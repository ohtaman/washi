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
  // TODO: Repair conflicting soft policies and solve the minimum-disruption production MIP.
  throw new Error("Not implemented");
}
