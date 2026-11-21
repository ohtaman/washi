import { Model, dot, expr, maximize, sum } from "@ohtaman/washi";

export interface P014Input {
  budget: number;
  unitReturns: number[];
  fixedCosts: number[];
  minLevels: number[];
  maxLevels: number[];
  prerequisites: number[][];
  conjunctions: number[][];
  conflicts: number[][];
}

export interface P014Output {
  active: number[];
  levels: number[];
  netProfit: number;
}

export async function solve(input: P014Input): Promise<P014Output> {
  const n = input.unitReturns.length;
  const m = new Model("ConditionalLogicBigM");

  const active = m.binary(n, { prefix: "act" });
  const levels = m.continuous(n, { lb: 0, prefix: "lvl" });

  // TODO: Link conditional operating ranges, enforce budget and logical rules, maximize net profit, and return the result.
  throw new Error("Not implemented");
}
