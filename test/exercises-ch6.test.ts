import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { PROBLEMS } from "../examples/web-demo/exercises/src/problems/registry.js";
import { runWashiExerciseCode } from "../examples/web-demo/exercises/src/runner/washi-runner.js";
import {
  registerChapterExerciseSuite,
  runHighspyBatch,
} from "./helpers/exercises-chapter-harness.js";

const hasUv = spawnSync("uv", ["--version"], { encoding: "utf-8" }).status === 0;
const itHighspy = hasUv ? it : it.skip;

const ZERO_TIME_VRPTW_INPUT = {
  dist: [
    [0, 1, 1],
    [1, 0, 0],
    [1, 0, 0],
  ],
  earliest: [0, 0, 0],
  latest: [3, 3, 3],
  service: [0, 0, 0],
  maxVehicles: 1,
};

registerChapterExerciseSuite({
  chapter: 6,
  dirName: "ch06-networks-routing",
  expectedIds: ["051", "052", "053", "054", "055", "056", "057", "058", "059", "060"],
  expectedRuntimes: {
    "051": ["washi", "highspy"],
    "052": ["washi", "highspy"],
    "053": ["washi", "highspy"],
    "054": ["washi", "highspy"],
    "055": ["washi", "highspy"],
    "056": ["washi", "highspy"],
    "057": ["washi", "highspy"],
    "058": ["washi", "highspy"],
    "059": ["washi", "highspy"],
    "060": ["washi", "highspy"],
  },
  extractObjective: (_id, output) => {
    const rec = output as Record<string, unknown>;
    for (const key of ["totalCost", "maxFlow", "netValue", "totalDistance"]) {
      if (typeof rec[key] === "number" && Number.isFinite(rec[key])) {
        return rec[key] as number;
      }
    }
    return null;
  },
  checkAdversarial: async (problems) => {
    const byId = new Map(problems.map((p) => [p.meta.id, p]));

    // #051: Reject fractional split flows even when node flow conservation holds
    const p051 = byId.get("051")!;
    const v51Frac = p051.judge(
      p051.cases[0].input,
      { flows: [5.5, 4.5, 1.5, 4, 6], totalCost: 54.5 },
      p051.cases[0].expectedOptimal,
      "en"
    );
    expect(v51Frac.ok).toBe(false);
    expect(v51Frac.status).toBe("VIOLATION");
    expect(v51Frac.message).toMatch(/fractional|unimodular/i);

    // #052: Reject cutEdges that fail to sever all s-t paths or mismatch maxFlow
    const p052 = byId.get("052")!;
    const v52LeakyCut = p052.judge(
      p052.cases[0].input,
      { flows: [8, 5, 4, 4, 9], cutEdges: [1, 2], maxFlow: 13 },
      p052.cases[0].expectedOptimal,
      "en"
    );
    expect(v52LeakyCut.ok).toBe(false);
    expect(v52LeakyCut.status).toBe("VIOLATION");
    expect(v52LeakyCut.message).toMatch(/reachable|s-t cut/i);

    const v52BadCutCap = p052.judge(
      p052.cases[0].input,
      { flows: [8, 5, 4, 4, 9], cutEdges: [0, 1], maxFlow: 13 },
      p052.cases[0].expectedOptimal,
      "en"
    );
    expect(v52BadCutCap.ok).toBe(false);
    expect(v52BadCutCap.status).toBe("VIOLATION");
    expect(v52BadCutCap.message).toMatch(/capacity/i);

    // #053: Reject disconnected cycle accompanying an s-t path (case 1 edges 1,2,3,5,8)
    const p053 = byId.get("053")!;
    const v53Cycle = p053.judge(
      p053.cases[1].input,
      { selected: [0, 1, 1, 1, 0, 1, 0, 0, 1], totalCost: 15 },
      p053.cases[1].expectedOptimal,
      "en"
    );
    expect(v53Cycle.ok).toBe(false);
    expect(v53Cycle.status).toBe("VIOLATION");
    expect(v53Cycle.message).toMatch(/cycle|simple/i);

    // #054: Reject subtours / duplicate cities and suboptimal tours
    const p054 = byId.get("054")!;
    const v54Subtour = p054.judge(
      p054.cases[0].input,
      { tour: [0, 2, 0, 2], totalCost: 10 },
      p054.cases[0].expectedOptimal,
      "en"
    );
    expect(v54Subtour.ok).toBe(false);
    expect(v54Subtour.status).toBe("VIOLATION");
    expect(v54Subtour.message).toMatch(/subtour|more than once/i);

    const v54Subopt = p054.judge(
      p054.cases[0].input,
      { tour: [0, 1, 2, 3], totalCost: 45 },
      p054.cases[0].expectedOptimal,
      "en"
    );
    expect(v54Subopt.ok).toBe(false);
    expect(v54Subopt.status).toBe("SUBOPTIMAL");

    // #055: Reject disconnected high-prize island cluster {3, 4} omitted from root 0
    const p055 = byId.get("055")!;
    const v55Island = p055.judge(
      p055.cases[0].input,
      { selectedNodes: [1, 0, 0, 1, 1], selectedEdges: [0, 0, 0, 1, 0], netValue: 20 },
      p055.cases[0].expectedOptimal,
      "en"
    );
    expect(v55Island.ok).toBe(false);
    expect(v55Island.status).toBe("VIOLATION");
    expect(v55Island.message).toMatch(/disconnected/i);

    // #056: Reject exceeded vehicle capacity (route [0, 1, 2, 3, 0] has load 13 > 10)
    const p056 = byId.get("056")!;
    const v56Cap = p056.judge(
      p056.cases[0].input,
      { routes: [[0, 1, 2, 3, 0], [0, 4, 0]], totalDistance: 35 },
      p056.cases[0].expectedOptimal,
      "en"
    );
    expect(v56Cap.ok).toBe(false);
    expect(v56Cap.status).toBe("VIOLATION");
    expect(v56Cap.message).toMatch(/capacity/i);

    // #057: Reject time window violation & depot closing deadline violation
    const p057 = byId.get("057")!;
    const v57Window = p057.judge(
      p057.cases[0].input,
      { routes: [[0, 1, 2, 3, 4, 0]], totalCost: 20 },
      p057.cases[0].expectedOptimal,
      "en"
    );
    expect(v57Window.ok).toBe(false);
    expect(v57Window.status).toBe("VIOLATION");
    expect(v57Window.message).toMatch(/window|deadline/i);

    // #058: Reject cross-route split request and reversed delivery-before-pickup order
    const p058 = byId.get("058")!;
    const v58Split = p058.judge(
      p058.cases[1].input,
      { routes: [[0, 1, 4, 0], [0, 3, 2, 0]], totalDistance: 34 },
      p058.cases[1].expectedOptimal,
      "en"
    );
    expect(v58Split.ok).toBe(false);
    expect(v58Split.status).toBe("VIOLATION");
    expect(v58Split.message).toMatch(/split/i);

    const v58Rev = p058.judge(
      p058.cases[0].input,
      { routes: [[0, 2, 1, 3, 4, 0]], totalDistance: 21 },
      p058.cases[0].expectedOptimal,
      "en"
    );
    expect(v58Rev.ok).toBe(false);
    expect(v58Rev.status).toBe("VIOLATION");
    expect(v58Rev.message).toMatch(/before pickup/i);

    const v58Load = p058.judge(
      p058.cases[3].input,
      { routes: [[0, 1, 3, 2, 4, 0], [0, 5, 6, 0]], totalDistance: 32 },
      p058.cases[3].expectedOptimal,
      "en"
    );
    expect(v58Load.ok).toBe(false);
    expect(v58Load.status).toBe("VIOLATION");
    expect(v58Load.message).toMatch(/load/i);

    // #059: Reject open inter-depot route, exceeded vehicleCapacity, and exceeded depotCapacities
    const p059 = byId.get("059")!;
    const v59CrossDepot = p059.judge(
      p059.cases[0].input,
      { routes: [[0, 3, 2, 1], [1, 5, 4, 1]], totalDistance: 32 },
      p059.cases[0].expectedOptimal,
      "en"
    );
    expect(v59CrossDepot.ok).toBe(false);
    expect(v59CrossDepot.status).toBe("VIOLATION");
    expect(v59CrossDepot.message).toMatch(/origin depot/i);

    const v59VehCap = p059.judge(
      p059.cases[0].input,
      { routes: [[0, 3, 2, 4, 0], [1, 5, 1]], totalDistance: 32 },
      p059.cases[0].expectedOptimal,
      "en"
    );
    expect(v59VehCap.ok).toBe(false);
    expect(v59VehCap.status).toBe("VIOLATION");
    expect(v59VehCap.message).toMatch(/vehicleCapacity/i);

    const v59DepotCap = p059.judge(
      p059.cases[2].input,
      { routes: [[0, 2, 3, 0], [0, 4, 0], [1, 5, 6, 1]], totalDistance: 37 },
      p059.cases[2].expectedOptimal,
      "en"
    );
    expect(v59DepotCap.ok).toBe(false);
    expect(v59DepotCap.status).toBe("VIOLATION");
    expect(v59DepotCap.message).toMatch(/depotCapacities/i);

    // #060: Reject disconnected territory (non-adjacent {0, 2} & {1, 3, 4}) and demand imbalance
    const p060 = byId.get("060")!;
    const v60Disconnected = p060.judge(
      p060.cases[0].input,
      {
        territories: [
          { hub: 0, tour: [0, 2, 0] },
          { hub: 4, tour: [4, 1, 3, 4] },
        ],
        totalCost: 34,
      },
      p060.cases[0].expectedOptimal,
      "en"
    );
    expect(v60Disconnected.ok).toBe(false);
    expect(v60Disconnected.status).toBe("VIOLATION");
    expect(v60Disconnected.message).toMatch(/disconnected|island/i);

    const v60Imbalance = p060.judge(
      p060.cases[1].input,
      {
        territories: [
          { hub: 0, tour: [0, 3, 0] },
          { hub: 2, tour: [2, 1, 4, 5, 2] },
        ],
        totalCost: 38,
      },
      p060.cases[1].expectedOptimal,
      "en"
    );
    expect(v60Imbalance.ok).toBe(false);
    expect(v60Imbalance.status).toBe("VIOLATION");
    expect(v60Imbalance.message).toMatch(/balance bounds/i);

    // #057: Zero-time colocated customers must not allow customer-only subtours (WaSHI)
    {
      const zeroTimeRun = await runWashiExerciseCode(p057.washiSolution, [
        structuredClone(ZERO_TIME_VRPTW_INPUT),
      ]);
      expect(zeroTimeRun.ok).toBe(true);
      const out = zeroTimeRun.outputs[0] as { routes: number[][]; totalCost: number };
      expect(out.totalCost).toBeCloseTo(2, 6);
      expect(p057.judge(ZERO_TIME_VRPTW_INPUT, out, 2, "en").status).toBe("AC");
    }

    // Shape-before-violation RUNTIME_ERROR checks across Ch6 judges (#052, #056, #057, #058, #060)
    expect(
      p052.judge(
        p052.cases[0].input,
        { flows: [0, 0, 0, 0, 0], cutEdges: [999], maxFlow: Number.NaN },
        p052.cases[0].expectedOptimal,
        "en"
      ).status
    ).toBe("RUNTIME_ERROR");
    expect(
      p056.judge(
        p056.cases[0].input,
        { routes: [[0, 1, 0], [0, 2, 0], [0, 3]], totalDistance: 10 },
        p056.cases[0].expectedOptimal,
        "en"
      ).status
    ).toBe("RUNTIME_ERROR");
    expect(
      p057.judge(
        p057.cases[0].input,
        { routes: [[0, 1, 0], [0, 2, 0], [0, "bad"]], totalCost: 10 },
        p057.cases[0].expectedOptimal,
        "en"
      ).status
    ).toBe("RUNTIME_ERROR");
    expect(
      p058.judge(
        p058.cases[0].input,
        { routes: [[0, 1, 0], [0, 2, 0], [0]], totalDistance: 10 },
        p058.cases[0].expectedOptimal,
        "en"
      ).status
    ).toBe("RUNTIME_ERROR");
    expect(
      p059.judge(
        p059.cases[0].input,
        { routes: [[0, 2, 3, 1], null], totalDistance: 0 },
        p059.cases[0].expectedOptimal,
        "en"
      ).status
    ).toBe("RUNTIME_ERROR");
    expect(
      p060.judge(
        p060.cases[0].input,
        { territories: [{ hub: 0, tour: [0, "bad", 0] }], totalCost: 10 },
        p060.cases[0].expectedOptimal,
        "en"
      ).status
    ).toBe("RUNTIME_ERROR");
  },
});

describe("Exercises Chapter 6 Python parity (#057 zero-time)", () => {
  const p057 = PROBLEMS.find((p) => p.meta.chapter === 6 && p.meta.id === "057")!;

  itHighspy("eliminates zero-time customer subtours in PuLP solution.py", () => {
    const batch = runHighspyBatch([
      { id: "057_zero", code: p057.highspySolution, inputs: [ZERO_TIME_VRPTW_INPUT] },
    ]);
    expect(batch["057_zero"].ok).toBe(true);
    const out = batch["057_zero"].outputs![0] as { routes: number[][]; totalCost: number };
    expect(out.totalCost).toBeCloseTo(2, 6);
    expect(p057.judge(ZERO_TIME_VRPTW_INPUT, out, 2, "en").status).toBe("AC");
  });
});
