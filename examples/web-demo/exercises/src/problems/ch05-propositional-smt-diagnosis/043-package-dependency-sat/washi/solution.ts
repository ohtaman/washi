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
    for (let i = 0; i < versions.length; i++) {
      for (let j = i + 1; j < versions.length; j++) {
        m.constraint(
          not(and(pick[pkg][versions[i]], pick[pkg][versions[j]])),
          `amo_${pkg}_${i}_${j}`
        );
      }
    }
  }

  for (const root of input.roots) {
    const vars = input.packages[root].map((v) => pick[root][v]);
    m.constraint(vars.length === 1 ? vars[0] : or(...vars), `root_${root}`);
  }

  input.requires.forEach((req, idx) => {
    const deps = req.depVersions.map((dv) => pick[req.depPkg][dv]);
    const rhs = deps.length === 0 ? not(pick[req.pkg][req.ver]) : deps.length === 1 ? deps[0] : or(...deps);
    m.constraint(
      deps.length === 0 ? rhs : implies(pick[req.pkg][req.ver], rhs),
      `req_${idx}`
    );
  });

  input.conflicts.forEach(([[p1, v1], [p2, v2]], idx) => {
    m.constraint(not(and(pick[p1][v1], pick[p2][v2])), `conf_${idx}`);
  });

  if (allUsed.length > 0) {
    m.objective(minimize(sum(allUsed)));
  }

  const status = await m.solve({ solver: "z3" });
  if (status !== "Optimal") {
    return { feasible: false, selected: null, installedCount: null };
  }

  const selected: Record<string, string | null> = {};
  let installedCount = 0;
  for (const [pkg, versions] of Object.entries(input.packages)) {
    const chosen = versions.find((v) => pick[pkg][v].value === true) ?? null;
    selected[pkg] = chosen;
    if (chosen !== null) installedCount++;
  }

  return { feasible: true, selected, installedCount };
}
