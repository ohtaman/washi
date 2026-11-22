import type { JudgeResult, Locale } from "../../../types.js";
import { accepted, formatTemplate, isRecord, runtimeError, violation } from "../../judge-helpers.js";
import { expectBooleanField } from "../smt-judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

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

function findPosition(
  assignment: Array<Record<string, string>>,
  category: string,
  value: string
): number {
  return assignment.findIndex((row) => row[category] === value);
}

function clueHolds(assignment: Array<Record<string, string>>, clue: ZebraClue): boolean {
  switch (clue.type) {
    case "at":
      return assignment[clue.position]?.[clue.category] === clue.value;
    case "same": {
      const pa = findPosition(assignment, clue.a[0], clue.a[1]);
      const pb = findPosition(assignment, clue.b[0], clue.b[1]);
      return pa !== -1 && pa === pb;
    }
    case "implies": {
      const pa = findPosition(assignment, clue.a[0], clue.a[1]);
      const pb = findPosition(assignment, clue.b[0], clue.b[1]);
      return pa === -1 || pa === pb;
    }
    case "notTogether": {
      const pa = findPosition(assignment, clue.a[0], clue.a[1]);
      const pb = findPosition(assignment, clue.b[0], clue.b[1]);
      return pa !== pb;
    }
    case "leftOf": {
      const pl = findPosition(assignment, clue.left[0], clue.left[1]);
      const pr = findPosition(assignment, clue.right[0], clue.right[1]);
      if (pl === -1 || pr === -1) return false;
      return clue.immediate ? pr === pl + 1 : pl < pr;
    }
    case "nextTo": {
      const pa = findPosition(assignment, clue.a[0], clue.a[1]);
      const pb = findPosition(assignment, clue.b[0], clue.b[1]);
      return pa !== -1 && pb !== -1 && Math.abs(pa - pb) === 1;
    }
  }
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = items.filter((_, idx) => idx !== i);
    for (const sub of permutations(rest)) {
      out.push([items[i], ...sub]);
    }
  }
  return out;
}

function clueCategories(clue: ZebraClue): string[] {
  switch (clue.type) {
    case "at":
      return [clue.category];
    case "same":
    case "implies":
    case "notTogether":
    case "nextTo":
      return [clue.a[0], clue.b[0]];
    case "leftOf":
      return [clue.left[0], clue.right[0]];
  }
}

function hasZebraSolution(input: P041Input): boolean {
  const catNames = Object.keys(input.categories);
  const catIndex = new Map(catNames.map((cat, idx) => [cat, idx]));
  const cluesByLevel: ZebraClue[][] = Array.from({ length: catNames.length }, () => []);
  const fallbackClues: ZebraClue[] = [];

  for (const clue of input.clues) {
    let maxIdx = -1;
    let known = true;
    for (const cat of clueCategories(clue)) {
      const idx = catIndex.get(cat);
      if (idx === undefined) {
        known = false;
        break;
      }
      if (idx > maxIdx) maxIdx = idx;
    }
    if (!known || maxIdx < 0) {
      fallbackClues.push(clue);
    } else {
      cluesByLevel[maxIdx].push(clue);
    }
  }

  const permsByCat = catNames.map((cat) => permutations(input.categories[cat]));
  const grid: Array<Record<string, string>> = Array.from({ length: input.n }, () => ({}));

  const search = (catIdx: number): boolean => {
    if (catIdx === catNames.length) {
      return fallbackClues.every((c) => clueHolds(grid, c));
    }
    const cat = catNames[catIdx];
    const levelClues = cluesByLevel[catIdx];
    for (const perm of permsByCat[catIdx]) {
      for (let pos = 0; pos < input.n; pos++) {
        grid[pos][cat] = perm[pos];
      }
      if (levelClues.every((c) => clueHolds(grid, c)) && search(catIdx + 1)) {
        return true;
      }
    }
    return false;
  };

  return search(0);
}

export function judge(
  input: P041Input,
  output: unknown,
  _expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const satCheck = expectBooleanField(output.satisfiable, "satisfiable", locale);
  if (typeof satCheck === "string") return runtimeError(satCheck);

  if (!satCheck) {
    if (output.assignment !== null) {
      return runtimeError(JMSG[locale].m1);
    }
    if (hasZebraSolution(input)) {
      return violation(JMSG[locale].m2);
    }
    return accepted(0, JMSG[locale].m4, "satisfiable=false");
  }

  if (!Array.isArray(output.assignment) || output.assignment.length !== input.n) {
    return runtimeError(formatTemplate(JMSG[locale].m6, { p0: input.n }));
  }

  const catNames = Object.keys(input.categories);
  const parsed: Array<Record<string, string>> = [];
  for (let pos = 0; pos < input.n; pos++) {
    const row = output.assignment[pos];
    if (!isRecord(row)) {
      return runtimeError(formatTemplate(JMSG[locale].m7, { p0: pos }));
    }
    const cleanRow: Record<string, string> = {};
    for (const cat of catNames) {
      const val = row[cat];
      if (typeof val !== "string") {
        return runtimeError(formatTemplate(JMSG[locale].m8, { p0: pos, p1: cat }));
      }
      cleanRow[cat] = val;
    }
    parsed.push(cleanRow);
  }

  for (const cat of catNames) {
    const allowed = new Set(input.categories[cat]);
    const seen = new Set<string>();
    for (let pos = 0; pos < input.n; pos++) {
      const val = parsed[pos][cat];
      if (!allowed.has(val)) {
        return violation(formatTemplate(JMSG[locale].m9, { p0: cat, p1: val }));
      }
      if (seen.has(val)) {
        return violation(formatTemplate(JMSG[locale].m10, { p0: cat, p1: val }));
      }
      seen.add(val);
    }
  }

  for (let i = 0; i < input.clues.length; i++) {
    if (!clueHolds(parsed, input.clues[i])) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: i }));
    }
  }

  const preview = parsed
    .map((row, pos) => `#${pos}:${catNames.map((c) => row[c]).join("/")}`)
    .join(" | ");
  return accepted(1, JMSG[locale].m5, preview);
}
