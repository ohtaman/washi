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

export interface P023Input {
  demands: number[];
  minRegular: number[];
  maxRegular: number[];
  regularCosts: number[];
  overtimePenalties: number[];
  totalRegularCap: number;
}

export interface P023Output {
  regular: number[];
  shortage: number[];
  totalCost: number;
}

export function judge(
  input: P023Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const T = input.demands.length;
  const regular = expectNumericArray(
    output.regular,
    T,
    { en: "regular", ja: "regular", zh: "regular" },
    locale
  );
  if (typeof regular === "string") return runtimeError(regular);

  const shortage = expectNumericArray(
    output.shortage,
    T,
    { en: "shortage", ja: "shortage", zh: "shortage" },
    locale
  );
  if (typeof shortage === "string") return runtimeError(shortage);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  let sumReg = 0;
  let trueCost = 0;
  for (let t = 0; t < T; t++) {
    const x = regular[t];
    const s = shortage[t];
    if (x < input.minRegular[t] - 1e-4 || x > input.maxRegular[t] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m1, {
          p0: t,
          p1: roundNice(x),
          p2: input.minRegular[t],
          p3: input.maxRegular[t],
        })
      );
    }
    if (s < -1e-6) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: t, p1: roundNice(s) }));
    }
    const reqShortage = Math.max(0, input.demands[t] - x);
    if (s < reqShortage - 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: t,
          p1: roundNice(s),
          p2: roundNice(reqShortage),
        })
      );
    }
    sumReg += x;
    trueCost += input.regularCosts[t] * x + input.overtimePenalties[t] * s;
  }

  if (sumReg > input.totalRegularCap + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(sumReg),
        p1: input.totalRegularCap,
      })
    );
  }

  if (!approxEqual(costCheck, trueCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(costCheck),
        p1: roundNice(trueCost),
      })
    );
  }

  const preview = `reg=[${regular.map((v) => roundNice(v, 2)).join(", ")}] | short=[${shortage.map((v) => roundNice(v, 2)).join(", ")}]`;

  if (trueCost > expectedOptimal + 1e-2) {
    return suboptimal(
      trueCost,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(trueCost),
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
