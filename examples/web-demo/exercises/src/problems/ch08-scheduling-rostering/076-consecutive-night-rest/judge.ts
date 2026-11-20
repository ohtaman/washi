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

export interface P076Input {
  demands: number[][];
  shiftCosts: number[][];
  maxConsecutiveDays: number;
}

export interface P076Output {
  schedule: number[][];
  totalCost: number;
}

export function judge(
  input: P076Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const N = input.shiftCosts.length;
  const D = input.demands.length;
  const S = 3;
  const K = input.maxConsecutiveDays;

  if (!Array.isArray(output.schedule) || output.schedule.length !== N) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: N, p1: D }));
  }
  const schedule: number[][] = [];
  for (let i = 0; i < N; i++) {
    const row = expectNumericArray(
      output.schedule[i],
      D,
      { en: `schedule[${i}]`, ja: `schedule[${i}]`, zh: `schedule[${i}]` },
      locale
    );
    if (typeof row === "string") return runtimeError(row);
    schedule.push(row);
  }

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const cleanSched: number[][] = [];
  const coverage = Array.from({ length: D }, () => [0, 0, 0]);
  let recomputed = 0;

  for (let i = 0; i < N; i++) {
    const rowInt: number[] = [];
    for (let d = 0; d < D; d++) {
      const raw = schedule[i][d];
      if (!checkIntegrality(raw)) {
        return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: d, p2: roundNice(raw) }));
      }
      const s = Math.round(raw);
      if (s < -1 || s >= S) {
        return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: d, p2: s }));
      }
      if (s >= 0) {
        coverage[d][s]++;
        recomputed += input.shiftCosts[i][s];
      }
      rowInt.push(s);
    }

    for (let t = 0; t <= D - K - 1; t++) {
      let streak = 0;
      for (let tau = t; tau <= t + K; tau++) {
        if (rowInt[tau] >= 0) streak++;
      }
      if (streak > K) {
        return violation(
          formatTemplate(JMSG[locale].m3, { p0: i, p1: t, p2: t + K, p3: K })
        );
      }
    }

    for (let d = 0; d < D - 1; d++) {
      if (rowInt[d] === 2 && rowInt[d + 1] === 0) {
        return violation(formatTemplate(JMSG[locale].m4, { p0: i, p1: d, p2: d + 1 }));
      }
    }

    cleanSched.push(rowInt);
  }

  for (let d = 0; d < D; d++) {
    for (let s = 0; s < S; s++) {
      if (coverage[d][s] < input.demands[d][s]) {
        return violation(
          formatTemplate(JMSG[locale].m5, {
            p0: d,
            p1: s,
            p2: coverage[d][s],
            p3: input.demands[d][s],
          })
        );
      }
    }
  }

  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(costCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `totalCost=${roundNice(recomputed)} | schedule=${JSON.stringify(cleanSched)}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m7, {
        p0: roundNice(recomputed),
        p1: expectedOptimal,
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m8, { p0: expectedOptimal }),
    preview
  );
}
