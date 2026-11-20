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

export interface P096Input {
  profits: number[][];
  localUsages: number[][];
  localCaps: number[];
  sharedUsages: number[][];
  sharedCap: number;
  productCaps: number[][];
}

export interface P096Output {
  allocations: number[][];
  totalProfit: number;
}

export function judge(
  input: P096Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const K = input.profits.length;
  if (!Array.isArray(output.allocations) || output.allocations.length !== K) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: K }));
  }

  const totalProfitCheck = expectFiniteNumber(
    output.totalProfit,
    { en: "totalProfit", ja: "totalProfit", zh: "totalProfit" },
    locale
  );
  if (typeof totalProfitCheck === "string") return runtimeError(totalProfitCheck);

  const cleanAlloc: number[][] = [];
  for (let k = 0; k < K; k++) {
    const J = input.profits[k].length;
    const row = expectNumericArray(
      output.allocations[k],
      J,
      { en: `allocations[${k}]`, ja: `allocations[${k}]`, zh: `allocations[${k}]` },
      locale
    );
    if (typeof row === "string") return runtimeError(row);
    cleanAlloc.push(row);
  }

  let sharedUsed = 0;
  let recomputedProfit = 0;

  for (let k = 0; k < K; k++) {
    const J = input.profits[k].length;
    let localUsed = 0;
    for (let j = 0; j < J; j++) {
      const val = cleanAlloc[k][j];
      const cap = input.productCaps[k][j];
      if (val < -1e-4 || val > cap + 1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m2, {
            p0: k,
            p1: j,
            p2: roundNice(val),
            p3: cap,
          })
        );
      }
      localUsed += input.localUsages[k][j] * val;
      sharedUsed += input.sharedUsages[k][j] * val;
      recomputedProfit += input.profits[k][j] * val;
    }

    if (localUsed > input.localCaps[k] + 1e-3) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: k,
          p1: roundNice(localUsed),
          p2: input.localCaps[k],
        })
      );
    }
  }

  if (sharedUsed > input.sharedCap + 1e-3) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(sharedUsed),
        p1: input.sharedCap,
      })
    );
  }

  if (!approxEqual(totalProfitCheck, recomputedProfit, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(totalProfitCheck),
        p1: roundNice(recomputedProfit),
      })
    );
  }

  const preview = `shared=${roundNice(sharedUsed)}/${input.sharedCap} | totalProfit=${roundNice(recomputedProfit)}`;

  if (recomputedProfit < expectedOptimal - 1e-2) {
    return suboptimal(
      recomputedProfit,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(recomputedProfit),
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
