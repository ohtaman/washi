import { Model, expr, max, minimize, or } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export interface P037Input {
  stripWidth: number;
  widths: number[];
  heights: number[];
}

export interface P037Output {
  x: number[];
  y: number[];
  height: number;
}

export async function solve(input: P037Input): Promise<P037Output> {
  const maxHeight = input.heights.reduce((acc, h) => acc + h, 0);
  const m = new Model("RectangleStripPacking");

  // TODO: Model rectangle coordinates, pairwise non-overlap, and strip height minimization.
  await m.solve({ solver: "pumpkin" });
  throw new Error("Not implemented");
}
