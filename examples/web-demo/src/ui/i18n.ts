export type Locale = "en" | "ja";

export interface TranslationDict {
  headerSubtitle: string;
  modelSelectLabel: string;
  solverSelectLabel: string;
  resetButton: string;
  viewLpButton: string;
  runButton: string;
  tabSolution: string;
  tabLp: string;
  tabLogs: string;
  tabDocs: string;
  statusLabel: string;
  objectiveLabel: string;
  timeLabel: string;
  varsLabel: string;
  visualizationTitle: string;
  tableTitle: string;
  filterNonZeroLabel: string;
  colName: string;
  colType: string;
  colValue: string;
  colBounds: string;
  colReducedCost: string;
  // Constraints & Sensitivity table
  constrsTableTitle: string;
  constrsTableSubtitle: string;
  colConstrName: string;
  colConstrRhs: string;
  colConstrStatus: string;
  colConstrSlack: string;
  colConstrDual: string;
  // Portfolio QP visualizer
  portfolioRiskLabel: string;
  portfolioVolLabel: string;
  portfolioBudgetLabel: string;
  portfolioWeightsTitle: string;
  // Supply chain visualizer
  supplyChainOpenedWarehouses: string;
  supplyChainTotalShipped: string;
  supplyChainAvgCost: string;
  supplyChainTopWarehouses: string;
  supplyChainWarehouseUnit: string;
  // Unsat Core (Conflict Diagnosis)
  unsatCoreTitle: string;
  unsatCoreDesc: string;
  backToDocs: string;
  navShowcase: string;
}

export const translations: Record<Locale, TranslationDict> = {
  en: {
    headerSubtitle: "Mathematical Optimization Modeler",
    modelSelectLabel: "Problem Model:",
    solverSelectLabel: "Solver:",
    resetButton: "Reset",
    viewLpButton: "View LP",
    runButton: "Run Optimization",
    tabSolution: "Solution & Variables",
    tabLp: "CPLEX LP Format",
    tabLogs: "Solver Logs",
    tabDocs: "Modeling Guide",
    statusLabel: "Status",
    objectiveLabel: "Objective Value",
    timeLabel: "Solve Time",
    varsLabel: "Variables",
    visualizationTitle: "Decision Summary",
    tableTitle: "Optimal Variable Values",
    filterNonZeroLabel: "Show non-zero variables only",
    colName: "Name",
    colType: "Type",
    colValue: "Value (Primal)",
    colBounds: "Bounds [LB, UB]",
    colReducedCost: "Reduced Cost",
    constrsTableTitle: "Constraints & Sensitivity (Dual / Slack)",
    constrsTableSubtitle: "Shadow prices (dual) and surpluses (slack) for linear constraints",
    colConstrName: "Constraint",
    colConstrRhs: "Relation & RHS",
    colConstrStatus: "Status",
    colConstrSlack: "Slack",
    colConstrDual: "Shadow Price (Dual)",
    portfolioRiskLabel: "Optimal Portfolio Variance (Risk)",
    portfolioVolLabel: "Annual Volatility (Std Dev σ)",
    portfolioBudgetLabel: "Total Investment Ratio (Budget)",
    portfolioWeightsTitle: "Optimal Asset Allocation Weights:",
    supplyChainOpenedWarehouses: "Active Distribution Centers",
    supplyChainTotalShipped: "Total Logistics Volume",
    supplyChainAvgCost: "Avg Unit Logistics Cost",
    supplyChainTopWarehouses: "Top 8 Active Warehouses (by shipment volume):",
    supplyChainWarehouseUnit: "units",
    unsatCoreTitle: "Conflicting Constraints Detected (Unsat Core):",
    unsatCoreDesc: "The model has no feasible solution. The solver identified the following subset of incompatible constraints (unsat core):",
    backToDocs: "Documentation",
    navShowcase: "Showcase",
  },
  ja: {
    headerSubtitle: "数理最適化モデラー",
    modelSelectLabel: "問題モデル:",
    solverSelectLabel: "ソルバー:",
    resetButton: "初期化",
    viewLpButton: "LP 構文",
    runButton: "最適化を実行",
    tabSolution: "解と変数一覧",
    tabLp: "CPLEX LP 構文",
    tabLogs: "ソルバーログ",
    tabDocs: "モデリング手引",
    statusLabel: "求解ステータス",
    objectiveLabel: "最適目的関数値",
    timeLabel: "計算時間",
    varsLabel: "決定変数",
    visualizationTitle: "決定サマリー",
    tableTitle: "決定変数の最適値",
    filterNonZeroLabel: "非ゼロ変数のみ表示",
    colName: "変数名",
    colType: "種類",
    colValue: "最適値 (Primal)",
    colBounds: "定義域 [下限, 上限]",
    colReducedCost: "被約費用 (Reduced Cost)",
    constrsTableTitle: "制約条件と感度分析（潜在価格 Dual・スラック Slack）",
    constrsTableSubtitle: "どの制約がボトルネック（Binding）になっているかと潜在価格を表示",
    colConstrName: "制約名",
    colConstrRhs: "条件式 (RHS)",
    colConstrStatus: "状態",
    colConstrSlack: "スラック (余剰)",
    colConstrDual: "潜在価格 (Dual)",
    portfolioRiskLabel: "最適ポートフォリオ分散 (Risk)",
    portfolioVolLabel: "年率ボラティリティ (Std Dev σ)",
    portfolioBudgetLabel: "投資比率合計 (Budget)",
    portfolioWeightsTitle: "最適資産配分比率 (Asset Weights):",
    supplyChainOpenedWarehouses: "稼働拠点数 (DC)",
    supplyChainTotalShipped: "総出荷量 (Demand Met)",
    supplyChainAvgCost: "平均ユニット輸送コスト",
    supplyChainTopWarehouses: "稼働物流拠点トップ 8（総出荷量順）:",
    supplyChainWarehouseUnit: "個",
    unsatCoreTitle: "矛盾制約を検出（Unsat Core）:",
    unsatCoreDesc: "モデルに実行可能解が存在しません。ソルバーは矛盾を引き起こしている制約の部分集合（Unsat Core）を特定しました:",
    backToDocs: "ドキュメント",
    navShowcase: "ショーケース",
  },
};

const STORAGE_KEY = "opt_ts_locale";

/**
 * Determine the initial locale based on stored preference or browser settings
 */
export function detectInitialLocale(stored?: string | null, browserLang?: string): Locale {
  if (stored === "en" || stored === "ja") {
    return stored;
  }
  const lang = (browserLang || (typeof navigator !== "undefined" ? navigator.language : "en")).toLowerCase();
  if (lang.startsWith("ja")) {
    return "ja";
  }
  return "en";
}

let currentLocale: Locale = "en";
const listeners = new Set<(locale: Locale) => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Ignore storage errors in restricted iframe
    }
  }
  listeners.forEach((fn) => fn(locale));
}

export function initLocale(): Locale {
  let stored: string | null = null;
  if (typeof localStorage !== "undefined") {
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
  }
  const initial = detectInitialLocale(stored);
  currentLocale = initial;
  return initial;
}

export function onLocaleChange(fn: (locale: Locale) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Translate a key into the active locale text
 */
export function t(key: keyof TranslationDict): string {
  const dict = translations[currentLocale] || translations.en;
  return dict[key] || translations.en[key] || String(key);
}
