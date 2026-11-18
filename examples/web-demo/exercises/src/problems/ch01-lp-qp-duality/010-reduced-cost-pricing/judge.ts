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

export interface P010Input {
  baseMargins: number[];
  candidateMargins: number[];
  usages: number[][];
  capacities: number[];
}

export interface P010Output {
  baseQuantities: number[];
  candidateQuantities: number[];
  optimalProfit: number;
  shadowPrices: number[];
  candidateReducedCosts: number[];
  minMarginIncreaseNeeded: number[];
}

export function judge(
  input: P010Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return violation(
      JMSG[locale].m0
    );
  }

  const B = input.baseMargins.length;
  const C = input.candidateMargins.length;
  const M = input.capacities.length;

  const baseQ = expectNumericArray(output.baseQuantities, B, { en: "baseQuantities", ja: "baseQuantities", zh: "baseQuantities" }, locale);
  if (typeof baseQ === "string") return violation(baseQ);

  const candQ = expectNumericArray(output.candidateQuantities, C, { en: "candidateQuantities", ja: "candidateQuantities", zh: "candidateQuantities" }, locale);
  if (typeof candQ === "string") return violation(candQ);

  const profitCheck = expectFiniteNumber(output.optimalProfit, { en: "optimalProfit", ja: "optimalProfit", zh: "optimalProfit" }, locale);
  if (typeof profitCheck === "string") return violation(profitCheck);

  const shadowPrices = expectNumericArray(output.shadowPrices, M, { en: "shadowPrices", ja: "shadowPrices", zh: "shadowPrices" }, locale);
  if (typeof shadowPrices === "string") return violation(shadowPrices);

  const candRC = expectNumericArray(output.candidateReducedCosts, C, { en: "candidateReducedCosts", ja: "candidateReducedCosts", zh: "candidateReducedCosts" }, locale);
  if (typeof candRC === "string") return violation(candRC);

  const minRaise = expectNumericArray(output.minMarginIncreaseNeeded, C, { en: "minMarginIncreaseNeeded", ja: "minMarginIncreaseNeeded", zh: "minMarginIncreaseNeeded" }, locale);
  if (typeof minRaise === "string") return violation(minRaise);

  const allQ = [...baseQ, ...candQ];
  const allMargins = [...input.baseMargins, ...input.candidateMargins];
  const N = B + C;

  for (let j = 0; j < N; j++) {
    if (allQ[j] < -1e-6) {
      return violation(
        formatTemplate(JMSG[locale].m1, { p0: j, p1: roundNice(allQ[j]) })
      );
    }
  }

  const trueSlacks: number[] = [];
  for (let k = 0; k < M; k++) {
    let used = 0;
    for (let j = 0; j < N; j++) {
      used += input.usages[k][j] * allQ[j];
    }
    const slack = input.capacities[k] - used;
    if (slack < -1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: k, p1: roundNice(used), p2: input.capacities[k] })
      );
    }
    trueSlacks.push(slack);
  }

  let trueProfit = 0;
  for (let j = 0; j < N; j++) {
    trueProfit += allMargins[j] * allQ[j];
  }
  if (!approxEqual(profitCheck, trueProfit, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m3, { p0: roundNice(profitCheck), p1: roundNice(trueProfit) })
    );
  }

  const preview = `candQ=[${candQ.map((v) => roundNice(v, 2)).join(", ")}], raise=[${minRaise.map((v) => roundNice(v, 2)).join(", ")}]`;

  if (trueProfit < expectedOptimal - 1e-2) {
    return suboptimal(
      trueProfit,
      expectedOptimal,
      formatTemplate(JMSG[locale].m4, { p0: roundNice(trueProfit), p1: roundNice(expectedOptimal) }),
      preview
    );
  }

  // Dual checks & reduced cost pricing verification
  let dualObj = 0;
  for (let k = 0; k < M; k++) {
    if (shadowPrices[k] < -1e-5) {
      return violation(
        formatTemplate(JMSG[locale].m5, { p0: k, p1: roundNice(shadowPrices[k]) })
      );
    }
    if (trueSlacks[k] > 1e-3 && Math.abs(shadowPrices[k]) > 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m6, { p0: k, p1: roundNice(trueSlacks[k]) })
      );
    }
    dualObj += input.capacities[k] * shadowPrices[k];
  }

  if (!approxEqual(dualObj, expectedOptimal, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m7, { p0: roundNice(dualObj), p1: roundNice(expectedOptimal) })
    );
  }

  for (let c = 0; c < C; c++) {
    let oppCost = 0;
    for (let k = 0; k < M; k++) {
      oppCost += input.usages[k][B + c] * shadowPrices[k];
    }
    const expectedRC = input.candidateMargins[c] - oppCost;
    if (!approxEqual(candRC[c], expectedRC, 1e-3)) {
      return violation(
        formatTemplate(JMSG[locale].m8, { p0: c, p1: roundNice(candRC[c], 3), p2: roundNice(expectedRC, 3) })
      );
    }
    const expectedRaise = Math.max(0, -expectedRC);
    if (!approxEqual(minRaise[c], expectedRaise, 1e-3)) {
      return violation(
        formatTemplate(JMSG[locale].m9, { p0: c, p1: roundNice(minRaise[c], 3), p2: roundNice(expectedRaise, 3) })
      );
    }
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m10, { p0: roundNice(expectedOptimal, 2) }),
    preview
  );
}
