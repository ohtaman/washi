import type { JudgeResult, Locale } from "../../../types.js";
import { accepted, formatTemplate, isRecord, runtimeError, violation } from "../../judge-helpers.js";
import {
  expectStringArray,
  findAnySmtModel,
  hasDuplicates,
  type IntVarSpec,
  type SmtFormula,
} from "../smt-judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface NamedSmtRule {
  id: string;
  expr: SmtFormula;
}

export interface P046Input {
  boolVars: string[];
  intVars: IntVarSpec[];
  rules: NamedSmtRule[];
}

export interface P046Output {
  coreRules: string[];
}

export function judge(
  input: P046Input,
  output: unknown,
  _expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const coreCheck = expectStringArray(output.coreRules, "coreRules", locale);
  if (typeof coreCheck === "string") return runtimeError(coreCheck);

  const dup = hasDuplicates(coreCheck);
  if (dup !== null) {
    return violation(formatTemplate(JMSG[locale].m1, { p0: dup }));
  }

  const ruleMap = new Map(input.rules.map((r) => [r.id, r.expr]));
  for (const id of coreCheck) {
    if (!ruleMap.has(id)) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: id }));
    }
  }

  if (coreCheck.length === 0) {
    return violation(JMSG[locale].m3);
  }

  const coreExprs = coreCheck.map((id) => ruleMap.get(id)!);
  const fullWitness = findAnySmtModel(input.boolVars, input.intVars, coreExprs);
  if (fullWitness !== null) {
    return violation(formatTemplate(JMSG[locale].m4, { p0: coreCheck.join(", ") }));
  }

  for (let i = 0; i < coreCheck.length; i++) {
    const withoutI = coreExprs.filter((_, idx) => idx !== i);
    const subWitness = findAnySmtModel(input.boolVars, input.intVars, withoutI);
    if (subWitness === null) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: coreCheck.join(", "),
          p1: coreCheck[i],
        })
      );
    }
  }

  const sorted = [...coreCheck].sort();
  return accepted(
    sorted.length,
    formatTemplate(JMSG[locale].m6, { p0: sorted.length }),
    `core=[${sorted.join(", ")}]`
  );
}
