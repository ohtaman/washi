import { Model, Var, expr, minimize, not, or } from "@ohtaman/washi";

export type PolicyRule =
  | { id: string; type: "must_run"; line: number; weight?: number }
  | { id: string; type: "must_idle"; line: number; weight?: number }
  | { id: string; type: "min_active"; lines: number[]; weight?: number }
  | {
      id: string;
      type: "implies";
      ifLine: number;
      thenLine: number;
      thenActive: boolean;
      weight?: number;
    };

export interface P100Input {
  capacities: number[];
  fixedCosts: number[];
  prodCosts: number[];
  demand: number;
  baselineActive: number[];
  disruptionPenalty: number;
  hardRules: PolicyRule[];
  softRules: Array<PolicyRule & { weight: number }>;
}

export interface P100Output {
  droppedPolicies: string[];
  activeAssignments: number[];
  quantities: number[];
  totalCost: number;
}

export async function solve(input: P100Input): Promise<P100Output> {
  // TODO:
  // Phase 1 (Policy Consistency & Minimum-Weight Repair via Z3 unsatCore + HiGHS IHS MaxSAT):
  // 1. Build a Z3 SMT model over boolean line activations b[i] (linked to binary integers u[i] for sum cap*u >= demand),
  //    asserting all hardRules + non-dropped softRules with their rule IDs as constraint names.
  // 2. Call await smt.check({ solver: "z3" }). Whenever status === "Unsat", read res.unsatCore,
  //    collect soft rules appearing in the core as a hitting-set cut for a HiGHS binary drop-selection MIP
  //    (minimizing sum weight * drop[r]), and repeat until Z3 returns "Sat".
  // Phase 2 (Minimum-Disruption Production Rescheduling via HiGHS MIP):
  // 3. With the repaired active rule set fixed (hardRules + retained softRules), build a HiGHS MIP
  //    for binary activeAssignments y[i], continuous quantities q[i] <= capacities[i] * y[i],
  //    and disruption indicator delta[i] >= |y[i] - baselineActive[i]|, minimizing fixed + prod + disruption costs.
  // 4. Return { droppedPolicies, activeAssignments, quantities, totalCost }.
  throw new Error("Not implemented");
}
