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

export interface P020Input {
  fixedCosts: number[];
  capacities: number[];
  demands: number[];
  unitCosts: number[][];
}

export interface P020Output {
  open: number[];
  shipments: number[][];
  totalCost: number;
}

export function judge(
  input: P020Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const nF = input.fixedCosts.length;
  const nD = input.demands.length;

  const openRaw = expectNumericArray(
    output.open,
    nF,
    { en: "open", ja: "open", zh: "open" },
    locale
  );
  if (typeof openRaw === "string") return runtimeError(openRaw);

  if (!Array.isArray(output.shipments) || output.shipments.length !== nF) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: nF }));
  }

  const shipMatrix: number[][] = [];
  for (let i = 0; i < nF; i++) {
    const row = expectNumericArray(
      output.shipments[i],
      nD,
      { en: `shipments[${i}]`, ja: `shipments[${i}]`, zh: `shipments[${i}]` },
      locale
    );
    if (typeof row === "string") return runtimeError(row);
    shipMatrix.push(row);
  }

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  for (let i = 0; i < nF; i++) {
    const row = shipMatrix[i];
    for (let j = 0; j < nD; j++) {
      if (row[j] < -1e-6) {
        return violation(
          formatTemplate(JMSG[locale].m3, { p0: i, p1: j, p2: roundNice(row[j]) })
        );
      }
    }
  }

  const openClean: number[] = [];
  let recomputed = 0;

  for (let i = 0; i < nF; i++) {
    const o = openRaw[i];
    if (!checkIntegrality(o)) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: roundNice(o) }));
    }
    const oInt = Math.round(o);
    if (oInt !== 0 && oInt !== 1) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: oInt }));
    }
    openClean.push(oInt);

    const outflow = shipMatrix[i].reduce((acc, v) => acc + v, 0);
    const maxCap = input.capacities[i] * oInt;
    if (outflow > maxCap + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: i,
          p1: roundNice(outflow),
          p2: maxCap,
          p3: oInt,
        })
      );
    }

    recomputed += input.fixedCosts[i] * oInt;
    for (let j = 0; j < nD; j++) {
      recomputed += input.unitCosts[i][j] * shipMatrix[i][j];
    }
  }

  for (let j = 0; j < nD; j++) {
    let colSum = 0;
    for (let i = 0; i < nF; i++) {
      colSum += shipMatrix[i][j];
    }
    if (colSum < input.demands[j] - 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: j,
          p1: roundNice(colSum),
          p2: input.demands[j],
        })
      );
    }
  }

  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m6, { p0: roundNice(costCheck), p1: roundNice(recomputed) })
    );
  }

  const preview = `open=[${openClean.join(", ")}] | totalCost=${roundNice(recomputed)}`;

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
