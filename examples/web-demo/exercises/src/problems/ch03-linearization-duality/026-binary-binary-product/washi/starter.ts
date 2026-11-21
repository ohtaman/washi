import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P026Input {
  values: number[];
  costs: number[];
  budget: number;
  pairs: number[][];
}

export interface P026Output {
  selected: number[];
  pairProducts: number[];
  totalValue: number;
}

export async function solve(input: P026Input): Promise<P026Output> {
  const n = input.values.length;
  const P = input.pairs.length;
  const m = new Model("BinaryBinaryProduct");

  // TODO: Build and solve the quadratic module selection MIP, then return the output.
  throw new Error("Not implemented");
}
