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
  milkCap: number;
  sugarCap: number;
  vanillaProfit: number;
  chocoProfit: number;
  vanillaMilk: number;
  vanillaSugar: number;
  chocoMilk: number;
  chocoSugar: number;
}

export interface P002Output {
  vanilla: number;
  chocolate: number;
  totalProfit: number;
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

  const vCheck = expectFiniteNumber(
    output.vanilla,
    { en: "vanilla", ja: "vanilla", zh: "vanilla" },
    locale
  );
  if (typeof vCheck === "string") return runtimeError(vCheck);

  const cCheck = expectFiniteNumber(
    output.chocolate,
    { en: "chocolate", ja: "chocolate", zh: "chocolate" },
    locale
  );
  if (typeof cCheck === "string") return runtimeError(cCheck);

  const pCheck = expectFiniteNumber(
    output.totalProfit,
    { en: "totalProfit", ja: "totalProfit", zh: "totalProfit" },
    locale
  );
  if (typeof pCheck === "string") return runtimeError(pCheck);

  if (vCheck < -1e-6 || cCheck < -1e-6) {
    return violation(
      formatTemplate(JMSG[locale].m1, { p0: roundNice(vCheck), p1: roundNice(cCheck) })
    );
  }

  const milkUsed = input.vanillaMilk * vCheck + input.chocoMilk * cCheck;
  if (milkUsed > input.milkCap + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m2, { p0: roundNice(milkUsed), p1: input.milkCap })
    );
  }

  const sugarUsed = input.vanillaSugar * vCheck + input.chocoSugar * cCheck;
  if (sugarUsed > input.sugarCap + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m3, { p0: roundNice(sugarUsed), p1: input.sugarCap })
    );
  }

  const recomputed = input.vanillaProfit * vCheck + input.chocoProfit * cCheck;
  if (!approxEqual(pCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m4, { p0: roundNice(pCheck), p1: roundNice(recomputed) })
    );
  }

  const preview = `vanilla=${roundNice(vCheck)}, chocolate=${roundNice(cCheck)} | milk=${roundNice(milkUsed)}/${input.milkCap}, sugar=${roundNice(sugarUsed)}/${input.sugarCap}`;

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
