import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  formatTemplate,
  approxEqual,
  expectFiniteNumber,
  expectNumericArray,
  isRecord,
  roundNice,
  suboptimal,
  violation,
} from "../../judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface P004Input {
  loads: number[];
  capacities: number[];
  allowed: number[][];
}

export interface P004Output {
  assignments: number[][];
  peakUtilization: number;
}

export function judge(
  input: P004Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return violation(
      JMSG[locale].m0
    );
  }

  const nJobs = input.loads.length;
  const nServers = input.capacities.length;

  if (!Array.isArray(output.assignments) || output.assignments.length !== nJobs) {
    return violation(
      formatTemplate(JMSG[locale].m1, { p0: nJobs, p1: nServers })
    );
  }

  const peakCheck = expectFiniteNumber(
    output.peakUtilization,
    { en: "peakUtilization", ja: "peakUtilization", zh: "peakUtilization" },
    locale
  );
  if (typeof peakCheck === "string") return violation(peakCheck);

  const serverLoad = new Array<number>(nServers).fill(0);
  const assignMatrix: number[][] = [];

  for (let j = 0; j < nJobs; j++) {
    const row = expectNumericArray(
      output.assignments[j],
      nServers,
      { en: `assignments[${j}]`, ja: `assignments[${j}]`, zh: `assignments[${j}]` },
      locale
    );
    if (typeof row === "string") return violation(row);
    assignMatrix.push(row);

    let rowSum = 0;
    for (let s = 0; s < nServers; s++) {
      if (row[s] < -1e-6) {
        return violation(
          formatTemplate(JMSG[locale].m2, { p0: j, p1: s, p2: roundNice(row[s]) })
        );
      }
      if (input.allowed[j][s] === 0 && row[s] > 1e-5) {
        return violation(
          formatTemplate(JMSG[locale].m3, { p0: j, p1: s, p2: roundNice(row[s]) })
        );
      }
      rowSum += row[s];
      serverLoad[s] += input.loads[j] * row[s];
    }

    if (!approxEqual(rowSum, 1.0, 1e-4)) {
      return violation(
        formatTemplate(JMSG[locale].m4, { p0: j, p1: roundNice(rowSum) })
      );
    }
  }

  let truePeak = 0;
  for (let s = 0; s < nServers; s++) {
    const util = serverLoad[s] / input.capacities[s];
    if (util > truePeak) truePeak = util;
  }

  if (!approxEqual(peakCheck, truePeak, 1e-3)) {
    return violation(
      formatTemplate(JMSG[locale].m5, { p0: roundNice(peakCheck, 5), p1: roundNice(truePeak, 5) })
    );
  }

  const preview = `peak=${roundNice(truePeak * 100, 1)}%, utils=[${serverLoad.map((l, s) => roundNice(l / input.capacities[s], 3)).join(", ")}]`;

  if (truePeak > expectedOptimal + 1e-4) {
    return suboptimal(
      truePeak,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, { p0: roundNice(truePeak, 5), p1: roundNice(expectedOptimal, 5) }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: roundNice(expectedOptimal, 5) }),
    preview
  );
}
