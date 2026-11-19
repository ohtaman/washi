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
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface P001Input {
  flourCap: number;
  butterCap: number;
}

export interface P001Output {
  croissants: number;
  loaves: number;
  totalProfit: number;
}

export function judge(
  input: P001Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const cCheck = expectFiniteNumber(
    output.croissants,
    { en: "croissants", ja: "croissants", zh: "croissants" },
    locale
  );
  if (typeof cCheck === "string") return runtimeError(cCheck);

  const lCheck = expectFiniteNumber(
    output.loaves,
    { en: "loaves", ja: "loaves", zh: "loaves" },
    locale
  );
  if (typeof lCheck === "string") return runtimeError(lCheck);

  const pCheck = expectFiniteNumber(
    output.totalProfit,
    { en: "totalProfit", ja: "totalProfit", zh: "totalProfit" },
    locale
  );
  if (typeof pCheck === "string") return runtimeError(pCheck);

  if (cCheck < -1e-6 || lCheck < -1e-6) {
    return violation(
      formatTemplate(JMSG[locale].m1, { p0: roundNice(cCheck), p1: roundNice(lCheck) })
    );
  }

  const flourUsed = 2 * cCheck + 3 * lCheck;
  if (flourUsed > input.flourCap + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m2, { p0: roundNice(flourUsed), p1: input.flourCap })
    );
  }

  const butterUsed = 1 * cCheck + 2 * lCheck;
  if (butterUsed > input.butterCap + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m3, { p0: roundNice(butterUsed), p1: input.butterCap })
    );
  }

  const recomputed = 40 * cCheck + 70 * lCheck;
  if (!approxEqual(pCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m4, { p0: roundNice(pCheck), p1: roundNice(recomputed) })
    );
  }

  const preview = `croissants=${roundNice(cCheck)}, loaves=${roundNice(lCheck)} | flour=${roundNice(flourUsed)}/${input.flourCap}, butter=${roundNice(butterUsed)}/${input.butterCap}`;

  if (recomputed < expectedOptimal - 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m5, { p0: roundNice(recomputed), p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m6, { p0: expectedOptimal }),
    preview
  );
}
