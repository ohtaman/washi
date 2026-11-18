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

export interface P001Input {
  margins: number[];
  usages: number[][];
  capacities: number[];
}

export interface P001Output {
  quantities: number[];
  totalProfit: number;
}

export function judge(
  input: P001Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return violation(
      JMSG[locale].m0
    );
  }

  const nProducts = input.margins.length;
  const nResources = input.capacities.length;
  const q = expectNumericArray(output.quantities, nProducts, { en: "quantities", ja: "quantities", zh: "quantities" }, locale);
  if (typeof q === "string") return violation(q);

  const profitCheck = expectFiniteNumber(output.totalProfit, { en: "totalProfit", ja: "totalProfit", zh: "totalProfit" }, locale);
  if (typeof profitCheck === "string") return violation(profitCheck);

  for (let j = 0; j < nProducts; j++) {
    if (q[j] < -1e-6) {
      return violation(
        formatTemplate(JMSG[locale].m1, { p0: j, p1: roundNice(q[j]) })
      );
    }
  }

  for (let k = 0; k < nResources; k++) {
    let used = 0;
    for (let j = 0; j < nProducts; j++) {
      used += input.usages[k][j] * q[j];
    }
    if (used > input.capacities[k] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: k, p1: roundNice(used), p2: input.capacities[k] })
      );
    }
  }

  let trueProfit = 0;
  for (let j = 0; j < nProducts; j++) {
    trueProfit += input.margins[j] * q[j];
  }

  if (!approxEqual(profitCheck, trueProfit, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m3, { p0: roundNice(profitCheck), p1: roundNice(trueProfit) })
    );
  }

  const preview = `quantities=[${q.map((v) => roundNice(v, 2)).join(", ")}]`;

  if (trueProfit < expectedOptimal - 1e-2) {
    return suboptimal(
      trueProfit,
      expectedOptimal,
      formatTemplate(JMSG[locale].m4, { p0: roundNice(trueProfit), p1: roundNice(expectedOptimal) }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m5, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
