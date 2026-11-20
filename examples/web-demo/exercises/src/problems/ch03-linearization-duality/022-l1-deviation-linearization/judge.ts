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

export interface P022Input {
  targets: number[];
  weights: number[];
  upperBounds: number[];
  costs: number[];
  budget: number;
  totalOutput: number;
}

export interface P022Output {
  allocations: number[];
  totalDeviation: number;
}

export function judge(
  input: P022Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.targets.length;
  const allocations = expectNumericArray(
    output.allocations,
    n,
    { en: "allocations", ja: "allocations", zh: "allocations" },
    locale
  );
  if (typeof allocations === "string") return runtimeError(allocations);

  const devCheck = expectFiniteNumber(
    output.totalDeviation,
    { en: "totalDeviation", ja: "totalDeviation", zh: "totalDeviation" },
    locale
  );
  if (typeof devCheck === "string") return runtimeError(devCheck);

  let sumOut = 0;
  let totalCost = 0;
  let trueDev = 0;
  for (let i = 0; i < n; i++) {
    const x = allocations[i];
    if (x < -1e-6) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(x) }));
    }
    if (x > input.upperBounds[i] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: i,
          p1: roundNice(x),
          p2: input.upperBounds[i],
        })
      );
    }
    sumOut += x;
    totalCost += input.costs[i] * x;
    trueDev += input.weights[i] * Math.abs(x - input.targets[i]);
  }

  if (!approxEqual(sumOut, input.totalOutput, 1e-4)) {
    return violation(
      formatTemplate(JMSG[locale].m3, {
        p0: roundNice(sumOut),
        p1: input.totalOutput,
      })
    );
  }

  if (totalCost > input.budget + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(totalCost),
        p1: input.budget,
      })
    );
  }

  if (!approxEqual(devCheck, trueDev, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(devCheck),
        p1: roundNice(trueDev),
      })
    );
  }

  const preview = `x=[${allocations.map((v) => roundNice(v, 2)).join(", ")}] | cost=${roundNice(totalCost, 2)}/${input.budget}`;

  if (trueDev > expectedOptimal + 1e-2) {
    return suboptimal(
      trueDev,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(trueDev),
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
