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

export interface P002Input {
  minProtein: number;
  minFiber: number;
}

export interface P002Output {
  oats: number;
  beans: number;
  totalCost: number;
}

export function judge(
  input: P002Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const oatsCheck = expectFiniteNumber(
    output.oats,
    { en: "oats", ja: "oats", zh: "oats" },
    locale
  );
  if (typeof oatsCheck === "string") return runtimeError(oatsCheck);

  const beansCheck = expectFiniteNumber(
    output.beans,
    { en: "beans", ja: "beans", zh: "beans" },
    locale
  );
  if (typeof beansCheck === "string") return runtimeError(beansCheck);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  if (oatsCheck < -1e-6 || beansCheck < -1e-6) {
    return violation(
      formatTemplate(JMSG[locale].m1, { p0: roundNice(oatsCheck), p1: roundNice(beansCheck) })
    );
  }

  const protein = 2 * oatsCheck + 1 * beansCheck;
  if (protein + 1e-4 < input.minProtein) {
    return violation(
      formatTemplate(JMSG[locale].m2, { p0: roundNice(protein), p1: input.minProtein })
    );
  }

  const fiber = 1 * oatsCheck + 3 * beansCheck;
  if (fiber + 1e-4 < input.minFiber) {
    return violation(
      formatTemplate(JMSG[locale].m3, { p0: roundNice(fiber), p1: input.minFiber })
    );
  }

  const recomputed = 30 * oatsCheck + 50 * beansCheck;
  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m4, { p0: roundNice(costCheck), p1: roundNice(recomputed) })
    );
  }

  const preview = `oats=${roundNice(oatsCheck)}, beans=${roundNice(beansCheck)} | protein=${roundNice(protein)}/${input.minProtein}, fiber=${roundNice(fiber)}/${input.minFiber}`;

  if (recomputed > expectedOptimal + 1e-2) {
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
