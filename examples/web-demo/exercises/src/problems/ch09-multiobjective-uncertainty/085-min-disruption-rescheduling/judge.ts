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

export interface P085Input {
  baseline: number[][];
  unavailable: number[][];
  demands: number[];
  maxShifts: number[];
  workerCosts: number[];
  disruptionWeight: number;
}

export interface P085Output {
  schedule: number[][];
  hammingDistance: number;
  totalObjective: number;
}

export function judge(
  input: P085Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const mWorkers = input.baseline.length;
  const nSlots = input.demands.length;

  if (!Array.isArray(output.schedule) || output.schedule.length !== mWorkers) {
    return runtimeError(formatTemplate(JMSG[locale].m1, { p0: mWorkers }));
  }

  const hamCheck = expectFiniteNumber(
    output.hammingDistance,
    { en: "hammingDistance", ja: "hammingDistance", zh: "hammingDistance" },
    locale
  );
  if (typeof hamCheck === "string") return runtimeError(hamCheck);

  const objCheck = expectFiniteNumber(
    output.totalObjective,
    { en: "totalObjective", ja: "totalObjective", zh: "totalObjective" },
    locale
  );
  if (typeof objCheck === "string") return runtimeError(objCheck);

  const scheduleRaw: number[][] = [];
  for (let i = 0; i < mWorkers; i++) {
    const rowRaw = expectNumericArray(
      output.schedule[i],
      nSlots,
      { en: `schedule[${i}]`, ja: `schedule[${i}]`, zh: `schedule[${i}]` },
      locale
    );
    if (typeof rowRaw === "string") return runtimeError(rowRaw);
    scheduleRaw.push(rowRaw);
  }

  const cleanSched: number[][] = [];
  const slotCounts = new Array<number>(nSlots).fill(0);
  let hamming = 0;
  let assignCost = 0;

  for (let i = 0; i < mWorkers; i++) {
    const rowRaw = scheduleRaw[i];
    const cleanRow: number[] = [];
    let workerShiftSum = 0;
    for (let t = 0; t < nSlots; t++) {
      const val = rowRaw[t];
      if (!checkIntegrality(val)) {
        return violation(
          formatTemplate(JMSG[locale].m2, { p0: i, p1: t, p2: roundNice(val) })
        );
      }
      const bit = Math.round(val);
      if (bit !== 0 && bit !== 1) {
        return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: t, p2: bit }));
      }
      if (input.unavailable[i][t] === 1 && bit === 1) {
        return violation(formatTemplate(JMSG[locale].m3, { p0: i, p1: t }));
      }
      cleanRow.push(bit);
      workerShiftSum += bit;
      slotCounts[t] += bit;
      if (bit !== input.baseline[i][t]) {
        hamming += 1;
      }
      assignCost += input.workerCosts[i] * bit;
    }

    if (workerShiftSum > input.maxShifts[i]) {
      return violation(
        formatTemplate(JMSG[locale].m4, {
          p0: i,
          p1: workerShiftSum,
          p2: input.maxShifts[i],
        })
      );
    }
    cleanSched.push(cleanRow);
  }

  for (let t = 0; t < nSlots; t++) {
    if (slotCounts[t] !== input.demands[t]) {
      return violation(
        formatTemplate(JMSG[locale].m5, {
          p0: t,
          p1: slotCounts[t],
          p2: input.demands[t],
        })
      );
    }
  }

  if (!approxEqual(hamCheck, hamming, 1e-4)) {
    return violation(
      formatTemplate(JMSG[locale].m6, {
        p0: roundNice(hamCheck),
        p1: hamming,
      })
    );
  }

  const totalObj = input.disruptionWeight * hamming + assignCost;
  if (!approxEqual(objCheck, totalObj, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m7, {
        p0: roundNice(objCheck),
        p1: roundNice(totalObj),
      })
    );
  }

  const preview = `hamming=${hamming} | assignCost=${roundNice(assignCost)} | totalObj=${roundNice(totalObj)}`;

  if (totalObj > expectedOptimal + 1e-2) {
    return suboptimal(
      totalObj,
      expectedOptimal,
      formatTemplate(JMSG[locale].m8, {
        p0: roundNice(totalObj),
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
