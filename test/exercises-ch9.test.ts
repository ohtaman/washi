import { expect } from "vitest";
import { runWashiExerciseCode } from "../examples/web-demo/exercises/src/runner/washi-runner.js";
import type { ProblemDefinition } from "../examples/web-demo/exercises/src/types.js";
import { registerChapterExerciseSuite } from "./helpers/exercises-chapter-harness.js";

function getProblem(problems: ProblemDefinition[], id: string): ProblemDefinition {
  const prob = problems.find((p) => p.meta.id === id);
  if (!prob) throw new Error(`Missing problem ${id}`);
  return prob;
}

registerChapterExerciseSuite({
  chapter: 9,
  dirName: "ch09-multiobjective-uncertainty",
  expectedIds: ["081", "082", "083", "084", "085", "086", "087", "088", "089", "090"],
  expectedRuntimes: {
    "081": ["washi", "highspy"],
    "082": ["washi", "highspy"],
    "083": ["washi", "highspy"],
    "084": ["washi"],
    "085": ["washi", "highspy"],
    "086": ["washi", "highspy"],
    "087": ["washi", "highspy"],
    "088": ["washi", "highspy"],
    "089": ["washi", "highspy"],
    "090": ["washi", "highspy"],
  },
  objectiveTol: 1e-2,
  enforceScaffoldPolicy: true,
  extractObjective: (id, output) => {
    const rec = output as Record<string, unknown>;
    const keyMap: Record<string, string> = {
      "081": "totalCost",
      "082": "minSurplus",
      "083": "frontierSum",
      "084": "totalCost",
      "085": "totalObjective",
      "086": "totalCost",
      "087": "expectedCost",
      "088": "totalObjective",
      "089": "totalProfit",
      "090": "totalCost",
    };
    const key = keyMap[id];
    return typeof rec[key] === "number" ? (rec[key] as number) : null;
  },
  checkAdversarial: async (problems) => {
    // #081: Capacity violation and suboptimal deviation
    {
      const p = getProblem(problems, "081");
      const c0 = p.cases[0];
      expect(
        p.judge(
          c0.input,
          { quantities: [10, 10, 10], shortfalls: [0, 0, 0], excesses: [0, 0, 0], totalCost: 120 },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("VIOLATION");
      expect(
        p.judge(
          c0.input,
          { quantities: [3, 10, 10], shortfalls: [7, 0, 0], excesses: [0, 0, 0], totalCost: 792 },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("SUBOPTIMAL");
    }

    // #082: Stage-1 suboptimal assignment, Stage-2 envy/rent violations, and unfair envy-free split fail
    {
      const p = getProblem(problems, "082");
      const c0 = p.cases[0];
      // Malformed output -> RUNTIME_ERROR
      expect(
        p.judge(c0.input, { assignment: [0, 1], rents: [600, 500, 400], totalValuation: 2100, minSurplus: 200 }, c0.expectedOptimal, "en").status
      ).toBe("RUNTIME_ERROR");
      // Duplicate room assignment -> VIOLATION
      expect(
        p.judge(c0.input, { assignment: [0, 0, 2], rents: [600, 500, 400], totalValuation: 2000, minSurplus: 200 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      // Suboptimal Stage-1 assignment [0, 2, 1] (totalValuation 1750 < 2100) -> VIOLATION
      expect(
        p.judge(c0.input, { assignment: [0, 2, 1], rents: [600, 450, 450], totalValuation: 1750, minSurplus: 0 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      // Negative rent -> VIOLATION
      expect(
        p.judge(c0.input, { assignment: [0, 1, 2], rents: [1000, 600, -100], totalValuation: 2100, minSurplus: -200 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      // Envy-freeness violated: equal rent [500, 500, 500] on Case 0? Wait: [500, 500, 500] is envy-free (surpluses 300, 200, 100) -> SUBOPTIMAL
      expect(
        p.judge(c0.input, { assignment: [0, 1, 2], rents: [500, 500, 500], totalValuation: 2100, minSurplus: 100 }, c0.expectedOptimal, "en").status
      ).toBe("SUBOPTIMAL");
      // Envy-freeness violated: rents [800, 350, 350] gives roommate 0 surplus 0 in room 0 vs 150 in room 1 -> VIOLATION
      expect(
        p.judge(c0.input, { assignment: [0, 1, 2], rents: [800, 350, 350], totalValuation: 2100, minSurplus: 0 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      // Optimal solution -> AC
      expect(
        p.judge(c0.input, { assignment: [0, 1, 2], rents: [600, 500, 400], totalValuation: 2100, minSurplus: 200 }, c0.expectedOptimal, "en").status
      ).toBe("AC");
    }

    // #083: Missing unsupported Pareto point or exceeding epsilon cap
    {
      const p = getProblem(problems, "083");
      const c1 = p.cases[1];
      // Unsupported Pareto point at eps=7: [0, 1, 0, 0, 0] gives 34 or [1, 1, 0, 0, 0] gives 54; replacing with 48 gives SUBOPTIMAL
      expect(
        p.judge(
          c1.input,
          {
            selections: [
              [1, 0, 0, 0, 0],
              [0, 0, 1, 0, 0],
              [1, 0, 1, 0, 0],
              [0, 1, 0, 1, 0],
              [0, 0, 1, 0, 1],
            ],
            frontierProfits: [20, 48, 68, 89, 128],
            frontierSum: 353,
          },
          c1.expectedOptimal,
          "en"
        ).status
      ).toBe("SUBOPTIMAL");
      // Exceeding epsilon=2 at k=0
      expect(
        p.judge(
          c1.input,
          {
            selections: [
              [0, 1, 0, 0, 0],
              [1, 1, 0, 0, 0],
              [0, 0, 0, 1, 0],
              [0, 0, 0, 0, 1],
              [0, 0, 1, 0, 1],
            ],
            frontierProfits: [34, 54, 55, 80, 128],
            frontierSum: 351,
          },
          c1.expectedOptimal,
          "en"
        ).status
      ).toBe("VIOLATION");
    }

    // #084: WaSHI-only QP checks + LP format quadratic verification + unfair corner suboptimal
    {
      const p = getProblem(problems, "084");
      expect(p.meta.runtimes).toEqual(["washi"]);
      expect(p.meta.paradigms).toEqual(["QP", "LP"]);
      expect(p.highspyStarter).toBe("");
      expect(p.highspySolution).toBe("");

      const runRes = await runWashiExerciseCode(p.washiSolution, [structuredClone(p.cases[0].input)]);
      expect(runRes.ok).toBe(true);
      expect(runRes.lpPreview).toMatch(/\[.*\]\s*\/\s*2/);

      // Pure linear corner [0, 20, 10] violates fairness optimality on Case 0
      expect(
        p.judge(p.cases[0].input, { allocations: [0, 20, 10], totalCost: 500 }, p.cases[0].expectedOptimal, "en").status
      ).toBe("SUBOPTIMAL");
      expect(
        p.judge(p.cases[0].input, { allocations: [9, 9, 9], totalCost: 162 }, p.cases[0].expectedOptimal, "en").status
      ).toBe("VIOLATION");
    }

    // #085: Unavailable assignment & suboptimal stability
    {
      const p = getProblem(problems, "085");
      const c0 = p.cases[0];
      expect(
        p.judge(
          c0.input,
          {
            schedule: [
              [1, 1, 0, 0],
              [0, 1, 1, 0],
              [0, 0, 1, 1],
            ],
            hammingDistance: 0,
            totalObjective: 72,
          },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("VIOLATION");
      // Valid repair with extra flips (hamming=6, obj=372 > 272) -> SUBOPTIMAL
      expect(
        p.judge(
          c0.input,
          {
            schedule: [
              [0, 1, 0, 1],
              [1, 0, 1, 0],
              [0, 1, 1, 0],
            ],
            hammingDistance: 6,
            totalObjective: 372,
          },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("SUBOPTIMAL");
    }

    // #086: Non-MPC trajectories (H=1 myopic, wrong period-1 action matching Case 1 cost, Clairvoyant) rejected; alternative MPC optima accepted
    {
      const p = getProblem(problems, "086");
      const c0 = p.cases[0];
      // H=1 myopic on Case 0 violates window optimality at t=0 (produces 10 instead of 20)
      expect(
        p.judge(
          c0.input,
          {
            produced: [10, 10, 20, 10],
            inventories: [0, 0, 0, 0],
            shortfalls: [0, 0, 10, 0],
            totalCost: 1830,
          },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("VIOLATION");

      // Codex Case 1 counterexample: matches totalCost=1150, but commits produced[1]=18 instead of window optimum 20
      expect(
        p.judge(
          p.cases[1].input,
          {
            produced: [20, 18, 18, 20, 15],
            inventories: [12, 6, 6, 0, 0],
            shortfalls: [0, 0, 0, 0, 0],
            totalCost: 1150,
          },
          p.cases[1].expectedOptimal,
          "en"
        ).status
      ).toBe("VIOLATION");

      // Alternative-optima MPC test: c_0 + holdCost == c_1 => x_0 in [10, 20] both optimal for window [0, 1]
      const tieInput = {
        actualDemands: [10, 10],
        forecastDemands: [10, 10],
        prodCosts: [10, 12],
        prodCap: 20,
        holdCost: 2,
        shortfallPenalty: 100,
        initialInventory: 0,
        windowLen: 2,
      };
      expect(
        p.judge(
          tieInput,
          { produced: [10, 10], inventories: [0, 0], shortfalls: [0, 0], totalCost: 220 },
          220,
          "en"
        ).status
      ).toBe("AC");
      expect(
        p.judge(
          tieInput,
          { produced: [20, 0], inventories: [10, 0], shortfalls: [0, 0], totalCost: 220 },
          220,
          "en"
        ).status
      ).toBe("AC");

      // Divergent realized cost under alternative MPC window optima when actualDemands != forecastDemands
      const divergentTieInput = {
        ...tieInput,
        actualDemands: [5, 10],
      };
      const branchA = { produced: [10, 5], inventories: [5, 0], shortfalls: [0, 0], totalCost: 170 };
      const branchB = { produced: [20, 0], inventories: [15, 5], shortfalls: [0, 0], totalCost: 240 };
      for (const refObj of [170, 240]) {
        expect(p.judge(divergentTieInput, branchA, refObj, "en").status).toBe("AC");
        expect(p.judge(divergentTieInput, branchB, refObj, "en").status).toBe("AC");
      }

      // Shape-before-violation checks for #083 and #085
      const p083 = getProblem(problems, "083");
      expect(
        p083.judge(
          p083.cases[0].input,
          {
            selections: [[2, 0, 0, 0], null, [0, 0, 0, 0], [0, 0, 0, 0]],
            frontierProfits: [0, 0, 0, 0],
            frontierSum: 0,
          },
          p083.cases[0].expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");

      const p085 = getProblem(problems, "085");
      expect(
        p085.judge(
          p085.cases[0].input,
          {
            schedule: [[2, 0, 0, 0], null, [0, 0, 0, 0]],
            hammingDistance: 0,
            totalObjective: 0,
          },
          p085.cases[0].expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");

      // Clairvoyant cheat on Case 1 (solves full horizon over actualDemands -> cost=1145 < 1150)
      const clairvoyantRun = await runWashiExerciseCode(
        p.washiSolution
          .replace("input.windowLen", "T")
          .replace("input.forecastDemands", "input.actualDemands"),
        [structuredClone(p.cases[1].input)]
      );
      expect(clairvoyantRun.ok).toBe(true);
      expect(
        p.judge(p.cases[1].input, clairvoyantRun.outputs[0], p.cases[1].expectedOptimal, "en").status
      ).toBe("VIOLATION");
    }

    // #087: Deterministic Expected-Value solution fails on Case 0 (VSS > 0)
    {
      const p = getProblem(problems, "087");
      const c0 = p.cases[0];
      // Mean demand = [15, 12] -> EV order=[15, 12], expected cost = 196.5 > 184
      expect(
        p.judge(c0.input, { orders: [15, 12], expectedCost: 196.5 }, c0.expectedOptimal, "en").status
      ).toBe("SUBOPTIMAL");
      expect(
        p.judge(c0.input, { orders: [20, 16], expectedCost: 170 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
    }

    // #088: Forgetting lb: -Infinity on eta fails on Case 1 (all positive returns)
    {
      const p = getProblem(problems, "088");
      const clampedEtaCode = p.washiSolution.replace("{ lb: -Infinity, ub: Infinity }", "{ lb: 0 }");
      const clampedRun = await runWashiExerciseCode(clampedEtaCode, [structuredClone(p.cases[1].input)]);
      expect(clampedRun.ok).toBe(true);
      const clampedVerdict = p.judge(p.cases[1].input, clampedRun.outputs[0], p.cases[1].expectedOptimal, "en");
      expect(clampedVerdict.ok).toBe(false);
    }

    // #089: Nominal (gamma=0) violates worst case; Soyster (gamma=n) is suboptimal
    {
      const p = getProblem(problems, "089");
      const c0 = p.cases[0];
      // Nominal [8, 4.6667, 0], profit = 170.6667 -> VIOLATION under gamma=1
      expect(
        p.judge(c0.input, { quantities: [8, 4.6666667, 0], totalProfit: 170.6666667 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      // Soyster [1.4285714, 1.4285714, 8], profit = 120 -> SUBOPTIMAL
      expect(
        p.judge(c0.input, { quantities: [1.4285714, 1.4285714, 8], totalProfit: 120 }, c0.expectedOptimal, "en").status
      ).toBe("SUBOPTIMAL");
    }

    // #090: Non-robust Stage-1 commitment and offline recovery unit rejected
    {
      const p = getProblem(problems, "090");
      const c0 = p.cases[0];
      // [1, 0, 0, 1] has surviving cap 18+16-8 = 26 < 28 -> VIOLATION
      expect(
        p.judge(
          c0.input,
          {
            committed: [1, 0, 0, 1],
            recovered: [
              [1, 0, 0, 1],
              [1, 0, 0, 1],
            ],
            totalCost: 230,
          },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("VIOLATION");
      // Using offline unit 1 in Scenario 1 -> VIOLATION
      expect(
        p.judge(
          c0.input,
          {
            committed: [0, 1, 0, 1],
            recovered: [
              [0, 1, 0, 1],
              [0, 1, 0, 1],
            ],
            totalCost: 260,
          },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("VIOLATION");
      // Malformed recovered row with violating committed must return RUNTIME_ERROR first
      expect(
        p.judge(
          c0.input,
          {
            committed: [2, 0, 0, 1],
            recovered: [[0, 0, 0], [0, 0, 0, 1]],
            totalCost: 200,
          },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");
    }
  },
});
