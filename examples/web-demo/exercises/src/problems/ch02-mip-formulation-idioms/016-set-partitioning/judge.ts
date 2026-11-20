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

export interface P016Input {
  numTasks: number;
  costs: number[];
  routes: number[][];
}

export interface P016Output {
  selected: number[];
  totalCost: number;
}

export function judge(
  input: P016Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const m = input.costs.length;
  const selRaw = expectNumericArray(
    output.selected,
    m,
    { en: "selected", ja: "selected", zh: "selected" },
    locale
  );
  if (typeof selRaw === "string") return runtimeError(selRaw);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const selClean: number[] = [];
  const counts = new Array<number>(input.numTasks).fill(0);
  let recomputed = 0;

  for (let j = 0; j < m; j++) {
    const s = selRaw[j];
    if (!checkIntegrality(s)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: j, p1: roundNice(s) }));
    }
    const sInt = Math.round(s);
    if (sInt !== 0 && sInt !== 1) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: j, p1: sInt }));
    }
    selClean.push(sInt);
    if (sInt === 1) {
      recomputed += input.costs[j];
      for (const task of input.routes[j]) {
        counts[task] += 1;
      }
    }
  }

  for (let i = 0; i < input.numTasks; i++) {
    if (counts[i] !== 1) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: counts[i] }));
    }
  }

  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m3, { p0: roundNice(costCheck), p1: roundNice(recomputed) })
    );
  }

  const preview = `selected=[${selClean.join(", ")}] | totalCost=${roundNice(recomputed)}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m4, { p0: roundNice(recomputed), p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m5, { p0: expectedOptimal }),
    preview
  );
}
