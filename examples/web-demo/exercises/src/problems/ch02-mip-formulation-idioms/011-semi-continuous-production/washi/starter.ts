import { Model, dot, expr, maximize } from "@ohtaman/washi";

export interface P011Input {
  margins: number[];
  minBatches: number[];
  maxBatches: number[];
  resourceUsages: number[];
  resourceCap: number;
}

export interface P011Output {
  active: number[];
  quantities: number[];
  totalMargin: number;
}

export async function solve(input: P011Input): Promise<P011Output> {
  const n = input.margins.length;
  const m = new Model("SemiContinuousProduction");

  const active = m.binary(n, { prefix: "active" });
  const quantities = m.continuous(n, { lb: 0, prefix: "qty" });

  // TODO: Link each product's semi-continuous bounds, enforce the resource cap, maximize total margin, and return the output.
  throw new Error("Not implemented");
}
