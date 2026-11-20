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

export interface P014Input {
  budget: number;
  unitReturns: number[];
  fixedCosts: number[];
  minLevels: number[];
  maxLevels: number[];
  prerequisites: number[][];
  conjunctions: number[][];
  conflicts: number[][];
}

export interface P014Output {
  active: number[];
  levels: number[];
  netProfit: number;
}

export function judge(
  input: P014Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.unitReturns.length;
  const activeRaw = expectNumericArray(
    output.active,
    n,
    { en: "active", ja: "active", zh: "active" },
    locale
  );
  if (typeof activeRaw === "string") return runtimeError(activeRaw);

  const levels = expectNumericArray(
    output.levels,
    n,
    { en: "levels", ja: "levels", zh: "levels" },
    locale
  );
  if (typeof levels === "string") return runtimeError(levels);

  const profitCheck = expectFiniteNumber(
    output.netProfit,
    { en: "netProfit", ja: "netProfit", zh: "netProfit" },
    locale
  );
  if (typeof profitCheck === "string") return runtimeError(profitCheck);

  const activeClean: number[] = [];
  let totalAllocated = 0;
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

    const x = levels[i];
    if (x < -1e-6) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: roundNice(x) }));
    }
    const minReq = input.minLevels[i] * aInt;
    const maxAllowed = input.maxLevels[i] * aInt;
    if (x < minReq - 1e-4 || x > maxAllowed + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: i,
          p1: roundNice(x),
          p2: aInt,
          p3: minReq,
          p4: maxAllowed,
        })
      );
    }

    totalAllocated += x;
    recomputed += input.unitReturns[i] * x - input.fixedCosts[i] * aInt;
  }

  if (totalAllocated > input.budget + 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(totalAllocated),
        p1: input.budget,
      })
    );
  }

  for (const [a, b] of input.prerequisites) {
    if (activeClean[a] > activeClean[b]) {
      return violation(formatTemplate(JMSG[locale].m5, { p0: a, p1: b }));
    }
  }

  for (const [a, b, c] of input.conjunctions) {
    if (activeClean[a] + activeClean[b] - 1 > activeClean[c]) {
      return violation(formatTemplate(JMSG[locale].m6, { p0: a, p1: b, p2: c }));
    }
  }

  for (const [u, v] of input.conflicts) {
    if (activeClean[u] + activeClean[v] > 1) {
      return violation(formatTemplate(JMSG[locale].m7, { p0: u, p1: v }));
    }
  }

  if (!approxEqual(profitCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m8, {
        p0: roundNice(profitCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `active=[${activeClean.join(", ")}] | levels=[${levels.map((v) => roundNice(v)).join(", ")}]`;

  if (recomputed < expectedOptimal - 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m9, {
        p0: roundNice(recomputed),
        p1: roundNice(expectedOptimal),
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m10, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
