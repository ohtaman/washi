import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  checkIntegrality,
  expectNumericArray,
  formatTemplate,
  isRecord,
  roundNice,
  runtimeError,
  violation,
} from "../../judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

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

export function judge(
  input: P039Input,
  output: unknown,
  _expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.size;
  if (!Array.isArray(output.grid) || output.grid.length !== n) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: n }));
  }

  const rawGrid: number[][] = [];
  for (let r = 0; r < n; r++) {
    const rowArr = expectNumericArray(
      output.grid[r],
      n,
      { en: `grid[${r}]`, ja: `grid[${r}]`, zh: `grid[${r}]` },
      locale
    );
    if (typeof rowArr === "string") return runtimeError(rowArr);
    rawGrid.push(rowArr);
  }

  const cleanGrid: number[][] = [];
  for (let r = 0; r < n; r++) {
    const rowArr = rawGrid[r];
    const rowClean: number[] = [];
    for (let c = 0; c < n; c++) {
      const raw = rowArr[c];
      if (!checkIntegrality(raw)) {
        return violation(
          formatTemplate(JMSG[locale].m2, { p0: r, p1: c, p2: roundNice(raw) })
        );
      }
      const val = Math.round(raw);
      if (val < 1 || val > n) {
        return violation(
          formatTemplate(JMSG[locale].m3, { p0: r, p1: c, p2: val, p3: n })
        );
      }
      rowClean.push(val);
    }
    cleanGrid.push(rowClean);
  }

  for (let r = 0; r < n; r++) {
    const seen = new Set<number>();
    for (let c = 0; c < n; c++) {
      if (seen.has(cleanGrid[r][c])) {
        return violation(
          formatTemplate(JMSG[locale].m4, { p0: r, p1: cleanGrid[r][c] })
        );
      }
      seen.add(cleanGrid[r][c]);
    }
  }

  for (let c = 0; c < n; c++) {
    const seen = new Set<number>();
    for (let r = 0; r < n; r++) {
      if (seen.has(cleanGrid[r][c])) {
        return violation(
          formatTemplate(JMSG[locale].m5, { p0: c, p1: cleanGrid[r][c] })
        );
      }
      seen.add(cleanGrid[r][c]);
    }
  }

  for (const [r, c, expectedVal] of input.givens) {
    if (cleanGrid[r][c] !== expectedVal) {
      return violation(
        formatTemplate(JMSG[locale].m6, {
          p0: r,
          p1: c,
          p2: expectedVal,
          p3: cleanGrid[r][c],
        })
      );
    }
  }

  for (let idx = 0; idx < input.cages.length; idx++) {
    const cage = input.cages[idx];
    const seen = new Set<number>();
    let cageSum = 0;
    for (const [r, c] of cage.cells) {
      const val = cleanGrid[r][c];
      if (seen.has(val)) {
        return violation(
          formatTemplate(JMSG[locale].m7, { p0: idx, p1: val })
        );
      }
      seen.add(val);
      cageSum += val;
    }
    if (cageSum !== cage.targetSum) {
      return violation(
        formatTemplate(JMSG[locale].m8, {
          p0: idx,
          p1: cageSum,
          p2: cage.targetSum,
        })
      );
    }
  }

  const preview = cleanGrid.map((row) => `[${row.join(" ")}]`).join(" / ");
  return accepted(0, formatTemplate(JMSG[locale].m9, { p0: n }), preview);
}
