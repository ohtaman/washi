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

export interface P099Input {
  demands: number[];
  setupCosts: number[];
  prodCosts: number[];
  holdCost: number;
  capacities: number[];
  initialPlan: number[];
  windowSize: number;
}

export interface P099Output {
  setups: number[];
  production: number[];
  inventory: number[];
  totalCost: number;
}

export function judge(
  input: P099Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const T = input.demands.length;

  const setupsRaw = expectNumericArray(
    output.setups,
    T,
    { en: "setups", ja: "setups", zh: "setups" },
    locale
  );
  if (typeof setupsRaw === "string") return runtimeError(setupsRaw);

  const prodRaw = expectNumericArray(
    output.production,
    T,
    { en: "production", ja: "production", zh: "production" },
    locale
  );
  if (typeof prodRaw === "string") return runtimeError(prodRaw);

  const invRaw = expectNumericArray(
    output.inventory,
    T,
    { en: "inventory", ja: "inventory", zh: "inventory" },
    locale
  );
  if (typeof invRaw === "string") return runtimeError(invRaw);

  const totalCostCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof totalCostCheck === "string") return runtimeError(totalCostCheck);

  const setups: number[] = [];
  const production: number[] = [];
  const inventory: number[] = [];
  let recomputedCost = 0;

  for (let t = 0; t < T; t++) {
    const sRaw = setupsRaw[t];
    if (!checkIntegrality(sRaw)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: t, p1: roundNice(sRaw) }));
    }
    const y = Math.round(sRaw);
    if (y !== 0 && y !== 1) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: t, p1: y }));
    }

    const p = prodRaw[t];
    if (p < -1e-4) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: t, p1: roundNice(p) }));
    }
    const inv = invRaw[t];
    if (inv < -1e-4) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: t, p1: roundNice(inv) }));
    }

    const cleanProd = Math.max(0, p);
    const cleanInv = Math.max(0, inv);
    const capAllowed = input.capacities[t] * y;
    if (cleanProd > capAllowed + 1e-3) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: t,
          p1: roundNice(cleanProd),
          p2: capAllowed,
        })
      );
    }

    const prevInv = t === 0 ? 0 : inventory[t - 1];
    const supplied = prevInv + cleanProd - cleanInv;
    if (!approxEqual(supplied, input.demands[t], 1e-2)) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: t,
          p1: roundNice(supplied),
          p2: input.demands[t],
        })
      );
    }

    setups.push(y);
    production.push(cleanProd);
    inventory.push(cleanInv);
    recomputedCost +=
      input.setupCosts[t] * y +
      input.prodCosts[t] * cleanProd +
      input.holdCost * cleanInv;
  }

  if (!approxEqual(totalCostCheck, recomputedCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(totalCostCheck),
        p1: roundNice(recomputedCost),
      })
    );
  }

  const preview = `setups=[${setups.join(",")}] | totalCost=${roundNice(recomputedCost)}`;

  if (recomputedCost > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputedCost,
      expectedOptimal,
      formatTemplate(JMSG[locale].m7, {
        p0: roundNice(recomputedCost),
        p1: roundNice(expectedOptimal),
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m8, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
