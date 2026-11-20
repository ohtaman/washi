import type { JudgeResult, Locale } from "../../../types.js";
import { accepted, formatTemplate, isRecord, runtimeError, violation } from "../../judge-helpers.js";
import {
  evalSmtFormula,
  expectBoolAssignment,
  expectBooleanField,
  findAnySmtModel,
  type PropFormula,
} from "../smt-judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface P041Input {
  vars: string[];
  rules: PropFormula[];
}

export interface P041Output {
  satisfiable: boolean;
  assignment: Record<string, boolean> | null;
}

export function judge(
  input: P041Input,
  output: unknown,
  _expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const satCheck = expectBooleanField(output.satisfiable, "satisfiable", locale);
  if (typeof satCheck === "string") return runtimeError(satCheck);

  if (!satCheck) {
    if (output.assignment !== null) {
      return runtimeError(JMSG[locale].m1);
    }
    const model = findAnySmtModel(input.vars, [], input.rules);
    if (model !== null) {
      return violation(JMSG[locale].m2);
    }
    return accepted(0, JMSG[locale].m4, "satisfiable=false");
  }

  const assignCheck = expectBoolAssignment(output.assignment, input.vars, "assignment", locale);
  if (typeof assignCheck === "string") return runtimeError(assignCheck);

  for (let i = 0; i < input.rules.length; i++) {
    if (!evalSmtFormula(input.rules[i], assignCheck)) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: i }));
    }
  }

  const preview = input.vars.map((v) => `${v}=${assignCheck[v]}`).join(", ");
  return accepted(1, JMSG[locale].m5, preview);
}
