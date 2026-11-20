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

export interface P024Input {
  numCoeffs: number[];
  numConst: number;
  denCoeffs: number[];
  denConst: number;
  usages: number[][];
  capacities: number[];
  upperBounds: number[];
}

export interface P024Output {
  x: number[];
  maxRatio: number;
}

export function judge(
  input: P024Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.numCoeffs.length;
  const x = expectNumericArray(output.x, n, { en: "x", ja: "x", zh: "x" }, locale);
  if (typeof x === "string") return runtimeError(x);

  const ratioCheck = expectFiniteNumber(
    output.maxRatio,
    { en: "maxRatio", ja: "maxRatio", zh: "maxRatio" },
    locale
  );
  if (typeof ratioCheck === "string") return runtimeError(ratioCheck);

  let numVal = input.numConst;
  let denVal = input.denConst;
  for (let j = 0; j < n; j++) {
    if (x[j] < -1e-6) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: j, p1: roundNice(x[j]) }));
    }
    if (x[j] > input.upperBounds[j] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: j,
          p1: roundNice(x[j]),
          p2: input.upperBounds[j],
        })
      );
    }
    numVal += input.numCoeffs[j] * x[j];
    denVal += input.denCoeffs[j] * x[j];
  }

  for (let k = 0; k < input.capacities.length; k++) {
    let used = 0;
    for (let j = 0; j < n; j++) {
      used += input.usages[k][j] * x[j];
    }
    if (used > input.capacities[k] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: k,
          p1: roundNice(used),
          p2: input.capacities[k],
        })
      );
    }
  }

  if (denVal <= 1e-9) {
    return violation(formatTemplate(JMSG[locale].m4, { p0: roundNice(denVal) }));
  }

  const trueRatio = numVal / denVal;
  if (!approxEqual(ratioCheck, trueRatio, 1e-4)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(ratioCheck),
        p1: roundNice(trueRatio),
      })
    );
  }

  const preview = `x=[${x.map((v) => roundNice(v, 3)).join(", ")}] | ratio=${roundNice(trueRatio, 4)}`;

  if (trueRatio < expectedOptimal - 1e-4) {
    return suboptimal(
      trueRatio,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(trueRatio),
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
