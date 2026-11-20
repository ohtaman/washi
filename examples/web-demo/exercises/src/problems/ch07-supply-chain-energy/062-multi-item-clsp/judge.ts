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

export interface P062Input {
  demands: number[][];
  setupCosts: number[];
  holdCosts: number[];
  unitTimes: number[];
  setupTimes: number[];
  capacities: number[];
}

export interface P062Output {
  setups: number[][];
  production: number[][];
  inventory: number[][];
  totalCost: number;
}

export function judge(
  input: P062Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const nItems = input.demands.length;
  const T = input.capacities.length;

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
  const prodClean: number[][] = [];
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
    prodClean.push(pRow);
    invClean.push(iRow);
  }

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const setupsClean: number[][] = [];
  for (let i = 0; i < nItems; i++) {
    const sRow = setupsRaw[i];
    const pRow = prodClean[i];
    const iRow = invClean[i];
    const cleanY: number[] = [];
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

      if (pRow[t] < -1e-6) {
        return violation(
          formatTemplate(JMSG[locale].m3, { p0: i, p1: t, p2: roundNice(pRow[t]) })
        );
      }
      if (yInt === 0 && pRow[t] > 1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m4, { p0: i, p1: t, p2: roundNice(pRow[t]) })
        );
      }
      if (iRow[t] < -1e-6) {
        return violation(
          formatTemplate(JMSG[locale].m5, { p0: i, p1: t, p2: roundNice(iRow[t]) })
        );
      }
    }
    setupsClean.push(cleanY);
  }

  let recomputed = 0;

  for (let i = 0; i < nItems; i++) {
    let prevInv = 0;
    for (let t = 0; t < T; t++) {
      const expectedInv = prevInv + prodClean[i][t] - input.demands[i][t];
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
        input.setupCosts[i] * setupsClean[i][t] + input.holdCosts[i] * invClean[i][t];
      prevInv = invClean[i][t];
    }
  }

  for (let t = 0; t < T; t++) {
    let usedHours = 0;
    for (let i = 0; i < nItems; i++) {
      usedHours +=
        input.unitTimes[i] * prodClean[i][t] + input.setupTimes[i] * setupsClean[i][t];
    }
    if (usedHours > input.capacities[t] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m7, {
          p0: t,
          p1: roundNice(usedHours),
          p2: input.capacities[t],
        })
      );
    }
  }

  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m8, {
        p0: roundNice(costCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const totalSetups = setupsClean.flat().reduce((acc, v) => acc + v, 0);
  const preview = `setups=${totalSetups} | totalCost=${roundNice(recomputed)}`;

  if (recomputed > expectedOptimal + 1e-2) {
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
