import type { JudgeResult, Locale } from "../../../types.js";
import { accepted, formatTemplate, isRecord, runtimeError, violation } from "../../judge-helpers.js";
import {
  expectStringArray,
  findAnySmtModel,
  hasDuplicates,
  sameStringSet,
  type PropFormula,
} from "../smt-judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface TriggerRule {
  id: string;
  condition: PropFormula;
  effect: PropFormula;
}

export interface P045Input {
  vars: string[];
  baseRules: PropFormula[];
  rules: TriggerRule[];
}

export interface P045Output {
  deadRules: string[];
  redundantRules: string[];
}

function isSorted(arr: ReadonlyArray<string>): boolean {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i - 1] > arr[i]) return false;
  }
  return true;
}

export function judge(
  input: P045Input,
  output: unknown,
  _expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const deadCheck = expectStringArray(output.deadRules, "deadRules", locale);
  if (typeof deadCheck === "string") return runtimeError(deadCheck);

  const redCheck = expectStringArray(output.redundantRules, "redundantRules", locale);
  if (typeof redCheck === "string") return runtimeError(redCheck);

  const dupDead = hasDuplicates(deadCheck);
  if (dupDead !== null) {
    return violation(formatTemplate(JMSG[locale].m1, { p0: dupDead, p1: "deadRules" }));
  }
  const dupRed = hasDuplicates(redCheck);
  if (dupRed !== null) {
    return violation(formatTemplate(JMSG[locale].m1, { p0: dupRed, p1: "redundantRules" }));
  }

  const validIds = new Set(input.rules.map((r) => r.id));
  for (const id of deadCheck) {
    if (!validIds.has(id)) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: id, p1: "deadRules" }));
    }
  }
  for (const id of redCheck) {
    if (!validIds.has(id)) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: id, p1: "redundantRules" }));
    }
  }

  const expectedDead: string[] = [];
  const expectedRedundant: string[] = [];
  const prior: PropFormula[] = [...input.baseRules];

  for (const r of input.rules) {
    const canFire = findAnySmtModel(input.vars, [], [...prior, r.condition]);
    if (canFire === null) {
      expectedDead.push(r.id);
    } else {
      const counterexample = findAnySmtModel(input.vars, [], [
        ...prior,
        r.condition,
        { not: r.effect },
      ]);
      if (counterexample === null) {
        expectedRedundant.push(r.id);
      }
    }
    prior.push({ implies: [r.condition, r.effect] });
  }

  expectedDead.sort();
  expectedRedundant.sort();

  if (!sameStringSet(deadCheck, expectedDead)) {
    return violation(
      formatTemplate(JMSG[locale].m3, {
        p0: expectedDead.join(", "),
        p1: deadCheck.join(", "),
      })
    );
  }
  if (!sameStringSet(redCheck, expectedRedundant)) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: expectedRedundant.join(", "),
        p1: redCheck.join(", "),
      })
    );
  }
  if (!isSorted(deadCheck) || !isSorted(redCheck)) {
    return violation(JMSG[locale].m5);
  }

  const total = expectedDead.length + expectedRedundant.length;
  const preview = `dead=[${expectedDead.join(", ")}] | redundant=[${expectedRedundant.join(", ")}]`;
  return accepted(total, formatTemplate(JMSG[locale].m6, { p0: total }), preview);
}
