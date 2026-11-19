import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  approxEqual,
  expectFiniteNumber,
  formatTemplate,
  isRecord,
  roundNice,
  runtimeError,
  violation,
} from "../../judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface P000Input {
  a: number;
  b: number;
}

export interface P000Output {
  sum: number;
}

export function judge(
  input: P000Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const sumCheck = expectFiniteNumber(
    output.sum,
    { en: "sum", ja: "sum", zh: "sum" },
    locale
  );
  if (typeof sumCheck === "string") return runtimeError(sumCheck);

  const preview = `sum=${roundNice(sumCheck)}`;
  const target = input.a + input.b;
  if (!approxEqual(sumCheck, target, 1e-6)) {
    return violation(
      formatTemplate(JMSG[locale].m1, { p0: roundNice(sumCheck), p1: target }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m2, { p0: expectedOptimal }),
    preview
  );
}
