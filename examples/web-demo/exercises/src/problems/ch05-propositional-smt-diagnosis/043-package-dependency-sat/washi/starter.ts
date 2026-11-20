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
  const pick: Record<string, Record<string, BoolVar>> = {};
  const used: Record<string, Record<string, Var>> = {};
  const allUsed: Var[] = [];

  for (const [pkg, versions] of Object.entries(input.packages)) {
    pick[pkg] = {};
    used[pkg] = {};
    for (const ver of versions) {
      const b = m.bool(`pick_${pkg}_${ver}`);
      const u = m.binary(`used_${pkg}_${ver}`);
      pick[pkg][ver] = b;
      used[pkg][ver] = u;
      allUsed.push(u);
      m.constraint(implies(b, expr`${u} == 1`), `link_on_${pkg}_${ver}`);
      m.constraint(implies(not(b), expr`${u} == 0`), `link_off_${pkg}_${ver}`);
    }
  }

  // TODO:
  // 1. Enforce at-most-one version per package (not(and(a, b)) for pairs), and exact-one (or(...)) for input.roots.
  // 2. Add requires implications: implies(pick[r.pkg][r.ver], or(...r.depVersions.map(...))).
  // 3. Add conflicts exclusions: not(and(pick[p1][v1], pick[p2][v2])).
  // 4. Minimize sum(allUsed) via await m.solve({ solver: "z3" }) and return { feasible, selected, installedCount }.
  throw new Error("Not implemented");
}
