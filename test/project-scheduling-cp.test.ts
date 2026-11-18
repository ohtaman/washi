import { describe, it, expect } from "vitest";
import { Model, expr, disjoint, cumulative, max, and } from "../src/index.js";
import "../src/modeler/solvers/pumpkin.js";
import { runProjectSchedulingCP } from "../examples/node/15-project-scheduling-cp.js";

describe("RCPSP Project Scheduling Example (examples/node/15-project-scheduling-cp.ts)", () => {
  it("solves the 6-task resource-constrained schedule to Optimal with Pumpkin and diagnoses rush deadline conflict", async () => {
    const res = await runProjectSchedulingCP();

    // Part 1: Optimal RCPSP Schedule
    expect(res.status).toBe("Optimal");
    expect(res.valid).toBe(true);
    // Naive critical path without the 3-engineer cumulative limit is 9h (board 3 + assembly 3 + test 2 = 8h, chassis 4 + assembly 3 + test 2 = 9h),
    // but chassis (2 crew), board (2 crew), and assembly (2 crew) cannot overlap when crewCapacity === 3, giving minimum makespan = 12h.
    expect(res.makespan).toBe(12);

    const taskById = Object.fromEntries(res.tasks.map((t) => [t.id, t]));
    for (const task of res.tasks) {
      const start = res.starts[task.id];
      expect(Number.isInteger(start)).toBe(true);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start + task.duration).toBeLessThanOrEqual(res.makespan!);
    }

    // Precedence graph checks
    expect(res.starts.chassis + taskById.chassis.duration).toBeLessThanOrEqual(res.starts.assembly);
    expect(res.starts.board + taskById.board.duration).toBeLessThanOrEqual(res.starts.assembly);
    expect(res.starts.board + taskById.board.duration).toBeLessThanOrEqual(res.starts.calib);
    expect(res.starts.assembly + taskById.assembly.duration).toBeLessThanOrEqual(res.starts.test);
    expect(res.starts.firmware + taskById.firmware.duration).toBeLessThanOrEqual(res.starts.test);
    expect(res.starts.calib + taskById.calib.duration).toBeLessThanOrEqual(res.starts.test);

    // Unary rig exclusivity (disjoint across firmware, calib, test)
    const rigTasks = res.tasks.filter((t) => t.usesRig);
    expect(rigTasks.map((t) => t.id)).toEqual(["firmware", "calib", "test"]);
    for (let i = 0; i < rigTasks.length; i++) {
      for (let j = i + 1; j < rigTasks.length; j++) {
        const a = rigTasks[i];
        const b = rigTasks[j];
        const aStart = res.starts[a.id];
        const aEnd = aStart + a.duration;
        const bStart = res.starts[b.id];
        const bEnd = bStart + b.duration;
        expect(aEnd <= bStart || bEnd <= aStart).toBe(true);
      }
    }

    // Cumulative engineer capacity profile over t in [0, makespan)
    let peakCrew = 0;
    for (let t = 0; t < res.makespan!; t++) {
      const activeCrew = res.tasks.reduce((acc, task) => {
        const s = res.starts[task.id];
        return s <= t && t < s + task.duration ? acc + task.crew : acc;
      }, 0);
      expect(activeCrew).toBeLessThanOrEqual(res.crewCapacity);
      if (activeCrew > peakCrew) {
        peakCrew = activeCrew;
      }
    }
    expect(peakCrew).toBe(res.crewCapacity);

    // Part 2: Zero-COOP/COEP Unsat Core Diagnosis on conflicting maintenance window & rush deadline
    expect(res.conflictStatus).toBe("Unsat");
    expect(res.unsatCore).toBeDefined();
    expect(res.unsatCore).toEqual(res.conflicts);
    expect(res.unsatCore).toEqual(
      expect.arrayContaining(["rig_maintenance_window", "single_rig", "rush_ship_deadline"])
    );
    expect(res.unsatCore).not.toContain("crew_limit");

    // Independent soundness verification: asserting ONLY the constraints in res.unsatCore must be Unsat
    const coreModel = new Model("CoreSoundnessCheck", { solver: "pumpkin" });
    const coreStart = coreModel.integer(
      res.tasks.map((t) => t.id),
      { lb: 0, ub: 24, prefix: "start" }
    );
    const coreMakespan = max(res.tasks.map((t) => expr`${coreStart[t.id]} + ${t.duration}`));
    const constraintBuilders: Record<string, () => void> = {
      assembly_after_chassis: () => {
        coreModel.constraint(
          expr`${coreStart.chassis} + 4 <= ${coreStart.assembly}`,
          "assembly_after_chassis"
        );
      },
      assembly_after_board: () => {
        coreModel.constraint(
          expr`${coreStart.board} + 3 <= ${coreStart.assembly}`,
          "assembly_after_board"
        );
      },
      calib_after_board: () => {
        coreModel.constraint(
          expr`${coreStart.board} + 3 <= ${coreStart.calib}`,
          "calib_after_board"
        );
      },
      test_after_assembly: () => {
        coreModel.constraint(
          expr`${coreStart.assembly} + 3 <= ${coreStart.test}`,
          "test_after_assembly"
        );
      },
      test_after_firmware: () => {
        coreModel.constraint(
          expr`${coreStart.firmware} + 4 <= ${coreStart.test}`,
          "test_after_firmware"
        );
      },
      test_after_calib: () => {
        coreModel.constraint(
          expr`${coreStart.calib} + 3 <= ${coreStart.test}`,
          "test_after_calib"
        );
      },
      single_rig: () => {
        coreModel.constraint(
          disjoint(
            res.tasks
              .filter((t) => t.usesRig)
              .map((t) => ({ start: coreStart[t.id], duration: t.duration }))
          ),
          "single_rig"
        );
      },
      crew_limit: () => {
        coreModel.constraint(
          cumulative(
            res.tasks.map((t) => ({
              start: coreStart[t.id],
              duration: t.duration,
              demand: t.crew,
            })),
            res.crewCapacity
          ),
          "crew_limit"
        );
      },
      rig_maintenance_window: () => {
        coreModel.constraint(
          and(expr`${coreStart.firmware} >= 6`, expr`${coreStart.calib} >= 6`),
          "rig_maintenance_window"
        );
      },
      rush_ship_deadline: () => {
        coreModel.constraint(expr`${coreMakespan} <= 13`, "rush_ship_deadline");
      },
    };

    for (const cname of new Set(res.unsatCore ?? [])) {
      const addFn = constraintBuilders[cname];
      expect(addFn, `Unknown constraint name in unsatCore: ${cname}`).toBeDefined();
      addFn();
    }
    const coreCheck = await coreModel.check();
    expect(coreCheck.status).toBe("Unsat");
  });
});
