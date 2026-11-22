import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
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

export interface P003Input {
  denominations: number[];
  maxCounts: number[];
  targetAmount: number;
}

export interface P003Output {
  counts: number[];
  totalCoins: number;
}

export function judge(
  input: P003Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.denominations.length;
  const counts = expectNumericArray(
    output.counts,
    n,
    { en: "counts", ja: "counts", zh: "counts" },
    locale
  );
  if (typeof counts === "string") return runtimeError(counts);

  const coinsCheck = expectFiniteNumber(
    output.totalCoins,
    { en: "totalCoins", ja: "totalCoins", zh: "totalCoins" },
    locale
  );
  if (typeof coinsCheck === "string") return runtimeError(coinsCheck);

  let amountSum = 0;
  let coinSum = 0;
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
    amountSum += input.denominations[i] * qInt;
    coinSum += qInt;
  }

  if (Math.abs(amountSum - input.targetAmount) > 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m3, { p0: amountSum, p1: input.targetAmount })
    );
  }

  const preview = `counts=[${counts.map((c) => Math.round(c)).join(", ")}] | amount=${amountSum}/${input.targetAmount}`;

  if (Math.abs(coinsCheck - coinSum) > 1e-2) {
    return violation(
      formatTemplate(JMSG[locale].m4, { p0: roundNice(coinsCheck), p1: coinSum })
    );
  }

  if (coinSum > expectedOptimal + 1e-2) {
    return suboptimal(
      coinSum,
      expectedOptimal,
      formatTemplate(JMSG[locale].m5, { p0: coinSum, p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m6, { p0: expectedOptimal }),
    preview
  );
}
