import enLocale from "../locales/en.json";
import jaLocale from "../locales/ja.json";
import zhLocale from "../locales/zh.json";
import type { JudgeResult, Locale, LocalizedString } from "../types.js";

const HELPER_MESSAGES: Record<Locale, typeof enLocale.judgeHelpers> = {
  en: enLocale.judgeHelpers,
  ja: jaLocale.judgeHelpers,
  zh: zhLocale.judgeHelpers,
};

export function formatTemplate(
  template: string,
  params: Record<string, string | number>
): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : `{${key}}`
  );
}

export function msg(locale: Locale, text: LocalizedString): string {
  return text[locale];
}

export function approxEqual(a: number, b: number, tol: number = 1e-4): boolean {
  return typeof a === "number" && Number.isFinite(a) && Math.abs(a - b) <= tol;
}

export function roundNice(n: number, digits: number = 4): number {
  const f = 10 ** digits;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

export function violation(message: string, preview?: string): JudgeResult {
  return {
    status: "VIOLATION",
    ok: false,
    message,
    ...(preview ? { preview } : {}),
  };
}

export function runtimeError(message: string): JudgeResult {
  return {
    status: "RUNTIME_ERROR",
    ok: false,
    message,
  };
}

export function infeasible(message: string): JudgeResult {
  return {
    status: "INFEASIBLE",
    ok: false,
    message,
  };
}

export interface SolverStatusMessages {
  infeasible: string;
  unbounded: string;
  notSolved: string;
  solverError: (status: string) => string;
}

export function applySolverStatusToVerdict(
  verdict: JudgeResult,
  solverStatus: string | null | undefined,
  messages: SolverStatusMessages
): JudgeResult {
  if (!solverStatus) return verdict;
  if (
    solverStatus === "Infeasible" ||
    solverStatus === "Unsat" ||
    solverStatus === "InfeasibleOrUnbounded"
  ) {
    return infeasible(messages.infeasible);
  }
  if (solverStatus === "Unbounded") {
    return runtimeError(messages.unbounded);
  }
  if (verdict.status === "RUNTIME_ERROR") {
    if (solverStatus === "NotSolved") {
      return runtimeError(messages.notSolved);
    }
    if (solverStatus !== "Optimal" && solverStatus !== "Feasible" && solverStatus !== "Sat") {
      return runtimeError(messages.solverError(solverStatus));
    }
  }
  return verdict;
}

export function suboptimal(
  yourObjective: number,
  optimalObjective: number,
  message: string,
  preview?: string
): JudgeResult {
  return {
    status: "SUBOPTIMAL",
    ok: false,
    message,
    yourObjective: roundNice(yourObjective),
    optimalObjective: roundNice(optimalObjective),
    ...(preview ? { preview } : {}),
  };
}

export function accepted(
  optimalObjective: number,
  message: string,
  preview?: string
): JudgeResult {
  return {
    status: "AC",
    ok: true,
    message,
    yourObjective: roundNice(optimalObjective),
    optimalObjective: roundNice(optimalObjective),
    ...(preview ? { preview } : {}),
  };
}

export function expectFiniteNumber(
  val: unknown,
  fieldLabel: LocalizedString,
  locale: Locale
): number | string {
  if (typeof val !== "number" || !Number.isFinite(val)) {
    return formatTemplate(HELPER_MESSAGES[locale].expectFiniteNumber, {
      field: fieldLabel[locale],
      actual: String(val),
    });
  }
  return val;
}

export function expectNumericArray(
  val: unknown,
  expectedLength: number,
  fieldLabel: LocalizedString,
  locale: Locale
): number[] | string {
  if (!Array.isArray(val) || val.length !== expectedLength) {
    return formatTemplate(HELPER_MESSAGES[locale].expectArrayLength, {
      field: fieldLabel[locale],
      length: expectedLength,
    });
  }
  for (let i = 0; i < val.length; i++) {
    if (typeof val[i] !== "number" || !Number.isFinite(val[i])) {
      return formatTemplate(HELPER_MESSAGES[locale].expectArrayElementFinite, {
        field: fieldLabel[locale],
        index: i,
        actual: String(val[i]),
      });
    }
  }
  return val as number[];
}

export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function checkIntegrality(val: number, tol: number = 1e-4): boolean {
  return Math.abs(val - Math.round(val)) <= tol;
}
