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

export interface P003Input {
  baseRevenue: number;
  baseCost: number;
  revenues: number[];
  costs: number[];
  capacities: number[];
  minTotal: number;
  maxTotal: number;
  greenIndex: number;
  minGreenShare: number;
}

export interface P003Output {
  quantities: number[];
  ratio: number;
}

export function judge(
  input: P003Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return violation(
      JMSG[locale].m0
    );
  }

  const n = input.revenues.length;
  const q = expectNumericArray(
    output.quantities,
    n,
    { en: "quantities", ja: "quantities", zh: "quantities" },
    locale
  );
  if (typeof q === "string") return violation(q);

  const ratioCheck = expectFiniteNumber(
    output.ratio,
    { en: "ratio", ja: "ratio", zh: "ratio" },
    locale
  );
  if (typeof ratioCheck === "string") return violation(ratioCheck);

  let totalQty = 0;
  let num = input.baseRevenue;
  let den = input.baseCost;

  for (let i = 0; i < n; i++) {
    if (q[i] < -1e-6) {
      return violation(
        formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(q[i]) })
      );
    }
    if (q[i] > input.capacities[i] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: i, p1: roundNice(q[i]), p2: input.capacities[i] })
      );
    }
    totalQty += q[i];
    num += input.revenues[i] * q[i];
    den += input.costs[i] * q[i];
  }

  if (totalQty < input.minTotal - 1e-4 || totalQty > input.maxTotal + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m3, { p0: roundNice(totalQty), p1: input.minTotal, p2: input.maxTotal })
    );
  }

  if (q[input.greenIndex] < input.minGreenShare * totalQty - 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m4, { p0: roundNice((q[input.greenIndex] / Math.max(1e-9, totalQty)) * 100, 2), p1: roundNice(input.minGreenShare * 100, 2) })
    );
  }

  if (den <= 1e-6) {
    return violation(
      formatTemplate(JMSG[locale].m5, { p0: roundNice(den) })
    );
  }

  const trueRatio = num / den;
  if (!approxEqual(ratioCheck, trueRatio, 1e-3)) {
    return violation(
      formatTemplate(JMSG[locale].m6, { p0: roundNice(ratioCheck, 5), p1: roundNice(trueRatio, 5) })
    );
  }

  const preview = `quantities=[${q.map((v) => roundNice(v, 2)).join(", ")}]`;

  if (trueRatio < expectedOptimal - 1e-4) {
    return suboptimal(
      trueRatio,
      expectedOptimal,
      formatTemplate(JMSG[locale].m7, { p0: roundNice(trueRatio, 5), p1: roundNice(expectedOptimal, 5) }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m8, { p0: roundNice(expectedOptimal, 5) }),
    preview
  );
}
