import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  approxEqual,
  expectFiniteNumber,
  formatTemplate,
  isRecord,
  roundNice,
  runtimeError,
  suboptimal,
  violation,
} from "../../judge-helpers.js";
import {
  evalSmtFormula,
  expectBooleanField,
  expectMixedAssignment,
  expectStringArray,
  findAnySmtModel,
  forEachSmtAssignment,
  hasDuplicates,
  sameStringSet,
  type IntVarSpec,
  type SmtFormula,
} from "../smt-judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface NamedHardRule {
  id: string;
  expr: SmtFormula;
}

export interface NamedSoftRule {
  id: string;
  weight: number;
  expr: SmtFormula;
}

export interface P050Input {
  boolVars: string[];
  intVars: IntVarSpec[];
  hardRules: NamedHardRule[];
  softRules: NamedSoftRule[];
}

export interface P050Output {
  consistent: boolean;
  minimalCore: string[];
  relaxedRules: string[];
  repairCost: number;
  repairedAssignment: Record<string, boolean | number>;
}

function findMinRepairCost(input: P050Input): number | null {
  let best: number | null = null;
  forEachSmtAssignment(input.boolVars, input.intVars, (env) => {
    for (const h of input.hardRules) {
      if (!evalSmtFormula(h.expr, env)) return;
    }
    let cost = 0;
    for (const s of input.softRules) {
      if (!evalSmtFormula(s.expr, env)) cost += s.weight;
    }
    if (best === null || cost < best) best = cost;
  });
  return best;
}

export function judge(
  input: P050Input,
  output: unknown,
  _expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const consCheck = expectBooleanField(output.consistent, "consistent", locale);
  if (typeof consCheck === "string") return runtimeError(consCheck);

  const coreCheck = expectStringArray(output.minimalCore, "minimalCore", locale);
  if (typeof coreCheck === "string") return runtimeError(coreCheck);

  const relCheck = expectStringArray(output.relaxedRules, "relaxedRules", locale);
  if (typeof relCheck === "string") return runtimeError(relCheck);

  const costCheck = expectFiniteNumber(
    output.repairCost,
    { en: "repairCost", ja: "repairCost", zh: "repairCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const parsedAssign = expectMixedAssignment(
    output.repairedAssignment,
    input.boolVars,
    input.intVars,
    "repairedAssignment",
    locale
  );
  if (!parsedAssign.ok) return parsedAssign.result;

  for (const h of input.hardRules) {
    if (!evalSmtFormula(h.expr, parsedAssign.env)) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: h.id }));
    }
  }

  const allRulesMap = new Map<string, SmtFormula>();
  for (const h of input.hardRules) allRulesMap.set(h.id, h.expr);
  for (const s of input.softRules) allRulesMap.set(s.id, s.expr);

  const softIds = new Set(input.softRules.map((s) => s.id));

  const dupCore = hasDuplicates(coreCheck);
  if (dupCore !== null) {
    return violation(formatTemplate(JMSG[locale].m4, { p0: dupCore, p1: "minimalCore" }));
  }
  const dupRel = hasDuplicates(relCheck);
  if (dupRel !== null) {
    return violation(formatTemplate(JMSG[locale].m4, { p0: dupRel, p1: "relaxedRules" }));
  }

  for (const id of coreCheck) {
    if (!allRulesMap.has(id)) {
      return violation(formatTemplate(JMSG[locale].m5, { p0: id, p1: "minimalCore" }));
    }
  }
  for (const id of relCheck) {
    if (!softIds.has(id)) {
      return violation(formatTemplate(JMSG[locale].m5, { p0: id, p1: "relaxedRules" }));
    }
  }

  const allExprs = [
    ...input.hardRules.map((h) => h.expr),
    ...input.softRules.map((s) => s.expr),
  ];
  const actuallyConsistent = findAnySmtModel(input.boolVars, input.intVars, allExprs) !== null;

  if (consCheck !== actuallyConsistent) {
    return violation(
      formatTemplate(JMSG[locale].m1, {
        p0: String(consCheck),
        p1: actuallyConsistent ? "consistent" : "inconsistent",
      })
    );
  }

  const actualViolated: string[] = [];
  let actualCost = 0;
  for (const s of input.softRules) {
    if (!evalSmtFormula(s.expr, parsedAssign.env)) {
      actualViolated.push(s.id);
      actualCost += s.weight;
    }
  }
  actualViolated.sort();

  if (actuallyConsistent) {
    if (coreCheck.length !== 0 || relCheck.length !== 0 || !approxEqual(costCheck, 0, 1e-4)) {
      return violation(JMSG[locale].m2);
    }
    if (actualViolated.length !== 0) {
      return violation(
        formatTemplate(JMSG[locale].m9, {
          p0: relCheck.join(", "),
          p1: actualViolated.join(", "),
        })
      );
    }
    return accepted(0, JMSG[locale].m12, "consistent=true, repairCost=0");
  }

  if (coreCheck.length === 0) {
    return violation(JMSG[locale].m6);
  }
  const coreExprs = coreCheck.map((id) => allRulesMap.get(id)!);
  if (findAnySmtModel(input.boolVars, input.intVars, coreExprs) !== null) {
    return violation(formatTemplate(JMSG[locale].m7, { p0: coreCheck.join(", ") }));
  }
  for (let i = 0; i < coreCheck.length; i++) {
    const withoutI = coreExprs.filter((_, idx) => idx !== i);
    if (findAnySmtModel(input.boolVars, input.intVars, withoutI) === null) {
      return violation(
        formatTemplate(JMSG[locale].m8, {
          p0: coreCheck.join(", "),
          p1: coreCheck[i],
        })
      );
    }
  }

  if (!sameStringSet(relCheck, actualViolated)) {
    return violation(
      formatTemplate(JMSG[locale].m9, {
        p0: relCheck.join(", "),
        p1: actualViolated.join(", "),
      })
    );
  }

  if (!approxEqual(costCheck, actualCost, 1e-4)) {
    return violation(
      formatTemplate(JMSG[locale].m10, {
        p0: roundNice(costCheck),
        p1: roundNice(actualCost),
      })
    );
  }

  const minCost = findMinRepairCost(input);
  const preview = `core=[${[...coreCheck].sort().join(", ")}] | relaxed=[${actualViolated.join(", ")}] | cost=${roundNice(actualCost)}`;
  if (minCost !== null && actualCost > minCost + 1e-4) {
    return suboptimal(
      actualCost,
      minCost,
      formatTemplate(JMSG[locale].m11, {
        p0: roundNice(actualCost),
        p1: roundNice(minCost),
      }),
      preview
    );
  }

  return accepted(actualCost, formatTemplate(JMSG[locale].m13, { p0: roundNice(actualCost) }), preview);
}
