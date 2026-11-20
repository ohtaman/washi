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
  expectBoolAssignment,
  expectStringArray,
  forEachSmtAssignment,
  hasDuplicates,
  sameStringSet,
  type PropFormula,
} from "../smt-judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface SoftRule {
  id: string;
  weight: number;
  expr: PropFormula;
}

export interface P047Input {
  vars: string[];
  hardRules: PropFormula[];
  softRules: SoftRule[];
}

export interface P047Output {
  assignment: Record<string, boolean>;
  violatedRules: string[];
  totalPenalty: number;
}

function findMinPenalty(input: P047Input): number | null {
  let best: number | null = null;
  forEachSmtAssignment(input.vars, [], (env) => {
    for (const h of input.hardRules) {
      if (!evalSmtFormula(h, env)) return;
    }
    let pen = 0;
    for (const s of input.softRules) {
      if (!evalSmtFormula(s.expr, env)) pen += s.weight;
    }
    if (best === null || pen < best) best = pen;
  });
  return best;
}

export function judge(
  input: P047Input,
  output: unknown,
  _expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const assignCheck = expectBoolAssignment(output.assignment, input.vars, "assignment", locale);
  if (typeof assignCheck === "string") return runtimeError(assignCheck);

  const violCheck = expectStringArray(output.violatedRules, "violatedRules", locale);
  if (typeof violCheck === "string") return runtimeError(violCheck);

  const penCheck = expectFiniteNumber(
    output.totalPenalty,
    { en: "totalPenalty", ja: "totalPenalty", zh: "totalPenalty" },
    locale
  );
  if (typeof penCheck === "string") return runtimeError(penCheck);

  for (let i = 0; i < input.hardRules.length; i++) {
    if (!evalSmtFormula(input.hardRules[i], assignCheck)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i }));
    }
  }

  const dup = hasDuplicates(violCheck);
  if (dup !== null) {
    return violation(formatTemplate(JMSG[locale].m2, { p0: dup }));
  }
  const softIds = new Set(input.softRules.map((s) => s.id));
  for (const id of violCheck) {
    if (!softIds.has(id)) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: id }));
    }
  }

  const actualViolated: string[] = [];
  let actualPenalty = 0;
  for (const s of input.softRules) {
    if (!evalSmtFormula(s.expr, assignCheck)) {
      actualViolated.push(s.id);
      actualPenalty += s.weight;
    }
  }
  actualViolated.sort();

  if (!sameStringSet(violCheck, actualViolated)) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: violCheck.join(", "),
        p1: actualViolated.join(", "),
      })
    );
  }

  if (!approxEqual(penCheck, actualPenalty, 1e-4)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(penCheck),
        p1: roundNice(actualPenalty),
      })
    );
  }

  const minPen = findMinPenalty(input);
  const preview = `violated=[${actualViolated.join(", ")}] | penalty=${roundNice(actualPenalty)}`;
  if (minPen !== null && actualPenalty > minPen + 1e-4) {
    return suboptimal(
      actualPenalty,
      minPen,
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(actualPenalty),
        p1: roundNice(minPen),
      }),
      preview
    );
  }

  return accepted(actualPenalty, formatTemplate(JMSG[locale].m7, { p0: roundNice(actualPenalty) }), preview);
}
