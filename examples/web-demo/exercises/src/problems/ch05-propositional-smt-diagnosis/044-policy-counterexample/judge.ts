import type { JudgeResult, Locale } from "../../../types.js";
import { accepted, formatTemplate, isRecord, runtimeError, violation } from "../../judge-helpers.js";
import {
  evalSmtFormula,
  expectBooleanField,
  expectMixedAssignment,
  findAnySmtModel,
  type IntVarSpec,
  type SmtFormula,
} from "../smt-judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface P044Input {
  boolVars: string[];
  intVars: IntVarSpec[];
  rules: SmtFormula[];
  safeInvariant: SmtFormula;
}

export interface P044Output {
  hasViolation: boolean;
  counterexample: Record<string, boolean | number> | null;
}

export function judge(
  input: P044Input,
  output: unknown,
  _expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const hasViolCheck = expectBooleanField(output.hasViolation, "hasViolation", locale);
  if (typeof hasViolCheck === "string") return runtimeError(hasViolCheck);

  if (!hasViolCheck) {
    if (output.counterexample !== null) {
      return runtimeError(JMSG[locale].m1);
    }
    const ce = findAnySmtModel(input.boolVars, input.intVars, [
      ...input.rules,
      { not: input.safeInvariant },
    ]);
    if (ce !== null) {
      return violation(JMSG[locale].m2);
    }
    return accepted(0, JMSG[locale].m5, "hasViolation=false (Unsat)");
  }

  const parsed = expectMixedAssignment(
    output.counterexample,
    input.boolVars,
    input.intVars,
    "counterexample",
    locale
  );
  if (!parsed.ok) return parsed.result;

  for (let i = 0; i < input.rules.length; i++) {
    if (!evalSmtFormula(input.rules[i], parsed.env)) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: i }));
    }
  }
  if (evalSmtFormula(input.safeInvariant, parsed.env)) {
    return violation(JMSG[locale].m4);
  }

  const preview = Object.entries(parsed.env)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  return accepted(1, JMSG[locale].m6, preview);
}
