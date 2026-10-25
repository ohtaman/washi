import type { GameLang } from "../i18n.js";

export type AssetCategory = "broad" | "sector" | "stock" | "commodity" | "alt";

export type AssetId = string;

export interface LocalizedText {
  ja: string;
  en: string;
  zh: string;
}

export interface AssetSpec {
  id: AssetId;
  ticker: string;
  color: string;
  category: AssetCategory;
  unlockedAtLevel: number;
  expectedReturn: number; // e.g. 0.16 for +16%
  volatility: number; // e.g. 0.24 for 24% std dev
  name: LocalizedText;
  roleDesc: LocalizedText;
}

export interface MarketShockSpec {
  id: string;
  day: number; // Trading day (1..60) when shock can trigger
  headline: LocalizedText;
  reversedHeadline?: LocalizedText;
  /** Map of asset ID to shock return impulse */
  assetImpulses: Record<string, number>;
}

export interface LevelSpec {
  level: number;
  title: LocalizedText;
  forecast: LocalizedText;
  rivalPersona: LocalizedText;
  maxPicks: number;
  targetReturn: number;
  liquidationFloor: number;
  maxWeightPerAsset: number;
  newAssetIds: string[];
  unlockedAssetIds: string[];
  candidateShocks: MarketShockSpec[];
}

export interface QuarterRegime {
  id: string;
  quarter: number; // Equivalent to level
  level: number;
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
  /** Quarterly return floor below which the fund is liquidated (e.g. -0.055 for -5.5%) */
  liquidationFloor: number;
  /** Maximum weight allowed in any single asset */
  maxWeightPerAsset: number;
  /** Candidate macro shocks for this regime */
  candidateShocks: MarketShockSpec[];
  /** Subset asset indices in the parent universe */
  selectedAssetIds: string[];
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
  playerImpact: number;
  aiImpact: number;
}

export interface GhostSeries {
  ticker: string;
  label: LocalizedText;
  aumSeries: number[];
  liquidatedDay: number | null;
}

export interface MarketSimulationInput {
  regime: QuarterRegime;
  playerWeights: number[];
  aiWeights: number[];
  playerStartAum: number;
  aiStartAum: number;
  seed?: number;
  ghostAssetId?: string;
}

export interface MarketSimulationResult {
  days: number;
  playerAumSeries: number[];
  aiAumSeries: number[];
  liquidationAumFloor: number;
  liquidationFloorRate: number;
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
  ghostSeries?: GhostSeries;
}

export interface GameSaveState {
  currentLevel: number;
  highestLevel: number;
  playerAum: number;
  aiAum: number;
  stageStartAum?: number;
  selectedAssetIds: string[];
  bestQuarter?: number;
  peakAum?: number;
}
