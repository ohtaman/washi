import { describe, expect, it } from "vitest";
import { CH10_PROBLEMS } from "../examples/web-demo/exercises/src/problems/ch10-decomposition-hybrid/index.js";
import { registerChapterExerciseSuite } from "./helpers/exercises-chapter-harness.js";

function getProblem(id: string) {
  const prob = CH10_PROBLEMS.find((p) => p.meta.id === id);
  if (!prob) throw new Error(`Missing problem #${id}`);
  return prob;
}

function extractCh10Objective(output: unknown): number | null {
  if (!output || typeof output !== "object") return null;
  const obj = output as Record<string, unknown>;
  for (const key of ["totalCost", "totalProfit", "totalDistance", "totalRolls", "binsUsed"]) {
    if (typeof obj[key] === "number" && Number.isFinite(obj[key])) {
      return obj[key] as number;
    }
  }
  return null;
}

registerChapterExerciseSuite({
  chapter: 10,
  dirName: "ch10-decomposition-hybrid",
  expectedIds: ["091", "092", "093", "094", "095", "096", "097", "098", "099", "100"],
  expectedRuntimes: {
    "091": ["washi", "highspy"],
    "092": ["washi", "highspy"],
    "093": ["washi", "highspy"],
    "094": ["washi"],
    "095": ["washi"],
    "096": ["washi"],
    "097": ["washi"],
    "098": ["washi"],
    "099": ["washi", "highspy"],
    "100": ["washi"],
  },
  usesZ3: true,
  enforceScaffoldPolicy: true,
  extractObjective: (_id, output) => extractCh10Objective(output),
  checkAdversarial: () => {
    const p091 = getProblem("091");
    const c091 = p091.cases[0];
    const weakLpVerdict = p091.judge(
      c091.input,
      { open: [0, 0, 1], quantities: [0, 0, 60], totalCost: 1110, lpBound: 780 },
      c091.expectedOptimal,
      "en"
    );
    expect(weakLpVerdict.ok).toBe(false);
    expect(weakLpVerdict.status).toBe("VIOLATION");

    const p093 = getProblem("093");
    const c093 = p093.cases[0];
    const subtourVerdict = p093.judge(
      c093.input,
      { tour: [0, 1, 2, 0, 1, 2], totalDistance: 24, iterations: 1 },
      c093.expectedOptimal,
      "en"
    );
    expect(subtourVerdict.ok).toBe(false);
    expect(subtourVerdict.status).toBe("VIOLATION");

    const p098 = getProblem("098");
    const c098 = p098.cases[0];
    const overlapVerdict = p098.judge(
      c098.input,
      { assignments: [0, 0, 1, 1], starts: [0, 1, 2, 5], totalCost: 51 },
      c098.expectedOptimal,
      "en"
    );
    expect(overlapVerdict.ok).toBe(false);
    expect(overlapVerdict.status).toBe("VIOLATION");

    const p100 = getProblem("100");
    const c100 = p100.cases[0];
    const unsatPolicyVerdict = p100.judge(
      c100.input,
      {
        droppedPolicies: [],
        activeAssignments: [1, 1, 1, 0],
        quantities: [0, 50, 40, 0],
        totalCost: 1160,
      },
      c100.expectedOptimal,
      "en"
    );
    expect(unsatPolicyVerdict.ok).toBe(false);
    expect(unsatPolicyVerdict.status).toBe("VIOLATION");
  },
});

describe("Chapter 10 extended adversarial verifications", () => {
  it("rejects forged TSP tour distance and non-minimal policy drop weights", () => {
    const p093 = getProblem("093");
    const c093 = p093.cases[0];
    const forgedDist = p093.judge(
      c093.input,
      { tour: [0, 1, 3, 5, 4, 2], totalDistance: 10, iterations: 2 },
      c093.expectedOptimal,
      "en"
    );
    expect(forgedDist.ok).toBe(false);
    expect(forgedDist.status).toBe("VIOLATION");

    const p100 = getProblem("100");
    const c100 = p100.cases[0];
    const nonMinDrop = p100.judge(
      c100.input,
      {
        droppedPolicies: ["soft_idle_3"],
        activeAssignments: [1, 1, 0, 1],
        quantities: [0, 50, 0, 40],
        totalCost: 1290,
      },
      c100.expectedOptimal,
      "en"
    );
    expect(nonMinDrop.ok).toBe(false);
    expect(nonMinDrop.status).toBe("VIOLATION");
  });

  it("validates exact strengthened LP bound rather than loose interval in #092", () => {
    const p092 = getProblem("092");

    // Case 1: weights [4,4,4,4,4], binCapacity 10 -> strengthened LP optimum = 2.5, integer = 3
    const c1 = p092.cases[1];
    expect(
      p092.judge(c1.input, { assignments: [0, 0, 1, 1, 2], binsUsed: 3, lpBound: 3 }, c1.expectedOptimal, "en").status
    ).toBe("VIOLATION");
    expect(
      p092.judge(c1.input, { assignments: [0, 0, 1, 1, 2], binsUsed: 3, lpBound: 2.0 }, c1.expectedOptimal, "en").status
    ).toBe("VIOLATION");
    expect(
      p092.judge(c1.input, { assignments: [0, 0, 1, 1, 2], binsUsed: 3, lpBound: 2.5 }, c1.expectedOptimal, "en").status
    ).toBe("AC");
    expect(
      p092.judge(c1.input, { assignments: [0, 2, 1, 0, 1], binsUsed: 3, lpBound: 2.5 }, c1.expectedOptimal, "en").status
    ).toBe("VIOLATION");

    // Asymmetric custom instance: weights [7,4,4,4], binCapacity 10 -> strengthened LP optimum = 2.5
    const asymInput = { weights: [7, 4, 4, 4], binCapacity: 10 };
    expect(
      p092.judge(asymInput, { assignments: [0, 1, 1, 2], binsUsed: 3, lpBound: 2.0 }, 3, "en").status
    ).toBe("VIOLATION");
    expect(
      p092.judge(asymInput, { assignments: [0, 1, 1, 2], binsUsed: 3, lpBound: 3.0 }, 3, "en").status
    ).toBe("VIOLATION");
    expect(
      p092.judge(asymInput, { assignments: [0, 1, 1, 2], binsUsed: 3, lpBound: 2.5 }, 3, "en").status
    ).toBe("AC");
  });
});
