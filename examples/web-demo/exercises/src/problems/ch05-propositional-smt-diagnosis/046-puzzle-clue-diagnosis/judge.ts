import type { JudgeResult, Locale } from "../../../types.js";
import { accepted, formatTemplate, isRecord, runtimeError, violation } from "../../judge-helpers.js";
import { expectStringArray, hasDuplicates } from "../smt-judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

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

function clueHolds(clue: PuzzleClue, mines: Record<string, number>): boolean {
  switch (clue.type) {
    case "mineCount":
      return clue.cells.reduce((acc, c) => acc + mines[c], 0) === clue.count;
    case "atLeast":
      return clue.cells.reduce((acc, c) => acc + mines[c], 0) >= clue.count;
    case "atMost":
      return clue.cells.reduce((acc, c) => acc + mines[c], 0) <= clue.count;
    case "safe":
      return mines[clue.cell] === 0;
    case "mine":
      return mines[clue.cell] === 1;
    case "impliesMine":
      return mines[clue.ifMine] <= mines[clue.thenMine];
    case "same":
      return mines[clue.a] === mines[clue.b];
    case "different":
      return mines[clue.a] + mines[clue.b] === 1;
  }
}

function findAnyMineBoard(cells: string[], clues: PuzzleClue[]): Record<string, number> | null {
  const mines: Record<string, number> = {};
  const visit = (idx: number): boolean => {
    if (idx === cells.length) {
      return clues.every((c) => clueHolds(c, mines));
    }
    const cell = cells[idx];
    mines[cell] = 0;
    if (visit(idx + 1)) return true;
    mines[cell] = 1;
    if (visit(idx + 1)) return true;
    return false;
  };
  return visit(0) ? { ...mines } : null;
}

export function judge(
  input: P046Input,
  output: unknown,
  _expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const coreCheck = expectStringArray(output.coreRules, "coreRules", locale);
  if (typeof coreCheck === "string") return runtimeError(coreCheck);

  const dup = hasDuplicates(coreCheck);
  if (dup !== null) {
    return violation(formatTemplate(JMSG[locale].m1, { p0: dup }));
  }

  const clueMap = new Map(input.clues.map((c) => [c.id, c]));
  for (const id of coreCheck) {
    if (!clueMap.has(id)) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: id }));
    }
  }

  if (coreCheck.length === 0) {
    return violation(JMSG[locale].m3);
  }

  const coreClues = coreCheck.map((id) => clueMap.get(id)!);
  const fullWitness = findAnyMineBoard(input.cells, coreClues);
  if (fullWitness !== null) {
    return violation(formatTemplate(JMSG[locale].m4, { p0: coreCheck.join(", ") }));
  }

  for (let i = 0; i < coreCheck.length; i++) {
    const withoutI = coreClues.filter((_, idx) => idx !== i);
    const subWitness = findAnyMineBoard(input.cells, withoutI);
    if (subWitness === null) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: coreCheck.join(", "),
          p1: coreCheck[i],
        })
      );
    }
  }

  const sorted = [...coreCheck].sort();
  return accepted(
    sorted.length,
    formatTemplate(JMSG[locale].m6, { p0: sorted.length }),
    `core=[${sorted.join(", ")}]`
  );
}
