import { HiGHS, Model, minimize, sum } from "../../../../src/index.js";
import type {
  FrontierPoint,
  FundTrackResult,
  MarketSimulationInput,
  MarketSimulationResult,
  PortfolioMetrics,
  QuantOptimalResult,
  QuarterRegime,
  TriggeredShock,
} from "./types.js";

/**
 * Standard normal cumulative distribution function Phi(z).
 * Uses Abramowitz & Stegun 7.1.26 rational approximation (max error < 1.5e-7).
 */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) {
    return z < 0 ? 0 : 1;
  }
  if (z < -8) return 0;
  if (z > 8) return 1;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  const erf = sign * (1 - poly * Math.exp(-x * x));
  return 0.5 * (1 + erf);
}

export function normalizeWeights(rawWeights: number[], maxCap = 1.0): number[] {
  const n = rawWeights.length;
  if (n === 0) return [];
  const clamped = rawWeights.map((w) => Math.max(0, Number.isFinite(w) ? w : 0));
  const total = clamped.reduce((a, b) => a + b, 0);
  if (total <= 1e-9) {
    return new Array<number>(n).fill(1 / n);
  }
  const normalized = clamped.map((w) => w / total);
  if (maxCap >= 1 - 1e-6) {
    return normalized;
  }

  // Iterative water-filling projection onto { sum w_i = 1, 0 <= w_i <= maxCap }
  const effectiveCap = Math.max(1 / n, maxCap);
  const w = normalized.slice();
  const locked = new Array<boolean>(n).fill(false);
  for (let iter = 0; iter < n; iter++) {
    let excess = 0;
    let freeSum = 0;
    let freeCount = 0;
    for (let i = 0; i < n; i++) {
      if (locked[i]) continue;
      if (w[i] > effectiveCap + 1e-9) {
        excess += w[i] - effectiveCap;
        w[i] = effectiveCap;
        locked[i] = true;
      } else {
        freeSum += w[i];
        freeCount++;
      }
    }
    if (excess <= 1e-9 || freeCount === 0) break;
    for (let i = 0; i < n; i++) {
      if (!locked[i]) {
        w[i] += freeSum > 1e-9 ? excess * (w[i] / freeSum) : excess / freeCount;
      }
    }
  }
  return w;
}

/**
 * Converts a weight vector into integer percentages (0..100) that sum to exactly 100
 * while respecting the per-asset cap, using the Largest Remainder (Hamilton) method.
 */
export function roundWeightsToHundred(rawWeights: number[], maxCap = 1.0): number[] {
  const n = rawWeights.length;
  if (n === 0) return [];
  const continuous = normalizeWeights(rawWeights, maxCap);
  const capPct = Math.max(Math.ceil(100 / n), Math.round(maxCap * 100));

  const scaled = continuous.map((w) => Math.min(capPct, Math.max(0, w * 100)));
  const floors = scaled.map((v) => Math.floor(v));
  let remainder = 100 - floors.reduce((a, b) => a + b, 0);

  const order = scaled
    .map((v, idx) => ({ idx, frac: v - floors[idx] }))
    .sort((a, b) => b.frac - a.frac || a.idx - b.idx);

  for (const item of order) {
    if (remainder <= 0) break;
    if (floors[item.idx] < capPct) {
      floors[item.idx] += 1;
      remainder -= 1;
    }
  }

  // In case cap clamping left any residual points, distribute across any non-capped slots
  while (remainder > 0) {
    let progressed = false;
    for (let i = 0; i < n && remainder > 0; i++) {
      if (floors[i] < capPct) {
        floors[i] += 1;
        remainder -= 1;
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  return floors;
}

/**
 * Quantizes portfolio weights to 1% increments (0.01 steps) summing to 1.00 so that
 * UI slider percentages and evaluated portfolio weights match 1-to-1.
 */
export function quantizeWeightsToPercent(rawWeights: number[], maxCap = 1.0): number[] {
  return roundWeightsToHundred(rawWeights, maxCap).map((pct) => pct / 100);
}

export function computePortfolioMetrics(
  regime: QuarterRegime,
  weights: number[]
): PortfolioMetrics {
  const n = regime.assets.length;
  let expectedReturn = 0;
  let variance = 0;
  let maxAssetWeight = 0;
  let weightSum = 0;

  for (let i = 0; i < n; i++) {
    const wi = weights[i] ?? 0;
    weightSum += wi;
    if (wi > maxAssetWeight) maxAssetWeight = wi;
    expectedReturn += wi * regime.assets[i].expectedReturn;
    for (let j = 0; j < n; j++) {
      const wj = weights[j] ?? 0;
      variance += wi * wj * regime.covariance[i][j];
    }
  }

  variance = Math.max(1e-8, variance);
  const volatility = Math.sqrt(variance);
  const safetyFirstRatio = (expectedReturn - regime.liquidationFloor) / volatility;
  const ruinProbability = normalCdf(-safetyFirstRatio);
  const riskFreeRate = 0.03;
  const sharpeRatio = (expectedReturn - riskFreeRate) / volatility;

  return {
    expectedReturn,
    variance,
    volatility,
    safetyFirstRatio,
    ruinProbability,
    sharpeRatio,
    maxAssetWeight,
    isNormalized: Math.abs(weightSum - 1.0) <= 1e-3,
    isWithinCap: maxAssetWeight <= regime.maxWeightPerAsset + 1e-3,
  };
}

/**
 * Cholesky decomposition L of a symmetric positive-definite matrix Sigma (Sigma = L * L^T).
 */
export function choleskyDecompose(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let k = 0; k < j; k++) {
        s += L[i][k] * L[j][k];
      }
      if (i === j) {
        const diag = matrix[i][i] - s;
        L[i][j] = Math.sqrt(Math.max(1e-9, diag));
      } else {
        L[i][j] = (matrix[i][j] - s) / L[j][j];
      }
    }
  }
  return L;
}

/**
 * Solves the Markowitz Minimum-Variance Convex Quadratic Program (QP) via WaSHI + HiGHS:
 *   minimize   w^T Sigma w - 1e-4 * mu^T w
 *   subject to sum_i w_i == 1
 *              sum_i mu_i * w_i >= targetReturn
 *              0 <= w_i <= maxWeightPerAsset
 */
export async function solveQuantOptimalPortfolio(
  regime: QuarterRegime,
  customTargetReturn?: number
): Promise<QuantOptimalResult> {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const n = regime.assets.length;
  const target = customTargetReturn ?? regime.targetReturn;

  const model = new Model(`QuantQP_Q${regime.quarter}`);
  const wVars = regime.assets.map((_, i) =>
    model.continuous(`w_${i}`, { lb: 0, ub: regime.maxWeightPerAsset })
  );

  // Full investment constraint: sum(w_i) == 1
  model.constraint(sum(wVars).eq(1), "full_investment");

  // Target expected return constraint: sum(mu_i * w_i) >= target
  const returnTerms = wVars.map((v, i) => v.mul(regime.assets[i].expectedReturn));
  model.constraint(sum(returnTerms).ge(target), "target_return");

  // Convex quadratic objective: w^T Sigma w - 1e-4 * mu^T w
  let quadObj = wVars[0].mul(wVars[0]).mul(regime.covariance[0][0]);
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      if (i === 0 && j === 0) continue;
      const coeff = i === j ? regime.covariance[i][j] : 2 * regime.covariance[i][j];
      if (Math.abs(coeff) > 1e-9) {
        quadObj = quadObj.add(wVars[i].mul(wVars[j]).mul(coeff));
      }
    }
  }
  // Tiny linear tie-breaker favoring higher expected return at identical variance
  for (let i = 0; i < n; i++) {
    quadObj = quadObj.sub(wVars[i].mul(1e-4 * regime.assets[i].expectedReturn));
  }

  model.objective(minimize(quadObj));

  let solverStatus = "Error";
  try {
    const status = await model.solve(HiGHS);
    solverStatus = status;
    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();

    if (status === "Optimal") {
      const rawWeights = wVars.map((v) => v.value ?? 0);
      const weights = normalizeWeights(rawWeights, regime.maxWeightPerAsset);
      const metrics = computePortfolioMetrics(regime, weights);
      const targetSatisfied = metrics.expectedReturn >= target - 1e-4;
      return {
        status: "Optimal",
        weights,
        metrics,
        solveTimeMs: Math.max(0.1, t1 - t0),
        verified: metrics.isNormalized && metrics.isWithinCap && targetSatisfied,
      };
    }
    if (status === "Infeasible") {
      const fallback = computeAnalyticalMinimumVariancePortfolio(regime, target);
      return {
        status: "Infeasible",
        weights: fallback.weights,
        metrics: fallback.metrics,
        solveTimeMs: Math.max(0.1, t1 - t0),
        verified: false,
      };
    }
  } catch {
    // Fall back to analytical projected-gradient solver if WASM solver fails in constrained env
  }

  const fallback = computeAnalyticalMinimumVariancePortfolio(regime, target);
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const targetSatisfied = fallback.metrics.expectedReturn >= target - 1e-4;
  const isFeasible =
    fallback.metrics.isNormalized && fallback.metrics.isWithinCap && targetSatisfied;
  return {
    status: isFeasible ? "Optimal" : solverStatus === "Error" ? "Infeasible" : solverStatus,
    weights: fallback.weights,
    metrics: fallback.metrics,
    solveTimeMs: Math.max(0.1, t1 - t0),
    verified: isFeasible,
  };
}

/**
 * Computes the portfolio on the capped simplex { sum w_i = 1, 0 <= w_i <= cap }
 * that achieves the maximum possible expected return (greedy allocation in descending mu_i order).
 */
function computeMaxReturnPortfolio(regime: QuarterRegime): {
  weights: number[];
  maxReturn: number;
} {
  const n = regime.assets.length;
  const effectiveCap = Math.max(1 / n, regime.maxWeightPerAsset);
  const order = regime.assets
    .map((a, idx) => ({ idx, mu: a.expectedReturn }))
    .sort((a, b) => b.mu - a.mu || a.idx - b.idx);

  const weights = new Array<number>(n).fill(0);
  let rem = 1.0;
  for (const item of order) {
    if (rem <= 0) break;
    const alloc = Math.min(effectiveCap, rem);
    weights[item.idx] = alloc;
    rem -= alloc;
  }

  let maxReturn = 0;
  for (let i = 0; i < n; i++) {
    maxReturn += weights[i] * regime.assets[i].expectedReturn;
  }
  return { weights, maxReturn };
}

/**
 * Fast augmented-Lagrangian projected-gradient solver used for plotting the continuous
 * Efficient Frontier curve synchronously in the UI without spawning N separate worker calls.
 */
export function computeAnalyticalMinimumVariancePortfolio(
  regime: QuarterRegime,
  targetReturn: number
): { weights: number[]; metrics: PortfolioMetrics } {
  const n = regime.assets.length;
  const cap = regime.maxWeightPerAsset;
  const { weights: maxRetWeights, maxReturn } = computeMaxReturnPortfolio(regime);

  // If the requested target exceeds the maximum return achievable on the capped simplex,
  // return the highest-return feasible portfolio (whose expectedReturn < targetReturn).
  if (targetReturn >= maxReturn - 1e-7) {
    const metrics = computePortfolioMetrics(regime, maxRetWeights);
    return { weights: maxRetWeights, metrics };
  }

  let w = new Array<number>(n).fill(1 / n);

  // Augmented Lagrangian multiplier for targetReturn constraint: sum(mu_i * w_i) >= targetReturn
  let lambda = 0;
  const rho = 40;
  const lr = 0.05;
  for (let step = 0; step < 360; step++) {
    let curRet = 0;
    for (let i = 0; i < n; i++) {
      curRet += w[i] * regime.assets[i].expectedReturn;
    }
    const violation = targetReturn - curRet;
    const activeDual = Math.max(0, lambda + rho * violation);

    const grad = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      let sg = 0;
      for (let j = 0; j < n; j++) {
        sg += 2 * regime.covariance[i][j] * w[j];
      }
      grad[i] = sg - activeDual * regime.assets[i].expectedReturn;
    }

    const next = w.map((wi, i) => wi - lr * grad[i]);
    w = projectOntoCappedSimplex(next, cap);

    if (step % 15 === 14) {
      let updatedRet = 0;
      for (let i = 0; i < n; i++) {
        updatedRet += w[i] * regime.assets[i].expectedReturn;
      }
      lambda = Math.max(0, lambda + rho * (targetReturn - updatedRet));
    }
  }

  // Exact convex feasibility repair onto { w in CappedSimplex : mu^T w >= targetReturn }
  let finalRet = 0;
  for (let i = 0; i < n; i++) {
    finalRet += w[i] * regime.assets[i].expectedReturn;
  }
  if (finalRet < targetReturn && maxReturn > finalRet + 1e-12) {
    const alpha = Math.min(1, (targetReturn - finalRet) / (maxReturn - finalRet));
    w = w.map((wi, i) => (1 - alpha) * wi + alpha * maxRetWeights[i]);
  }

  const metrics = computePortfolioMetrics(regime, w);
  return { weights: w, metrics };
}

function projectOntoCappedSimplex(v: number[], cap: number): number[] {
  const n = v.length;
  const effectiveCap = Math.max(1 / n, cap);
  let low = Math.min(...v) - 1;
  let high = Math.max(...v) + 1;
  for (let iter = 0; iter < 32; iter++) {
    const mid = 0.5 * (low + high);
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += Math.min(effectiveCap, Math.max(0, v[i] - mid));
    }
    if (s > 1) {
      low = mid;
    } else {
      high = mid;
    }
  }
  const tau = 0.5 * (low + high);
  return v.map((vi) => Math.min(effectiveCap, Math.max(0, vi - tau)));
}

export function computeEfficientFrontier(
  regime: QuarterRegime,
  numPoints = 9
): FrontierPoint[] {
  const returns = regime.assets.map((a) => a.expectedReturn).slice().sort((a, b) => a - b);
  const minRet = returns[0] + 0.01;

  // Max achievable return under single-asset cap
  const descReturns = returns.slice().reverse();
  let rem = 1.0;
  let maxRet = 0;
  for (const r of descReturns) {
    const alloc = Math.min(rem, regime.maxWeightPerAsset);
    maxRet += alloc * r;
    rem -= alloc;
    if (rem <= 1e-9) break;
  }
  maxRet = Math.max(minRet + 0.01, maxRet - 0.005);

  const points: FrontierPoint[] = [];
  for (let k = 0; k < numPoints; k++) {
    const t = numPoints === 1 ? 0.5 : k / (numPoints - 1);
    const target = minRet + t * (maxRet - minRet);
    const solved = computeAnalyticalMinimumVariancePortfolio(regime, target);
    points.push({
      expectedReturn: solved.metrics.expectedReturn,
      volatility: solved.metrics.volatility,
      ruinProbability: solved.metrics.ruinProbability,
      weights: solved.weights,
    });
  }

  // Enforce non-decreasing envelope for clean chart rendering
  for (let i = 1; i < points.length; i++) {
    if (points[i].expectedReturn < points[i - 1].expectedReturn) {
      points[i].expectedReturn = points[i - 1].expectedReturn;
    }
    if (points[i].volatility < points[i - 1].volatility) {
      points[i].volatility = points[i - 1].volatility;
    }
  }
  return points;
}

class SeededRng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0 || 123456789;
  }
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return (this.state & 0x7fffffff) / 0x80000000;
  }
  nextNormal(): number {
    const u1 = Math.max(1e-7, this.next());
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

/**
 * Evaluates a single fund's 60-day AUM trajectory against a given sequence of daily asset returns.
 * Accumulates the daily portfolio return increments over the 60-day quarter so that the no-shock
 * terminal return distribution matches the Markowitz quarterly model N(w^T mu, w^T Sigma w),
 * and applies the barrier liquidation rule identically to every participant.
 */
export function evaluateFundTrack(
  dailyAssetReturns: number[][],
  weights: number[],
  startAum: number,
  liquidationFloor: number
): FundTrackResult {
  const days = dailyAssetReturns.length;
  const aumSeries: number[] = [startAum];
  const liquidationAumFloor = startAum * (1 + liquidationFloor);

  let cumReturn = 0;
  let peakAum = startAum;
  let minAum = startAum;
  let maxDrawdown = 0;
  let liquidatedDay: number | null = null;

  for (let d = 0; d < days; d++) {
    const assetReturns = dailyAssetReturns[d];
    let dayRet = 0;
    for (let i = 0; i < assetReturns.length; i++) {
      dayRet += (weights[i] ?? 0) * assetReturns[i];
    }

    cumReturn += dayRet;
    const aum = startAum * (1 + cumReturn);
    aumSeries.push(aum);

    if (aum > peakAum) peakAum = aum;
    if (aum < minAum) minAum = aum;

    const dd = (aum - peakAum) / peakAum;
    if (dd < maxDrawdown) maxDrawdown = dd;

    if (liquidatedDay === null && aum < liquidationAumFloor) {
      liquidatedDay = d + 1;
    }
  }

  const endAum = aumSeries[days];
  const liquidated = endAum < liquidationAumFloor || liquidatedDay !== null;

  return {
    startAum,
    endAum,
    minAum,
    aumSeries,
    totalReturn: cumReturn,
    maxDrawdown,
    liquidationAumFloor,
    liquidated,
    liquidatedDay,
  };
}

export function simulateQuarterMarket(input: MarketSimulationInput): MarketSimulationResult {
  const { regime, playerWeights, aiWeights, playerStartAum, aiStartAum } = input;
  const days = 60;
  const n = regime.assets.length;
  const rng = new SeededRng(input.seed ?? Math.floor(Date.now() % 2147483647));

  const L = choleskyDecompose(regime.covariance);
  const dailyScale = 1 / Math.sqrt(days);
  const dailyDrift = regime.assets.map((a) => a.expectedReturn / days);

  // Pick candidate macro shocks indexed by trading day
  const activeShocks = new Map<number, (typeof regime.candidateShocks)[number]>();
  for (const shock of regime.candidateShocks) {
    activeShocks.set(shock.day, shock);
  }

  const dailyAssetReturns: number[][] = [];
  const triggeredShocks: TriggeredShock[] = [];

  for (let day = 1; day <= days; day++) {
    const z = Array.from({ length: n }, () => rng.nextNormal());
    const assetDailyReturns = new Array<number>(n).fill(0);

    for (let i = 0; i < n; i++) {
      let corrNoise = 0;
      for (let k = 0; k <= i; k++) {
        corrNoise += L[i][k] * z[k];
      }
      assetDailyReturns[i] = dailyDrift[i] + dailyScale * corrNoise;
    }

    const shock = activeShocks.get(day);
    if (shock) {
      const shockDirection = rng.next() < 0.75 ? 1 : -0.65;
      let pShock = 0;
      let aShock = 0;
      for (let i = 0; i < n; i++) {
        const imp = (shock.assetImpulses[i] ?? 0) * shockDirection;
        assetDailyReturns[i] += imp;
        pShock += (playerWeights[i] ?? 0) * imp;
        aShock += (aiWeights[i] ?? 0) * imp;
      }
      triggeredShocks.push({
        day,
        headline: shockDirection > 0 ? shock.headline : shock.reversedHeadline,
        reversed: shockDirection < 0,
        playerImpact: pShock,
        aiImpact: aShock,
      });
    }

    dailyAssetReturns.push(assetDailyReturns);
  }

  const playerTrack = evaluateFundTrack(
    dailyAssetReturns,
    playerWeights,
    playerStartAum,
    regime.liquidationFloor
  );
  const aiTrack = evaluateFundTrack(
    dailyAssetReturns,
    aiWeights,
    aiStartAum,
    regime.liquidationFloor
  );

  return {
    days,
    playerAumSeries: playerTrack.aumSeries,
    aiAumSeries: aiTrack.aumSeries,
    liquidationAumFloor: playerTrack.liquidationAumFloor,
    playerReturn: playerTrack.totalReturn,
    aiReturn: aiTrack.totalReturn,
    playerEndAum: playerTrack.endAum,
    aiEndAum: aiTrack.endAum,
    playerMinAum: playerTrack.minAum,
    aiMinAum: aiTrack.minAum,
    playerMaxDrawdown: playerTrack.maxDrawdown,
    aiMaxDrawdown: aiTrack.maxDrawdown,
    playerLiquidated: playerTrack.liquidated,
    playerLiquidatedDay: playerTrack.liquidatedDay,
    aiLiquidated: aiTrack.liquidated,
    aiLiquidatedDay: aiTrack.liquidatedDay,
    shocks: triggeredShocks,
  };
}
