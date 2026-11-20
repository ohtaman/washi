import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  approxEqual,
  expectFiniteNumber,
  expectNumericArray,
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

export interface P081Input {
  unitCosts: number[];
  hours: number[];
  targets: number[];
  shortfallPenalties: number[];
  excessPenalties: number[];
  machineCap: number;
  minTotal: number;
}

export interface P081Output {
  quantities: number[];
  shortfalls: number[];
  excesses: number[];
  totalCost: number;
}

export function judge(
  input: P081Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.unitCosts.length;
  const quantities = expectNumericArray(
    output.quantities,
    n,
    { en: "quantities", ja: "quantities", zh: "quantities" },
    locale
  );
  if (typeof quantities === "string") return runtimeError(quantities);

  const shortfalls = expectNumericArray(
    output.shortfalls,
    n,
    { en: "shortfalls", ja: "shortfalls", zh: "shortfalls" },
    locale
  );
  if (typeof shortfalls === "string") return runtimeError(shortfalls);

  const excesses = expectNumericArray(
    output.excesses,
    n,
    { en: "excesses", ja: "excesses", zh: "excesses" },
    locale
  );
  if (typeof excesses === "string") return runtimeError(excesses);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  let usedHours = 0;
  let totalOutput = 0;
  let recomputed = 0;

  for (let j = 0; j < n; j++) {
    const q = quantities[j];
    const sn = shortfalls[j];
    const sp = excesses[j];
    if (q < -1e-6 || sn < -1e-6 || sp < -1e-6) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: j }));
    }
    const lhs = q + sn - sp;
    if (!approxEqual(lhs, input.targets[j], 1e-4)) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: j,
          p1: roundNice(lhs),
          p2: input.targets[j],
        })
      );
    }
    usedHours += input.hours[j] * q;
    totalOutput += q;
    recomputed +=
      input.unitCosts[j] * q +
      input.shortfallPenalties[j] * sn +
      input.excessPenalties[j] * sp;
  }

  if (usedHours > input.machineCap + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m3, {
        p0: roundNice(usedHours),
        p1: input.machineCap,
      })
    );
  }

  if (totalOutput < input.minTotal - 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(totalOutput),
        p1: input.minTotal,
      })
    );
  }

  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(costCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `q=[${quantities.map((v) => roundNice(v)).join(", ")}] | hours=${roundNice(usedHours)}/${input.machineCap} | cost=${roundNice(recomputed)}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(recomputed),
        p1: roundNice(expectedOptimal),
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
