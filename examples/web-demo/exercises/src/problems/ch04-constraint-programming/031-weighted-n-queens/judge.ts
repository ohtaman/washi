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

export interface P031Input {
  costMatrix: number[][];
}

export interface P031Output {
  cols: number[];
  totalCost: number;
}

export function judge(
  input: P031Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.costMatrix.length;
  const colsRaw = expectNumericArray(
    output.cols,
    n,
    { en: "cols", ja: "cols", zh: "cols" },
    locale
  );
  if (typeof colsRaw === "string") return runtimeError(colsRaw);

  const costCheck = expectFiniteNumber(
    output.totalCost,
    { en: "totalCost", ja: "totalCost", zh: "totalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  const usedCols = new Set<number>();
  const usedDiagPos = new Set<number>();
  const usedDiagNeg = new Set<number>();
  const clean: number[] = [];
  let recomputed = 0;

  for (let r = 0; r < n; r++) {
    const raw = colsRaw[r];
    if (!checkIntegrality(raw)) {
      return violation(formatTemplate(JMSG[locale].m1, { p0: r, p1: roundNice(raw) }));
    }
    const c = Math.round(raw);
    if (c < 0 || c >= n) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: r, p1: n - 1, p2: c }));
    }
    if (usedCols.has(c)) {
      return violation(formatTemplate(JMSG[locale].m3, { p0: c }));
    }
    if (usedDiagPos.has(c + r) || usedDiagNeg.has(c - r)) {
      return violation(formatTemplate(JMSG[locale].m4, { p0: r, p1: c }));
    }
    usedCols.add(c);
    usedDiagPos.add(c + r);
    usedDiagNeg.add(c - r);
    clean.push(c);
    recomputed += input.costMatrix[r][c];
  }

  if (!approxEqual(costCheck, recomputed, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m5, { p0: roundNice(costCheck), p1: recomputed })
    );
  }

  const preview = `cols=[${clean.join(", ")}] | totalCost=${recomputed}`;

  if (recomputed > expectedOptimal + 1e-2) {
    return suboptimal(
      recomputed,
      expectedOptimal,
      formatTemplate(JMSG[locale].m6, { p0: recomputed, p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m7, { p0: expectedOptimal }),
    preview
  );
}
