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

export interface P028Input {
  costs: number[];
  yields: number[][];
  minRequirements: number[];
}

export interface P028Output {
  quantities: number[];
  reducedCosts: number[];
  optimalCost: number;
}

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const k = rhs.length;
  if (k === 0) return [];
  const aug = matrix.map((row, r) => [...row, rhs[r]]);

  for (let col = 0; col < k; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let r = col + 1; r < k; r++) {
      const val = Math.abs(aug[r][col]);
      if (val > maxVal) {
        maxVal = val;
        pivotRow = r;
      }
    }
    if (maxVal < 1e-10) return null;
    if (pivotRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[pivotRow];
      aug[pivotRow] = tmp;
    }
    const pivot = aug[col][col];
    for (let r = col + 1; r < k; r++) {
      const factor = aug[r][col] / pivot;
      for (let c = col; c <= k; c++) {
        aug[r][c] -= factor * aug[col][c];
      }
    }
  }

  const sol = new Array<number>(k).fill(0);
  for (let r = k - 1; r >= 0; r--) {
    let sum = aug[r][k];
    for (let c = r + 1; c < k; c++) {
      sum -= aug[r][c] * sol[c];
    }
    sol[r] = sum / aug[r][r];
  }
  return sol;
}

export function judge(
  input: P028Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.costs.length;
  const m = input.minRequirements.length;

  const quantities = expectNumericArray(
    output.quantities,
    n,
    { en: "quantities", ja: "quantities", zh: "quantities" },
    locale
  );
  if (typeof quantities === "string") return runtimeError(quantities);

  const reducedCosts = expectNumericArray(
    output.reducedCosts,
    n,
    { en: "reducedCosts", ja: "reducedCosts", zh: "reducedCosts" },
    locale
  );
  if (typeof reducedCosts === "string") return runtimeError(reducedCosts);

  const costCheck = expectFiniteNumber(
    output.optimalCost,
    { en: "optimalCost", ja: "optimalCost", zh: "optimalCost" },
    locale
  );
  if (typeof costCheck === "string") return runtimeError(costCheck);

  let trueCost = 0;
  for (let j = 0; j < n; j++) {
    if (quantities[j] < -1e-6) {
      return violation(
        formatTemplate(JMSG[locale].m1, { p0: j, p1: roundNice(quantities[j]) })
      );
    }
    trueCost += input.costs[j] * quantities[j];
  }

  const activeRows: number[] = [];
  for (let k = 0; k < m; k++) {
    let lhs = 0;
    for (let j = 0; j < n; j++) {
      lhs += input.yields[k][j] * quantities[j];
    }
    if (lhs < input.minRequirements[k] - 1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m2, {
          p0: k,
          p1: roundNice(lhs),
          p2: input.minRequirements[k],
        })
      );
    }
    if (Math.abs(lhs - input.minRequirements[k]) <= 1e-3) {
      activeRows.push(k);
    }
  }

  if (!approxEqual(costCheck, trueCost, 1e-2)) {
    return violation(
      formatTemplate(JMSG[locale].m3, {
        p0: roundNice(costCheck),
        p1: roundNice(trueCost),
      })
    );
  }

  if (trueCost > expectedOptimal + 1e-2) {
    return suboptimal(
      trueCost,
      expectedOptimal,
      formatTemplate(JMSG[locale].m4, {
        p0: roundNice(trueCost),
        p1: roundNice(expectedOptimal),
      })
    );
  }

  const basicCols: number[] = [];
  for (let j = 0; j < n; j++) {
    if (reducedCosts[j] < -1e-4) {
      return violation(
        formatTemplate(JMSG[locale].m5, { p0: j, p1: roundNice(reducedCosts[j]) })
      );
    }
    if (quantities[j] > 1e-4) {
      basicCols.push(j);
      if (Math.abs(reducedCosts[j]) > 1e-4) {
        return violation(
          formatTemplate(JMSG[locale].m6, {
            p0: j,
            p1: roundNice(quantities[j]),
            p2: roundNice(reducedCosts[j]),
          })
        );
      }
    }
  }

  if (activeRows.length !== basicCols.length) {
    return violation(
      formatTemplate(JMSG[locale].m7, {
        p0: activeRows.length,
        p1: basicCols.length,
      })
    );
  }

  // Solve A_{act, B}^T * pi = c_B to recover unique duals at the optimal basis
  const basisT = basicCols.map((j) => activeRows.map((k) => input.yields[k][j]));
  const rhsB = basicCols.map((j) => input.costs[j]);
  const pi = solveLinearSystem(basisT, rhsB);
  if (!pi || pi.some((v) => v < -1e-4)) {
    return violation(JMSG[locale].m8);
  }

  for (let j = 0; j < n; j++) {
    let expectedRc = input.costs[j];
    for (let r = 0; r < activeRows.length; r++) {
      expectedRc -= input.yields[activeRows[r]][j] * pi[r];
    }
    if (!approxEqual(reducedCosts[j], expectedRc, 1e-4)) {
      return violation(
        formatTemplate(JMSG[locale].m9, {
          p0: j,
          p1: roundNice(reducedCosts[j]),
          p2: roundNice(expectedRc),
        })
      );
    }
  }

  const preview = `x=[${quantities.map((v) => roundNice(v, 2)).join(", ")}] | rc=[${reducedCosts.map((v) => roundNice(v, 3)).join(", ")}]`;

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m10, { p0: roundNice(expectedOptimal) }),
    preview
  );
}
