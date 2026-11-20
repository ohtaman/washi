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

export interface P012Input {
  supplies: number[];
  demands: number[];
  fixedCosts: number[][];
  unitCosts: number[][];
  capacities: number[][];
}

export interface P012Output {
  open: number[][];
  shipments: number[][];
  totalCost: number;
}

export function judge(
  input: P012Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const nS = input.supplies.length;
  const nD = input.demands.length;

  if (!Array.isArray(output.open) || output.open.length !== nS) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: nS }));
  }
  if (!Array.isArray(output.shipments) || output.shipments.length !== nS) {
    return runtimeError(formatTemplate(JMSG[locale].m2, { p0: nS }));
  }

  const openRawMatrix: number[][] = [];
  const shipMatrix: number[][] = [];

  for (let i = 0; i < nS; i++) {
    const openRow = expectNumericArray(
      output.open[i],
      nD,
      { en: `open[${i}]`, ja: `open[${i}]`, zh: `open[${i}]` },
      locale
    );
    if (typeof openRow === "string") return runtimeError(openRow);

    const shipRow = expectNumericArray(
      output.shipments[i],
      nD,
      { en: `shipments[${i}]`, ja: `shipments[${i}]`, zh: `shipments[${i}]` },
      locale
    );
    if (typeof shipRow === "string") return runtimeError(shipRow);

    openRawMatrix.push(openRow);
    shipMatrix.push(shipRow);
  }

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const openMatrix: number[][] = [];
  for (let i = 0; i < nS; i++) {
    const openRow = openRawMatrix[i];
    const shipRow = shipMatrix[i];
    const openCleanRow: number[] = [];
    for (let j = 0; j < nD; j++) {
      const o = openRow[j];
      if (!checkIntegrality(o)) {
        return violation(formatTemplate(JMSG[locale].m3, { p0: i, p1: j, p2: roundNice(o) }));
      }
      const oInt = Math.round(o);
      if (oInt !== 0 && oInt !== 1) {
        return violation(formatTemplate(JMSG[locale].m3, { p0: i, p1: j, p2: oInt }));
      }
      openCleanRow.push(oInt);

      const q = shipRow[j];
      if (q < -1e-6) {
        return violation(formatTemplate(JMSG[locale].m4, { p0: i, p1: j, p2: roundNice(q) }));
      }
      const maxCap = input.capacities[i][j] * oInt;
      if (q > maxCap + 1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m5, {
            p0: i,
            p1: j,
            p2: roundNice(q),
            p3: maxCap,
            p4: oInt,
          })
        );
      }
    }
    openMatrix.push(openCleanRow);
  }

  for (let i = 0; i < nS; i++) {
    const rowSum = shipMatrix[i].reduce((acc, v) => acc + v, 0);
    if (rowSum > input.supplies[i] + 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m6, {
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
      colSum += shipMatrix[i][j];
    }
    if (colSum < input.demands[j] - 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m7, {
          p0: j,
          p1: roundNice(colSum),
          p2: input.demands[j],
        })
      );
    }
  }

  let recomputed = 0;
  let lanesOpened = 0;
  for (let i = 0; i < nS; i++) {
    for (let j = 0; j < nD; j++) {
      lanesOpened += openMatrix[i][j];
      recomputed +=
        input.fixedCosts[i][j] * openMatrix[i][j] +
        input.unitCosts[i][j] * shipMatrix[i][j];
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

  const preview = `lanesOpen=${lanesOpened}/${nS * nD} | totalCost=${roundNice(recomputed)}`;

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
