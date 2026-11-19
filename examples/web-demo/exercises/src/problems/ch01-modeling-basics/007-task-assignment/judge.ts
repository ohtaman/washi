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
  suboptimal,
  violation,
} from "../../judge-helpers.js";
import enLoc from "./locales/en.json";
import jaLoc from "./locales/ja.json";
import zhLoc from "./locales/zh.json";

const JMSG = { en: enLoc.judge, ja: jaLoc.judge, zh: zhLoc.judge };

export interface P007Input {
  costs: number[][];
}

export interface P007Output {
  assignment: number[];
  totalCost: number;
}

export function judge(
  input: P007Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return violation(JMSG[locale].m0);
  }

  const n = input.costs.length;
  const assignment = expectNumericArray(
    output.assignment,
    n,
    { en: "assignment", ja: "assignment", zh: "assignment" },
    locale
  );
  if (typeof assignment === "string") return violation(assignment);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return violation(costCheck);

  const usedTasks = new Set<number>();
  const cleanAssign: number[] = [];
  let costSum = 0;

  for (let i = 0; i < n; i++) {
    const raw = assignment[i];
    if (!checkIntegrality(raw)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: i, p1: roundNice(raw) }));
    }
    const j = Math.round(raw);
    if (j < 0 || j >= n) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: j, p2: n - 1 }));
    }
    if (usedTasks.has(j)) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: j }));
    }
    usedTasks.add(j);
    cleanAssign.push(j);
    costSum += input.costs[i][j];
  }

  if (!approxEqual(costCheck, costSum, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m4, { p0: roundNice(costCheck), p1: costSum })
    );
  }

  const preview = `assignment=[${cleanAssign.join(", ")}] | totalCost=${costSum}`;

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
