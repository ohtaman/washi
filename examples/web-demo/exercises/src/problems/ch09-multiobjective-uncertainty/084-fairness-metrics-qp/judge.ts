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

export interface P084Input {
  unitCosts: number[];
  minAlloc: number[];
  maxAlloc: number[];
  totalDemand: number;
  fairnessWeight: number;
}

export interface P084Output {
  allocations: number[];
  totalCost: number;
}

export function judge(
  input: P084Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.unitCosts.length;
  const allocations = expectNumericArray(
    output.allocations,
    n,
    { en: "allocations", ja: "allocations", zh: "allocations" },
    locale
  );
  if (typeof allocations === "string") return runtimeError(allocations);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  let totalSum = 0;
  let linearCost = 0;
  const mean = input.totalDemand / n;
  let sqDev = 0;

  for (let i = 0; i < n; i++) {
    const x = allocations[i];
    if (x < input.minAlloc[i] - 1e-4 || x > input.maxAlloc[i] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m1, {
          p0: i,
          p1: roundNice(x),
          p2: input.minAlloc[i],
          p3: input.maxAlloc[i],
        })
      );
    }
    totalSum += x;
    linearCost += input.unitCosts[i] * x;
    sqDev += (x - mean) ** 2;
  }

  if (!approxEqual(totalSum, input.totalDemand, 1e-3)) {
    return violation(
      formatTemplate(JMSG[locale].m2, {
        p0: roundNice(totalSum),
        p1: input.totalDemand,
      })
    );
  }

  const recomputed = linearCost + input.fairnessWeight * sqDev;
  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m3, {
        p0: roundNice(costCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `x=[${allocations.map((v) => roundNice(v)).join(", ")}] | mean=${roundNice(mean)} | obj=${roundNice(recomputed)}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(recomputed),
        p1: roundNice(expectedOptimal),
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m5, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
