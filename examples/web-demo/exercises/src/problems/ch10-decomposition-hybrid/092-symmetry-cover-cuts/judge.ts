import type { JudgeResult, Locale } from "../../../types.js";
import {
  accepted,
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

export interface P092Input {
  weights: number[];
  binCapacity: number;
}

export interface P092Output {
  assignments: number[];
  binsUsed: number;
  lpBound: number;
}

function buildExtendedCovers(
  weights: number[],
  binCapacity: number
): Array<{ items: number[]; rhsMult: number }> {
  const cuts: Array<{ items: number[]; rhsMult: number }> = [];
  const seen = new Set<string>();

  function dfs(
    start: number,
    cur: number[],
    sumW: number,
    minW: number,
    maxW: number
  ): void {
    if (sumW > binCapacity) {
      if (sumW - minW <= binCapacity) {
        const ext: number[] = [];
        for (let j = 0; j < weights.length; j++) {
          if (cur.includes(j) || weights[j] >= maxW) {
            ext.push(j);
          }
        }
        const key = `${ext.join(",")}|${cur.length - 1}`;
        if (!seen.has(key)) {
          seen.add(key);
          cuts.push({ items: ext, rhsMult: cur.length - 1 });
        }
      }
      return;
    }
    for (let nxt = start; nxt < weights.length; nxt++) {
      cur.push(nxt);
      dfs(
        nxt + 1,
        cur,
        sumW + weights[nxt],
        Math.min(minW, weights[nxt]),
        Math.max(maxW, weights[nxt])
      );
      cur.pop();
    }
  }

  dfs(0, [], 0, Infinity, 0);
  return cuts;
}

type LpSense = "<=" | "=" | ">=";

interface LinearRow {
  coeffs: Array<[number, number]>;
  sense: LpSense;
  rhs: number;
}

/**
 * Solve min sum(c_j * x_j) subject to x >= 0 and linear rows via Two-Phase Tableau Simplex
 * with Bland's anti-cycling rule.
 */
function solveLpMinSimplex(numVars: number, objCoeffs: number[], rawRows: LinearRow[]): number {
  const EPS = 1e-9;
  const rows = rawRows.map((r) => {
    if (r.rhs >= 0) {
      return { coeffs: r.coeffs, sense: r.sense, rhs: r.rhs };
    }
    const flippedSense: LpSense = r.sense === "<=" ? ">=" : r.sense === ">=" ? "<=" : "=";
    return {
      coeffs: r.coeffs.map(([c, v]) => [c, -v] as [number, number]),
      sense: flippedSense,
      rhs: -r.rhs,
    };
  });

  const m = rows.length;
  let totalCols = numVars;
  const slackCols: number[] = [];
  const artCols: number[] = [];
  const artSet = new Set<number>();

  for (let i = 0; i < m; i++) {
    if (rows[i].sense === "<=") {
      slackCols.push(totalCols++);
    } else if (rows[i].sense === ">=") {
      slackCols.push(totalCols++);
      const a = totalCols++;
      artCols.push(a);
      artSet.add(a);
    } else {
      slackCols.push(-1);
      const a = totalCols++;
      artCols.push(a);
      artSet.add(a);
    }
  }

  // Last row (index m) is the reduced-cost + negative-objective row: rc_j and (-obj)
  const T: Float64Array[] = Array.from({ length: m + 1 }, () => new Float64Array(totalCols + 1));
  const basis = new Int32Array(m);
  let artCursor = 0;

  for (let i = 0; i < m; i++) {
    for (const [col, val] of rows[i].coeffs) {
      T[i][col] += val;
    }
    T[i][totalCols] = rows[i].rhs;
    if (rows[i].sense === "<=") {
      T[i][slackCols[i]] = 1;
      basis[i] = slackCols[i];
    } else if (rows[i].sense === ">=") {
      T[i][slackCols[i]] = -1;
      const a = artCols[artCursor++];
      T[i][a] = 1;
      basis[i] = a;
    } else {
      const a = artCols[artCursor++];
      T[i][a] = 1;
      basis[i] = a;
    }
  }

  function pivot(pRow: number, pCol: number, activeCols: number): void {
    const piv = T[pRow][pCol];
    const rowP = T[pRow];
    for (let j = 0; j < activeCols; j++) rowP[j] /= piv;
    rowP[totalCols] /= piv;
    for (let r = 0; r <= m; r++) {
      if (r === pRow) continue;
      const factor = T[r][pCol];
      if (Math.abs(factor) <= 1e-13) continue;
      const rowR = T[r];
      for (let j = 0; j < activeCols; j++) {
        rowR[j] -= factor * rowP[j];
      }
      rowR[totalCols] -= factor * rowP[totalCols];
      rowR[pCol] = 0;
    }
    rowP[pCol] = 1;
    basis[pRow] = pCol;
  }

  function runSimplex(activeCols: number, forbidden?: Set<number>): void {
    const objRow = T[m];
    for (let iter = 0; iter < 50000; iter++) {
      let enterCol = -1;
      for (let j = 0; j < activeCols; j++) {
        if (forbidden?.has(j)) continue;
        if (objRow[j] < -EPS) {
          enterCol = j;
          break;
        }
      }
      if (enterCol === -1) break;

      let leaveRow = -1;
      let minRatio = Infinity;
      let leaveVar = Infinity;
      for (let i = 0; i < m; i++) {
        const aij = T[i][enterCol];
        if (aij > EPS) {
          const ratio = Math.max(0, T[i][totalCols]) / aij;
          if (
            ratio < minRatio - 1e-12 ||
            (Math.abs(ratio - minRatio) <= 1e-12 && basis[i] < leaveVar)
          ) {
            minRatio = ratio;
            leaveRow = i;
            leaveVar = basis[i];
          }
        }
      }
      if (leaveRow === -1) {
        throw new Error("Unbounded LP encountered in judge solver");
      }
      pivot(leaveRow, enterCol, activeCols);
    }
  }

  // Phase I: minimize sum of artificial variables
  if (artCols.length > 0) {
    const objRow = T[m];
    for (const a of artCols) objRow[a] = 1;
    for (let i = 0; i < m; i++) {
      if (artSet.has(basis[i])) {
        const rowI = T[i];
        for (let j = 0; j < totalCols; j++) objRow[j] -= rowI[j];
        objRow[totalCols] -= rowI[totalCols];
      }
    }
    runSimplex(totalCols);
    const phase1Obj = -T[m][totalCols];
    if (phase1Obj > 1e-5) {
      throw new Error(`Infeasible LP relaxation in judge solver (phase1Obj=${phase1Obj})`);
    }
    // Drive any degenerate basic artificial variable out of the basis
    for (let i = 0; i < m; i++) {
      if (artSet.has(basis[i])) {
        for (let j = 0; j < totalCols; j++) {
          if (!artSet.has(j) && Math.abs(T[i][j]) > EPS) {
            pivot(i, j, totalCols);
            break;
          }
        }
      }
    }
  }

  // Phase II: minimize c^T x excluding artificial columns
  const objRow = T[m];
  objRow.fill(0);
  for (let j = 0; j < numVars; j++) {
    objRow[j] = objCoeffs[j];
  }
  for (let i = 0; i < m; i++) {
    const b = basis[i];
    if (artSet.has(b)) continue;
    const cb = objRow[b];
    if (Math.abs(cb) > 1e-13) {
      const rowI = T[i];
      for (let j = 0; j < totalCols; j++) {
        if (!artSet.has(j)) objRow[j] -= cb * rowI[j];
      }
      objRow[totalCols] -= cb * rowI[totalCols];
      objRow[b] = 0;
    }
  }
  runSimplex(totalCols, artSet);
  return -T[m][totalCols];
}

function solveStrengthenedLpBound(weights: number[], binCapacity: number): number {
  const n = weights.length;
  if (n === 0) return 0;

  // Variables: y[0..n-1] (indices 0..n-1), and x[i][k] for 0 <= k <= i < n
  let nextVar = n;
  const xVarIdx: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: i + 1 }, () => nextVar++)
  );

  const objCoeffs = new Array<number>(nextVar).fill(0);
  for (let k = 0; k < n; k++) objCoeffs[k] = 1;

  const rows: LinearRow[] = [];

  // sum_{k=0..i} x[i][k] == 1
  for (let i = 0; i < n; i++) {
    const coeffs: Array<[number, number]> = [];
    for (let k = 0; k <= i; k++) coeffs.push([xVarIdx[i][k], 1]);
    rows.push({ coeffs, sense: "=", rhs: 1 });
  }

  // y[k] <= 1 and y[k+1] - y[k] <= 0
  for (let k = 0; k < n; k++) {
    rows.push({ coeffs: [[k, 1]], sense: "<=", rhs: 1 });
    if (k < n - 1) {
      rows.push({
        coeffs: [
          [k + 1, 1],
          [k, -1],
        ],
        sense: "<=",
        rhs: 0,
      });
    }
  }

  // Bin capacity: sum_{i >= k} w_i * x[i][k] - B * y[k] <= 0
  for (let k = 0; k < n; k++) {
    const coeffs: Array<[number, number]> = [[k, -binCapacity]];
    for (let i = k; i < n; i++) coeffs.push([xVarIdx[i][k], weights[i]]);
    rows.push({ coeffs, sense: "<=", rhs: 0 });
  }

  // Global rounded capacity cut: sum_k y[k] >= ceil(sum(w) / B)
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  rows.push({
    coeffs: Array.from({ length: n }, (_, k) => [k, 1] as [number, number]),
    sense: ">=",
    rhs: Math.ceil(totalWeight / binCapacity),
  });

  // Extended minimal cover cuts: sum_{i in E(C), i >= k} x[i][k] - (|C| - 1) * y[k] <= 0
  const covers = buildExtendedCovers(weights, binCapacity);
  for (const cut of covers) {
    for (let k = 0; k < n; k++) {
      const coeffs: Array<[number, number]> = [[k, -cut.rhsMult]];
      let hasItem = false;
      for (const i of cut.items) {
        if (i >= k) {
          coeffs.push([xVarIdx[i][k], 1]);
          hasItem = true;
        }
      }
      if (hasItem) {
        rows.push({ coeffs, sense: "<=", rhs: 0 });
      }
    }
  }

  return solveLpMinSimplex(nextVar, objCoeffs, rows);
}

export function judge(
  input: P092Input,
  output: unknown,
  expectedOptimal: number,
  locale: Locale
): JudgeResult {
  if (!isRecord(output)) {
    return runtimeError(JMSG[locale].m0);
  }

  const n = input.weights.length;
  const assignRaw = expectNumericArray(
    output.assignments,
    n,
    { en: "assignments", ja: "assignments", zh: "assignments" },
    locale
  );
  if (typeof assignRaw === "string") return runtimeError(assignRaw);

  const binsUsedCheck = expectFiniteNumber(
    output.binsUsed,
    { en: "binsUsed", ja: "binsUsed", zh: "binsUsed" },
    locale
  );
  if (typeof binsUsedCheck === "string") return runtimeError(binsUsedCheck);

  const lpBoundCheck = expectFiniteNumber(
    output.lpBound,
    { en: "lpBound", ja: "lpBound", zh: "lpBound" },
    locale
  );
  if (typeof lpBoundCheck === "string") return runtimeError(lpBoundCheck);

  if (!checkIntegrality(binsUsedCheck)) {
    return violation(formatTemplate(JMSG[locale].m1, { p0: roundNice(binsUsedCheck) }));
  }
  const binsUsedInt = Math.round(binsUsedCheck);

  const binLoads = Array(n).fill(0);
  const binCounts = Array(n).fill(0);
  const cleanAssignments: number[] = [];

  for (let i = 0; i < n; i++) {
    const a = assignRaw[i];
    if (!checkIntegrality(a)) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: roundNice(a), p2: n - 1 }));
    }
    const k = Math.round(a);
    if (k < 0 || k >= n) {
      return violation(formatTemplate(JMSG[locale].m2, { p0: i, p1: k, p2: n - 1 }));
    }
    if (k > i) {
      return violation(formatTemplate(JMSG[locale].m11, { p0: i, p1: k }));
    }
    cleanAssignments.push(k);
    binLoads[k] += input.weights[i];
    binCounts[k] += 1;
  }

  if (n > 0 && cleanAssignments[0] !== 0) {
    return violation(formatTemplate(JMSG[locale].m3, { p0: cleanAssignments[0] }));
  }

  const actualUsed = binCounts.filter((c) => c > 0).length;
  for (let k = 0; k < actualUsed; k++) {
    if (binCounts[k] === 0) {
      return violation(formatTemplate(JMSG[locale].m4, { p0: k }));
    }
  }

  if (binsUsedInt !== actualUsed) {
    return violation(
      formatTemplate(JMSG[locale].m5, { p0: binsUsedInt, p1: actualUsed })
    );
  }

  for (let k = 0; k < n; k++) {
    if (binLoads[k] > input.binCapacity + 1e-6) {
      return violation(
        formatTemplate(JMSG[locale].m6, {
          p0: k,
          p1: roundNice(binLoads[k]),
          p2: input.binCapacity,
        })
      );
    }
  }

  const expectedLpBound = solveStrengthenedLpBound(input.weights, input.binCapacity);
  if (lpBoundCheck < expectedLpBound - 1e-2) {
    return violation(
      formatTemplate(JMSG[locale].m7, {
        p0: roundNice(lpBoundCheck),
        p1: roundNice(expectedLpBound),
      })
    );
  }
  if (lpBoundCheck > expectedLpBound + 1e-2) {
    return violation(
      formatTemplate(JMSG[locale].m8, {
        p0: roundNice(lpBoundCheck),
        p1: roundNice(expectedLpBound),
      })
    );
  }

  const preview = `assignments=[${cleanAssignments.join(", ")}] | bins=${binsUsedInt} | lpBound=${roundNice(lpBoundCheck)}`;

  if (binsUsedInt > expectedOptimal + 1e-2) {
    return suboptimal(
      binsUsedInt,
      expectedOptimal,
      formatTemplate(JMSG[locale].m9, { p0: binsUsedInt, p1: expectedOptimal }),
      preview
    );
  }

  return accepted(
    expectedOptimal,
    formatTemplate(JMSG[locale].m10, {
      p0: expectedOptimal,
      p1: roundNice(lpBoundCheck),
    }),
    preview
  );
}
