import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  approxEqual,
  checkIntegrality,
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

export interface P010Input {
  margins: number[];
  fixedCosts: number[];
  capacities: number[];
  materialUsages: number[];
  materialCap: number;
}

export interface P010Output {
  open: number[];
  quantities: number[];
  netProfit: number;
}

export function judge(
  input: P010Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.margins.length;
  const openRaw = expectNumericArray(
    output.open,
    n,
    { en: "open", ja: "open", zh: "open" },
    locale
  );
  if (typeof openRaw === "string") return runtimeError(openRaw);

  const quantities = expectNumericArray(
    output.quantities,
    n,
    { en: "quantities", ja: "quantities", zh: "quantities" },
    locale
  );
  if (typeof quantities === "string") return runtimeError(quantities);

  const profitCheck = expectFiniteNumber(
    output.netProfit,
    { en: "netProfit", ja: "netProfit", zh: "netProfit" },
    locale
  );
  if (typeof profitCheck === "string") return runtimeError(profitCheck);

  const openClean: number[] = [];
  let materialUsed = 0;
  let recomputed = 0;

  for (let i = 0; i < n; i++) {
    const o = openRaw[i];
    if (!checkIntegrality(o)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(o) }));
    }
    const oInt = Math.round(o);
    if (oInt !== 0 && oInt !== 1) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: oInt }));
    }
    openClean.push(oInt);

    const q = quantities[i];
    if (q < -1e-6) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: roundNice(q) }));
    }
    const allowedCap = input.capacities[i] * oInt;
    if (q > allowedCap + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: i,
          p1: roundNice(q),
          p2: allowedCap,
          p3: oInt,
        })
      );
    }

    materialUsed += input.materialUsages[i] * q;
    recomputed += input.margins[i] * q - input.fixedCosts[i] * oInt;
  }

  if (materialUsed > input.materialCap + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(materialUsed),
        p1: input.materialCap,
      })
    );
  }

  if (!approxEqual(profitCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(profitCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `open=[${openClean.join(", ")}] | q=[${quantities.map((v) => roundNice(v)).join(", ")}] | mat=${roundNice(materialUsed)}/${input.materialCap}`;

  if (recomputed < expectedOptimal - 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(recomputed),
        p1: expectedOptimal,
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: expectedOptimal }),
    preview
  );
}
