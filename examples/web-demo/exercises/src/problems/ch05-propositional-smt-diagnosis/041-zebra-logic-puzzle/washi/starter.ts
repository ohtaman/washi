import {
  Model,
  and,
  implies,
  not,
  or,
  type BoolVar,
  type LogicInput,
} from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

export type CategoryValue = [category: string, value: string];

export type ZebraClue =
  | { type: "at"; position: number; category: string; value: string }
  | { type: "same"; a: CategoryValue; b: CategoryValue }
  | { type: "implies"; a: CategoryValue; b: CategoryValue }
  | { type: "notTogether"; a: CategoryValue; b: CategoryValue }
  | { type: "leftOf"; left: CategoryValue; right: CategoryValue; immediate?: boolean }
  | { type: "nextTo"; a: CategoryValue; b: CategoryValue };

export interface P041Input {
  n: number;
  categories: Record<string, string[]>;
  clues: ZebraClue[];
}

export interface P041Output {
  satisfiable: boolean;
  assignment: Array<Record<string, string>> | null;
}

export async function solve(input: P041Input): Promise<P041Output> {
  const m = new Model("ZebraPuzzle");

  // TODO: Declare Boolean variables, enforce exact-one and clue constraints, and solve with Z3.
  throw new Error("Not implemented");
}
