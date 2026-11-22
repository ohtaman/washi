import {
  Model,
  sum,
  type CheckResult,
  type Var,
} from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

export type PuzzleClue =
  | { id: string; type: "mineCount"; cells: string[]; count: number }
  | { id: string; type: "atLeast"; cells: string[]; count: number }
  | { id: string; type: "atMost"; cells: string[]; count: number }
  | { id: string; type: "safe"; cell: string }
  | { id: string; type: "mine"; cell: string }
  | { id: string; type: "impliesMine"; ifMine: string; thenMine: string }
  | { id: string; type: "same"; a: string; b: string }
  | { id: string; type: "different"; a: string; b: string };

export interface P046Input {
  cells: string[];
  clues: PuzzleClue[];
}

export interface P046Output {
  coreRules: string[];
}

export async function solve(input: P046Input): Promise<P046Output> {
  // TODO: Extract an irreducible minimal unsatisfiable subset (MUS) of clue IDs using Z3 and return them sorted.
  throw new Error("Not implemented");
}
