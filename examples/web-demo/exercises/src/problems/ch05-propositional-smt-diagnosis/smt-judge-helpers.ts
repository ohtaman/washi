import type { JudgeResult, Locale } from "../../types.js";
import {
  checkIntegrality,
  formatTemplate,
  isRecord,
  roundNice,
  runtimeError,
  violation,
} from "../judge-helpers.js";
import enLoc from "../../locales/en.json";
import jaLoc from "../../locales/ja.json";
import zhLoc from "../../locales/zh.json";

const C5_MSG = {
  en: enLoc.judgeHelpers,
  ja: jaLoc.judgeHelpers,
  zh: zhLoc.judgeHelpers,
};

export type PropFormula =
  | string
  | { not: PropFormula }
  | { and: PropFormula[] }
  | { or: PropFormula[] }
  | { implies: [PropFormula, PropFormula] }
  | { xor: PropFormula[] };

export interface IntVarSpec {
  name: string;
  lb: number;
  ub: number;
}

export interface SmtCmp {
  terms: Record<string, number>;
  sense: "<=" | ">=" | "==" | "!=";
  rhs: number;
}

export type SmtFormula =
  | string
  | { not: SmtFormula }
  | { and: SmtFormula[] }
  | { or: SmtFormula[] }
  | { implies: [SmtFormula, SmtFormula] }
  | { xor: SmtFormula[] }
  | SmtCmp;

/** Evaluates a propositional or linear-integer SMT formula under a concrete assignment. */
export function evalSmtFormula(
  formula: SmtFormula,
  env: Record<string, boolean | number>
): boolean {
  if (typeof formula === "string") {
    return env[formula] === true;
  }
  if ("not" in formula) {
    return !evalSmtFormula(formula.not, env);
  }
  if ("and" in formula) {
    return formula.and.every((sub) => evalSmtFormula(sub, env));
  }
  if ("or" in formula) {
    return formula.or.some((sub) => evalSmtFormula(sub, env));
  }
  if ("implies" in formula) {
    return !evalSmtFormula(formula.implies[0], env) || evalSmtFormula(formula.implies[1], env);
  }
  if ("xor" in formula) {
    let parity = false;
    for (const sub of formula.xor) {
      if (evalSmtFormula(sub, env)) parity = !parity;
    }
    return parity;
  }
  let lhs = 0;
  for (const [varName, coeff] of Object.entries(formula.terms)) {
    const val = env[varName];
    if (typeof val !== "number") {
      throw new Error(`Missing numeric value for variable "${varName}"`);
    }
    lhs += coeff * val;
  }
  switch (formula.sense) {
    case "<=":
      return lhs <= formula.rhs + 1e-9;
    case ">=":
      return lhs >= formula.rhs - 1e-9;
    case "==":
      return Math.abs(lhs - formula.rhs) <= 1e-9;
    case "!=":
      return Math.abs(lhs - formula.rhs) > 1e-9;
  }
}

/** Iterates over all finite combinations of boolVars and bounded intVars until callback returns true. */
export function forEachSmtAssignment(
  boolVars: ReadonlyArray<string>,
  intVars: ReadonlyArray<IntVarSpec>,
  onAssignment: (env: Record<string, boolean | number>) => boolean | void
): void {
  const env: Record<string, boolean | number> = {};
  const nb = boolVars.length;
  const ni = intVars.length;

  const visitInts = (idx: number): boolean => {
    if (idx === ni) {
      return onAssignment(env) === true;
    }
    const spec = intVars[idx];
    for (let v = spec.lb; v <= spec.ub; v++) {
      env[spec.name] = v;
      if (visitInts(idx + 1)) return true;
    }
    return false;
  };

  const visitBools = (idx: number): boolean => {
    if (idx === nb) {
      return visitInts(0);
    }
    const name = boolVars[idx];
    env[name] = false;
    if (visitBools(idx + 1)) return true;
    env[name] = true;
    if (visitBools(idx + 1)) return true;
    return false;
  };

  visitBools(0);
}

/** Finds a satisfying assignment for the given rules, or returns null if unsatisfiable. */
export function findAnySmtModel(
  boolVars: ReadonlyArray<string>,
  intVars: ReadonlyArray<IntVarSpec>,
  rules: ReadonlyArray<SmtFormula>
): Record<string, boolean | number> | null {
  let found: Record<string, boolean | number> | null = null;
  forEachSmtAssignment(boolVars, intVars, (env) => {
    for (const r of rules) {
      if (!evalSmtFormula(r, env)) return false;
    }
    found = { ...env };
    return true;
  });
  return found;
}

/** Counts satisfying boolean assignments up to a given cap (default Infinity). */
export function countBoolModels(
  vars: ReadonlyArray<string>,
  rules: ReadonlyArray<PropFormula>,
  cap: number = Infinity
): number {
  let count = 0;
  forEachSmtAssignment(vars, [], (env) => {
    for (const r of rules) {
      if (!evalSmtFormula(r, env)) return false;
    }
    count++;
    return count >= cap;
  });
  return count;
}

/** Validates a boolean scalar field, returning an error string for runtimeError on mismatch. */
export function expectBooleanField(
  val: unknown,
  field: string,
  locale: Locale
): boolean | string {
  if (typeof val !== "boolean") {
    return formatTemplate(C5_MSG[locale].expectBoolean, {
      field,
      actual: String(val),
    });
  }
  return val;
}

/** Validates a Record<string, boolean> map against expected variable names. */
export function expectBoolAssignment(
  val: unknown,
  varNames: ReadonlyArray<string>,
  field: string,
  locale: Locale
): Record<string, boolean> | string {
  if (!isRecord(val)) {
    return formatTemplate(C5_MSG[locale].expectRecord, { field });
  }
  const out: Record<string, boolean> = {};
  for (const name of varNames) {
    const raw = Object.prototype.hasOwnProperty.call(val, name) ? val[name] : undefined;
    if (typeof raw !== "boolean") {
      return formatTemplate(C5_MSG[locale].expectBooleanEntry, {
        field,
        key: name,
        actual: String(raw),
      });
    }
    out[name] = raw;
  }
  return out;
}

/** Validates a Record<string, boolean | number> map, distinguishing shape errors from bound/integrality violations. */
export function expectMixedAssignment(
  val: unknown,
  boolVars: ReadonlyArray<string>,
  intVars: ReadonlyArray<IntVarSpec>,
  field: string,
  locale: Locale
): { ok: true; env: Record<string, boolean | number> } | { ok: false; result: JudgeResult } {
  if (!isRecord(val)) {
    return { ok: false, result: runtimeError(formatTemplate(C5_MSG[locale].expectRecord, { field })) };
  }
  const env: Record<string, boolean | number> = {};
  for (const name of boolVars) {
    const raw = Object.prototype.hasOwnProperty.call(val, name) ? val[name] : undefined;
    if (typeof raw !== "boolean") {
      return {
        ok: false,
        result: runtimeError(
          formatTemplate(C5_MSG[locale].expectBooleanEntry, {
            field,
            key: name,
            actual: String(raw),
          })
        ),
      };
    }
    env[name] = raw;
  }
  const intRawValues = new Map<string, number>();
  for (const spec of intVars) {
    const raw = Object.prototype.hasOwnProperty.call(val, spec.name) ? val[spec.name] : undefined;
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      return {
        ok: false,
        result: runtimeError(
          formatTemplate(C5_MSG[locale].expectNumberEntry, {
            field,
            key: spec.name,
            actual: String(raw),
          })
        ),
      };
    }
    intRawValues.set(spec.name, raw);
  }
  for (const spec of intVars) {
    const raw = intRawValues.get(spec.name)!;
    if (!checkIntegrality(raw)) {
      return {
        ok: false,
        result: violation(
          formatTemplate(C5_MSG[locale].intIntegrality, {
            field,
            key: spec.name,
            actual: roundNice(raw),
          })
        ),
      };
    }
    const intVal = Math.round(raw) || 0;
    if (intVal < spec.lb || intVal > spec.ub) {
      return {
        ok: false,
        result: violation(
          formatTemplate(C5_MSG[locale].intBounds, {
            field,
            key: spec.name,
            actual: intVal,
            lb: spec.lb,
            ub: spec.ub,
          })
        ),
      };
    }
    env[spec.name] = intVal;
  }
  return { ok: true, env };
}

/** Validates an array of strings, returning an error string for runtimeError on mismatch. */
export function expectStringArray(
  val: unknown,
  field: string,
  locale: Locale
): string[] | string {
  if (!Array.isArray(val)) {
    return formatTemplate(C5_MSG[locale].expectStringArray, { field });
  }
  const out: string[] = [];
  for (let i = 0; i < val.length; i++) {
    if (typeof val[i] !== "string") {
      return formatTemplate(C5_MSG[locale].expectStringElement, {
        field,
        index: i,
        actual: String(val[i]),
      });
    }
    out.push(val[i]);
  }
  return out;
}

/** Checks whether two sorted string lists have identical sets (also rejects duplicates). */
export function hasDuplicates(items: ReadonlyArray<string>): string | null {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item)) return item;
    seen.add(item);
  }
  return null;
}

export function sameStringSet(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  if (setA.size !== b.length) return false;
  return b.every((item) => setA.has(item));
}
