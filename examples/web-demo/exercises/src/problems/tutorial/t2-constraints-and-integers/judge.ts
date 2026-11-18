import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  formatTemplate,
  checkIntegrality,
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

export interface T2Input {
  maxWeight: number;
  weights: number[];
  values: number[];
  maxCounts: number[];
}

export interface T2Output {
  counts: number[];
  totalValue: number;
}

export function judge(
  input: T2Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return violation(
      JMSG[locale].m0
    );
  }

  const n = input.weights.length;
  const counts = expectNumericArray(output.counts, n, { en: "counts", ja: "counts", zh: "counts" }, locale);
  if (typeof counts === "string") return violation(counts);

  const valCheck = expectFiniteNumber(output.totalValue, { en: "totalValue", ja: "totalValue", zh: "totalValue" }, locale);
  if (typeof valCheck === "string") return violation(valCheck);

  let weightUsed = 0;
  let valueSum = 0;
  for (let i = 0; i < n; i++) {
    const q = counts[i];
    if (!checkIntegrality(q)) {
      return violation(
        formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(q) })
      );
    }
    const qInt = Math.round(q);
    if (qInt < 0 || qInt > input.maxCounts[i]) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: i, p1: qInt, p2: input.maxCounts[i] })
      );
    }
    weightUsed += input.weights[i] * qInt;
    valueSum += input.values[i] * qInt;
  }

  if (weightUsed > input.maxWeight + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m3, { p0: weightUsed, p1: input.maxWeight })
    );
  }

  const preview = `counts=[${counts.map((c) => Math.round(c)).join(", ")}] | weight=${weightUsed}/${input.maxWeight}`;

  if (Math.abs(valCheck - valueSum) > 1e-2) {
    return violation(
      formatTemplate(JMSG[locale].m4, { p0: roundNice(valCheck), p1: valueSum })
    );
  }

  if (valueSum < expectedOptimal - 1e-2) {
    return suboptimal(
      valueSum,
      expectedOptimal,
      formatTemplate(JMSG[locale].m5, { p0: valueSum, p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m6, { p0: expectedOptimal }),
    preview
  );
}
