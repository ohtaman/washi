import type { JudgeResult, Locale } from "../../../types.js";
import { accepted, formatTemplate, isRecord, runtimeError, violation } from "../../judge-helpers.js";
import {
  countBoolModels,
  evalSmtFormula,
  expectBoolAssignment,
  expectBooleanField,
  type PropFormula,
} from "../smt-judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface P042Input {
  vars: string[];
  rules: PropFormula[];
}

export interface P042Output {
  satisfiable: boolean;
  assignment: Record<string, boolean> | null;
  unique: boolean;
}

export function judge(
  input: P042Input,
  output: unknown,
  _expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const satCheck = expectBooleanField(output.satisfiable, "satisfiable", locale);
  if (typeof satCheck === "string") return runtimeError(satCheck);

  const uniqueCheck = expectBooleanField(output.unique, "unique", locale);
  if (typeof uniqueCheck === "string") return runtimeError(uniqueCheck);

  if (!satCheck) {
    if (output.assignment !== null) {
      return runtimeError(JMSG[locale].m1);
    }
    if (uniqueCheck) {
      return violation(JMSG[locale].m2);
    }
    const satCount = countBoolModels(input.vars, input.rules, 1);
    if (satCount > 0) {
      return violation(JMSG[locale].m3);
    }
    return accepted(0, JMSG[locale].m7, "satisfiable=false, unique=false");
  }

  const assignCheck = expectBoolAssignment(output.assignment, input.vars, "assignment", locale);
  if (typeof assignCheck === "string") return runtimeError(assignCheck);

  for (let i = 0; i < input.rules.length; i++) {
    if (!evalSmtFormula(input.rules[i], assignCheck)) {
      return violation(formatTemplate(JMSG[locale].m4, { p0: i }));
    }
  }

  const satCount = countBoolModels(input.vars, input.rules, 2);
  const actuallyUnique = satCount === 1;
  if (uniqueCheck !== actuallyUnique) {
    return violation(uniqueCheck ? JMSG[locale].m5 : JMSG[locale].m6);
  }

  const preview = `unique=${actuallyUnique} | ${input.vars.map((v) => `${v}=${assignCheck[v]}`).join(", ")}`;
  return accepted(actuallyUnique ? 1 : 2, actuallyUnique ? JMSG[locale].m8 : JMSG[locale].m9, preview);
}
