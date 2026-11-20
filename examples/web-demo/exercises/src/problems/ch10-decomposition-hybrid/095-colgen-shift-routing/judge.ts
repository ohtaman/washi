import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  approxEqual,
  checkIntegrality,
  expectFiniteNumber,
  expectNumericArray,
  formatTemplate,
  isRecord,
  roundNice,
  runtimeError,
  suboptimal,
  violation,
} from "../../judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface P095Input {
  demands: number[];
  shiftCosts: number[];
  baseCost: number;
  maxConsecutive: number;
  maxWorkDays: number;
}

export interface P095Output {
  selectedColumns: number[][];
  counts: number[];
  totalCost: number;
}

export function judge(
  input: P095Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  if (!Array.isArray(output.selectedColumns)) {
    return runtimeError(JMSG[locale].m1);
  }
  const P = output.selectedColumns.length;
  const countsRaw = expectNumericArray(
    output.counts,
    P,
    { en: "counts", ja: "counts", zh: "counts" },
    locale
  );
  if (typeof countsRaw === "string") return runtimeError(countsRaw);

  const totalCostCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof totalCostCheck === "string") return runtimeError(totalCostCheck);

  const D = input.demands.length;
  const cleanCols: number[][] = [];
  for (let p = 0; p < P; p++) {
    const col = expectNumericArray(
      output.selectedColumns[p],
      D,
      { en: `selectedColumns[${p}]`, ja: `selectedColumns[${p}]`, zh: `selectedColumns[${p}]` },
      locale
    );
    if (typeof col === "string") return runtimeError(col);
    cleanCols.push(col);
  }

  const coverage = Array(D).fill(0);
  const cleanCounts: number[] = [];
  let recomputedCost = 0;

  for (let p = 0; p < P; p++) {
    const cRaw = countsRaw[p];
    if (!checkIntegrality(cRaw) || Math.round(cRaw) < 0) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: p, p1: roundNice(cRaw) }));
    }
    const cnt = Math.round(cRaw);
    cleanCounts.push(cnt);

    const col = cleanCols[p];
    let totalDays = 0;
    let streak = 0;
    let maxStreak = 0;
    let colCost = input.baseCost;

    for (let d = 0; d < D; d++) {
      const bitRaw = col[d];
      if (!checkIntegrality(bitRaw)) {
        return violation(formatTemplate(JMSG[locale].m3, { p0: p, p1: d, p2: roundNice(bitRaw) }));
      }
      const bit = Math.round(bitRaw);
      if (bit !== 0 && bit !== 1) {
        return violation(formatTemplate(JMSG[locale].m3, { p0: p, p1: d, p2: bit }));
      }
      if (bit === 1) {
        totalDays++;
        streak++;
        maxStreak = Math.max(maxStreak, streak);
        colCost += input.shiftCosts[d];
        coverage[d] += cnt;
      } else {
        streak = 0;
      }
    }

    if (totalDays === 0 || totalDays > input.maxWorkDays) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: p,
          p1: totalDays,
          p2: input.maxWorkDays,
        })
      );
    }
    if (maxStreak > input.maxConsecutive) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: p,
          p1: maxStreak,
          p2: input.maxConsecutive,
        })
      );
    }

    recomputedCost += cnt * colCost;
  }

  for (let d = 0; d < D; d++) {
    if (coverage[d] < input.demands[d]) {
      return violation(
        formatTemplate(JMSG[locale].m6, {
          p0: d,
          p1: coverage[d],
          p2: input.demands[d],
        })
      );
    }
  }

  if (!approxEqual(totalCostCheck, recomputedCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m7, {
        p0: roundNice(totalCostCheck),
        p1: roundNice(recomputedCost),
      })
    );
  }

  const preview = `patterns=${P} | counts=[${cleanCounts.join(", ")}] | totalCost=${roundNice(recomputedCost)}`;

  if (recomputedCost > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputedCost,
      expectedOptimal,
      formatTemplate(JMSG[locale].m8, { p0: roundNice(recomputedCost), p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m9, { p0: expectedOptimal }),
    preview
  );
}
