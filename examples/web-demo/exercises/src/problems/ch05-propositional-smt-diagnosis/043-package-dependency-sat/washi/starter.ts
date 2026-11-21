import {
  Model,
  and,
  expr,
  implies,
  minimize,
  not,
  or,
  sum,
  type BoolVar,
  type Var,
} from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

export interface DependencyRule {
  pkg: string;
  ver: string;
  depPkg: string;
  depVersions: string[];
}

export interface P043Input {
  packages: Record<string, string[]>;
  roots: string[];
  requires: DependencyRule[];
  conflicts: Array<[[string, string], [string, string]]>;
}

export interface P043Output {
  feasible: boolean;
  selected: Record<string, string | null> | null;
  installedCount: number | null;
}

export async function solve(input: P043Input): Promise<P043Output> {
  const m = new Model("PackageResolver");

  // TODO: Model package version choices, root/dependency/conflict rules, and minimize installed packages with Z3.
  throw new Error("Not implemented");
}
