import { Model, distinct, expr, sum } from "@ohtaman/washi";

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

  // grid[r][c]: integer value in 1..n placed at row r, column c
  const grid = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) =>
      m.integer(`cell_${r}_${c}`, { lb: 1, ub: n })
    )
  );

  // Latin square constraints: all values distinct in every row and every column
  m.constraint(grid.map((row) => distinct(row)));
  m.constraint(
    Array.from({ length: n }, (_, c) => distinct(grid.map((row) => row[c])))
  );
  // Pre-filled cell clues
  m.constraint(
    input.givens.map(([r, c, val]) => expr`${grid[r][c]} == ${val}`)
  );
  // Killer/cage constraints: cells in each cage must sum to targetSum and be distinct
  m.constraint(
    input.cages.map((cage) => {
      const vars = cage.cells.map(([r, c]) => grid[r][c]);
      return expr`${sum(vars)} == ${cage.targetSum}`;
    })
  );
  m.constraint(
    input.cages.map((cage) => distinct(cage.cells.map(([r, c]) => grid[r][c])))
  );

  await m.solve({ solver: "pumpkin" });

  // Round solver output to clean integers and normalize -0 to 0
  return {
    grid: grid.map((row) => row.map((v) => Math.round(v.value!) || 0)),
  };
}
