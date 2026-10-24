import type { GameLang } from "../i18n.js";

export type AssetId = "tech" | "defense" | "gold" | "energy" | "bond" | "frontier";

export interface LocalizedText {
  ja: string;
  en: string;
  zh: string;
}

export interface AssetSpec {
  id: AssetId;
  ticker: string;
  color: string;
  expectedReturn: number; // e.g. 0.16 for +16%
  volatility: number; // e.g. 0.24 for 24% std dev
  name: LocalizedText;
  roleDesc: LocalizedText;
}

export interface MarketShockSpec {
  id: string;
  day: number; // Trading day (1..60) when shock can trigger
  headline: LocalizedText;
  /** Headline shown when the shock fires in the reversed direction (impulses * -0.65) */
  reversedHeadline: LocalizedText;
  /** Asset return impulse vector (same length as regime.assets) */
  assetImpulses: number[];
}

export interface QuarterRegime {
  id: string;
  quarter: number;
  title: LocalizedText;
  forecast: LocalizedText;
  rivalPersona: LocalizedText;
  assets: AssetSpec[];
  /** Symmetric correlation matrix R in [-1, 1]^{N x N} */
  correlation: number[][];
  /** Symmetric positive-definite covariance matrix Sigma in R^{N x N} */
  covariance: number[][];
  /** Minimum expected return target for rival QP and benchmark */
  targetReturn: number;
  /** Quarterly return floor below which the fund is liquidated (e.g. -0.065 for -6.5%) */
  liquidationFloor: number;
  /** Maximum weight allowed in any single asset (e.g. 1.0 in Q1, tightening in later quarters) */
  maxWeightPerAsset: number;
  /** Candidate macro shocks for this regime */
  candidateShocks: MarketShockSpec[];
}

export interface PortfolioMetrics {
  expectedReturn: number;
  variance: number;
  volatility: number;
  safetyFirstRatio: number;
  ruinProbability: number;
  sharpeRatio: number;
  maxAssetWeight: number;
  isNormalized: boolean;
  isWithinCap: boolean;
}

export interface QuantOptimalResult {
  status: string;
  weights: number[];
  metrics: PortfolioMetrics;
  solveTimeMs: number;
  verified: boolean;
}

export interface FrontierPoint {
  expectedReturn: number;
  volatility: number;
  ruinProbability: number;
  weights: number[];
}

export interface TriggeredShock {
  day: number;
  headline: Record<GameLang, string>;
  /** true when the shock fired in the reversed direction */
  reversed: boolean;
  playerImpact: number;
  aiImpact: number;
}

export interface MarketSimulationInput {
  regime: QuarterRegime;
  playerWeights: number[];
  aiWeights: number[];
  playerStartAum: number;
  aiStartAum: number;
  seed?: number;
}

export interface MarketSimulationResult {
  days: number;
  playerAumSeries: number[];
  aiAumSeries: number[];
  liquidationAumFloor: number;
  playerReturn: number;
  aiReturn: number;
  playerEndAum: number;
  aiEndAum: number;
  playerMinAum: number;
  aiMinAum: number;
  playerMaxDrawdown: number;
  aiMaxDrawdown: number;
  playerLiquidated: boolean;
  playerLiquidatedDay: number | null;
  aiLiquidated: boolean;
  shocks: TriggeredShock[];
}
