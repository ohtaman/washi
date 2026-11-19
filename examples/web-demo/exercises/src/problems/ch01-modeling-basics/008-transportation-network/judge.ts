import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
  approxEqual,
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

export interface P008Input {
  supplies: number[];
  demands: number[];
  unitCosts: number[][];
}

export interface P008Output {
  shipments: number[][];
  totalCost: number;
}

export function judge(
  input: P008Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const nS = input.supplies.length;
  const nD = input.demands.length;

  if (!Array.isArray(output.shipments) || output.shipments.length !== nS) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: nS }));
  }

  const cleanMatrix: number[][] = [];
  for (let i = 0; i < nS; i++) {
    const row = expectNumericArray(
      output.shipments[i],
      nD,
      { en: `shipments[${i}]`, ja: `shipments[${i}]`, zh: `shipments[${i}]` },
      locale
    );
    if (typeof row === "string") return runtimeError(row);
    for (let j = 0; j < nD; j++) {
      if (row[j] < -1e-6) {
        return violation(
          formatTemplate(JMSG[locale].m2, { p0: i, p1: j, p2: roundNice(row[j]) })
        );
      }
    }
    cleanMatrix.push(row);
  }

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  for (let i = 0; i < nS; i++) {
    const rowSum = cleanMatrix[i].reduce((acc, v) => acc + v, 0);
    if (rowSum > input.supplies[i] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m3, {
          p0: i,
          p1: roundNice(rowSum),
          p2: input.supplies[i],
        })
      );
    }
  }

  for (let j = 0; j < nD; j++) {
    let colSum = 0;
    for (let i = 0; i < nS; i++) {
      colSum += cleanMatrix[i][j];
    }
    if (colSum < input.demands[j] - 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: j,
          p1: roundNice(colSum),
          p2: input.demands[j],
        })
      );
    }
  }

  let totalCost = 0;
  for (let i = 0; i < nS; i++) {
    for (let j = 0; j < nD; j++) {
      totalCost += input.unitCosts[i][j] * cleanMatrix[i][j];
    }
  }

  if (!approxEqual(costCheck, totalCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, { p0: roundNice(costCheck), p1: roundNice(totalCost) })
    );
  }

  const totalShipped = cleanMatrix.flat().reduce((acc, v) => acc + v, 0);
  const preview = `totalShipped=${roundNice(totalShipped)} | totalCost=${roundNice(totalCost)}`;

  if (totalCost > expectedOptimal + 1e-2) {
    return suboptimal(
      totalCost,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, { p0: roundNice(totalCost), p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: expectedOptimal }),
    preview
  );
}
