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

export interface P002Input {
  targetBatch: number;
  costs: number[];
  availabilities: number[];
  compositions: number[][];
  minRatios: number[];
  maxRatios: number[];
}

export interface P002Output {
  amounts: number[];
  totalCost: number;
}

export function judge(
  input: P002Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return violation(
      JMSG[locale].m0
    );
  }

  const nRaw = input.costs.length;
  const nElem = input.minRatios.length;
  const amounts = expectNumericArray(
    output.amounts,
    nRaw,
    { en: "amounts", ja: "amounts", zh: "amounts" },
    locale
  );
  if (typeof amounts === "string") return violation(amounts);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return violation(costCheck);

  let totalWeight = 0;
  let trueCost = 0;
  for (let i = 0; i < nRaw; i++) {
    if (amounts[i] < -1e-6) {
      return violation(
        formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(amounts[i]) })
      );
    }
    if (amounts[i] > input.availabilities[i] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: i, p1: roundNice(amounts[i]), p2: input.availabilities[i] })
      );
    }
    totalWeight += amounts[i];
    trueCost += input.costs[i] * amounts[i];
  }

  if (!approxEqual(totalWeight, input.targetBatch, 1e-3)) {
    return violation(
      formatTemplate(JMSG[locale].m3, { p0: roundNice(totalWeight), p1: input.targetBatch })
    );
  }

  for (let k = 0; k < nElem; k++) {
    let elemWeight = 0;
    for (let i = 0; i < nRaw; i++) {
      elemWeight += input.compositions[i][k] * amounts[i];
    }
    const ratio = elemWeight / input.targetBatch;
    if (ratio < input.minRatios[k] - 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m4, { p0: k, p1: roundNice(ratio * 100, 2), p2: roundNice(input.minRatios[k] * 100, 2) })
      );
    }
    if (ratio > input.maxRatios[k] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m5, { p0: k, p1: roundNice(ratio * 100, 2), p2: roundNice(input.maxRatios[k] * 100, 2) })
      );
    }
  }

  if (!approxEqual(costCheck, trueCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m6, { p0: roundNice(costCheck), p1: roundNice(trueCost) })
    );
  }

  const preview = `amounts=[${amounts.map((v) => roundNice(v, 2)).join(", ")}]`;

  if (trueCost > expectedOptimal + 1e-2) {
    return suboptimal(
      trueCost,
      expectedOptimal,
      formatTemplate(JMSG[locale].m7, { p0: roundNice(trueCost), p1: roundNice(expectedOptimal) }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m8, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
