import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P083Input {
  profits: number[];
  budgets: number[];
  emissions: number[];
  budgetCap: number;
  epsilons: number[];
}

export interface P083Output {
  selections: number[][];
  frontierProfits: number[];
  frontierSum: number;
}

export async function solve(input: P083Input): Promise<P083Output> {
  // TODO: Solve the epsilon-constraint MIP for each threshold and return the Pareto frontier.
  throw new Error("Not implemented");
}
