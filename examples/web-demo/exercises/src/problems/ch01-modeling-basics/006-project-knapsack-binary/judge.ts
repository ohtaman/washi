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

export interface P006Input {
  budget: number;
  costs: number[];
  values: number[];
}

export interface P006Output {
  selected: number[];
  totalValue: number;
}

export function judge(
  input: P006Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.costs.length;
  const selected = expectNumericArray(
    output.selected,
    n,
    { en: "selected", ja: "selected", zh: "selected" },
    locale
  );
  if (typeof selected === "string") return runtimeError(selected);

  const valCheck = expectFiniteNumber(
    output.totalValue,
    { en: "totalValue", ja: "totalValue", zh: "totalValue" },
    locale
  );
  if (typeof valCheck === "string") return runtimeError(valCheck);

  let spent = 0;
  let valueSum = 0;
  const rounded: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = selected[i];
    if (!checkIntegrality(s)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(s) }));
    }
    const sInt = Math.round(s);
    if (sInt !== 0 && sInt !== 1) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: sInt }));
    }
    rounded.push(sInt);
    spent += input.costs[i] * sInt;
    valueSum += input.values[i] * sInt;
  }

  if (spent > input.budget + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m2, { p0: roundNice(spent), p1: input.budget })
    );
  }

  if (!approxEqual(valCheck, valueSum, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m3, { p0: roundNice(valCheck), p1: valueSum })
    );
  }

  const preview = `selected=[${rounded.join(", ")}] | budget=${spent}/${input.budget}`;

  if (valueSum < expectedOptimal - 1e-2) {
    return suboptimal(
      valueSum,
      expectedOptimal,
      formatTemplate(JMSG[locale].m4, { p0: valueSum, p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m5, { p0: expectedOptimal }),
    preview
  );
}
