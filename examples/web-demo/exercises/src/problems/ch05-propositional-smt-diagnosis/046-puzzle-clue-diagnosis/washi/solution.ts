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

function addClueConstraint(m: Model, clue: PuzzleClue, x: Record<string, Var>): void {
  switch (clue.type) {
    case "mineCount":
      m.constraint(sum(clue.cells.map((c) => x[c])).eq(clue.count), clue.id);
      break;
    case "atLeast":
      m.constraint(sum(clue.cells.map((c) => x[c])).ge(clue.count), clue.id);
      break;
    case "atMost":
      m.constraint(sum(clue.cells.map((c) => x[c])).le(clue.count), clue.id);
      break;
    case "safe":
      m.constraint(x[clue.cell].eq(0), clue.id);
      break;
    case "mine":
      m.constraint(x[clue.cell].eq(1), clue.id);
      break;
    case "impliesMine":
      m.constraint(x[clue.ifMine].le(x[clue.thenMine]), clue.id);
      break;
    case "same":
      m.constraint(x[clue.a].eq(x[clue.b]), clue.id);
      break;
    case "different":
      m.constraint(x[clue.a].add(x[clue.b]).eq(1), clue.id);
      break;
  }
}

async function checkSubset(input: P046Input, activeIds: string[]): Promise<CheckResult> {
  const m = new Model("PuzzleClueDiagnosis");
  const x: Record<string, Var> = {};
  for (const cell of input.cells) {
    x[cell] = m.integer(cell, { lb: 0, ub: 1 });
  }
  const activeSet = new Set(activeIds);
  for (const clue of input.clues) {
    if (activeSet.has(clue.id)) {
      addClueConstraint(m, clue, x);
    }
  }
  return m.check({ solver: "z3" });
}

export async function solve(input: P046Input): Promise<P046Output> {
  const allIds = input.clues.map((c) => c.id);
  const initial = await checkSubset(input, allIds);
  let core = Array.from(new Set(initial.unsatCore ?? allIds));

  for (const clueId of [...core]) {
    if (!core.includes(clueId)) continue;
    const candidate = core.filter((id) => id !== clueId);
    const res = await checkSubset(input, candidate);
    if (res.status === "Unsat") {
      if (res.unsatCore && res.unsatCore.length > 0) {
        const subSet = new Set(res.unsatCore);
        core = candidate.filter((id) => subSet.has(id));
      } else {
        core = candidate;
      }
    }
  }

  return { coreRules: core.sort() };
}
