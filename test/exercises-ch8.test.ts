import { expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { registerChapterExerciseSuite } from "./helpers/exercises-chapter-harness.js";
import { runWashiExerciseCode } from "../examples/web-demo/exercises/src/runner/washi-runner.js";
import type { ProblemDefinition } from "../examples/web-demo/exercises/src/types.js";

const EXPECTED_IDS = [
  "071",
  "072",
  "073",
  "074",
  "075",
  "076",
  "077",
  "078",
  "079",
  "080",
] as const;

const EXPECTED_RUNTIMES: Record<string, readonly ("washi" | "pulp")[]> = {
  "071": ["washi", "pulp"],
  "072": ["washi", "pulp"],
  "073": ["washi"],
  "074": ["washi"],
  "075": ["washi", "pulp"],
  "076": ["washi", "pulp"],
  "077": ["washi", "pulp"],
  "078": ["washi", "pulp"],
  "079": ["washi", "pulp"],
  "080": ["washi", "pulp"],
};

function extractObjective(_id: string, output: unknown): number | null {
  const rec = output as Record<string, unknown>;
  for (const key of [
    "totalWeightedTardiness",
    "totalTardiness",
    "makespan",
    "totalCost",
    "totalScore",
    "netScore",
  ]) {
    if (typeof rec[key] === "number" && Number.isFinite(rec[key])) {
      return rec[key] as number;
    }
  }
  return null;
}

async function verifyAdversarialChecks(problems: ProblemDefinition[]): Promise<void> {
  const byId = new Map(problems.map((p) => [p.meta.id, p]));
  const ch8Root = path.resolve(
    import.meta.dirname,
    "../examples/web-demo/exercises/src/problems/ch08-scheduling-rostering"
  );

  // Verify WaSHI-only CP exercises (#073, #074) omit pulp/ directory, use pumpkin, and solve fast (< 300ms/case)
  for (const cpId of ["073", "074"] as const) {
    const p = byId.get(cpId)!;
    expect(p.meta.solvers).toEqual(["pumpkin"]);
    expect(p.meta.paradigms).toEqual(["CP"]);
    const slugDir = cpId === "073" ? "073-job-shop-jssp" : "074-rcpsp-project";
    expect(fs.existsSync(path.join(ch8Root, slugDir, "pulp"))).toBe(false);

    const cpRun = await runWashiExerciseCode(
      p.washiSolution,
      p.cases.map((c) => structuredClone(c.input))
    );
    expect(cpRun.ok).toBe(true);
    for (let i = 0; i < cpRun.metrics.length; i++) {
      expect(cpRun.metrics[i].solveTimeMs ?? 0).toBeLessThan(300);
    }
  }

  // #071: release date violation, overlap violation, mismatched objective, and suboptimal non-delay schedule
  {
    const p = byId.get("071")!;
    const c0 = p.cases[0];
    expect(p.judge(c0.input, { starts: [0, 0, 5], totalWeightedTardiness: 0 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { starts: [0, 2, 5], totalWeightedTardiness: 0 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { starts: [7, 2, 5], totalWeightedTardiness: 0 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { starts: [0, 4, 7], totalWeightedTardiness: 16 }, c0.expectedOptimal, "en").status).toBe("SUBOPTIMAL");
  }

  // #072: duplicate permutation, setup transition time violation, greedy suboptimal sequence
  {
    const p = byId.get("072")!;
    const c0 = p.cases[0];
    expect(p.judge(c0.input, { order: [0, 0, 1], completions: [3, 11, 6], totalTardiness: 4 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { order: [0, 2, 1], completions: [3, 10, 6], totalTardiness: 3 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { order: [2, 0, 1], completions: [8, 17, 2], totalTardiness: 11 }, c0.expectedOptimal, "en").status).toBe("SUBOPTIMAL");
  }

  // #073: malformed matrix RUNTIME_ERROR, intra-job precedence violation, machine overlap, suboptimal makespan
  {
    const p = byId.get("073")!;
    const c0 = p.cases[0];
    expect(p.judge(c0.input, { starts: [[0, 3]], makespan: 10 }, c0.expectedOptimal, "en").status).toBe("RUNTIME_ERROR");
    expect(p.judge(c0.input, { starts: [[0, 3, Number.NaN], [0, 2, 7], [0, 4, 7]], makespan: 11 }, c0.expectedOptimal, "en").status).toBe("RUNTIME_ERROR");
    expect(p.judge(c0.input, { starts: [[2, 4, 7], [0, 2, 7], [0, 4, 7]], makespan: 11 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { starts: [[0, 3, 5], [0, 2, 7], [0, 4, 7]], makespan: 11 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { starts: [[2, 5, 7], [0, 2, 7], [0, 4, 10]], makespan: 12 }, c0.expectedOptimal, "en").status).toBe("SUBOPTIMAL");
  }

  // #074: DAG precedence violation, cumulative capacity overload, fractional start time, suboptimal makespan
  {
    const p = byId.get("074")!;
    const c0 = p.cases[0];
    expect(p.judge(c0.input, { starts: [0, 2, 3, 5, 10], makespan: 12 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { starts: [0, 3, 0, 3, 8], makespan: 10 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { starts: [0.5, 7, 3, 5, 10], makespan: 12 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { starts: [0, 7, 3, 5, 12], makespan: 14 }, c0.expectedOptimal, "en").status).toBe("SUBOPTIMAL");
  }

  // #075: malformed schedule RUNTIME_ERROR, working on daysOff, under-covering demand, violating minShifts & maxShifts
  {
    const p = byId.get("075")!;
    const c0 = p.cases[0];
    expect(p.judge(c0.input, { schedule: [[1, -1, 0]], totalCost: 70 }, c0.expectedOptimal, "en").status).toBe("RUNTIME_ERROR");
    expect(p.judge(c0.input, { schedule: [[1, -1, Number.NaN], [-1, 1, 1], [0, 0, -1]], totalCost: 70 }, c0.expectedOptimal, "en").status).toBe("RUNTIME_ERROR");
    expect(p.judge(c0.input, { schedule: [[1, 0, 0], [-1, 1, 1], [0, -1, -1]], totalCost: 67 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { schedule: [[1, -1, 0], [-1, 1, 1], [0, 1, -1]], totalCost: 77 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { schedule: [[1, -1, 0], [0, 1, 1], [0, -1, -1]], totalCost: 69 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { schedule: [[1, -1, 0], [0, 1, 1], [0, 0, -1]], totalCost: 82 }, c0.expectedOptimal, "en").status).toBe("SUBOPTIMAL");
  }

  // #076: rolling consecutive workday violation (3 days in row when K=2), forbidden Night->Day transition
  {
    const p = byId.get("076")!;
    const c0 = p.cases[0];
    expect(p.judge(c0.input, { schedule: [[0, 0, 0, 0], [2, -1, 2, 2], [1, -1, -1, 1], [-1, 2, -1, -1]], totalCost: 119 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { schedule: [[0, 0, -1, 0], [2, 0, 2, 2], [1, -1, -1, 1], [-1, 2, -1, -1]], totalCost: 120 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
  }

  // #077: missing senior lead, missing skill coverage, forbidden NG pair co-scheduled
  {
    const p = byId.get("077")!;
    const c0 = p.cases[0];
    expect(p.judge(c0.input, { schedule: [[1, 1], [-1, -1], [0, 0], [0, 0]], totalCost: 82 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { schedule: [[1, 1], [0, 0], [-1, -1], [0, 0]], totalCost: 94 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { schedule: [[0, 0], [1, 1], [0, 0], [-1, -1]], totalCost: 86 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
  }

  // #078: room capacity exceeded, room double-booked, teacher conflict, cohort conflict
  {
    const p = byId.get("078")!;
    const c0 = p.cases[0];
    expect(p.judge(c0.input, { rooms: [1, 0, 0, 1], slots: [1, 0, 2, 1], totalScore: 28 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { rooms: [0, 0, 1, 1], slots: [0, 0, 1, 2], totalScore: 32 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { rooms: [0, 1, 0, 1], slots: [0, 0, 1, 2], totalScore: 32 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { rooms: [0, 1, 1, 0], slots: [0, 1, 0, 1], totalScore: 37 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
  }

  // #079: malformed overtime matrix & NaN RUNTIME_ERROR, incompatible venue, overtime > maxOvertime, capacity load exceeded, (-1, 0) mismatch, suboptimal, AC
  {
    const p = byId.get("079")!;
    const c0 = p.cases[0];
    expect(p.judge(c0.input, { assignedVenue: [1, 0, 1, 0, -1], assignedSlot: [1, 0, 0, 1, -1], overtime: [[1, 0]], netScore: 260 }, c0.expectedOptimal, "en").status).toBe("RUNTIME_ERROR");
    expect(p.judge(c0.input, { assignedVenue: [1, Number.NaN, 1, 0, -1], assignedSlot: [1, 0, 0, 1, -1], overtime: [[1, 0], [0, 0]], netScore: 260 }, c0.expectedOptimal, "en").status).toBe("RUNTIME_ERROR");
    expect(p.judge(c0.input, { assignedVenue: [1, 1, 0, 0, -1], assignedSlot: [1, 0, 0, 1, -1], overtime: [[0, 0], [1, 0]], netScore: 260 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { assignedVenue: [1, 0, 1, 0, -1], assignedSlot: [1, 0, 0, 1, -1], overtime: [[2, 0], [0, 0]], netScore: 235 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { assignedVenue: [1, 0, 1, 0, -1], assignedSlot: [1, 0, 0, 1, -1], overtime: [[0, 0], [0, 0]], netScore: 285 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { assignedVenue: [1, 0, 1, 0, -1], assignedSlot: [1, 0, 0, 1, 0], overtime: [[1, 0], [0, 0]], netScore: 260 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { assignedVenue: [-1, 0, 1, 0, -1], assignedSlot: [-1, 0, 0, 1, -1], overtime: [[1, 0], [0, 0]], netScore: 205 }, c0.expectedOptimal, "en").status).toBe("SUBOPTIMAL");
    expect(p.judge(c0.input, { assignedVenue: [1, 0, 1, 0, -1], assignedSlot: [1, 0, 0, 1, -1], overtime: [[1, 0], [0, 0]], netScore: 260 }, c0.expectedOptimal, "en").status).toBe("AC");
  }

  // #080: uncertified staff, staff double-booked in slot, shared equipment exceeded, maxLimits exceeded, under-reported overtime
  {
    const p = byId.get("080")!;
    const c0 = p.cases[0];
    expect(p.judge(c0.input, { assignedStaff: [1, 0, 1, 2], assignedSlot: [0, 1, 0, 1], overtime: [0, 0, 0], totalCost: 87 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { assignedStaff: [2, 0, 2, 0], assignedSlot: [0, 1, 0, 1], overtime: [1, 0, 1], totalCost: 112 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { assignedStaff: [2, 0, 1, 2], assignedSlot: [0, 0, 0, 1], overtime: [0, 0, 1], totalCost: 97 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { assignedStaff: [2, 0, 2, 2], assignedSlot: [0, 1, 1, 0], overtime: [0, 0, 2], totalCost: 111 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
    expect(p.judge(c0.input, { assignedStaff: [2, 0, 1, 2], assignedSlot: [0, 1, 0, 1], overtime: [0, 0, 0], totalCost: 83 }, c0.expectedOptimal, "en").status).toBe("VIOLATION");
  }
}

registerChapterExerciseSuite({
  chapter: 8,
  dirName: "ch08-scheduling-rostering",
  expectedIds: EXPECTED_IDS,
  expectedRuntimes: EXPECTED_RUNTIMES,
  extractObjective,
  checkAdversarial: verifyAdversarialChecks,
  timeoutMs: 120_000,
  enforceScaffoldPolicy: true,
});
