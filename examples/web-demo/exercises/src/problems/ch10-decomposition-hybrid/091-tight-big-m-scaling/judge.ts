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

export interface P091Input {
  fixedCosts: number[];
  unitCosts: number[];
  capacities: number[];
  demand: number;
}

export interface P091Output {
  open: number[];
  quantities: number[];
  totalCost: number;
  lpBound: number;
}

function computeTightLpRelaxation(input: P091Input): number {
  if (input.demand <= 0) return 0;
  const items = input.capacities
    .map((cap, i) => {
      const mTight = Math.min(cap, input.demand);
      if (mTight <= 0) return null;
      return {
        mTight,
        effCost: input.unitCosts[i] + input.fixedCosts[i] / mTight,
      };
    })
    .filter((item): item is { mTight: number; effCost: number } => item !== null)
    .sort((a, b) => a.effCost - b.effCost);

  let remaining = input.demand;
  let bound = 0;
  for (const item of items) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, item.mTight);
    bound += take * item.effCost;
    remaining -= take;
  }
  return bound;
}

export function judge(
  input: P091Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.fixedCosts.length;
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

  const totalCostCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof totalCostCheck === "string") return runtimeError(totalCostCheck);

  const lpBoundCheck = expectFiniteNumber(
    output.lpBound,
    { en: "lpBound", ja: "lpBound", zh: "lpBound" },
    locale
  );
  if (typeof lpBoundCheck === "string") return runtimeError(lpBoundCheck);

  const openClean: number[] = [];
  let totalProduced = 0;
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

    totalProduced += q;
    recomputed += input.fixedCosts[i] * oInt + input.unitCosts[i] * q;
  }

  if (totalProduced < input.demand - 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(totalProduced),
        p1: input.demand,
      })
    );
  }

  if (!approxEqual(totalCostCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, {
        p0: roundNice(totalCostCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const tightLp = computeTightLpRelaxation(input);
  if (lpBoundCheck < tightLp - 1e-2) {
    return violation(
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(lpBoundCheck),
        p1: roundNice(tightLp),
      })
    );
  }
  if (lpBoundCheck > tightLp + 1e-2) {
    return violation(
      formatTemplate(JMSG[locale].m7, {
        p0: roundNice(lpBoundCheck),
        p1: roundNice(tightLp),
      })
    );
  }

  const preview = `open=[${openClean.join(", ")}] | lpBound=${roundNice(lpBoundCheck)} | totalCost=${roundNice(recomputed)}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m8, {
        p0: roundNice(recomputed),
        p1: expectedOptimal,
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m9, {
      p0: expectedOptimal,
      p1: roundNice(lpBoundCheck),
    }),
    preview
  );
}
