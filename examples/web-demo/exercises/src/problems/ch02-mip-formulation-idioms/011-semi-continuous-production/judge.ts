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

export interface P011Input {
  margins: number[];
  minBatches: number[];
  maxBatches: number[];
  resourceUsages: number[];
  resourceCap: number;
}

export interface P011Output {
  active: number[];
  quantities: number[];
  totalMargin: number;
}

export function judge(
  input: P011Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.margins.length;
  const activeRaw = expectNumericArray(
    output.active,
    n,
    { en: "active", ja: "active", zh: "active" },
    locale
  );
  if (typeof activeRaw === "string") return runtimeError(activeRaw);

  const quantities = expectNumericArray(
    output.quantities,
    n,
    { en: "quantities", ja: "quantities", zh: "quantities" },
    locale
  );
  if (typeof quantities === "string") return runtimeError(quantities);

  const marginCheck = expectFiniteNumber(
    output.totalMargin,
    { en: "totalMargin", ja: "totalMargin", zh: "totalMargin" },
    locale
  );
  if (typeof marginCheck === "string") return runtimeError(marginCheck);

  const activeClean: number[] = [];
  let resourceUsed = 0;
  let recomputed = 0;

  for (let i = 0; i < n; i++) {
    const a = activeRaw[i];
    if (!checkIntegrality(a)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(a) }));
    }
    const aInt = Math.round(a);
    if (aInt !== 0 && aInt !== 1) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: aInt }));
    }
    activeClean.push(aInt);

    const q = quantities[i];
    if (q < -1e-6) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: roundNice(q) }));
    }

    const minAllowed = input.minBatches[i] * aInt;
    const maxAllowed = input.maxBatches[i] * aInt;
    if (q < minAllowed - 1e-4 || q > maxAllowed + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: i,
          p1: roundNice(q),
          p2: aInt,
          p3: minAllowed,
          p4: maxAllowed,
        })
      );
    }

    resourceUsed += input.resourceUsages[i] * q;
    recomputed += input.margins[i] * q;
  }

  if (resourceUsed > input.resourceCap + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(resourceUsed),
        p1: input.resourceCap,
      })
    );
  }

  if (!approxEqual(marginCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(marginCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `active=[${activeClean.join(", ")}] | q=[${quantities.map((v) => roundNice(v)).join(", ")}] | res=${roundNice(resourceUsed)}/${input.resourceCap}`;

  if (recomputed < expectedOptimal - 1e-2) {
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
