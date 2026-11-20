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

export interface P064Input {
  externalDemands: number[][];
  bom: number[][];
  leadTimes: number[];
  initialInventory: number[];
  setupCosts: number[];
  prodCosts: number[];
  holdCosts: number[];
  capacities: number[];
}

export interface P064Output {
  setups: number[][];
  production: number[][];
  inventory: number[][];
  totalCost: number;
}

export function judge(
  input: P064Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const nItems = input.externalDemands.length;
  const T = input.externalDemands[0]?.length ?? 0;

  if (!Array.isArray(output.setups) || output.setups.length !== nItems) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: "setups", p1: nItems }));
  }
  if (!Array.isArray(output.production) || output.production.length !== nItems) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: "production", p1: nItems }));
  }
  if (!Array.isArray(output.inventory) || output.inventory.length !== nItems) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: "inventory", p1: nItems }));
  }

  const setupsRaw: number[][] = [];
  const prodRaw: number[][] = [];
  const invClean: number[][] = [];

  for (let i = 0; i < nItems; i++) {
    const sRow = expectNumericArray(
      output.setups[i],
      T,
      { en: `setups[${i}]`, ja: `setups[${i}]`, zh: `setups[${i}]` },
      locale
    );
    if (typeof sRow === "string") return runtimeError(sRow);

    const pRow = expectNumericArray(
      output.production[i],
      T,
      { en: `production[${i}]`, ja: `production[${i}]`, zh: `production[${i}]` },
      locale
    );
    if (typeof pRow === "string") return runtimeError(pRow);

    const iRow = expectNumericArray(
      output.inventory[i],
      T,
      { en: `inventory[${i}]`, ja: `inventory[${i}]`, zh: `inventory[${i}]` },
      locale
    );
    if (typeof iRow === "string") return runtimeError(iRow);

    setupsRaw.push(sRow);
    prodRaw.push(pRow);
    invClean.push(iRow);
  }

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const setupsClean: number[][] = [];
  const prodClean: number[][] = [];
  for (let i = 0; i < nItems; i++) {
    const sRow = setupsRaw[i];
    const pRow = prodRaw[i];
    const iRow = invClean[i];
    const cleanY: number[] = [];
    const cleanX: number[] = [];
    for (let t = 0; t < T; t++) {
      if (!checkIntegrality(sRow[t])) {
        return violation(
          formatTemplate(JMSG[locale].m2, { p0: i, p1: t, p2: roundNice(sRow[t]) })
        );
      }
      const yInt = Math.round(sRow[t]);
      if (yInt !== 0 && yInt !== 1) {
        return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: t, p2: yInt }));
      }
      cleanY.push(yInt);

      if (!checkIntegrality(pRow[t])) {
        return violation(
          formatTemplate(JMSG[locale].m3, { p0: i, p1: t, p2: roundNice(pRow[t]) })
        );
      }
      const xInt = Math.round(pRow[t]);
      if (xInt < 0 || xInt > input.capacities[i] * yInt) {
        return violation(
          formatTemplate(JMSG[locale].m4, {
            p0: i,
            p1: t,
            p2: xInt,
            p3: input.capacities[i] * yInt,
          })
        );
      }
      cleanX.push(xInt);

      if (iRow[t] < -1e-6) {
        return violation(
          formatTemplate(JMSG[locale].m5, { p0: i, p1: t, p2: roundNice(iRow[t]) })
        );
      }
    }

    setupsClean.push(cleanY);
    prodClean.push(cleanX);
  }

  let recomputed = 0;
  for (let i = 0; i < nItems; i++) {
    const L = input.leadTimes[i];
    let prevInv = input.initialInventory[i];
    for (let t = 0; t < T; t++) {
      const arrival = t >= L ? prodClean[i][t - L] : 0;
      let depDemand = 0;
      for (let j = 0; j < nItems; j++) {
        depDemand += input.bom[i][j] * prodClean[j][t];
      }
      const expectedInv = prevInv + arrival - input.externalDemands[i][t] - depDemand;
      if (!approxEqual(invClean[i][t], expectedInv, 1e-3)) {
        return violation(
          formatTemplate(JMSG[locale].m6, {
            p0: i,
            p1: t,
            p2: roundNice(expectedInv),
            p3: roundNice(invClean[i][t]),
          })
        );
      }
      recomputed +=
        input.setupCosts[i] * setupsClean[i][t] +
        input.prodCosts[i] * prodClean[i][t] +
        input.holdCosts[i] * invClean[i][t];
      prevInv = invClean[i][t];
    }
  }

  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m7, {
        p0: roundNice(costCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const totalLots = setupsClean.flat().reduce((acc, v) => acc + v, 0);
  const preview = `setups=${totalLots} | totalCost=${roundNice(recomputed)}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m8, {
        p0: roundNice(recomputed),
        p1: roundNice(expectedOptimal),
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m9, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
