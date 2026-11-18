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

export interface P009Input {
  margins: number[];
  usages: number[][];
  capacities: number[];
}

export interface P009Output {
  quantities: number[];
  optimalProfit: number;
  shadowPrices: number[];
  slacks: number[];
  isBottleneck: boolean[];
}

export function judge(
  input: P009Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return violation(
      JMSG[locale].m0
    );
  }

  const n = input.margins.length;
  const m = input.capacities.length;

  const q = expectNumericArray(output.quantities, n, { en: "quantities", ja: "quantities", zh: "quantities" }, locale);
  if (typeof q === "string") return violation(q);

  const profitCheck = expectFiniteNumber(
    output.optimalProfit,
    { en: "optimalProfit", ja: "optimalProfit", zh: "optimalProfit" },
    locale
  );
  if (typeof profitCheck === "string") return violation(profitCheck);

  const shadowPrices = expectNumericArray(
    output.shadowPrices,
    m,
    { en: "shadowPrices", ja: "shadowPrices", zh: "shadowPrices" },
    locale
  );
  if (typeof shadowPrices === "string") return violation(shadowPrices);

  const slacks = expectNumericArray(output.slacks, m, { en: "slacks", ja: "slacks", zh: "slacks" }, locale);
  if (typeof slacks === "string") return violation(slacks);

  if (
    !Array.isArray(output.isBottleneck) ||
    output.isBottleneck.length !== m ||
    !output.isBottleneck.every((v) => typeof v === "boolean")
  ) {
    return violation(
      formatTemplate(JMSG[locale].m1, { p0: m })
    );
  }
  const isBottleneck = output.isBottleneck as boolean[];

  for (let j = 0; j < n; j++) {
    if (q[j] < -1e-6) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: j, p1: roundNice(q[j]) })
      );
    }
  }

  const trueSlacks: number[] = [];
  for (let k = 0; k < m; k++) {
    let used = 0;
    for (let j = 0; j < n; j++) {
      used += input.usages[k][j] * q[j];
    }
    const slack = input.capacities[k] - used;
    if (slack < -1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m3, { p0: k, p1: roundNice(used), p2: input.capacities[k] })
      );
    }
    if (!approxEqual(slacks[k], slack, 1e-3)) {
      return violation(
        formatTemplate(JMSG[locale].m4, { p0: k, p1: roundNice(slacks[k]), p2: roundNice(slack) })
      );
    }
    trueSlacks.push(slack);
  }

  let trueProfit = 0;
  for (let j = 0; j < n; j++) {
    trueProfit += input.margins[j] * q[j];
  }
  if (!approxEqual(profitCheck, trueProfit, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, { p0: roundNice(profitCheck), p1: roundNice(trueProfit) })
    );
  }

  const preview = `duals=[${shadowPrices.map((d) => roundNice(d, 2)).join(", ")}], slacks=[${slacks.map((s) => roundNice(s, 2)).join(", ")}]`;

  if (trueProfit < expectedOptimal - 1e-2) {
    return suboptimal(
      trueProfit,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, { p0: roundNice(trueProfit), p1: roundNice(expectedOptimal) }),
      preview
    );
  }

  // Verify LP Dual Feasibility, Strong Duality, and Complementary Slackness
  let dualObj = 0;
  for (let k = 0; k < m; k++) {
    if (shadowPrices[k] < -1e-5) {
      return violation(
        formatTemplate(JMSG[locale].m7, { p0: k, p1: roundNice(shadowPrices[k]) })
      );
    }
    if (trueSlacks[k] > 1e-3 && Math.abs(shadowPrices[k]) > 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m8, { p0: k, p1: roundNice(trueSlacks[k]), p2: roundNice(shadowPrices[k]) })
      );
    }
    dualObj += input.capacities[k] * shadowPrices[k];

    const expectedFlag = shadowPrices[k] > 1e-5 || trueSlacks[k] <= 1e-5;
    if (isBottleneck[k] !== expectedFlag) {
      return violation(
        formatTemplate(JMSG[locale].m9, { p0: k, p1: expectedFlag, p2: roundNice(shadowPrices[k]), p3: roundNice(trueSlacks[k]) })
      );
    }
  }

  for (let j = 0; j < n; j++) {
    let dualCol = 0;
    for (let k = 0; k < m; k++) {
      dualCol += input.usages[k][j] * shadowPrices[k];
    }
    if (dualCol < input.margins[j] - 1e-3) {
      return violation(
        formatTemplate(JMSG[locale].m10, { p0: j, p1: roundNice(dualCol), p2: input.margins[j] })
      );
    }
  }

  if (!approxEqual(dualObj, expectedOptimal, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m11, { p0: roundNice(dualObj), p1: roundNice(expectedOptimal) })
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m12, { p0: roundNice(expectedOptimal), p1: shadowPrices.map((d) => roundNice(d, 2)).join(", ") }),
    preview
  );
}
