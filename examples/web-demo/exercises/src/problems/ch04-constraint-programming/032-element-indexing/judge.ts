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

export interface P032Input {
  costs: number[][];
}

export interface P032Output {
  assignment: number[];
  totalCost: number;
}

export function judge(
  input: P032Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.costs.length;
  const numMachines = input.costs[0]?.length ?? 0;

  const assignRaw = expectNumericArray(
    output.assignment,
    n,
    { en: "assignment", ja: "assignment", zh: "assignment" },
    locale
  );
  if (typeof assignRaw === "string") return runtimeError(assignRaw);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const usedMachines = new Set<number>();
  const clean: number[] = [];
  let costSum = 0;

  for (let i = 0; i < n; i++) {
    const raw = assignRaw[i];
    if (!checkIntegrality(raw)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(raw) }));
    }
    const mach = Math.round(raw);
    if (mach < 0 || mach >= numMachines) {
      return violation(
        formatTemplate(JMSG[locale].m2, { p0: i, p1: mach, p2: numMachines - 1 })
      );
    }
    if (usedMachines.has(mach)) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: mach }));
    }
    usedMachines.add(mach);
    clean.push(mach);
    costSum += input.costs[i][mach];
  }

  if (!approxEqual(costCheck, costSum, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m4, { p0: roundNice(costCheck), p1: costSum })
    );
  }

  const preview = `assignment=[${clean.join(", ")}] | totalCost=${costSum}`;

  if (costSum > expectedOptimal + 1e-2) {
    return suboptimal(
      costSum,
      expectedOptimal,
      formatTemplate(JMSG[locale].m5, { p0: costSum, p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m6, { p0: expectedOptimal }),
    preview
  );
}
