import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Model,
  and,
  getSolver,
  implies,
  listAvailableSolvers,
  maximize,
  minimize,
  not,
  or,
  sum,
  xor,
  type SolveProgressEvent,
} from "../src/index.js";

type PumpkinModule = typeof import("../src/modeler/solvers/pumpkin.js");

let cachedPumpkinModule: PumpkinModule | null = null;

async function ensurePumpkinRegistered(): Promise<PumpkinModule> {
  if (!cachedPumpkinModule) {
    cachedPumpkinModule = await import("../src/modeler/solvers/pumpkin.js");
  } else {
    cachedPumpkinModule.registerPumpkinSolver();
  }
  return cachedPumpkinModule;
}

function buildFt06Model(): Model {
  // Classic Muth & Thompson ft06 6x6 Job-Shop Scheduling instance (optimal makespan = 55)
  const jobs: Array<Array<[number, number]>> = [
    [[2, 1], [0, 3], [1, 6], [3, 7], [5, 3], [4, 6]],
    [[1, 8], [2, 5], [4, 10], [5, 10], [0, 10], [3, 4]],
    [[2, 5], [3, 4], [5, 8], [0, 9], [1, 1], [4, 7]],
    [[1, 5], [0, 5], [2, 5], [3, 3], [4, 8], [5, 9]],
    [[2, 9], [1, 3], [4, 5], [5, 4], [0, 3], [3, 1]],
    [[1, 3], [3, 3], [5, 9], [0, 10], [4, 4], [2, 1]],
  ];

  const numJobs = jobs.length;
  const numMachines = 6;
  const horizon = jobs.reduce(
    (sumDur, ops) => sumDur + ops.reduce((s, [, dur]) => s + dur, 0),
    0
  );

  const m = new Model("ft06");
  const makespan = m.integer("makespan", { lb: 0, ub: horizon });
  const starts = jobs.map((ops, j) =>
    ops.map((_, k) => m.integer(`s_${j}_${k}`, { lb: 0, ub: horizon }))
  );

  // Precedence within each job + makespan lower bound
  for (let j = 0; j < numJobs; j++) {
    for (let k = 0; k < jobs[j].length; k++) {
      const dur = jobs[j][k][1];
      if (k + 1 < jobs[j].length) {
        m.constraint(starts[j][k].add(dur).le(starts[j][k + 1]));
      } else {
        m.constraint(starts[j][k].add(dur).le(makespan));
      }
    }
  }

  // Disjunctive machine constraints via boolean indicators
  const machineOps: Array<Array<{ j: number; k: number; dur: number }>> = Array.from(
    { length: numMachines },
    () => []
  );
  for (let j = 0; j < numJobs; j++) {
    for (let k = 0; k < jobs[j].length; k++) {
      const [mach, dur] = jobs[j][k];
      machineOps[mach].push({ j, k, dur });
    }
  }

  for (let mach = 0; mach < numMachines; mach++) {
    const ops = machineOps[mach];
    for (let a = 0; a < ops.length; a++) {
      for (let b = a + 1; b < ops.length; b++) {
        const opA = ops[a];
        const opB = ops[b];
        const y = m.bool(`ord_${mach}_${opA.j}_${opB.j}`);
        m.constraint(implies(y, starts[opA.j][opA.k].add(opA.dur).le(starts[opB.j][opB.k])));
        m.constraint(implies(not(y), starts[opB.j][opB.k].add(opB.dur).le(starts[opA.j][opA.k])));
      }
    }
  }

  m.objective(minimize(makespan));
  return m;
}

describe("Pumpkin WASM LCG solver", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws a helpful error when 'pumpkin' solver is requested before registration", () => {
    if (cachedPumpkinModule) {
      return;
    }
    expect(() => getSolver("pumpkin")).toThrow(/@ohtaman\/washi\/solvers\/pumpkin/);
  });

  it("exposes accurate solver capabilities and registers cleanly", async () => {
    const { PumpkinSolver } = await ensurePumpkinRegistered();
    const solver = new PumpkinSolver();

    expect(solver.name).toBe("pumpkin");
    expect(PumpkinSolver.capabilities).toEqual({
      supportsMIP: true,
      supportsQP: false,
      supportsQCQP: false,
      supportsSMT: false,
      supportsLogicalConstraints: true,
      supportsUnsatCore: true,
      supportsWarmStart: true,
    });
    expect(solver.capabilities).toEqual(PumpkinSolver.capabilities);
    expect(listAvailableSolvers()).toContain("pumpkin");
    expect(getSolver("pumpkin").name).toBe("pumpkin");
  });

  it("checks satisfiability with linear and nested logical constraints", async () => {
    await ensurePumpkinRegistered();

    const m = new Model("sat-logic");
    const x = m.integer("x", { lb: -2, ub: 5 });
    const y = m.integer("y", { lb: 0, ub: 4 });
    const a = m.bool("a");
    const b = m.bool("b");
    const c = m.bool("c");

    m.constraint(and(a, implies(a, or(b, c))));
    m.constraint(xor(b, c));
    m.constraint(implies(b, x.add(y).ge(6)));
    m.constraint(implies(c, x.le(0)));
    m.constraint(not(and(a, b, c)));

    const checkResult = await m.check({ solver: "pumpkin" });
    expect(checkResult.status).toBe("Sat");
    expect(m.status).toBe("Sat");
    expect(typeof checkResult.values.x).toBe("number");
    expect(typeof checkResult.values.y).toBe("number");
    expect(typeof checkResult.values.a).toBe("boolean");
    expect(checkResult.values.a).toBe(true);
    expect(Number(Boolean(checkResult.values.b)) + Number(Boolean(checkResult.values.c))).toBe(1);
    expect(m.validateSolution().valid).toBe(true);
  });

  it("isolates unsatisfiable cores and excludes unrelated feasible constraints", async () => {
    await ensurePumpkinRegistered();

    const m = new Model("unsat-core");
    const x = m.integer("x", { lb: 0, ub: 10 });
    const z = m.integer("z", { lb: 0, ub: 5 });
    const p = m.bool("p");
    const q = m.bool("q");

    m.constraint(and(z.ge(1), z.le(3)), "unrelated");
    m.constraint(p, "force_p");
    m.constraint(implies(p, x.ge(8)), "p_implies_ge_8");
    m.constraint(implies(not(q), x.le(3)), "not_q_implies_le_3");
    m.constraint(not(q), "force_not_q");

    const checkResult = await m.check({ solver: "pumpkin" });
    expect(checkResult.status).toBe("Unsat");
    expect(m.status).toBe("Unsat");
    expect(checkResult.conflicts).toBeDefined();
    expect(checkResult.conflicts!.length).toBeGreaterThan(0);
    expect(checkResult.conflicts).not.toContain("unrelated");
    expect(checkResult.conflicts).toContain("force_p");
    expect(checkResult.conflicts).toContain("p_implies_ge_8");
    expect(m.unsatCore).toEqual(checkResult.conflicts);
  });

  it("handles zero-term tautology and contradiction constraints cleanly", async () => {
    await ensurePumpkinRegistered();

    const satModel = new Model("zero-term-sat");
    const x = satModel.integer("x", { lb: 0, ub: 3 });
    satModel.constraint(x.sub(x).le(5), "tautology");
    const satRes = await satModel.check({ solver: "pumpkin" });
    expect(satRes.status).toBe("Sat");

    const unsatModel = new Model("zero-term-unsat");
    const y = unsatModel.integer("y", { lb: 0, ub: 3 });
    const z = unsatModel.integer("z", { lb: 0, ub: 3 });
    unsatModel.constraint(y.ge(1), "unrelated");
    unsatModel.constraint(z.sub(z).ge(2), "zero_contradiction");
    const unsatRes = await unsatModel.check({ solver: "pumpkin" });
    expect(unsatRes.status).toBe("Unsat");
    expect(unsatRes.conflicts).toContain("zero_contradiction");
    expect(unsatRes.conflicts).not.toContain("unrelated");
  });

  it("keeps Object.prototype safe with reserved property names", async () => {
    await ensurePumpkinRegistered();

    const m = new Model("proto-safe");
    const protoVar = m.integer("__proto__", { lb: 1, ub: 5 });
    const ctorBool = m.bool("constructor");
    const toStrVar = m.binary("toString");

    m.constraint(implies(ctorBool, protoVar.add(toStrVar).ge(4)), "__proto__");
    m.constraint(ctorBool, "valueOf");
    m.objective(minimize(protoVar.mul(2).add(toStrVar)));

    const checkResult = await m.check({ solver: "pumpkin" });
    expect(checkResult.status).toBe("Sat");
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(checkResult.values, "__proto__")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(checkResult.values, "constructor")).toBe(true);

    const status = await m.solve({ solver: "pumpkin" });
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(7);
    expect(Object.prototype.hasOwnProperty.call(m.solution!.values, "__proto__")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(m.solution!.values, "toString")).toBe(true);
    expect(m.validateSolution().valid).toBe(true);
  });

  it("solves minimize and maximize problems with negative bounds, fixed bounds, and fractional objective constants", async () => {
    await ensurePumpkinRegistered();

    const mMin = new Model("min-bounds");
    const x = mMin.integer("x", { lb: -5, ub: 3 });
    const y = mMin.integer("y", { lb: 2, ub: 2 });
    mMin.constraint(x.add(y).ge(-1));
    mMin.objective(minimize(x.mul(3).sub(y).add(1.5)));

    const statusMin = await mMin.solve({ solver: "pumpkin" });
    expect(statusMin).toBe("Optimal");
    expect(x.value).toBe(-3);
    expect(y.value).toBe(2);
    expect(mMin.objectiveValue).toBeCloseTo(-9.5, 9);
    expect(mMin.validateSolution().valid).toBe(true);

    const mMax = new Model("max-bounds");
    const a = mMax.integer("a", { lb: -4, ub: 4 });
    const b = mMax.binary("b");
    mMax.constraint(a.add(b.mul(2)).le(3));
    mMax.objective(maximize(a.mul(2).add(b.mul(5)).sub(0.25)));

    const statusMax = await mMax.solve({ solver: "pumpkin" });
    expect(statusMax).toBe("Optimal");
    expect(a.value).toBe(1);
    expect(b.value).toBe(1);
    expect(mMax.objectiveValue).toBeCloseTo(6.75, 9);
    expect(mMax.validateSolution().valid).toBe(true);
  });

  it("solves constant / zero-term objective models cleanly", async () => {
    await ensurePumpkinRegistered();

    const m = new Model("zero-obj");
    const x = m.integer("x", { lb: 1, ub: 5 });
    m.constraint(x.ge(3));
    m.objective(minimize(x.sub(x).add(4.25)));

    const status = await m.solve({ solver: "pumpkin" });
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBeCloseTo(4.25, 9);
    expect(m.validateSolution().valid).toBe(true);
  });

  it("solves the ft06 6x6 Job-Shop benchmark to proven optimum (55)", async () => {
    await ensurePumpkinRegistered();

    const m = buildFt06Model();
    const status = await m.solve({ solver: "pumpkin", timeLimit: 15 });

    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(55);
    expect(m.validateSolution().valid).toBe(true);
  });

  it("returns Infeasible honestly on root-inconsistent and logically-inconsistent models", async () => {
    await ensurePumpkinRegistered();

    const rootBad = new Model("root-infeasible");
    const x = rootBad.integer("x", { lb: 5, ub: 10 });
    rootBad.constraint(x.le(2));
    rootBad.objective(minimize(x));
    const s1 = await rootBad.solve({ solver: "pumpkin" });
    expect(s1).toBe("Infeasible");
    expect(rootBad.status).toBe("Infeasible");

    const logicBad = new Model("logic-infeasible");
    const b = logicBad.bool("b");
    const y = logicBad.integer("y", { lb: 0, ub: 5 });
    logicBad.constraint(implies(b, y.ge(4)));
    logicBad.constraint(implies(not(b), y.ge(4)));
    logicBad.constraint(y.le(2));
    logicBad.objective(minimize(y));
    const s2 = await logicBad.solve({ solver: "pumpkin" });
    expect(s2).toBe("Infeasible");
  });

  it("supports timeLimit: 0, onProgress callbacks, and rethrows callback errors without loss", async () => {
    await ensurePumpkinRegistered();

    const ft06Timeout = buildFt06Model();
    const tStatus = await ft06Timeout.solve({ solver: "pumpkin", timeLimit: 0 });
    expect(["TimeLimit", "Optimal", "Feasible"]).toContain(tStatus);

    const ft06Progress = buildFt06Model();
    const updates: SolveProgressEvent[] = [];
    const pStatus = await ft06Progress.solve({
      solver: "pumpkin",
      onProgress: (info) => {
        updates.push(info);
      },
    });
    expect(pStatus).toBe("Optimal");
    expect(updates.length).toBeGreaterThan(0);
    for (const ev of updates) {
      expect(typeof ev.elapsedTime).toBe("number");
      expect(ev.elapsedTime).toBeGreaterThanOrEqual(0);
    }

    class ProgressSentinelError extends Error {}
    const ft06Throw = buildFt06Model();
    await expect(
      ft06Throw.solve({
        solver: "pumpkin",
        onProgress: () => {
          throw new ProgressSentinelError("progress callback failed");
        },
      })
    ).rejects.toThrow(ProgressSentinelError);
  });

  it("respects pre-aborted and mid-solve AbortSignal cancellation while preserving incumbents", async () => {
    await ensurePumpkinRegistered();

    const preAborted = new AbortController();
    preAborted.abort();
    const mPre = new Model("pre-abort");
    const x = mPre.integer("x", { lb: 0, ub: 1 });
    mPre.objective(minimize(x));
    const preStatus = await mPre.solve({ solver: "pumpkin", signal: preAborted.signal });
    expect(preStatus).toBe("Unknown");
    expect(mPre.terminationStatus).toBe("Interrupted");
    expect(mPre.hasPrimalSolution).toBe(false);

    const checkPreAborted = new AbortController();
    checkPreAborted.abort();
    const checkPreRes = await mPre.check({ solver: "pumpkin", signal: checkPreAborted.signal });
    expect(checkPreRes.status).toBe("Unknown");
    expect(mPre.terminationStatus).toBe("Interrupted");

    const midController = new AbortController();
    const mMid = buildFt06Model();
    let seenIncumbent = false;
    const midStatus = await mMid.solve({
      solver: "pumpkin",
      signal: midController.signal,
      onProgress: (ev) => {
        if (ev.objectiveValue !== undefined) {
          seenIncumbent = true;
          midController.abort();
        }
      },
    });
    expect(seenIncumbent).toBe(true);
    expect(mMid.terminationStatus).toBe("Interrupted");
    expect(midStatus).toBe("Feasible");
    expect(mMid.hasPrimalSolution).toBe(true);
    expect(mMid.objectiveValue).not.toBeNull();
  });

  it("supports running Pumpkin check() and HiGHS solve() sequentially on the same Model", async () => {
    await ensurePumpkinRegistered();

    const m = new Model("hybrid-same-model");
    const x = m.integer("x", { lb: 0, ub: 10 });
    const b = m.bool("b");
    m.constraint(implies(b, x.ge(4)));
    m.constraint(or(b, x.le(2)));
    m.objective(minimize(x));

    const checkRes = await m.check({ solver: "pumpkin" });
    expect(checkRes.status).toBe("Sat");

    const highsStatus = await m.solve({ solver: "highs" });
    expect(highsStatus).toBe("Optimal");
    expect(m.objectiveValue).toBe(0);
    expect(m.validateSolution().valid).toBe(true);
  });

  it("rejects unsupported model features explicitly without ad-hoc fallbacks", async () => {
    await ensurePumpkinRegistered();

    // Continuous variable
    const mCont = new Model("cont");
    const xc = mCont.continuous("xc", { lb: 0, ub: 10 });
    mCont.objective(minimize(xc));
    await expect(mCont.solve({ solver: "pumpkin" })).rejects.toThrow(/continuous/i);
    await expect(mCont.check({ solver: "pumpkin" })).rejects.toThrow(/continuous/i);

    // Unbounded Integer variable
    const mInf = new Model("inf");
    const xi = mInf.integer("xi", { lb: 0, ub: Infinity });
    mInf.objective(minimize(xi));
    await expect(mInf.solve({ solver: "pumpkin" })).rejects.toThrow(/bounded/i);
    await expect(mInf.check({ solver: "pumpkin" })).rejects.toThrow(/bounded/i);

    // Non-integer coefficient
    const mFracCoeff = new Model("frac-coeff");
    const xf = mFracCoeff.integer("xf", { lb: 0, ub: 5 });
    mFracCoeff.constraint(xf.mul(1.5).le(4));
    mFracCoeff.objective(minimize(xf));
    await expect(mFracCoeff.solve({ solver: "pumpkin" })).rejects.toThrow(/integer/i);

    // Non-integer RHS
    const mFracRhs = new Model("frac-rhs");
    const xr = mFracRhs.integer("xr", { lb: 0, ub: 5 });
    mFracRhs.constraint(xr.le(2.5));
    await expect(mFracRhs.check({ solver: "pumpkin" })).rejects.toThrow(/integer/i);

    // Non-integer variable bound
    const mFracBound = new Model("frac-bound");
    const xb = mFracBound.integer("xb", { lb: 0.5, ub: 4 });
    mFracBound.objective(minimize(xb));
    await expect(mFracBound.solve({ solver: "pumpkin" })).rejects.toThrow(/integer/i);

    // Safe i32 bound overflow (> 2^30 - 1)
    const mHuge = new Model("huge-bound");
    const xh = mHuge.integer("xh", { lb: 0, ub: 2_000_000_000 });
    mHuge.objective(minimize(xh));
    await expect(mHuge.solve({ solver: "pumpkin" })).rejects.toThrow(/safe integer|32-bit|i32|limit/i);

    // Safe magnitude sum overflow in constraint
    const mMag = new Model("mag-overflow");
    const a = mMag.integer("a", { lb: 0, ub: 1_000_000_000 });
    const b = mMag.integer("b", { lb: 0, ub: 1_000_000_000 });
    const c = mMag.integer("c", { lb: 0, ub: 1_000_000_000 });
    mMag.constraint(sum([a, b, c]).le(1_000_000_000));
    await expect(mMag.check({ solver: "pumpkin" })).rejects.toThrow(/overflow|magnitude|safe|32-bit/i);

    // Invalid timeLimit
    const mTl = new Model("bad-tl");
    const xt = mTl.integer("xt", { lb: 0, ub: 1 });
    mTl.objective(minimize(xt));
    await expect(mTl.solve({ solver: "pumpkin", timeLimit: -1 })).rejects.toThrow(/timeLimit/i);
    await expect(mTl.solve({ solver: "pumpkin", timeLimit: Number.NaN })).rejects.toThrow(/timeLimit/i);

    // Quadratic expression
    const mQuad = new Model("quad");
    const xq = mQuad.integer("xq", { lb: 0, ub: 3 });
    mQuad.objective(minimize(xq.mul(xq)));
    await expect(mQuad.solve({ solver: "pumpkin" })).rejects.toThrow(/quadratic/i);

    const { PumpkinSolver } = await ensurePumpkinRegistered();
    const xqc = mQuad.integer("xqc", { lb: 0, ub: 3 });
    await expect(
      new PumpkinSolver().check({
        variables: [xqc],
        constraints: [{ name: "quad_c", lhs: xqc.mul(xqc), sense: "<=", rhs: 4 } as any],
      })
    ).rejects.toThrow(/quadratic/i);

    // Warm start / initialValue
    const mWarm = new Model("warm");
    const xw1 = mWarm.integer("xw1", { lb: 0, ub: 3, initialValue: 2 });
    const xw2 = mWarm.integer("xw2", { lb: 0, ub: 3, initialValue: 1 });
    mWarm.constraint(xw1.add(xw2).eq(3), "sum3");
    mWarm.objective(minimize(xw1.add(xw2)));
    expect((await mWarm.check({ solver: "pumpkin" })).status).toBe("Sat");
    expect([xw1.value, xw2.value]).toEqual([2, 1]);
    expect(await mWarm.solve({ solver: "pumpkin" })).toBe("Optimal");
    expect([xw1.value, xw2.value]).toEqual([2, 1]);

    // Invalid bypassed initialValue on direct PumpkinSolver call is rejected honestly
    const xwBad = mWarm.integer("xw_bad", { lb: 0, ub: 3 });
    Object.defineProperty(xwBad, "initialValue", { value: 2.5, configurable: true });
    await expect(
      new PumpkinSolver().check({
        variables: [xwBad],
        constraints: [],
      })
    ).rejects.toThrow(/initialValue/i);

    // LP relaxation
    const mRelax = new Model("relax");
    const xrel = mRelax.integer("xrel", { lb: 0, ub: 3 });
    mRelax.objective(minimize(xrel));
    await expect(mRelax.solve({ solver: "pumpkin", relax: true })).rejects.toThrow(/relax/i);
  });

  it("validates custom wasmUrl responses and rejects HTML/corrupt payloads without CDN fallback", async () => {
    const mod = await ensurePumpkinRegistered();
    const { setPumpkinWasmUrl, getPumpkinWasmUrl, loadPumpkinRuntime, resetPumpkinLoader } =
      await import("../src/modeler/solvers/pumpkin/loader.js");

    const prevUrl = getPumpkinWasmUrl();
    try {
      setPumpkinWasmUrl("https://example.invalid/custom/pumpkin.wasm");
      expect(getPumpkinWasmUrl()).toBe("https://example.invalid/custom/pumpkin.wasm");

      const fetchMock = vi.fn().mockResolvedValue(
        new Response("<!doctype html><html>404</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(loadPumpkinRuntime()).rejects.toThrow(/html|wasm/i);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("https://example.invalid/custom/pumpkin.wasm");

      fetchMock.mockResolvedValueOnce(
        new Response(new Uint8Array([0x00, 0x01, 0x02, 0x03]), {
          status: 200,
          headers: { "content-type": "application/wasm" },
        })
      );
      await expect(loadPumpkinRuntime()).rejects.toThrow(/wasm|magic/i);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Verify per-call options.wasmUrl does not mutate global getPumpkinWasmUrl() and recovers cleanly
      setPumpkinWasmUrl(null);
      resetPumpkinLoader();
      fetchMock.mockResolvedValueOnce(
        new Response("<!doctype html><html>bad per-call</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
      );
      const perCallModel = new Model("per-call-wasm-url");
      const pv = perCallModel.bool("pv");
      perCallModel.constraint(pv);
      await expect(
        perCallModel.check({ solver: "pumpkin", wasmUrl: "https://example.invalid/per-call.wasm" })
      ).rejects.toThrow(/html|wasm/i);
      expect(fetchMock).toHaveBeenLastCalledWith("https://example.invalid/per-call.wasm");
      expect(getPumpkinWasmUrl()).toBeNull();

      vi.unstubAllGlobals();
      const recovered = await perCallModel.check({ solver: "pumpkin" });
      expect(recovered.status).toBe("Sat");
      expect(recovered.values.pv).toBe(true);
    } finally {
      setPumpkinWasmUrl(prevUrl);
      resetPumpkinLoader();
      expect(typeof mod.getPumpkinWasmUrl).toBe("function");
    }
  });

  it("queues worker requests cleanly and terminates + replaces the worker on mid-solve abort", async () => {
    const { createPumpkinWorkerClient } = await import(
      "../src/modeler/solvers/pumpkin/worker-client.js"
    );

    const createdWorkers: Array<{
      terminated: boolean;
      messages: Array<Record<string, unknown>>;
      onmessage: ((event: MessageEvent) => void) | null;
      onerror: ((event: ErrorEvent) => void) | null;
      onmessageerror: ((event: MessageEvent) => void) | null;
    }> = [];

    const client = createPumpkinWorkerClient({
      workerUrl: "https://example.test/pumpkin-worker.js",
      wasmUrl: "https://example.test/pumpkin.wasm",
      workerFactory: () => {
        const w = {
          terminated: false,
          messages: [] as Array<Record<string, unknown>>,
          onmessage: null as ((event: MessageEvent) => void) | null,
          onerror: null as ((event: ErrorEvent) => void) | null,
          onmessageerror: null as ((event: MessageEvent) => void) | null,
          postMessage(msg: Record<string, unknown>) {
            w.messages.push(msg);
          },
          terminate() {
            w.terminated = true;
          },
        };
        createdWorkers.push(w);
        return w as unknown as Worker;
      },
    });

    const controller1 = new AbortController();
    const p1 = client.solve({ requestJson: "{}" }, { signal: controller1.signal });
    const p2 = client.check({ requestJson: "{}" });

    await vi.waitFor(() => {
      expect(createdWorkers.length).toBe(1);
      expect(createdWorkers[0].messages.length).toBe(1);
    });

    const req1Id = createdWorkers[0].messages[0].id;
    controller1.abort();

    const r1 = await p1;
    expect(r1.terminationStatus).toBe("Interrupted");
    expect(createdWorkers[0].terminated).toBe(true);

    // Second queued request should start on a fresh replacement worker
    await vi.waitFor(() => {
      expect(createdWorkers.length).toBe(2);
      expect(createdWorkers[1].messages.length).toBe(1);
    });
    const w2 = createdWorkers[1];
    expect(w2.messages[0].id).not.toBe(req1Id);
    expect(w2.messages[0].type).toBe("check");

    w2.onmessage?.({
      data: {
        id: w2.messages[0].id,
        type: "CHECK_SUCCESS",
        result: { status: "Sat", values: [] },
        runTime: 0.01,
      },
    } as MessageEvent);

    await expect(p2).resolves.toMatchObject({ status: "Sat" });

    // Regression: if onProgress aborts its own signal and then throws, the queued next task
    // must NOT be terminated or rejected by the originating callback's catch block.
    const controller3 = new AbortController();
    const p3 = client.solve(
      { requestJson: "{}" },
      {
        signal: controller3.signal,
        onProgress: () => {
          controller3.abort();
          throw new Error("callback threw after aborting");
        },
      }
    );
    const p4 = client.check({ requestJson: "{}" });

    await vi.waitFor(() => {
      expect(createdWorkers.length).toBe(2);
      expect(createdWorkers[1].messages.length).toBe(2);
    });
    const wActive = createdWorkers[1];
    const req3Id = wActive.messages[1].id;
    wActive.onmessage?.({
      data: {
        id: req3Id,
        type: "SOLVE_PROGRESS",
        elapsedTime: 0.01,
        payloadJson: JSON.stringify({ objectiveValue: 42, values: [], boolValues: [] }),
      },
    } as MessageEvent);

    const r3 = await p3;
    expect(r3.terminationStatus).toBe("Interrupted");
    expect(r3.objectiveValue).toBe(42);
    expect(wActive.terminated).toBe(true);

    await vi.waitFor(() => {
      expect(createdWorkers.length).toBe(3);
      expect(createdWorkers[2].messages.length).toBe(1);
    });
    const wNext = createdWorkers[2];
    expect(wNext.terminated).toBe(false);
    expect(wNext.messages[0].type).toBe("check");
    wNext.onmessage?.({
      data: {
        id: wNext.messages[0].id,
        type: "CHECK_SUCCESS",
        responseJson: JSON.stringify({ status: "Sat", values: [] }),
        runTime: 0.01,
      },
    } as MessageEvent);

    await expect(p4).resolves.toMatchObject({ status: "Sat" });

    client.dispose();
    expect(wNext.terminated).toBe(true);
  });

  it("intersects Binary variable bounds with [0, 1] and handles empty binary domains honestly", async () => {
    await ensurePumpkinRegistered();

    // 1. Widened binary variable (ub > 1) must still stay in {0, 1}
    const mWidened = new Model("widened-binary");
    const x = mWidened.binary("x");
    x.ub = 10;
    mWidened.objective(maximize(x));

    expect(await mWidened.solve({ solver: "pumpkin" })).toBe("Optimal");
    expect(x.value).toBe(1);
    expect(mWidened.objectiveValue).toBe(1);
    expect(mWidened.validateSolution().valid).toBe(true);

    mWidened.constraint(x.ge(2), "ge_2");
    const checkWidened = await mWidened.check({ solver: "pumpkin" });
    expect(checkWidened.status).toBe("Unsat");
    expect(checkWidened.conflicts).toContain("ge_2");
    expect(checkWidened.unsatCore).toContain("ge_2");
    expect(await mWidened.solve({ solver: "pumpkin" })).toBe("Infeasible");

    // 2. Integer variable reassigned to Binary must intersect bounds with [0, 1]
    const mConverted = new Model("int-to-binary");
    const y = mConverted.integer("y", { lb: -5, ub: 10 });
    y.type = "Binary";
    mConverted.objective(maximize(y));

    expect(await mConverted.solve({ solver: "pumpkin" })).toBe("Optimal");
    expect(y.value).toBe(1);
    expect(mConverted.validateSolution().valid).toBe(true);

    mConverted.objective(minimize(y));
    expect(await mConverted.solve({ solver: "pumpkin" })).toBe("Optimal");
    expect(y.value).toBe(0);
    expect(mConverted.validateSolution().valid).toBe(true);

    // 3. Disjoint binary domain ([2, 5] ∩ [0, 1] = ∅) must report Unsat / Infeasible honestly
    const mEmpty = new Model("empty-binary");
    const z = mEmpty.binary("z");
    z.lb = 2;
    z.ub = 5;
    mEmpty.objective(minimize(z));

    const emptyCheck = await mEmpty.check({ solver: "pumpkin" });
    expect(emptyCheck.status).toBe("Unsat");
    expect(emptyCheck.conflicts).toEqual([]);
    expect(emptyCheck.unsatCore).toEqual([]);

    expect(await mEmpty.solve({ solver: "pumpkin" })).toBe("Infeasible");
    expect(mEmpty.terminationStatus).toBe("Infeasible");
    expect(mEmpty.hasPrimalSolution).toBe(false);

    // Unsupported options on an empty-binary model must still be rejected upfront
    await expect(mEmpty.solve({ solver: "pumpkin", relax: true })).rejects.toThrow(/relax/i);
  });

  it("isolates concurrent non-worker WASM loads across distinct wasmUrls and mid-load reconfiguration", async () => {
    await ensurePumpkinRegistered();
    const {
      getPumpkinWasmUrl,
      loadPumpkinRuntime,
      resetPumpkinLoader,
      setPumpkinWasmUrl,
    } = await import("../src/modeler/solvers/pumpkin/loader.js");

    const realWasmBytes = new Uint8Array(
      fs.readFileSync(path.resolve(process.cwd(), "public/pumpkin.wasm"))
    );
    const emptyWasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    const prevUrl = getPumpkinWasmUrl();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "https://delayed.test/empty.wasm") {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return new Response(emptyWasm, {
            status: 200,
            headers: { "content-type": "application/wasm" },
          });
        }
        if (url === "https://fast-a.test/pumpkin.wasm" || url === "https://fast-b.test/pumpkin.wasm") {
          return new Response(realWasmBytes, {
            status: 200,
            headers: { "content-type": "application/wasm" },
          });
        }
        return new Response("Not Found", { status: 404 });
      })
    );

    try {
      resetPumpkinLoader();

      const buildCheckModel = () => {
        const m = new Model("concurrent-check");
        const x = m.integer("x", { lb: 0, ub: 5 });
        m.constraint(x.ge(3), "lb3");
        return m;
      };

      // Sub-case 1: Concurrent distinct URLs must never leak instantiated modules across callers
      const [delayedRes, fastRes, bundledRes] = await Promise.allSettled([
        buildCheckModel().check({
          solver: "pumpkin",
          useWorker: false,
          wasmUrl: "https://delayed.test/empty.wasm",
        }),
        buildCheckModel().check({
          solver: "pumpkin",
          useWorker: false,
          wasmUrl: "https://fast-a.test/pumpkin.wasm",
        }),
        buildCheckModel().check({
          solver: "pumpkin",
          useWorker: false,
          wasmUrl: null,
        }),
      ]);

      expect(delayedRes.status).toBe("rejected");
      if (delayedRes.status === "rejected") {
        expect(String(delayedRes.reason)).toMatch(
          /Invalid Pumpkin WebAssembly module.*"https:\/\/delayed\.test\/empty\.wasm"/
        );
      }

      expect(fastRes.status).toBe("fulfilled");
      if (fastRes.status === "fulfilled") {
        expect(fastRes.value.status).toBe("Sat");
        expect(fastRes.value.values.x).toBeGreaterThanOrEqual(3);
      }

      expect(bundledRes.status).toBe("fulfilled");
      if (bundledRes.status === "fulfilled") {
        expect(bundledRes.value.status).toBe("Sat");
        expect(bundledRes.value.values.x).toBeGreaterThanOrEqual(3);
      }

      // Sub-case 2: Reconfiguring global setPumpkinWasmUrl while an older load is in flight
      setPumpkinWasmUrl("https://delayed.test/empty.wasm");
      const pOld = buildCheckModel().check({ solver: "pumpkin", useWorker: false });

      setPumpkinWasmUrl("https://fast-b.test/pumpkin.wasm");
      const optModel = new Model("reconfigured-opt");
      const ox = optModel.integer("ox", { lb: 2, ub: 7 });
      optModel.objective(minimize(ox));
      const pNew = optModel.solve({ solver: "pumpkin", useWorker: false });

      const [oldSettled, newSettled] = await Promise.allSettled([pOld, pNew]);
      expect(oldSettled.status).toBe("rejected");
      if (oldSettled.status === "rejected") {
        expect(String(oldSettled.reason)).toMatch(
          /Invalid Pumpkin WebAssembly module.*"https:\/\/delayed\.test\/empty\.wasm"/
        );
      }
      expect(newSettled.status).toBe("fulfilled");
      if (newSettled.status === "fulfilled") {
        expect(newSettled.value).toBe("Optimal");
        expect(optModel.objectiveValue).toBe(2);
      }

      // Sub-case 3: Coexisting runtime instances loaded from distinct URLs stay independent
      resetPumpkinLoader();
      const rA = await loadPumpkinRuntime("https://fast-a.test/pumpkin.wasm");
      const rB = await loadPumpkinRuntime("https://fast-b.test/pumpkin.wasm");
      expect(rA).not.toBe(rB);

      const sampleReq = JSON.stringify({
        vars: [{ name: "v", lb: 4, ub: 4 }],
        boolVars: [],
        constraints: [],
        logicalConstraints: [],
        timeLimitMs: null,
      });
      const parsedA = JSON.parse(rA.check_json(sampleReq)) as {
        status: string;
        values: Array<[string, number]>;
      };
      expect(parsedA.status).toBe("Sat");
      expect(parsedA.values).toEqual([["v", 4]]);
    } finally {
      setPumpkinWasmUrl(prevUrl);
      resetPumpkinLoader();
    }
  });
});
