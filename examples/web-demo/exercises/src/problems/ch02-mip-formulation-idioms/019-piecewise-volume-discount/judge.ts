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

export interface P019Tier {
  minQty: number;
  maxQty: number;
  unitPrice: number;
}

export interface P019Input {
  demand: number;
  suppliers: P019Tier[][];
}

export interface P019Output {
  tierSelected: number[][];
  tierQuantities: number[][];
  totalCost: number;
}

export function judge(
  input: P019Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const nSup = input.suppliers.length;
  if (!Array.isArray(output.tierSelected) || output.tierSelected.length !== nSup) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: nSup }));
  }
  if (!Array.isArray(output.tierQuantities) || output.tierQuantities.length !== nSup) {
    return runtimeError(formatTemplate(JMSG[locale].m2, { p0: nSup }));
  }

  const selRawMatrix: number[][] = [];
  const tierQtyClean: number[][] = [];

  for (let s = 0; s < nSup; s++) {
    const kCount = input.suppliers[s].length;
    const selRow = expectNumericArray(
      output.tierSelected[s],
      kCount,
      { en: `tierSelected[${s}]`, ja: `tierSelected[${s}]`, zh: `tierSelected[${s}]` },
      locale
    );
    if (typeof selRow === "string") return runtimeError(selRow);

    const qtyRow = expectNumericArray(
      output.tierQuantities[s],
      kCount,
      { en: `tierQuantities[${s}]`, ja: `tierQuantities[${s}]`, zh: `tierQuantities[${s}]` },
      locale
    );
    if (typeof qtyRow === "string") return runtimeError(qtyRow);

    selRawMatrix.push(selRow);
    tierQtyClean.push(qtyRow);
  }

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const tierSelClean: number[][] = [];
  for (let s = 0; s < nSup; s++) {
    const kCount = input.suppliers[s].length;
    const selRow = selRawMatrix[s];
    const qtyRow = tierQtyClean[s];
    const cleanRow: number[] = [];
    let activeTiers = 0;
    for (let k = 0; k < kCount; k++) {
      const y = selRow[k];
      if (!checkIntegrality(y)) {
        return violation(formatTemplate(JMSG[locale].m3, { p0: s, p1: k, p2: roundNice(y) }));
      }
      const yInt = Math.round(y);
      if (yInt !== 0 && yInt !== 1) {
        return violation(formatTemplate(JMSG[locale].m3, { p0: s, p1: k, p2: yInt }));
      }
      cleanRow.push(yInt);
      activeTiers += yInt;

      const q = qtyRow[k];
      if (q < -1e-6) {
        return violation(formatTemplate(JMSG[locale].m4, { p0: s, p1: k, p2: roundNice(q) }));
      }
      const tier = input.suppliers[s][k];
      const minBound = tier.minQty * yInt;
      const maxBound = tier.maxQty * yInt;
      if (q < minBound - 1e-4 || q > maxBound + 1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m5, {
            p0: s,
            p1: k,
            p2: roundNice(q),
            p3: yInt,
            p4: minBound,
            p5: maxBound,
          })
        );
      }
    }

    if (activeTiers > 1) {
      return violation(formatTemplate(JMSG[locale].m6, { p0: s, p1: activeTiers }));
    }

    tierSelClean.push(cleanRow);
  }

  let totalQty = 0;
  let recomputed = 0;
  const supTotals: number[] = [];
  for (let s = 0; s < nSup; s++) {
    let sQty = 0;
    for (let k = 0; k < input.suppliers[s].length; k++) {
      const q = tierQtyClean[s][k];
      sQty += q;
      totalQty += q;
      recomputed += input.suppliers[s][k].unitPrice * q;
    }
    supTotals.push(roundNice(sQty));
  }

  if (totalQty < input.demand - 1e-4) {
    return violation(
      formatTemplate(JMSG[locale].m7, { p0: roundNice(totalQty), p1: input.demand })
    );
  }

  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m8, { p0: roundNice(costCheck), p1: roundNice(recomputed) })
    );
  }

  const preview = `supplierTotals=[${supTotals.join(", ")}] | bought=${roundNice(totalQty)}/${input.demand}`;

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
