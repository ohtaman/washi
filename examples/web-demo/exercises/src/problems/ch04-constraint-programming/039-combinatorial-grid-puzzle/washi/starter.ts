import { Model, distinct, expr, sum } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export interface CageClue {
  cells: number[][];
  targetSum: number;
}

export interface P039Input {
  size: number;
  givens: number[][];
  cages: CageClue[];
}

export interface P039Output {
  grid: number[][];
}

export async function solve(input: P039Input): Promise<P039Output> {
  const n = input.size;
  const m = new Model("CageLatinGrid");

  // TODO: Model the N x N grid variables, givens, Latin-square uniqueness, and cage clues.
  await m.solve({ solver: "pumpkin" });
  throw new Error("Not implemented");
}
