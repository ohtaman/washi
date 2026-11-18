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

export interface P007Input {
  expectedReturns: number[];
  covariance: number[][];
  maxWeights: number[];
  minReturn: number;
}

export interface P007Output {
  weights: number[];
  variance: number;
}

export function judge(
  input: P007Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return violation(
      JMSG[locale].m0
    );
  }

  const n = input.expectedReturns.length;
  const w = expectNumericArray(
    output.weights,
    n,
    { en: "weights", ja: "weights", zh: "weights" },
    locale
  );
  if (typeof w === "string") return violation(w);

  const varCheck = expectFiniteNumber(
    output.variance,
    { en: "variance", ja: "variance", zh: "variance" },
    locale
  );
  if (typeof varCheck === "string") return violation(varCheck);

  let sumW = 0;
  let portReturn = 0;
  for (let i = 0; i < n; i++) {
    if (w[i] < -1e-6) {
      return violation(
        formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(w[i]) })
      );
    }
    if (w[i] > input.maxWeights[i] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: i, p1: roundNice(w[i], 4), p2: input.maxWeights[i] })
      );
    }
    sumW += w[i];
    portReturn += input.expectedReturns[i] * w[i];
  }

  if (!approxEqual(sumW, 1.0, 1e-4)) {
    return violation(
      formatTemplate(JMSG[locale].m3, { p0: roundNice(sumW, 5) })
    );
  }

  if (portReturn < input.minReturn - 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m4, { p0: roundNice(portReturn * 100, 3), p1: roundNice(input.minReturn * 100, 3) })
    );
  }

  let trueVar = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      trueVar += input.covariance[i][j] * w[i] * w[j];
    }
  }

  if (!approxEqual(varCheck, trueVar, 1e-5)) {
    return violation(
      formatTemplate(JMSG[locale].m5, { p0: roundNice(varCheck, 6), p1: roundNice(trueVar, 6) })
    );
  }

  const preview = `weights=[${w.map((v) => roundNice(v, 3)).join(", ")}]`;

  if (trueVar > expectedOptimal + 1e-5) {
    return suboptimal(
      trueVar,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, { p0: roundNice(trueVar, 6), p1: roundNice(expectedOptimal, 6) }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: roundNice(expectedOptimal, 6) }),
    preview
  );
}
