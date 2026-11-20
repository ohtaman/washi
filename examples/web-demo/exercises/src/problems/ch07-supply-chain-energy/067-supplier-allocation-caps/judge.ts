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

export interface P067Input {
  demands: number[];
  unitCosts: number[][];
  fixedCosts: number[];
  minOrders: number[];
  maxOrders: number[];
  maxShare: number;
  minSuppliers: number;
  maxSuppliers: number;
}

export interface P067Output {
  active: number[];
  allocations: number[][];
  totalCost: number;
}

export function judge(
  input: P067Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const nSup = input.fixedCosts.length;
  const nPlants = input.demands.length;

  const activeRaw = expectNumericArray(
    output.active,
    nSup,
    { en: "active", ja: "active", zh: "active" },
    locale
  );
  if (typeof activeRaw === "string") return runtimeError(activeRaw);

  if (!Array.isArray(output.allocations) || output.allocations.length !== nSup) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: nSup }));
  }

  const allocations: number[][] = [];
  for (let s = 0; s < nSup; s++) {
    const row = expectNumericArray(
      output.allocations[s],
      nPlants,
      { en: `allocations[${s}]`, ja: `allocations[${s}]`, zh: `allocations[${s}]` },
      locale
    );
    if (typeof row === "string") return runtimeError(row);
    allocations.push(row);
  }

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  for (let s = 0; s < nSup; s++) {
    const row = allocations[s];
    for (let p = 0; p < nPlants; p++) {
      if (row[p] < -1e-6) {
        return violation(
          formatTemplate(JMSG[locale].m3, { p0: s, p1: p, p2: roundNice(row[p]) })
        );
      }
      const cap = input.maxShare * input.demands[p];
      if (row[p] > cap + 1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m4, {
            p0: s,
            p1: p,
            p2: roundNice(row[p]),
            p3: roundNice(cap),
          })
        );
      }
    }
  }

  const activeClean: number[] = [];
  let activeCount = 0;
  let recomputed = 0;

  for (let s = 0; s < nSup; s++) {
    const a = activeRaw[s];
    if (!checkIntegrality(a)) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: s, p1: roundNice(a) }));
    }
    const aInt = Math.round(a);
    if (aInt !== 0 && aInt !== 1) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: s, p1: aInt }));
    }
    activeClean.push(aInt);
    activeCount += aInt;

    const totalSupOrder = allocations[s].reduce((acc, v) => acc + v, 0);
    const minReq = input.minOrders[s] * aInt;
    const maxAllowed = input.maxOrders[s] * aInt;
    if (totalSupOrder < minReq - 1e-4 || totalSupOrder > maxAllowed + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: s,
          p1: roundNice(totalSupOrder),
          p2: minReq,
          p3: maxAllowed,
        })
      );
    }

    recomputed += input.fixedCosts[s] * aInt;
    for (let p = 0; p < nPlants; p++) {
      recomputed += input.unitCosts[s][p] * allocations[s][p];
    }
  }

  if (activeCount < input.minSuppliers || activeCount > input.maxSuppliers) {
    return violation(
      formatTemplate(JMSG[locale].m6, {
        p0: activeCount,
        p1: input.minSuppliers,
        p2: input.maxSuppliers,
      })
    );
  }

  for (let p = 0; p < nPlants; p++) {
    let supplied = 0;
    for (let s = 0; s < nSup; s++) supplied += allocations[s][p];
    if (supplied < input.demands[p] - 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m7, {
          p0: p,
          p1: roundNice(supplied),
          p2: input.demands[p],
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

  const preview = `active=[${activeClean.join(", ")}] | totalCost=${roundNice(recomputed)}`;

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
