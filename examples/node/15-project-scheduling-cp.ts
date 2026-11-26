/**
 * Example 15: Resource-Constrained Project Scheduling (RCPSP) with Pumpkin CP
 *
 * Demonstrates:
 * - Finite-domain integer start-time modeling (`m.integer(keys, { lb, ub, prefix })`)
 * - Disjunctive unary resource exclusivity (`disjoint`) for a shared test/calibration rig
 * - Cumulative team capacity enforcement (`cumulative`) over integer time points
 * - Exact makespan objective (`max(...)`) minimized natively via Lazy Clause Generation (Pumpkin)
 * - Conflict diagnosis (`unsatCore` / `conflicts`) with `m.check()` without COOP/COEP headers
 *
 * Run with: npx tsx examples/node/15-project-scheduling-cp.ts
 */

import { Model, expr, disjoint, cumulative, max, and, minimize } from "../../src/index.js";

export interface RcpspTaskSpec {
  id: "chassis" | "board" | "firmware" | "assembly" | "calib" | "test";
  duration: number;
  crew: number;
  usesRig: boolean;
}

export async function runProjectSchedulingCP() {
  console.log("=== Hardware Prototype RCPSP (Pumpkin CP / LCG) ===");

  const horizon = 24;
  const crewCapacity = 3;
  const tasks: RcpspTaskSpec[] = [
    { id: "chassis", duration: 4, crew: 2, usesRig: false },
    { id: "board", duration: 3, crew: 2, usesRig: false },
    { id: "firmware", duration: 4, crew: 1, usesRig: true },
    { id: "assembly", duration: 3, crew: 2, usesRig: false },
    { id: "calib", duration: 3, crew: 1, usesRig: true },
    { id: "test", duration: 2, crew: 2, usesRig: true },
  ];

  // Part 1: Solve the Resource-Constrained Project Scheduling Problem (RCPSP)
  const m = new Model("PrototypeRCPSP", { solver: "pumpkin" });
  const taskIds = tasks.map((t) => t.id);
  const start = m.integer(taskIds, { lb: 0, ub: horizon, prefix: "start" });

  // Precedence network
  m.constraint(expr`${start.chassis} + 4 <= ${start.assembly}`, "assembly_after_chassis");
  m.constraint(expr`${start.board} + 3 <= ${start.assembly}`, "assembly_after_board");
  m.constraint(expr`${start.board} + 3 <= ${start.calib}`, "calib_after_board");
  m.constraint(expr`${start.assembly} + 3 <= ${start.test}`, "test_after_assembly");
  m.constraint(expr`${start.firmware} + 4 <= ${start.test}`, "test_after_firmware");
  m.constraint(expr`${start.calib} + 3 <= ${start.test}`, "test_after_calib");

  // Exclusive HIL / calibration rig (disjunctive unary resource)
  m.constraint(
    disjoint(
      tasks
        .filter((t) => t.usesRig)
        .map((t) => ({ start: start[t.id], duration: t.duration }))
    ),
    "single_rig"
  );

  // Renewable engineering team limit (at most 3 engineers busy simultaneously)
  m.constraint(
    cumulative(
      tasks.map((t) => ({ start: start[t.id], duration: t.duration, demand: t.crew })),
      crewCapacity
    ),
    "crew_limit"
  );

  // Minimize total completion time (makespan)
  const makespan = max(tasks.map((t) => expr`${start[t.id]} + ${t.duration}`));
  m.objective(minimize(makespan));

  const status = await m.solve();
  const report = m.verify();
  const makespanValue = m.objectiveValue;
  if (status !== "Optimal" || makespanValue === null) {
    throw new Error(`Project scheduling did not solve to Optimal (status: ${status}).`);
  }

  const starts: Record<string, number> = {};
  for (const t of tasks) {
    const startVal = start[t.id].value;
    if (startVal === null) {
      throw new Error(`Missing solved start time for task "${t.id}".`);
    }
    starts[t.id] = startVal;
  }

  console.log(`Status: ${status} (valid: ${report.valid})`);
  console.log(`Minimum Makespan: ${makespanValue}h`);
  for (const t of tasks) {
    const s = starts[t.id];
    const rigTag = t.usesRig ? " [Rig]" : "";
    console.log(`  ${t.id.padEnd(8)}: [${s}h, ${s + t.duration}h) crew=${t.crew}${rigTag}`);
  }

  // Part 2: Diagnose an over-constrained rush deadline & rig maintenance window via unsatCore
  m.constraint(
    and(expr`${start.firmware} >= 6`, expr`${start.calib} >= 6`),
    "rig_maintenance_window"
  );
  m.constraint(expr`${makespan} <= 13`, "rush_ship_deadline");

  const checkRes = await m.check();
  console.log(`\nDeadline check with rig maintenance [0, 6): ${checkRes.status}`);
  console.log(`Conflicting rules (unsatCore): [${(checkRes.unsatCore ?? []).join(", ")}]`);

  return {
    status,
    makespan: makespanValue,
    starts,
    tasks,
    crewCapacity,
    valid: report.valid,
    conflictStatus: checkRes.status,
    conflicts: checkRes.conflicts,
    unsatCore: checkRes.unsatCore,
  };
}

if (process.argv[1]?.includes("15-project-scheduling-cp")) {
  runProjectSchedulingCP().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
