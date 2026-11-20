import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  approxEqual,
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

export interface P021Input {
  weights: number[];
  compatible: number[][];
}

export interface P021Output {
  assignments: number[][];
  peakLoad: number;
}

export function judge(
  input: P021Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const nJobs = input.weights.length;
  const nServers = input.compatible[0].length;
  if (!Array.isArray(output.assignments) || output.assignments.length !== nJobs) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: nJobs }));
  }

  const assignments: number[][] = [];
  for (let i = 0; i < nJobs; i++) {
    const row = expectNumericArray(
      output.assignments[i],
      nServers,
      {
        en: `assignments[${i}]`,
        ja: `assignments[${i}]`,
        zh: `assignments[${i}]`,
      },
      locale
    );
    if (typeof row === "string") return runtimeError(row);
    assignments.push(row);
  }

  const peakCheck = expectFiniteNumber(
    output.peakLoad,
    { en: "peakLoad", ja: "peakLoad", zh: "peakLoad" },
    locale
  );
  if (typeof peakCheck === "string") return runtimeError(peakCheck);

  const serverLoads = new Array<number>(nServers).fill(0);
  for (let i = 0; i < nJobs; i++) {
    let rowSum = 0;
    for (let j = 0; j < nServers; j++) {
      const val = assignments[i][j];
      if (val < -1e-6) {
        return violation(
          formatTemplate(JMSG[locale].m2, { p0: i, p1: j, p2: roundNice(val) })
        );
      }
      if (input.compatible[i][j] === 0 && val > 1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m3, { p0: i, p1: j, p2: roundNice(val) })
        );
      }
      rowSum += val;
      serverLoads[j] += input.weights[i] * val;
    }
    if (!approxEqual(rowSum, 1, 1e-4)) {
      return violation(
        formatTemplate(JMSG[locale].m4, { p0: i, p1: roundNice(rowSum) })
      );
    }
  }

  const actualPeak = Math.max(...serverLoads);
  if (!approxEqual(peakCheck, actualPeak, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(peakCheck),
        p1: roundNice(actualPeak),
      })
    );
  }

  const preview = `loads=[${serverLoads.map((v) => roundNice(v, 2)).join(", ")}] | peak=${roundNice(actualPeak)}`;

  if (actualPeak > expectedOptimal + 1e-2) {
    return suboptimal(
      actualPeak,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(actualPeak),
        p1: roundNice(expectedOptimal),
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
