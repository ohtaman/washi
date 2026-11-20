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

  const grid = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) =>
      m.integer(`cell_${r}_${c}`, { lb: 1, ub: n })
    )
  );

  m.constraint(
    input.givens.map(([r, c, val]) => expr`${grid[r][c]} == ${val}`)
  );

  // TODO 1: Add distinct(row) for every row and distinct(col) for every column
  // TODO 2: For each cage in input.cages, enforce sum(cageVars) == cage.targetSum and distinct(cageVars)

  await m.solve({ solver: "pumpkin" });

  return {
    grid: grid.map((row) => row.map((v) => Math.round(v.value!) || 0)),
  };
}
