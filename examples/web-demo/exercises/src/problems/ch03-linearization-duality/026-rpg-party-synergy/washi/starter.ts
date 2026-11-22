import { Model, dot, expr, maximize, sum } from "@ohtaman/washi";

export interface P026Input {
  power: number[];
  costs: number[];
  budget: number;
  maxPartySize: number;
  pairs: number[][];
}

export interface P026Output {
  selected: number[];
  pairProducts: number[];
  totalValue: number;
}

export async function solve(input: P026Input): Promise<P026Output> {
  const n = input.power.length;
  const P = input.pairs.length;
  const m = new Model("RpgPartySynergy");

  // TODO: Build and solve the RPG party synergy MIP, then return the output.
  throw new Error("Not implemented");
}
