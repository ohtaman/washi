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

export interface P065Input {
  plantFixedCosts: number[];
  plantCaps: number[];
  dcFixedCosts: number[];
  dcCaps: number[];
  demands: number[];
  plantDcCosts: number[][];
  dcCustomerCosts: number[][];
}

export interface P065Output {
  openPlants: number[];
  openDcs: number[];
  plantToDc: number[][];
  dcToCustomer: number[][];
  totalCost: number;
}

export function judge(
  input: P065Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const nPlants = input.plantCaps.length;
  const nDcs = input.dcCaps.length;
  const nCusts = input.demands.length;

  const openPlantsRaw = expectNumericArray(
    output.openPlants,
    nPlants,
    { en: "openPlants", ja: "openPlants", zh: "openPlants" },
    locale
  );
  if (typeof openPlantsRaw === "string") return runtimeError(openPlantsRaw);

  const openDcsRaw = expectNumericArray(
    output.openDcs,
    nDcs,
    { en: "openDcs", ja: "openDcs", zh: "openDcs" },
    locale
  );
  if (typeof openDcsRaw === "string") return runtimeError(openDcsRaw);

  if (!Array.isArray(output.plantToDc) || output.plantToDc.length !== nPlants) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: "plantToDc", p1: nPlants }));
  }
  if (!Array.isArray(output.dcToCustomer) || output.dcToCustomer.length !== nDcs) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: "dcToCustomer", p1: nDcs }));
  }

  const plantToDc: number[][] = [];
  for (let p = 0; p < nPlants; p++) {
    const row = expectNumericArray(
      output.plantToDc[p],
      nDcs,
      { en: `plantToDc[${p}]`, ja: `plantToDc[${p}]`, zh: `plantToDc[${p}]` },
      locale
    );
    if (typeof row === "string") return runtimeError(row);
    plantToDc.push(row);
  }

  const dcToCustomer: number[][] = [];
  for (let d = 0; d < nDcs; d++) {
    const row = expectNumericArray(
      output.dcToCustomer[d],
      nCusts,
      { en: `dcToCustomer[${d}]`, ja: `dcToCustomer[${d}]`, zh: `dcToCustomer[${d}]` },
      locale
    );
    if (typeof row === "string") return runtimeError(row);
    dcToCustomer.push(row);
  }

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  for (let p = 0; p < nPlants; p++) {
    const row = plantToDc[p];
    for (let d = 0; d < nDcs; d++) {
      if (row[d] < -1e-6) {
        return violation(
          formatTemplate(JMSG[locale].m3, { p0: "plantToDc", p1: p, p2: d, p3: roundNice(row[d]) })
        );
      }
    }
  }

  for (let d = 0; d < nDcs; d++) {
    const row = dcToCustomer[d];
    for (let c = 0; c < nCusts; c++) {
      if (row[c] < -1e-6) {
        return violation(
          formatTemplate(JMSG[locale].m3, {
            p0: "dcToCustomer",
            p1: d,
            p2: c,
            p3: roundNice(row[c]),
          })
        );
      }
    }
  }

  const openPlants: number[] = [];
  let recomputed = 0;

  for (let p = 0; p < nPlants; p++) {
    if (!checkIntegrality(openPlantsRaw[p])) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: "openPlants",
          p1: p,
          p2: roundNice(openPlantsRaw[p]),
        })
      );
    }
    const u = Math.round(openPlantsRaw[p]);
    if (u !== 0 && u !== 1) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: "openPlants", p1: p, p2: u }));
    }
    openPlants.push(u);

    const outFlow = plantToDc[p].reduce((acc, v) => acc + v, 0);
    if (outFlow > input.plantCaps[p] * u + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: p,
          p1: roundNice(outFlow),
          p2: input.plantCaps[p] * u,
        })
      );
    }
    recomputed += input.plantFixedCosts[p] * u;
  }

  const openDcs: number[] = [];
  for (let d = 0; d < nDcs; d++) {
    if (!checkIntegrality(openDcsRaw[d])) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: "openDcs",
          p1: d,
          p2: roundNice(openDcsRaw[d]),
        })
      );
    }
    const w = Math.round(openDcsRaw[d]);
    if (w !== 0 && w !== 1) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: "openDcs", p1: d, p2: w }));
    }
    openDcs.push(w);

    let inFlow = 0;
    for (let p = 0; p < nPlants; p++) {
      inFlow += plantToDc[p][d];
      recomputed += input.plantDcCosts[p][d] * plantToDc[p][d];
    }
    const outFlow = dcToCustomer[d].reduce((acc, v) => acc + v, 0);
    if (!approxEqual(inFlow, outFlow, 1e-3)) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: d,
          p1: roundNice(inFlow),
          p2: roundNice(outFlow),
        })
      );
    }
    if (inFlow > input.dcCaps[d] * w + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m6, {
          p0: d,
          p1: roundNice(inFlow),
          p2: input.dcCaps[d] * w,
        })
      );
    }
    recomputed += input.dcFixedCosts[d] * w;
  }

  for (let c = 0; c < nCusts; c++) {
    let delivered = 0;
    for (let d = 0; d < nDcs; d++) {
      delivered += dcToCustomer[d][c];
      recomputed += input.dcCustomerCosts[d][c] * dcToCustomer[d][c];
    }
    if (delivered < input.demands[c] - 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m7, {
          p0: c,
          p1: roundNice(delivered),
          p2: input.demands[c],
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

  const preview = `plants=[${openPlants.join(", ")}] | dcs=[${openDcs.join(", ")}] | totalCost=${roundNice(recomputed)}`;

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
