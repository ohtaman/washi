import { expect } from "vitest";
import { runWashiExerciseCode } from "../examples/web-demo/exercises/src/runner/washi-runner.js";
import { registerChapterExerciseSuite, runHighspyBatch } from "./helpers/exercises-chapter-harness.js";

function extractCh2Objective(_id: string, output: unknown): number | null {
  if (typeof output !== "object" || output === null) return null;
  const rec = output as Record<string, unknown>;
  for (const key of [
    "totalMargin",
    "totalCost",
    "totalValue",
    "netProfit",
    "totalCoveredDemand",
  ]) {
    if (typeof rec[key] === "number" && Number.isFinite(rec[key])) {
      return rec[key] as number;
    }
  }
  return null;
}

registerChapterExerciseSuite({
  chapter: 2,
  dirName: "ch02-mip-formulation-idioms",
  expectedIds: ["011", "012", "013", "014", "015", "016", "017", "018", "019", "020"],
  expectedRuntimes: {
    "011": ["washi", "highspy"],
    "012": ["washi", "highspy"],
    "013": ["washi", "highspy"],
    "014": ["washi", "highspy"],
    "015": ["washi", "highspy"],
    "016": ["washi", "highspy"],
    "017": ["washi", "highspy"],
    "018": ["washi", "highspy"],
    "019": ["washi", "highspy"],
    "020": ["washi", "highspy"],
  },
  extractObjective: extractCh2Objective,
  checkAdversarial: async (problems) => {
    const byId = new Map(problems.map((p) => [p.meta.id, p]));

    // #011: Starter missing lower bound must produce VIOLATION in WaSHI (and PuLP if uv is present)
    {
      const p = byId.get("011")!;
      const c0 = p.cases[0];
      const washiStarterRun = await runWashiExerciseCode(p.washiStarter, [structuredClone(c0.input)]);
      expect(washiStarterRun.ok).toBe(true);
      expect(
        p.judge(c0.input, washiStarterRun.outputs[0], c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");

      if (process.env.REQUIRE_HIGHSPY_PYTHON === "1") {
        const pyRes = runHighspyBatch([
          { id: "011_starter", code: p.highspyStarter, inputs: [c0.input] },
        ])["011_starter"];
        expect(pyRes.ok).toBe(true);
        expect(
          p.judge(c0.input, pyRes.outputs![0], c0.expectedOptimal, "en").status
        ).toBe("VIOLATION");
      }
    }

    // Malformed / NaN / ragged-matrix RUNTIME_ERROR and objective-tampering VIOLATION checks
    {
      const p012 = byId.get("012")!;
      expect(
        p012.judge(
          p012.cases[0].input,
          { open: [[1, 1, 0]], shipments: [[30, 35, 0], [0, 0, 25]], totalCost: 620 },
          p012.cases[0].expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");
      expect(
        p012.judge(
          p012.cases[0].input,
          { open: [[1, 1, 0], [0, 0, 1]], shipments: [[30, Number.NaN, 0], [0, 0, 25]], totalCost: 620 },
          p012.cases[0].expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");
      expect(
        p012.judge(
          p012.cases[0].input,
          { open: [[1, 1, 0], [0, 0, 1]], shipments: [[30, 35, 0], [0, 0, 25]], totalCost: 999 },
          p012.cases[0].expectedOptimal,
          "en"
        ).status
      ).toBe("VIOLATION");

      const p019 = byId.get("019")!;
      expect(
        p019.judge(
          p019.cases[0].input,
          { tierSelected: [[0, 1], [0]], tierQuantities: [[0, 35], [0, 25]], totalCost: 517.5 },
          p019.cases[0].expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");
      expect(
        p019.judge(
          p019.cases[0].input,
          { tierSelected: [[1, 0], [0]], tierQuantities: [[0, 0], [0, 0]], totalCost: 0 },
          p019.cases[0].expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");
      expect(
        p019.judge(
          p019.cases[0].input,
          { tierSelected: [[1, 0], [0, 1]], tierQuantities: [[0, 0], [0, 0]], totalCost: Number.NaN },
          p019.cases[0].expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");

      const p020 = byId.get("020")!;
      expect(
        p020.judge(
          p020.cases[0].input,
          { open: [0, 1, 1], shipments: [[0, 0, 0, 0], [20, 30, 0]], totalCost: 985 },
          p020.cases[0].expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");
      expect(
        p020.judge(
          p020.cases[0].input,
          { open: [0, 1, 1], shipments: [[-5, 0, 0, 0], [20, 30, 0]], totalCost: 985 },
          p020.cases[0].expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");
      expect(
        p020.judge(
          p020.cases[0].input,
          { open: [0, 1, 1], shipments: [[-5, 0, 0, 0], [20, 30, 0, 0], [0, 0, 0, 0]], totalCost: Number.NaN },
          p020.cases[0].expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");

      expect(
        p012.judge(
          p012.cases[0].input,
          { open: [[0.5, 0, 0], [0, 0, 1]], shipments: [[0, 0, 0], [0, 0]], totalCost: 620 },
          p012.cases[0].expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");
      expect(
        p012.judge(
          p012.cases[0].input,
          { open: [[0, 0, 0], [0, 0, 1]], shipments: [[10, 0, 0], [0, 0, 25]], totalCost: undefined },
          p012.cases[0].expectedOptimal,
          "en"
        ).status
      ).toBe("RUNTIME_ERROR");
    }

    // #011: Semi-continuous bounds violation (0 < q < minBatches) and suboptimality
    {
      const p = byId.get("011")!;
      const c0 = p.cases[0];
      expect(
        p.judge(c0.input, { active: [1, 1, 1], quantities: [20, 10, 0], totalMargin: 840 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      expect(
        p.judge(c0.input, { active: [0, 0, 0], quantities: [15, 15, 0], totalMargin: 810 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      expect(
        p.judge(c0.input, { active: [1, 0, 1], quantities: [20, 0, 10], totalMargin: 780 }, c0.expectedOptimal, "en").status
      ).toBe("SUBOPTIMAL");
    }

    // #012: Fixed-charge network closed-lane leak, unmet demand, and suboptimality
    {
      const p = byId.get("012")!;
      const c0 = p.cases[0];
      expect(
        p.judge(
          c0.input,
          { open: [[0, 1, 0], [0, 0, 1]], shipments: [[30, 35, 0], [0, 0, 25]], totalCost: 500 },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("VIOLATION");
      expect(
        p.judge(
          c0.input,
          { open: [[1, 1, 0], [0, 0, 1]], shipments: [[30, 30, 0], [0, 0, 25]], totalCost: 595 },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("VIOLATION");
      expect(
        p.judge(
          c0.input,
          { open: [[1, 0, 0], [0, 1, 1]], shipments: [[30, 0, 0], [0, 35, 25]], totalCost: 755 },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("SUBOPTIMAL");
    }

    // #013: Mutex, exact-k, at-least-one violations and suboptimality
    {
      const p = byId.get("013")!;
      const c0 = p.cases[0];
      expect(
        p.judge(c0.input, { selected: [1, 1, 1, 0, 0, 0], totalValue: 41 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      expect(
        p.judge(c0.input, { selected: [0, 1, 0, 0, 1, 0], totalValue: 36 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      expect(
        p.judge(c0.input, { selected: [0, 1, 1, 1, 0, 0], totalValue: 35 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      expect(
        p.judge(c0.input, { selected: [1, 0, 0, 1, 1, 0], totalValue: 41 }, c0.expectedOptimal, "en").status
      ).toBe("SUBOPTIMAL");
    }

    // #014: Prerequisite, conjunction trigger, conflict, range violation, and suboptimality
    {
      const p = byId.get("014")!;
      const c0 = p.cases[0];
      expect(
        p.judge(c0.input, { active: [0, 1, 0, 0, 1], levels: [0, 22, 0, 0, 24], netProfit: 789 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      expect(
        p.judge(c0.input, { active: [1, 1, 1, 0, 0], levels: [13, 22, 20, 0, 0], netProfit: 797 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      expect(
        p.judge(c0.input, { active: [0, 0, 1, 0, 1], levels: [0, 0, 20, 0, 24], netProfit: 790 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      expect(
        p.judge(c0.input, { active: [1, 1, 0, 0, 1], levels: [5, 22, 0, 0, 24], netProfit: 729 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      expect(
        p.judge(c0.input, { active: [0, 0, 1, 0, 0], levels: [0, 0, 20, 0, 0], netProfit: 405 }, c0.expectedOptimal, "en").status
      ).toBe("SUBOPTIMAL");
    }

    // #015: Set covering uncovered element and suboptimality
    {
      const p = byId.get("015")!;
      const c0 = p.cases[0];
      expect(
        p.judge(c0.input, { selected: [1, 1, 0, 0, 0], totalCost: 11 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      expect(
        p.judge(c0.input, { selected: [1, 0, 0, 1, 0], totalCost: 13 }, c0.expectedOptimal, "en").status
      ).toBe("SUBOPTIMAL");
    }

    // #016: Set partitioning rejects Set Covering overlap (even at lower cost!) and accepts exact optimality
    {
      const p = byId.get("016")!;
      const c0 = p.cases[0];
      expect(
        p.judge(c0.input, { selected: [1, 1, 0, 0, 0, 0], totalCost: 10 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      expect(
        p.judge(c0.input, { selected: [0, 0, 1, 1, 0, 0], totalCost: 15 }, c0.expectedOptimal, "en").status
      ).toBe("SUBOPTIMAL");
    }

    // #017: MCLP rejects excess open facilities, false coverage, accepts alternative optima, and flags suboptimality
    {
      const p = byId.get("017")!;
      const c0 = p.cases[0];
      expect(
        p.judge(c0.input, { open: [1, 1, 1, 0], covered: [1, 1, 1, 1, 0], totalCoveredDemand: 130 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      expect(
        p.judge(c0.input, { open: [1, 0, 0, 0], covered: [1, 1, 1, 1, 0], totalCoveredDemand: 130 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      expect(
        p.judge(c0.input, { open: [0, 1, 0, 1], covered: [0, 1, 1, 1, 1], totalCoveredDemand: 112 }, c0.expectedOptimal, "en").status
      ).toBe("SUBOPTIMAL");
      // Alternative optimal site pair [1, 0, 1, 0] also achieves 130 and must be accepted
      expect(
        p.judge(c0.input, { open: [1, 0, 1, 0], covered: [1, 1, 1, 1, 0], totalCoveredDemand: 130 }, c0.expectedOptimal, "en").status
      ).toBe("AC");
    }

    // #018: Multidimensional knapsack resource 1 overflow, prereq, incompatibles, and suboptimality
    {
      const p = byId.get("018")!;
      const c0 = p.cases[0];
      expect(
        p.judge(c0.input, { selected: [1, 0, 1, 0, 1], totalValue: 45 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      expect(
        p.judge(c0.input, { selected: [0, 1, 0, 1, 0], totalValue: 43 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      expect(
        p.judge(c0.input, { selected: [0, 1, 1, 0, 0], totalValue: 46 }, c0.expectedOptimal, "en").status
      ).toBe("VIOLATION");
      expect(
        p.judge(c0.input, { selected: [1, 0, 0, 1, 0], totalValue: 27 }, c0.expectedOptimal, "en").status
      ).toBe("SUBOPTIMAL");
    }

    // #019: Volume discount double-tier selection, below minQty, unmet demand, and suboptimality
    {
      const p = byId.get("019")!;
      const c0 = p.cases[0];
      expect(
        p.judge(
          c0.input,
          { tierSelected: [[1, 1], [0, 0]], tierQuantities: [[20, 40], [0, 0]], totalCost: 560 },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("VIOLATION");
      expect(
        p.judge(
          c0.input,
          { tierSelected: [[0, 1], [0, 1]], tierQuantities: [[0, 30], [0, 30]], totalCost: 519 },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("VIOLATION");
      expect(
        p.judge(
          c0.input,
          { tierSelected: [[0, 1], [0, 0]], tierQuantities: [[0, 50], [0, 0]], totalCost: 425 },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("VIOLATION");
      expect(
        p.judge(
          c0.input,
          { tierSelected: [[0, 1], [1, 0]], tierQuantities: [[0, 50], [10, 0]], totalCost: 525 },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("SUBOPTIMAL");
    }

    // #020: CFLP closed facility flow, excess capacity, unmet demand, and suboptimality
    {
      const p = byId.get("020")!;
      const c0 = p.cases[0];
      expect(
        p.judge(
          c0.input,
          { open: [0, 0, 1], shipments: [[0, 0, 0, 0], [20, 30, 0, 0], [5, 0, 20, 25]], totalCost: 725 },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("VIOLATION");
      expect(
        p.judge(
          c0.input,
          { open: [0, 1, 1], shipments: [[0, 0, 0, 0], [25, 30, 0, 0], [0, 0, 20, 25]], totalCost: 970 },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("VIOLATION");
      expect(
        p.judge(
          c0.input,
          { open: [1, 0, 1], shipments: [[25, 25, 0, 0], [0, 0, 0, 0], [0, 5, 20, 25]], totalCost: 1050 },
          c0.expectedOptimal,
          "en"
        ).status
      ).toBe("SUBOPTIMAL");
    }
  },
});
