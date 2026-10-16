import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";

async function withDeadline(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Browser regression did not settle within 30s")), 30_000);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs against the packed browser distribution, not source imports or mock solvers. */
export async function checkBrowserRegressions({ browser, serve, fixture, browserRoot }) {
  const assets = await serve(browserRoot, true);
  const pagesRoot = path.join(fixture, "pages");
  const site = await serve(pagesRoot, true);

  for (const format of ["esm", "iife"]) {
    for (const solver of ["highs", "glpk", "z3"]) {
      const plugin = solver === "highs" ? "" : solver;
      const setup = format === "esm"
        ? `<script type="module">
            import * as api from '${assets}/factory/washi.js';
            ${plugin ? `import '${assets}/factory/solvers/${plugin}.js';` : ""}
            window.api = api;
          </script>`
        : `<script src="${assets}/factory/washi.min.js"></script>
           ${plugin ? `<script src="${assets}/factory/solvers/${plugin}.min.js"></script>` : ""}
           <script>window.api = Washi;</script>`;
      const file = `regression-${solver}-${format}.html`;
      await writeFile(path.join(pagesRoot, file), setup);
      const context = await browser.newContext({ serviceWorkers: "block" });
      const externalRequests = [];
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (new URL(url).hostname !== "127.0.0.1") {
          externalRequests.push(url);
          return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      // A hung solve must fail this test instead of keeping the CI job alive.
      page.setDefaultTimeout(30_000);
      try {
        await page.goto(`${site}/factory/${file}`);
        await page.waitForFunction(() => Boolean(window.api));
        await withDeadline(page.evaluate(async (solverName) => {
          const { Model, maximize, expr } = window.api;
          const require = (condition, message) => { if (!condition) throw new Error(message); };
          const m = new Model("Browser integration");
          const x = m.integer("x", { lb: 0, ub: 10 });
          const active = m.binary("active");
          const scaled = expr`${1e-7} * ${x} + 1.5e-6`;
          require(scaled.terms.get(x) === 1e-7 && scaled.constant === 1.5e-6, "Exponential interpolation failed");
          const gridCheck = new Model("GridShapeCheck").binary(2, 2);
          require(Array.isArray(gridCheck) && Array.isArray(gridCheck[0]), "2D numeric grid must be an Array of Arrays");
          m.constraint(active.eq(1), "activation");
          m.indicator(active, x.le(7), { name: "conditional_capacity" });
          m.objective(maximize(expr`3 * ${x} + 5`));
          const progress = [];
          require(await m.solve({ solver: solverName, useWorker: true,
            onProgress: (event) => progress.push(event) }) === "Optimal", "Expected Optimal");
          require(x.value === 7 && m.objectiveValue === 26, "Wrong primal or objective offset");
          require(m.hasPrimalSolution && m.terminationStatus === "Optimal", "Wrong solution metrics");
          require(progress.length > 0, "No progress callback received");
          const report = m.validateSolution();
          require(report.valid && report.complete && report.violations.length === 0, "Invalid solution");
          const invalid = m.validateSolution({ values: { x: 8, active: 1 } });
          require(!invalid.valid, "Validator accepted an indicator violation");

          let rejected = false;
          try { m.indicator(active, x.le(2), { M: NaN }); } catch { rejected = true; }
          require(rejected && m.objectiveValue === 26 && m.status === "Optimal", "Failed validation changed solved state");
          const controller = new AbortController();
          controller.abort();
          require(await m.solve({ solver: solverName, signal: controller.signal }) === "Unknown", "Wrong pre-abort status");
          require(m.terminationStatus === "Interrupted" && !m.hasPrimalSolution && x.value === null,
            "Pre-abort left stale primal values");
          require(await m.solve({ solver: solverName }) === "Optimal" && m.objectiveValue === 26,
            "Could not solve again after cancellation");

          if (solverName === "highs") {
            const warm = new Model("Browser warm start");
            // Create variables in reverse order of LP appearance so model.variables order !== LP column order
            const w4 = warm.binary("w4", { initialValue: 1 });
            const w3 = warm.binary("w3");
            const w2 = warm.binary("w2");
            const w1 = warm.binary("w1", { initialValue: 1 });
            warm.objective(maximize(expr`10 * ${w1} + 10 * ${w2} + 10 * ${w3} + 10 * ${w4}`));
            warm.constraint(expr`${w1} + ${w2} + ${w3} + ${w4} <= 2`, "cap");
            warm.constraint(expr`${w1} + ${w2} >= 1`, "g1");
            warm.constraint(expr`${w3} + ${w4} >= 1`, "g2");
            require(
              await warm.solve({ solver: "highs", useWorker: true, presolve: "off" }) === "Optimal",
              "Expected Optimal for warm-started MIP"
            );
            require(
              w1.value === 1 && w2.value === 0 && w3.value === 0 && w4.value === 1,
              "HiGHS Worker did not apply partial primal initial values with native column mapping"
            );
            require(
              w1.initialValue === 1 && w2.initialValue === undefined,
              "initialValue must remain distinct from solved Var.value"
            );
          } else {
            const unsupported = new Model("Unsupported warm start");
            const ux = unsupported.integer("ux", { lb: 0, ub: 5, initialValue: 2 });
            unsupported.objective(maximize(ux));
            let solveRejected = false;
            try {
              await unsupported.solve({ solver: solverName });
            } catch (err) {
              solveRejected = String(err?.message || err).includes("does not support primal initial values");
            }
            require(solveRejected, `${solverName} solve() did not reject initialValue`);
            let checkRejected = false;
            try {
              await unsupported.check({ solver: solverName });
            } catch (err) {
              checkRejected = String(err?.message || err).includes("does not support primal initial values");
            }
            require(checkRejected, `${solverName} check() did not reject initialValue`);
          }

          if (solverName === "z3") {
            const logic = new Model("Browser conflicts");
            const a = logic.bool("a");
            logic.constraint(a, "required presence");
            require((await logic.check("z3")).status === "Sat", "Expected Sat");
            require(logic.validateSolution().valid, "Boolean solution validation failed");
            logic.constraint(a.not(), "requested absence");
            require((await logic.check("z3")).status === "Unsat", "Expected Unsat");
            require(logic.unsatCore.length === 2 && logic.unsatCore.includes("required presence") &&
              logic.unsatCore.includes("requested absence"), "Wrong named unsat core");
            require(JSON.stringify(logic.conflicts) === JSON.stringify(logic.unsatCore), "Conflict alias mismatch");
          }
        }, solver));
        if (solver === "highs") await checkWorkerCancellation(page);
        if (solver === "z3") await checkZ3FailureRecovery(page, assets);
        assert.deepEqual(errors, [], `${solver}/${format}: uncaught browser errors`);
        assert.deepEqual(externalRequests, [], `${solver}/${format}: external network dependency`);
        console.log(`PASS Chromium regression: ${solver}/${format} (declarative API, Big-M, validation, metrics, cancellation/recovery${solver === "z3" ? ", SAT/UNSAT/conflicts" : ""})`);
      } finally {
        await context.close();
      }
    }
  }
}

async function checkZ3FailureRecovery(page, assets) {
  await withDeadline(page.evaluate(async (assetsUrl) => {
    const z3 = window.WashiZ3 || await import(`${assetsUrl}/factory/solvers/z3.js`);
    const { Model, maximize } = window.api;
    const require = (condition, message) => { if (!condition) throw new Error(message); };
    const old = await z3.loadZ3();
    const originalCall = old.em.async_call;
    let started;
    const inFlight = new Promise(resolve => { started = resolve; });
    old.em.async_call = function (...args) {
      const result = originalCall.apply(this, args);
      started();
      return result;
    };
    const checkModel = new Model("Worker failure check");
    checkModel.constraint(checkModel.bool("present"));
    const solveModel = new Model("Worker failure optimization");
    const x = solveModel.integer("x", { lb: 0, ub: 7 });
    solveModel.objective(maximize(x));
    // Start actual WASM work and queue another operation behind Z3's own mutex.
    const outcomes = Promise.allSettled([checkModel.check("z3"), solveModel.solve("z3")]);
    await inFlight;
    const workers = [...old.em.PThread.runningWorkers, ...old.em.PThread.unusedWorkers];
    require(workers.length > 0 && typeof workers[0].onerror === "function", "No real Z3 worker observed");
    const staleError = workers[0].onerror;
    staleError({ message: "injected Z3 worker failure" });
    for (const outcome of await outcomes) {
      require(outcome.status === "rejected" && outcome.reason.message.includes("injected Z3 worker failure"),
        "Affected check/solve did not reject with the worker failure");
    }
    require(!checkModel.hasPrimalSolution && !solveModel.hasPrimalSolution, "Failed operation fabricated a solution");

    const replacement = await z3.loadZ3();
    require(replacement !== old, "Failed runtime was reused");
    staleError({ message: "late failure from the disposed runtime" });
    await z3.killZ3Threads(old);
    require(await z3.loadZ3() === replacement, "Old cleanup invalidated the replacement");
    require((await checkModel.check("z3")).status === "Sat", "check() did not recover");
    require(await solveModel.solve("z3") === "Optimal" && x.value === 7, "solve() did not recover");
    require(solveModel.validateSolution().valid, "Recovered solution is invalid");
    await z3.killZ3Threads();
  }, assets));
}

async function checkWorkerCancellation(page) {
  // Use a fresh page so the observed Worker is created inside this test.
  await page.reload();
  await page.waitForFunction(() => Boolean(window.api));
  await withDeadline(page.evaluate(async () => {
    const { Model, sum } = window.api;
    const require = (condition, message) => { if (!condition) throw new Error(message); };
    const NativeWorker = window.Worker;
    const workers = [];
    // Observe actual Worker traffic and termination without replacing solver responses.
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.solves = [];
        this.initialValuePayloads = [];
        this.stopped = false;
        workers.push(this);
      }
      postMessage(message, ...args) {
        if (message.type === "SOLVE") {
          this.solves.push(message.lpString);
          this.initialValuePayloads.push(message.options?.initialValues);
        }
        return super.postMessage(message, ...args);
      }
      terminate() { this.stopped = true; return super.terminate(); }
    };
    try {
      const active = new Model("Active worker solve");
      const weights = [13, 17, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71];
      const x = weights.map((_, i) => active.binary(`item_${i}`));
      active.constraint(sum(x.map((v, i) => v.mul(weights[i]))).le(180));
      active.objective(window.api.maximize(sum(x.map((v, i) => v.mul(weights[i] + 6))).add(100)));
      const queued = new Model("Cancelled queued solve");
      const q = queued.continuous("cancelled_queue_marker", { lb: 0, ub: 3 });
      queued.objective(window.api.maximize(q));
      const remaining = new Model("Remaining queued solve");
      const r = remaining.continuous("remaining_queue_marker", { lb: 0, ub: 5, initialValue: 4 });
      remaining.objective(window.api.maximize(r));
      const activeController = new AbortController();
      const queuedController = new AbortController();
      let progressCount = 0;
      const first = active.solve({ useWorker: true, presolve: "off", signal: activeController.signal,
        onProgress: () => {
          if (progressCount++ > 0) return;
          queuedController.abort();
          require(!workers[0].stopped, "Cancelling a queued solve terminated the active Worker");
          activeController.abort();
        } });
      // All three requests enter the queue before the fresh Worker emits progress.
      const second = queued.solve({ useWorker: true, signal: queuedController.signal });
      const third = remaining.solve({ useWorker: true });
      await Promise.all([first, second, third]);
      require(progressCount > 0, "Real Worker did not emit progress");
      require(active.terminationStatus === "Interrupted", "Active solve was not interrupted");
      require(queued.terminationStatus === "Interrupted" && !queued.hasPrimalSolution && q.value === null,
        "Queued cancellation returned stale values");
      require(workers.length === 2 && workers[0].stopped && workers[0].solves.length === 1,
        "Active Worker was not replaced correctly");
      require(workers[1].solves.length === 1 && workers[1].solves[0].includes("remaining_queue_marker"),
        "Cancelled queued solve was dispatched or remaining solve was lost");
      require(workers[1].initialValuePayloads[0]?.remaining_queue_marker === 4,
        "Worker postMessage did not carry initialValues across Worker replacement");
      require(remaining.status === "Optimal" && r.value === 5 && r.initialValue === 4 && remaining.validateSolution().valid,
        "Remaining queued solve failed after Worker replacement");
      require(await queued.solve({ useWorker: true }) === "Optimal" && q.value === 3,
        "Cancelled model could not be solved again");
      const mutatedInWorker = new Model("Mutated during real Worker solve");
      const mw = mutatedInWorker.continuous("mw", { lb: 0, ub: 10 });
      mutatedInWorker.objective(window.api.maximize(mw));
      const staleWorkerPromise = mutatedInWorker.solve({ useWorker: true });
      mutatedInWorker.objective(window.api.minimize(mw));
      let staleRejected = false;
      try {
        await staleWorkerPromise;
      } catch (err) {
        staleRejected = String(err?.message || err).includes("modified while solve() was in progress");
      }
      require(staleRejected && mutatedInWorker.status === "NotSolved" && mw.value === null,
        "Stale Worker solve result was not discarded after mid-flight objective change");
      const staleInitPromise = mutatedInWorker.solve({ useWorker: true });
      mw.initialValue = 3;
      let staleInitRejected = false;
      try {
        await staleInitPromise;
      } catch (err) {
        staleInitRejected = String(err?.message || err).includes("modified while solve() was in progress");
      }
      require(staleInitRejected && mutatedInWorker.status === "NotSolved" && mw.value === null && mw.initialValue === 3,
        "Stale Worker solve result was not discarded after mid-flight initialValue change");
      console.log("PASS real HiGHS Worker: active abort, queued abort, replacement, recovery, warm-start payload, and stale-result rejection");
    } finally {
      window.Worker = NativeWorker;
    }
  }));
}
