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

// Pairwise SAT encoding for an exact-one (at-least-one + at-most-one) constraint
function exactOne(m: Model, vars: BoolVar[], prefix: string): void {
  m.constraint(or(...vars), `${prefix}_at_least_one`);
  for (let i = 0; i < vars.length; i++) {
    for (let j = i + 1; j < vars.length; j++) {
      m.constraint(not(and(vars[i], vars[j])), `${prefix}_at_most_one_${i}_${j}`);
    }
  }
}

export async function solve(input: P041Input): Promise<P041Output> {
  const m = new Model("ZebraPuzzle");
  const catNames = Object.keys(input.categories);
  // vars[cat][val][pos]: Boolean indicator that category `cat` takes `val` at 0-based position `pos`
  const vars: Record<string, Record<string, BoolVar[]>> = {};

  for (const cat of catNames) {
    vars[cat] = {};
    for (const val of input.categories[cat]) {
      vars[cat][val] = Array.from({ length: input.n }, (_, pos) =>
        m.bool(`${cat}_${val}_${pos}`)
      );
    }
  }

  // Bijection constraints: each position has one value per category, and each value appears once
  for (const cat of catNames) {
    const vals = input.categories[cat];
    for (let pos = 0; pos < input.n; pos++) {
      exactOne(
        m,
        vals.map((val) => vars[cat][val][pos]),
        `pos_${cat}_${pos}`
      );
    }
    for (const val of vals) {
      exactOne(m, vars[cat][val], `val_${cat}_${val}`);
    }
  }

  // Encode each structured puzzle clue into propositional logic over position indicators
  input.clues.forEach((clue, idx) => {
    const tag = `clue_${idx}`;
    switch (clue.type) {
      case "at":
        m.constraint(vars[clue.category][clue.value][clue.position], tag);
        break;
      case "same": {
        // Biconditional at every position: a holds at pos iff b holds at pos
        const [ca, va] = clue.a;
        const [cb, vb] = clue.b;
        for (let pos = 0; pos < input.n; pos++) {
          m.constraint(
            and(implies(vars[ca][va][pos], vars[cb][vb][pos]), implies(vars[cb][vb][pos], vars[ca][va][pos])),
            `${tag}_${pos}`
          );
        }
        break;
      }
      case "implies": {
        const [ca, va] = clue.a;
        const [cb, vb] = clue.b;
        for (let pos = 0; pos < input.n; pos++) {
          m.constraint(implies(vars[ca][va][pos], vars[cb][vb][pos]), `${tag}_${pos}`);
        }
        break;
      }
      case "notTogether": {
        const [ca, va] = clue.a;
        const [cb, vb] = clue.b;
        for (let pos = 0; pos < input.n; pos++) {
          m.constraint(not(and(vars[ca][va][pos], vars[cb][vb][pos])), `${tag}_${pos}`);
        }
        break;
      }
      case "leftOf": {
        // Left item cannot occupy the rightmost slot; if at pos, right item is at pos+1 (or > pos)
        const [cl, vl] = clue.left;
        const [cr, vr] = clue.right;
        if (clue.immediate) {
          m.constraint(not(vars[cl][vl][input.n - 1]), `${tag}_end`);
          for (let pos = 0; pos < input.n - 1; pos++) {
            m.constraint(implies(vars[cl][vl][pos], vars[cr][vr][pos + 1]), `${tag}_${pos}`);
          }
        } else {
          m.constraint(not(vars[cl][vl][input.n - 1]), `${tag}_end`);
          for (let pos = 0; pos < input.n - 1; pos++) {
            const later: LogicInput[] = [];
            for (let q = pos + 1; q < input.n; q++) {
              later.push(vars[cr][vr][q]);
            }
            m.constraint(implies(vars[cl][vl][pos], or(...later)), `${tag}_${pos}`);
          }
        }
        break;
      }
      case "nextTo": {
        // Adjacency: if a is at pos, b must appear at pos-1 or pos+1
        const [ca, va] = clue.a;
        const [cb, vb] = clue.b;
        for (let pos = 0; pos < input.n; pos++) {
          const adj: LogicInput[] = [];
          if (pos > 0) adj.push(vars[cb][vb][pos - 1]);
          if (pos < input.n - 1) adj.push(vars[cb][vb][pos + 1]);
          m.constraint(implies(vars[ca][va][pos], or(...adj)), `${tag}_${pos}`);
        }
        break;
      }
    }
  });

  // Check satisfiability with Z3 and decode the true indicator at each position
  const res = await m.check({ solver: "z3" });
  if (res.status !== "Sat") {
    return { satisfiable: false, assignment: null };
  }

  const assignment: Array<Record<string, string>> = Array.from({ length: input.n }, (_, pos) => {
    const row: Record<string, string> = {};
    for (const cat of catNames) {
      const chosen = input.categories[cat].find((val) => Boolean(vars[cat][val][pos].value));
      row[cat] = chosen ?? input.categories[cat][0];
    }
    return row;
  });

  return { satisfiable: true, assignment };
}
