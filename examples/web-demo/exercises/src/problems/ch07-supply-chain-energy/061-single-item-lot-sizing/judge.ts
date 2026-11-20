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

export interface P061Input {
  demands: number[];
  setupCosts: number[];
  prodCosts: number[];
  holdCosts: number[];
  capacities: number[];
}

export interface P061Output {
  setups: number[];
  production: number[];
  inventory: number[];
  totalCost: number;
}

export function judge(
  input: P061Input,
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

  const production = expectNumericArray(
    output.production,
    T,
    { en: "production", ja: "production", zh: "production" },
    locale
  );
  if (typeof production === "string") return runtimeError(production);

  const inventory = expectNumericArray(
    output.inventory,
    T,
    { en: "inventory", ja: "inventory", zh: "inventory" },
    locale
  );
  if (typeof inventory === "string") return runtimeError(inventory);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const setupsClean: number[] = [];
  let prevInv = 0;
  let recomputed = 0;

  for (let t = 0; t < T; t++) {
    const y = setupsRaw[t];
    if (!checkIntegrality(y)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: t, p1: roundNice(y) }));
    }
    const yInt = Math.round(y);
    if (yInt !== 0 && yInt !== 1) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: t, p1: yInt }));
    }
    setupsClean.push(yInt);

    const x = production[t];
    if (x < -1e-6) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: t, p1: roundNice(x) }));
    }
    const allowedCap = input.capacities[t] * yInt;
    if (x > allowedCap + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: t,
          p1: roundNice(x),
          p2: allowedCap,
          p3: yInt,
        })
      );
    }

    const inv = inventory[t];
    if (inv < -1e-6) {
      return violation(formatTemplate(JMSG[locale].m4, { p0: t, p1: roundNice(inv) }));
    }
    const expectedInv = prevInv + x - input.demands[t];
    if (!approxEqual(inv, expectedInv, 1e-3)) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: t,
          p1: roundNice(expectedInv),
          p2: roundNice(inv),
        })
      );
    }

    recomputed +=
      input.setupCosts[t] * yInt + input.prodCosts[t] * x + input.holdCosts[t] * inv;
    prevInv = inv;
  }

  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(costCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `setups=[${setupsClean.join(", ")}] | prod=[${production.map((v) => roundNice(v, 2)).join(", ")}] | totalCost=${roundNice(recomputed)}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m7, {
        p0: roundNice(recomputed),
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
