import { Model, allowed, at, minimize, not, sum } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export interface TableRule {
  vars: number[];
  tuples: number[][];
}

export interface P033Input {
  componentCosts: number[][];
  allowedRules: TableRule[];
  forbiddenRules: TableRule[];
}

export interface P033Output {
  choices: number[];
  totalCost: number;
}

export async function solve(input: P033Input): Promise<P033Output> {
  const m = new Model("TableConfig");

  // TODO: Model component option choices, compatibility/forbidden table rules, and cost objective.
  await m.solve({ solver: "pumpkin" });
  throw new Error("Not implemented");
}
