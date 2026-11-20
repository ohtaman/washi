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

export interface P097Input {
  fixedCosts: number[];
  capacities: number[];
  demands: number[];
  shippingCosts: number[][];
}

export interface P097Output {
  open: number[];
  shipments: number[][];
  totalCost: number;
}

export function judge(
  input: P097Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const I = input.fixedCosts.length;
  const J = input.demands.length;

  const openRaw = expectNumericArray(
    output.open,
    I,
    { en: "open", ja: "open", zh: "open" },
    locale
  );
  if (typeof openRaw === "string") return runtimeError(openRaw);

  if (!Array.isArray(output.shipments) || output.shipments.length !== I) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: I }));
  }

  const shipRows: number[][] = [];
  for (let i = 0; i < I; i++) {
    const row = expectNumericArray(
      output.shipments[i],
      J,
      { en: `shipments[${i}]`, ja: `shipments[${i}]`, zh: `shipments[${i}]` },
      locale
    );
    if (typeof row === "string") return runtimeError(row);
    shipRows.push(row);
  }

  const totalCostCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof totalCostCheck === "string") return runtimeError(totalCostCheck);

  const cleanOpen: number[] = [];
  let fixedSum = 0;
  for (let i = 0; i < I; i++) {
    const oRaw = openRaw[i];
    if (!checkIntegrality(oRaw)) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: roundNice(oRaw) }));
    }
    const bit = Math.round(oRaw);
    if (bit !== 0 && bit !== 1) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: bit }));
    }
    cleanOpen.push(bit);
    fixedSum += input.fixedCosts[i] * bit;
  }

  let shipSum = 0;
  const colDemand = Array(J).fill(0);
  for (let i = 0; i < I; i++) {
    let rowOut = 0;
    for (let j = 0; j < J; j++) {
      const flow = shipRows[i][j];
      if (flow < -1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m3, { p0: i, p1: j, p2: roundNice(flow) })
        );
      }
      const cleanFlow = Math.max(0, flow);
      rowOut += cleanFlow;
      colDemand[j] += cleanFlow;
      shipSum += input.shippingCosts[i][j] * cleanFlow;
    }
    const capAllowed = input.capacities[i] * cleanOpen[i];
    if (rowOut > capAllowed + 1e-3) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: i,
          p1: roundNice(rowOut),
          p2: capAllowed,
        })
      );
    }
  }

  for (let j = 0; j < J; j++) {
    if (colDemand[j] < input.demands[j] - 1e-3) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: j,
          p1: roundNice(colDemand[j]),
          p2: input.demands[j],
        })
      );
    }
  }

  const recomputedTotal = fixedSum + shipSum;
  if (!approxEqual(totalCostCheck, recomputedTotal, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(totalCostCheck),
        p1: roundNice(recomputedTotal),
      })
    );
  }

  const preview = `open=[${cleanOpen.join(",")}] | fixed=${fixedSum} | ship=${roundNice(shipSum)} | totalCost=${roundNice(recomputedTotal)}`;

  if (recomputedTotal > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputedTotal,
      expectedOptimal,
      formatTemplate(JMSG[locale].m7, {
        p0: roundNice(recomputedTotal),
        p1: expectedOptimal,
      }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m8, { p0: expectedOptimal }),
    preview
  );
}
