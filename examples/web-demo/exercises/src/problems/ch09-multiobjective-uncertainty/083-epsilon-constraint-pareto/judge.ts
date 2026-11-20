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

export interface P083Input {
  profits: number[];
  budgets: number[];
  emissions: number[];
  budgetCap: number;
  epsilons: number[];
}

export interface P083Output {
  selections: number[][];
  frontierProfits: number[];
  frontierSum: number;
}

export function judge(
  input: P083Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.profits.length;
  const K = input.epsilons.length;

  if (!Array.isArray(output.selections) || output.selections.length !== K) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: K }));
  }

  const frontierProfits = expectNumericArray(
    output.frontierProfits,
    K,
    { en: "frontierProfits", ja: "frontierProfits", zh: "frontierProfits" },
    locale
  );
  if (typeof frontierProfits === "string") return runtimeError(frontierProfits);

  const sumCheck = expectFiniteNumber(
    output.frontierSum,
    { en: "frontierSum", ja: "frontierSum", zh: "frontierSum" },
    locale
  );
  if (typeof sumCheck === "string") return runtimeError(sumCheck);

  const selectionsRaw: number[][] = [];
  for (let k = 0; k < K; k++) {
    const selRaw = expectNumericArray(
      output.selections[k],
      n,
      { en: `selections[${k}]`, ja: `selections[${k}]`, zh: `selections[${k}]` },
      locale
    );
    if (typeof selRaw === "string") return runtimeError(selRaw);
    selectionsRaw.push(selRaw);
  }

  const recomputedProfits: number[] = [];

  for (let k = 0; k < K; k++) {
    const selRaw = selectionsRaw[k];
    let budgetUsed = 0;
    let emissionUsed = 0;
    let profitSum = 0;

    for (let j = 0; j < n; j++) {
      const val = selRaw[j];
      if (!checkIntegrality(val)) {
        return violation(
          formatTemplate(JMSG[locale].m2, { p0: k, p1: j, p2: roundNice(val) })
        );
      }
      const bit = Math.round(val);
      if (bit !== 0 && bit !== 1) {
        return violation(formatTemplate(JMSG[locale].m2, { p0: k, p1: j, p2: bit }));
      }
      budgetUsed += input.budgets[j] * bit;
      emissionUsed += input.emissions[j] * bit;
      profitSum += input.profits[j] * bit;
    }

    if (budgetUsed > input.budgetCap + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: k,
          p1: roundNice(budgetUsed),
          p2: input.budgetCap,
        })
      );
    }

    if (emissionUsed > input.epsilons[k] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: k,
          p1: roundNice(emissionUsed),
          p2: input.epsilons[k],
        })
      );
    }

    if (!approxEqual(frontierProfits[k], profitSum, 1e-2)) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: k,
          p1: roundNice(frontierProfits[k]),
          p2: roundNice(profitSum),
        })
      );
    }

    recomputedProfits.push(profitSum);
  }

  const totalSum = recomputedProfits.reduce((a, b) => a + b, 0);
  if (!approxEqual(sumCheck, totalSum, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(sumCheck),
        p1: roundNice(totalSum),
      })
    );
  }

  const preview = `frontier=[${recomputedProfits.map((v) => roundNice(v)).join(", ")}] | sum=${roundNice(totalSum)}`;

  if (totalSum < expectedOptimal - 1e-2) {
    return suboptimal(
      totalSum,
      expectedOptimal,
      formatTemplate(JMSG[locale].m7, {
        p0: roundNice(totalSum),
        p1: roundNice(expectedOptimal),
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m8, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
