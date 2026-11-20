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

export interface P089Input {
  profits: number[];
  nominalUsages: number[];
  deviations: number[];
  maxUnits: number[];
  capacityCap: number;
  gamma: number;
}

export interface P089Output {
  quantities: number[];
  totalProfit: number;
}

function worstCaseDeviation(deviations: number[], x: number[], gamma: number): number {
  const impacts = x.map((val, j) => deviations[j] * val).sort((a, b) => b - a);
  const full = Math.floor(gamma);
  const frac = gamma - full;
  let penalty = 0;
  for (let k = 0; k < Math.min(full, impacts.length); k++) {
    penalty += impacts[k];
  }
  if (frac > 1e-12 && full < impacts.length) {
    penalty += frac * impacts[full];
  }
  return penalty;
}

export function judge(
  input: P089Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.profits.length;
  const quantities = expectNumericArray(
    output.quantities,
    n,
    { en: "quantities", ja: "quantities", zh: "quantities" },
    locale
  );
  if (typeof quantities === "string") return runtimeError(quantities);

  const profitCheck = expectFiniteNumber(
    output.totalProfit,
    { en: "totalProfit", ja: "totalProfit", zh: "totalProfit" },
    locale
  );
  if (typeof profitCheck === "string") return runtimeError(profitCheck);

  let nominalUsed = 0;
  let recomputedProfit = 0;
  for (let j = 0; j < n; j++) {
    const q = quantities[j];
    if (q < -1e-6 || q > input.maxUnits[j] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m1, {
          p0: j,
          p1: roundNice(q),
          p2: input.maxUnits[j],
        })
      );
    }
    nominalUsed += input.nominalUsages[j] * q;
    recomputedProfit += input.profits[j] * q;
  }

  const protection = worstCaseDeviation(input.deviations, quantities, input.gamma);
  const worstUsed = nominalUsed + protection;

  if (worstUsed > input.capacityCap + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m2, {
        p0: roundNice(worstUsed),
        p1: input.capacityCap,
        p2: input.gamma,
      })
    );
  }

  if (!approxEqual(profitCheck, recomputedProfit, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m3, {
        p0: roundNice(profitCheck),
        p1: roundNice(recomputedProfit),
      })
    );
  }

  const preview = `q=[${quantities.map((v) => roundNice(v)).join(", ")}] | worstCap=${roundNice(worstUsed)}/${input.capacityCap} | profit=${roundNice(recomputedProfit)}`;

  if (recomputedProfit < expectedOptimal - 1e-2) {
    return suboptimal(
      recomputedProfit,
      expectedOptimal,
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(recomputedProfit),
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
