import type { JudgeResult, Locale } from "../../../types.js";
import { accepted, formatTemplate, isRecord, runtimeError, violation } from "../../judge-helpers.js";
import {
  evalSmtFormula,
  expectBooleanField,
  expectStringArray,
  hasDuplicates,
  sameStringSet,
  type IntVarSpec,
  type SmtFormula,
} from "../smt-judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface AuditRule {
  id: string;
  expr: SmtFormula;
}

export interface P048Input {
  boolVars: string[];
  intVars: IntVarSpec[];
  rules: AuditRule[];
  candidateValues: Record<string, boolean | number>;
}

export interface P048Output {
  valid: boolean;
  violatedRules: string[];
}

function isSorted(arr: ReadonlyArray<string>): boolean {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i - 1] > arr[i]) return false;
  }
  return true;
}

export function judge(
  input: P048Input,
  output: unknown,
  _expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const validCheck = expectBooleanField(output.valid, "valid", locale);
  if (typeof validCheck === "string") return runtimeError(validCheck);

  const violCheck = expectStringArray(output.violatedRules, "violatedRules", locale);
  if (typeof violCheck === "string") return runtimeError(violCheck);

  const dup = hasDuplicates(violCheck);
  if (dup !== null) {
    return violation(formatTemplate(JMSG[locale].m1, { p0: dup }));
  }

  const validIds = new Set(input.rules.map((r) => r.id));
  for (const id of violCheck) {
    if (!validIds.has(id)) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: id }));
    }
  }

  const expectedViolated = input.rules
    .filter((r) => !evalSmtFormula(r.expr, input.candidateValues))
    .map((r) => r.id)
    .sort();
  const expectedValid = expectedViolated.length === 0;

  if (validCheck !== expectedValid) {
    return violation(
      formatTemplate(JMSG[locale].m3, {
        p0: String(validCheck),
        p1: String(expectedValid),
      })
    );
  }

  if (!sameStringSet(violCheck, expectedViolated)) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: expectedViolated.join(", "),
        p1: violCheck.join(", "),
      })
    );
  }

  if (!isSorted(violCheck)) {
    return violation(JMSG[locale].m5);
  }

  const preview = expectedValid ? "valid=true" : `violated=[${expectedViolated.join(", ")}]`;
  return accepted(
    expectedViolated.length,
    expectedValid
      ? JMSG[locale].m6
      : formatTemplate(JMSG[locale].m7, { p0: expectedViolated.length }),
    preview
  );
}
