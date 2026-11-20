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

export interface TableRule {
  vars: number[];
  tuples: number[][];
}

export interface P033Input {
  componentCosts: number[][];
  allowedRules: TableRule[];
  forbiddenRules: TableRule[];
}

export interface P033Output {
  choices: number[];
  totalCost: number;
}

export function judge(
  input: P033Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const k = input.componentCosts.length;
  const rawChoices = expectNumericArray(
    output.choices,
    k,
    { en: "choices", ja: "choices", zh: "choices" },
    locale
  );
  if (typeof rawChoices === "string") return runtimeError(rawChoices);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const clean: number[] = [];
  let costSum = 0;

  for (let c = 0; c < k; c++) {
    const raw = rawChoices[c];
    if (!checkIntegrality(raw)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: c, p1: roundNice(raw) }));
    }
    const opt = Math.round(raw);
    const maxOpt = input.componentCosts[c].length - 1;
    if (opt < 0 || opt > maxOpt) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: c, p1: opt, p2: maxOpt }));
    }
    clean.push(opt);
    costSum += input.componentCosts[c][opt];
  }

  for (let rIdx = 0; rIdx < input.allowedRules.length; rIdx++) {
    const rule = input.allowedRules[rIdx];
    const picked = rule.vars.map((c) => clean[c]);
    const matched = rule.tuples.some((t) => t.every((val, j) => val === picked[j]));
    if (!matched) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: rIdx,
          p1: `[${picked.join(", ")}]`,
        })
      );
    }
  }

  for (let rIdx = 0; rIdx < input.forbiddenRules.length; rIdx++) {
    const rule = input.forbiddenRules[rIdx];
    const picked = rule.vars.map((c) => clean[c]);
    const hit = rule.tuples.some((t) => t.every((val, j) => val === picked[j]));
    if (hit) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: rIdx,
          p1: `[${picked.join(", ")}]`,
        })
      );
    }
  }

  if (!approxEqual(costCheck, costSum, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, { p0: roundNice(costCheck), p1: costSum })
    );
  }

  const preview = `choices=[${clean.join(", ")}] | totalCost=${costSum}`;

  if (costSum > expectedOptimal + 1e-2) {
    return suboptimal(
      costSum,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, { p0: costSum, p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: expectedOptimal }),
    preview
  );
}
