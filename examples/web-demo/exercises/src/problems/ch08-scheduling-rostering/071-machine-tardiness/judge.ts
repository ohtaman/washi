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

export interface P071Input {
  releaseDates: number[];
  processingTimes: number[];
  dueDates: number[];
  weights: number[];
}

export interface P071Output {
  starts: number[];
  totalWeightedTardiness: number;
}

export function judge(
  input: P071Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.processingTimes.length;
  const starts = expectNumericArray(
    output.starts,
    n,
    { en: "starts", ja: "starts", zh: "starts" },
    locale
  );
  if (typeof starts === "string") return runtimeError(starts);

  const objCheck = expectFiniteNumber(
    output.totalWeightedTardiness,
    {
      en: "totalWeightedTardiness",
      ja: "totalWeightedTardiness",
      zh: "totalWeightedTardiness",
    },
    locale
  );
  if (typeof objCheck === "string") return runtimeError(objCheck);

  for (let j = 0; j < n; j++) {
    if (starts[j] < input.releaseDates[j] - 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m1, {
          p0: j,
          p1: roundNice(starts[j]),
          p2: input.releaseDates[j],
        })
      );
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const iBeforeJ = starts[i] + input.processingTimes[i] <= starts[j] + 1e-4;
      const jBeforeI = starts[j] + input.processingTimes[j] <= starts[i] + 1e-4;
      if (!iBeforeJ && !jBeforeI) {
        return violation(
          formatTemplate(JMSG[locale].m2, {
            p0: i,
            p1: roundNice(starts[i]),
            p2: roundNice(starts[i] + input.processingTimes[i]),
            p3: j,
            p4: roundNice(starts[j]),
            p5: roundNice(starts[j] + input.processingTimes[j]),
          })
        );
      }
    }
  }

  let recomputed = 0;
  for (let j = 0; j < n; j++) {
    const tardiness = Math.max(0, starts[j] + input.processingTimes[j] - input.dueDates[j]);
    recomputed += input.weights[j] * tardiness;
  }

  if (!approxEqual(objCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m3, {
        p0: roundNice(objCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `starts=[${starts.map((v) => roundNice(v)).join(", ")}] | TWT=${roundNice(recomputed)}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(recomputed),
        p1: expectedOptimal,
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m5, { p0: expectedOptimal }),
    preview
  );
}
