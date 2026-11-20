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

export interface P077Input {
  demands: number[][];
  isSenior: number[];
  staffSkills: number[][];
  skillDemands: number[][];
  ngPairs: number[][];
  shiftCosts: number[][];
}

export interface P077Output {
  schedule: number[][];
  totalCost: number;
}

export function judge(
  input: P077Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const N = input.shiftCosts.length;
  const D = input.demands.length;
  const S = input.demands[0].length;
  const K = input.staffSkills[0].length;

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
  let recomputed = 0;

  for (let i = 0; i < N; i++) {
    const rowInt: number[] = [];
    for (let d = 0; d < D; d++) {
      const raw = schedule[i][d];
      if (!checkIntegrality(raw)) {
        return violation(
          formatTemplate(JMSG[locale].m2, { p0: i, p1: d, p2: roundNice(raw), p3: S - 1 })
        );
      }
      const s = Math.round(raw);
      if (s < -1 || s >= S) {
        return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: d, p2: s, p3: S - 1 }));
      }
      if (s >= 0) {
        recomputed += input.shiftCosts[i][s];
      }
      rowInt.push(s);
    }
    cleanSched.push(rowInt);
  }

  for (let d = 0; d < D; d++) {
    for (let s = 0; s < S; s++) {
      const assigned: number[] = [];
      for (let i = 0; i < N; i++) {
        if (cleanSched[i][d] === s) assigned.push(i);
      }
      if (assigned.length < input.demands[d][s]) {
        return violation(
          formatTemplate(JMSG[locale].m3, {
            p0: d,
            p1: s,
            p2: assigned.length,
            p3: input.demands[d][s],
          })
        );
      }
      if (input.demands[d][s] > 0) {
        const seniorCount = assigned.reduce((acc, i) => acc + input.isSenior[i], 0);
        if (seniorCount < 1) {
          return violation(formatTemplate(JMSG[locale].m4, { p0: d, p1: s }));
        }
        for (let k = 0; k < K; k++) {
          const skCount = assigned.reduce((acc, i) => acc + input.staffSkills[i][k], 0);
          if (skCount < input.skillDemands[s][k]) {
            return violation(
              formatTemplate(JMSG[locale].m5, {
                p0: d,
                p1: s,
                p2: k,
                p3: skCount,
                p4: input.skillDemands[s][k],
              })
            );
          }
        }
      }
    }
  }

  for (const [a, b] of input.ngPairs) {
    for (let d = 0; d < D; d++) {
      if (cleanSched[a][d] >= 0 && cleanSched[a][d] === cleanSched[b][d]) {
        return violation(
          formatTemplate(JMSG[locale].m6, {
            p0: a,
            p1: b,
            p2: d,
            p3: cleanSched[a][d],
          })
        );
      }
    }
  }

  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m7, {
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
      formatTemplate(JMSG[locale].m8, {
        p0: roundNice(recomputed),
        p1: expectedOptimal,
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m9, { p0: expectedOptimal }),
    preview
  );
}
