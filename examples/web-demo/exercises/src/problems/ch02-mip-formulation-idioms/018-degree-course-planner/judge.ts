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

export interface P018Input {
  interest: number[];
  requirements: number[][];
  caps: number[];
  prerequisites: number[][];
  timeConflicts: number[][];
}

export interface P018Output {
  take: number[];
  totalInterest: number;
}

export function judge(
  input: P018Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.interest.length;
  const takeRaw = expectNumericArray(
    output.take,
    n,
    { en: "take", ja: "take", zh: "take" },
    locale
  );
  if (typeof takeRaw === "string") return runtimeError(takeRaw);

  const interestCheck = expectFiniteNumber(
    output.totalInterest,
    { en: "totalInterest", ja: "totalInterest", zh: "totalInterest" },
    locale
  );
  if (typeof interestCheck === "string") return runtimeError(interestCheck);

  const takeClean: number[] = [];
  let recomputed = 0;

  for (let j = 0; j < n; j++) {
    const t = takeRaw[j];
    if (!checkIntegrality(t)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: j, p1: roundNice(t) }));
    }
    const tInt = Math.round(t);
    if (tInt !== 0 && tInt !== 1) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: j, p1: tInt }));
    }
    takeClean.push(tInt);
    recomputed += input.interest[j] * tInt;
  }

  for (let k = 0; k < input.caps.length; k++) {
    const used = input.requirements[k].reduce((acc, w, j) => acc + w * takeClean[j], 0);
    if (used > input.caps[k] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: k,
          p1: roundNice(used),
          p2: input.caps[k],
        })
      );
    }
  }

  for (const [prereq, course] of input.prerequisites) {
    if (takeClean[course] > takeClean[prereq]) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: course, p1: prereq }));
    }
  }

  for (const [a, b] of input.timeConflicts) {
    if (takeClean[a] + takeClean[b] > 1) {
      return violation(formatTemplate(JMSG[locale].m4, { p0: a, p1: b }));
    }
  }

  if (!approxEqual(interestCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, { p0: roundNice(interestCheck), p1: roundNice(recomputed) })
    );
  }

  const preview = `take=[${takeClean.join(", ")}] | totalInterest=${roundNice(recomputed)}`;

  if (recomputed < expectedOptimal - 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, { p0: roundNice(recomputed), p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: expectedOptimal }),
    preview
  );
}
