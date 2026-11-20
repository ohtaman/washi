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

export interface P070Input {
  demands: number[];
  setupCost: number;
  holdCost: number;
  prodCap: number;
  setupPower: number;
  unitPower: number;
  baseLoads: number[];
  prices: number[];
  demandCharge: number;
  batteryCap: number;
  initSoc: number;
  maxPower: number;
  etaCharge: number;
  etaDischarge: number;
}

export interface P070Output {
  setups: number[];
  production: number[];
  inventory: number[];
  charge: number[];
  discharge: number[];
  soc: number[];
  peakLoad: number;
  totalCost: number;
}

export function judge(
  input: P070Input,
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

  const charge = expectNumericArray(
    output.charge,
    T,
    { en: "charge", ja: "charge", zh: "charge" },
    locale
  );
  if (typeof charge === "string") return runtimeError(charge);

  const discharge = expectNumericArray(
    output.discharge,
    T,
    { en: "discharge", ja: "discharge", zh: "discharge" },
    locale
  );
  if (typeof discharge === "string") return runtimeError(discharge);

  const soc = expectNumericArray(
    output.soc,
    T,
    { en: "soc", ja: "soc", zh: "soc" },
    locale
  );
  if (typeof soc === "string") return runtimeError(soc);

  const peakCheck = expectFiniteNumber(
    output.peakLoad,
    { en: "peakLoad", ja: "peakLoad", zh: "peakLoad" },
    locale
  );
  if (typeof peakCheck === "string") return runtimeError(peakCheck);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const setupsClean: number[] = [];
  let prevInv = 0;
  let prevSoc = input.initSoc;
  let recomputed = 0;
  let actualPeak = 0;

  for (let t = 0; t < T; t++) {
    if (!checkIntegrality(setupsRaw[t])) {
      return violation(
        formatTemplate(JMSG[locale].m1, { p0: t, p1: roundNice(setupsRaw[t]) })
      );
    }
    const y = Math.round(setupsRaw[t]);
    if (y !== 0 && y !== 1) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: t, p1: y }));
    }
    setupsClean.push(y);

    if (production[t] < -1e-6 || production[t] > input.prodCap * y + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: t,
          p1: roundNice(production[t]),
          p2: input.prodCap * y,
        })
      );
    }
    if (inventory[t] < -1e-6) {
      return violation(
        formatTemplate(JMSG[locale].m3, { p0: t, p1: roundNice(inventory[t]) })
      );
    }

    const expectedInv = prevInv + production[t] - input.demands[t];
    if (!approxEqual(inventory[t], expectedInv, 1e-3)) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: t,
          p1: roundNice(expectedInv),
          p2: roundNice(inventory[t]),
        })
      );
    }

    if (charge[t] < -1e-6 || charge[t] > input.maxPower + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: "charge",
          p1: t,
          p2: roundNice(charge[t]),
          p3: input.maxPower,
        })
      );
    }
    if (discharge[t] < -1e-6 || discharge[t] > input.maxPower + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: "discharge",
          p1: t,
          p2: roundNice(discharge[t]),
          p3: input.maxPower,
        })
      );
    }
    if (Math.min(charge[t], discharge[t]) > 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m6, {
          p0: t,
          p1: roundNice(charge[t]),
          p2: roundNice(discharge[t]),
        })
      );
    }
    if (soc[t] < -1e-4 || soc[t] > input.batteryCap + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m7, {
          p0: t,
          p1: roundNice(soc[t]),
          p2: input.batteryCap,
        })
      );
    }

    const expectedSoc =
      prevSoc + input.etaCharge * charge[t] - discharge[t] / input.etaDischarge;
    if (!approxEqual(soc[t], expectedSoc, 1e-3)) {
      return violation(
        formatTemplate(JMSG[locale].m8, {
          p0: t,
          p1: roundNice(expectedSoc),
          p2: roundNice(soc[t]),
        })
      );
    }

    const gridLoad =
      input.baseLoads[t] +
      input.setupPower * y +
      input.unitPower * production[t] +
      charge[t] -
      discharge[t];

    if (gridLoad < -1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m9, { p0: t, p1: roundNice(gridLoad) })
      );
    }
    if (peakCheck < gridLoad - 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m10, {
          p0: roundNice(peakCheck),
          p1: t,
          p2: roundNice(gridLoad),
        })
      );
    }

    actualPeak = Math.max(actualPeak, gridLoad);
    recomputed +=
      input.setupCost * y +
      input.holdCost * inventory[t] +
      input.prices[t] * gridLoad;

    prevInv = inventory[t];
    prevSoc = soc[t];
  }

  if (soc[T - 1] < input.initSoc - 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m11, {
        p0: roundNice(soc[T - 1]),
        p1: input.initSoc,
      })
    );
  }

  recomputed += input.demandCharge * peakCheck;

  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m12, {
        p0: roundNice(costCheck),
        p1: roundNice(recomputed),
      })
    );
  }

  const preview = `setups=[${setupsClean.join(",")}] | peak=${roundNice(actualPeak, 2)} | totalCost=${roundNice(recomputed)}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m13, {
        p0: roundNice(recomputed),
        p1: roundNice(expectedOptimal),
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m14, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
