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

const EXPECTED_IDS = [
  "021",
  "022",
  "023",
  "024",
  "025",
  "026",
  "027",
  "028",
  "029",
  "030",
] as const;

const EXPECTED_RUNTIMES = Object.fromEntries(
  EXPECTED_IDS.map((id) => [id, ["washi", "highspy"] as const])
);

function extractCh3Objective(id: string, output: unknown): number | null {
  const rec = output as Record<string, unknown>;
  const keyMap: Record<string, string> = {
    "021": "peakLoad",
    "022": "totalDeviation",
    "023": "totalCost",
    "024": "maxRatio",
    "025": "totalCost",
    "026": "totalValue",
    "027": "optimalCost",
    "028": "optimalCost",
    "029": "totalCost",
    "030": "totalCost",
  };
  const key = keyMap[id];
  return key && typeof rec[key] === "number" ? (rec[key] as number) : null;
}

registerChapterExerciseSuite({
  chapter: 3,
  dirName: "ch03-linearization-duality",
  expectedIds: EXPECTED_IDS,
  expectedRuntimes: EXPECTED_RUNTIMES,
  objectiveTol: 1e-4,
  extractObjective: extractCh3Objective,
  checkAdversarial: async (problems) => {
    const byId = new Map(problems.map((p) => [p.meta.id, p]));

    // #021: Reject incompatible server usage and wrong peakLoad
    {
      const p = byId.get("021")!;
      const c0 = p.cases[0];
      const badCompat = p.judge(
        c0.input,
        { assignments: [[0, 1], [0.5, 0.5], [0, 1]], peakLoad: 19 },
        c0.expectedOptimal,
        "en"
      );
      expect(badCompat.ok).toBe(false);
      expect(badCompat.status).toBe("VIOLATION");

      const badPeak = p.judge(
        c0.input,
        { assignments: [[1, 0], [0.25, 0.75], [0, 1]], peakLoad: 10 },
        c0.expectedOptimal,
        "en"
      );
      expect(badPeak.ok).toBe(false);
      expect(badPeak.status).toBe("VIOLATION");
    }

    // #022: Reject budget/sum violations and wrong totalDeviation
    {
      const p = byId.get("022")!;
      const c0 = p.cases[0];
      const badBudget = p.judge(
        c0.input,
        { allocations: [40, 30, 30], totalDeviation: 0 },
        c0.expectedOptimal,
        "en"
      );
      expect(badBudget.ok).toBe(false);
      expect(badBudget.status).toBe("VIOLATION");

      const subopt = p.judge(
        c0.input,
        { allocations: [20, 40, 40], totalDeviation: 90 },
        c0.expectedOptimal,
        "en"
      );
      expect(subopt.ok).toBe(false);
      expect(subopt.status).toBe("SUBOPTIMAL");
    }

    // #023: Verify reverse-sign trap & equality trap explicitly fail
    {
      const p = byId.get("023")!;
      const reverseSignCode = p.washiSolution.replace(
        "expr`${shortage[t]} >= ${demand} - ${regular[t]}`",
        "expr`${shortage[t]} >= ${regular[t]} - ${demand}`"
      );
      const revRun = await runWashiExerciseCode(reverseSignCode, [
        structuredClone(p.cases[0].input),
      ]);
      expect(revRun.ok).toBe(true);
      const revVerdict = p.judge(
        p.cases[0].input,
        revRun.outputs[0],
        p.cases[0].expectedOptimal,
        "en"
      );
      expect(revVerdict.ok).toBe(false);
      expect(revVerdict.status).toBe("VIOLATION");

      const equalityTrapCode = p.washiSolution.replace(
        "expr`${shortage[t]} >= ${demand} - ${regular[t]}`",
        "expr`${shortage[t]} == ${demand} - ${regular[t]}`"
      );
      const eqRun = await runWashiExerciseCode(equalityTrapCode, [
        structuredClone(p.cases[1].input),
      ]);
      expect(eqRun.ok).toBe(true);
      expect(eqRun.metrics[0]?.solverStatus).toBe("Infeasible");
    }

    // #024: Reject wrong ratio and suboptimal numerator-maximizing solution
    {
      const p = byId.get("024")!;
      const c0 = p.cases[0];
      const wrongRatio = p.judge(
        c0.input,
        { x: [0, 6], maxRatio: 64 },
        c0.expectedOptimal,
        "en"
      );
      expect(wrongRatio.ok).toBe(false);
      expect(wrongRatio.status).toBe("VIOLATION");

      const suboptNum = p.judge(
        c0.input,
        { x: [5, 3], maxRatio: 97 / 34 },
        c0.expectedOptimal,
        "en"
      );
      expect(suboptNum.ok).toBe(false);
      expect(suboptNum.status).toBe("SUBOPTIMAL");
    }

    // #025: Reject bilinear mismatch z_i != b_i * x_i
    {
      const p = byId.get("025")!;
      const c0 = p.cases[0];
      const badZ = p.judge(
        c0.input,
        { b: [1, 0, 0], x: [50, 15, 30], z: [50, 15, 0], totalCost: 1690 },
        c0.expectedOptimal,
        "en"
      );
      expect(badZ.ok).toBe(false);
      expect(badZ.status).toBe("VIOLATION");
    }

    // #026: Reject non-equal w_ij != x_i x_j and omitting lower McCormick bound
    {
      const p = byId.get("026")!;
      const c0 = p.cases[0];
      const zeroW = p.judge(
        c0.input,
        { selected: [1, 1, 0, 0], pairProducts: [0, 0, 0, 0], totalValue: 75 },
        c0.expectedOptimal,
        "en"
      );
      expect(zeroW.ok).toBe(false);
      expect(zeroW.status).toBe("VIOLATION");

      const fakeBonusW = p.judge(
        c0.input,
        { selected: [1, 0, 0, 0], pairProducts: [1, 0, 0, 0], totalValue: 65 },
        c0.expectedOptimal,
        "en"
      );
      expect(fakeBonusW.ok).toBe(false);
      expect(fakeBonusW.status).toBe("VIOLATION");

      const noLowerMcCormick = p.washiSolution.replace(
        "expr`${pairProducts[k]} >= ${selected[i]} + ${selected[j]} - 1`,",
        ""
      );
      const cheatRun = await runWashiExerciseCode(noLowerMcCormick, [
        structuredClone(p.cases[1].input),
      ]);
      expect(cheatRun.ok).toBe(true);
      const cheatVerdict = p.judge(
        p.cases[1].input,
        cheatRun.outputs[0],
        p.cases[1].expectedOptimal,
        "en"
      );
      expect(cheatVerdict.ok).toBe(false);
      expect(cheatVerdict.status).toBe("VIOLATION");
    }

    // #027: Reject wrong dual signs, non-zero slack duals, and verify WaSHI == PuLP duals to <= 1e-4
    {
      const p = byId.get("027")!;
      const c0 = p.cases[0];
      const flippedDuals = p.judge(
        c0.input,
        { quantities: [4, 10, 2], duals: [-6, -5, 3], optimalCost: 230 },
        c0.expectedOptimal,
        "en"
      );
      expect(flippedDuals.ok).toBe(false);
      expect(flippedDuals.status).toBe("VIOLATION");

      const wrongCapSign = p.judge(
        c0.input,
        { quantities: [4, 10, 2], duals: [6, 5, 3], optimalCost: 230 },
        c0.expectedOptimal,
        "en"
      );
      expect(wrongCapSign.ok).toBe(false);
      expect(wrongCapSign.status).toBe("VIOLATION");

      const wrongMagnitude = p.judge(
        c0.input,
        { quantities: [4, 10, 2], duals: [5, 5, -3], optimalCost: 230 },
        c0.expectedOptimal,
        "en"
      );
      expect(wrongMagnitude.ok).toBe(false);
      expect(wrongMagnitude.status).toBe("VIOLATION");

      const c2 = p.cases[2];
      const nonZeroSlackDual = p.judge(
        c2.input,
        { quantities: [3.5, 10.5, 4.5, 0], duals: [16.75, 3.75, -20, -1], optimalCost: 269.5 },
        c2.expectedOptimal,
        "en"
      );
      expect(nonZeroSlackDual.ok).toBe(false);
      expect(nonZeroSlackDual.status).toBe("VIOLATION");
    }

    // #028: Reject wrong reduced cost signs/zeros/raw costs
    {
      const p = byId.get("028")!;
      const c0 = p.cases[0];
      const negRc = p.judge(
        c0.input,
        { quantities: [5, 6, 0, 0], reducedCosts: [0, 0, -6, -10], optimalCost: 134 },
        c0.expectedOptimal,
        "en"
      );
      expect(negRc.ok).toBe(false);
      expect(negRc.status).toBe("VIOLATION");

      const zeroRc = p.judge(
        c0.input,
        { quantities: [5, 6, 0, 0], reducedCosts: [0, 0, 0, 0], optimalCost: 134 },
        c0.expectedOptimal,
        "en"
      );
      expect(zeroRc.ok).toBe(false);
      expect(zeroRc.status).toBe("VIOLATION");

      const rawCostRc = p.judge(
        c0.input,
        { quantities: [5, 6, 0, 0], reducedCosts: [10, 14, 24, 30], optimalCost: 134 },
        c0.expectedOptimal,
        "en"
      );
      expect(rawCostRc.ok).toBe(false);
      expect(rawCostRc.status).toBe("VIOLATION");
    }

    // #029: Reject output falling in forbidden gap between operating bands
    {
      const p = byId.get("029")!;
      const c0 = p.cases[0];
      const gapOutput = p.judge(
        c0.input,
        { modes: [2, 1], outputs: [25, 17], totalCost: 990 },
        c0.expectedOptimal,
        "en"
      );
      expect(gapOutput.ok).toBe(false);
      expect(gapOutput.status).toBe("VIOLATION");
    }

    // #030: Reject non-equal pairProducts and under-reported peakLoad
    {
      const p = byId.get("030")!;
      const c0 = p.cases[0];
      const badW = p.judge(
        c0.input,
        { selected: [1, 0, 0, 1], pairProducts: [1, 0, 0], peakLoad: 18, totalCost: 184 },
        c0.expectedOptimal,
        "en"
      );
      expect(badW.ok).toBe(false);
      expect(badW.status).toBe("VIOLATION");

      const badPeak = p.judge(
        c0.input,
        { selected: [1, 0, 0, 1], pairProducts: [0, 0, 0], peakLoad: 10, totalCost: 161 },
        c0.expectedOptimal,
        "en"
      );
      expect(badPeak.ok).toBe(false);
      expect(badPeak.status).toBe("VIOLATION");
    }
  },
});

describe("Exercises Chapter 3 Python parity (#027, #028)", () => {
  const byId = new Map(
    PROBLEMS.filter((p) => p.meta.chapter === 3).map((p) => [p.meta.id, p])
  );

  itHighspy("matches WaSHI and PuLP duals (#027) and reduced costs (#028) within 1e-4", async () => {
    const p027 = byId.get("027")!;
    const p028 = byId.get("028")!;

    const w027 = await runWashiExerciseCode(
      p027.washiSolution,
      p027.cases.map((c) => structuredClone(c.input))
    );
    expect(w027.ok).toBe(true);

    const w028 = await runWashiExerciseCode(
      p028.washiSolution,
      p028.cases.map((c) => structuredClone(c.input))
    );
    expect(w028.ok).toBe(true);

    const pyBatch = runHighspyBatch([
      { id: "027", code: p027.highspySolution, inputs: p027.cases.map((c) => c.input) },
      { id: "028", code: p028.highspySolution, inputs: p028.cases.map((c) => c.input) },
    ]);
    expect(pyBatch["027"].ok).toBe(true);
    expect(pyBatch["028"].ok).toBe(true);

    for (let idx = 0; idx < p027.cases.length; idx++) {
      const wOut = w027.outputs[idx] as { duals: number[]; optimalCost: number };
      const pyOut = pyBatch["027"].outputs![idx] as { duals: number[]; optimalCost: number };
      expect(Math.abs(wOut.optimalCost - pyOut.optimalCost)).toBeLessThanOrEqual(1e-4);
      expect(wOut.duals).toHaveLength(pyOut.duals.length);
      for (let k = 0; k < wOut.duals.length; k++) {
        expect(Math.abs(wOut.duals[k] - pyOut.duals[k])).toBeLessThanOrEqual(1e-4);
      }
    }

    for (let idx = 0; idx < p028.cases.length; idx++) {
      const wOut = w028.outputs[idx] as { reducedCosts: number[]; optimalCost: number };
      const pyOut = pyBatch["028"].outputs![idx] as { reducedCosts: number[]; optimalCost: number };
      expect(Math.abs(wOut.optimalCost - pyOut.optimalCost)).toBeLessThanOrEqual(1e-4);
      expect(wOut.reducedCosts).toHaveLength(pyOut.reducedCosts.length);
      for (let j = 0; j < wOut.reducedCosts.length; j++) {
        expect(Math.abs(wOut.reducedCosts[j] - pyOut.reducedCosts[j])).toBeLessThanOrEqual(1e-4);
      }
    }
  });
});
