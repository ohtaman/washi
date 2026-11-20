import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
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

export interface P094Input {
  rollWidth: number;
  widths: number[];
  demands: number[];
}

export interface P094Output {
  patterns: number[][];
  counts: number[];
  totalRolls: number;
}

export function judge(
  input: P094Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  if (!Array.isArray(output.patterns)) {
    return runtimeError(JMSG[locale].m1);
  }
  const P = output.patterns.length;
  const countsRaw = expectNumericArray(
    output.counts,
    P,
    { en: "counts", ja: "counts", zh: "counts" },
    locale
  );
  if (typeof countsRaw === "string") return runtimeError(countsRaw);

  const totalRollsCheck = expectFiniteNumber(
    output.totalRolls,
    { en: "totalRolls", ja: "totalRolls", zh: "totalRolls" },
    locale
  );
  if (typeof totalRollsCheck === "string") return runtimeError(totalRollsCheck);

  const m = input.widths.length;
  const cleanPatterns: number[][] = [];
  for (let p = 0; p < P; p++) {
    const row = expectNumericArray(
      output.patterns[p],
      m,
      { en: `patterns[${p}]`, ja: `patterns[${p}]`, zh: `patterns[${p}]` },
      locale
    );
    if (typeof row === "string") return runtimeError(row);
    cleanPatterns.push(row);
  }

  const cleanCounts: number[] = [];
  const fulfilled = Array(m).fill(0);
  let recomputedTotal = 0;

  for (let p = 0; p < P; p++) {
    const cRaw = countsRaw[p];
    if (!checkIntegrality(cRaw) || Math.round(cRaw) < 0) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: p, p1: roundNice(cRaw) }));
    }
    const cnt = Math.round(cRaw);
    cleanCounts.push(cnt);
    recomputedTotal += cnt;

    let usedWidth = 0;
    for (let i = 0; i < m; i++) {
      const a = cleanPatterns[p][i];
      if (!checkIntegrality(a) || Math.round(a) < 0) {
        return violation(
          formatTemplate(JMSG[locale].m3, { p0: p, p1: i, p2: roundNice(a) })
        );
      }
      const aInt = Math.round(a);
      usedWidth += input.widths[i] * aInt;
      fulfilled[i] += cnt * aInt;
    }

    if (usedWidth > input.rollWidth + 1e-6) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: p,
          p1: roundNice(usedWidth),
          p2: input.rollWidth,
        })
      );
    }
  }

  for (let i = 0; i < m; i++) {
    if (fulfilled[i] < input.demands[i]) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: i,
          p1: fulfilled[i],
          p2: input.demands[i],
        })
      );
    }
  }

  if (!checkIntegrality(totalRollsCheck) || Math.round(totalRollsCheck) !== recomputedTotal) {
    return violation(
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(totalRollsCheck),
        p1: recomputedTotal,
      })
    );
  }

  const preview = `patterns=${P} | counts=[${cleanCounts.join(", ")}] | totalRolls=${recomputedTotal}`;

  if (recomputedTotal > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputedTotal,
      expectedOptimal,
      formatTemplate(JMSG[locale].m7, { p0: recomputedTotal, p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m8, { p0: expectedOptimal }),
    preview
  );
}
