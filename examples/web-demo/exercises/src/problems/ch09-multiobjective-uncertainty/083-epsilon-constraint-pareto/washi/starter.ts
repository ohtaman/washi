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
  const n = input.profits.length;
  const selections: number[][] = [];
  const frontierProfits: number[] = [];

  // TODO:
  // For each eps in input.epsilons:
  // 1. Create a Model with binary variables x of length n
  // 2. Enforce dot(budgets, x) <= budgetCap and dot(emissions, x) <= eps
  // 3. Maximize dot(profits, x), solve, and push binary selection + objective value
  // 4. Return { selections, frontierProfits, frontierSum }
  throw new Error("Not implemented");
}
