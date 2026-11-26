import { Model, expr, max, minimize } from "@ohtaman/washi";

export interface P038Input {
  numNodes: number;
  maxColors: number;
  edges: number[][];
}

export interface P038Output {
  colors: number[];
  usedColors: number;
}

export async function solve(input: P038Input): Promise<P038Output> {
  const n = input.numNodes;
  const m = new Model("GraphColoringSymmetry");

  // TODO: Model node colors, edge inequality, value symmetry breaking, and color-count minimization.
  await m.solve({ solver: "pumpkin" });
  throw new Error("Not implemented");
}
