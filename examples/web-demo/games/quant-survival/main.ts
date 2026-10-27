/// <reference types="vite/client" />
import { setHighsWasmUrl } from "../../../../src/index.js";
import { getGameLang, pickLang, setGameLang, type GameLang } from "../i18n.js";
import {
  autoPickLevelAssets,
  buildSubsetRegime,
  getAssetSpecById,
  getLevelSpec,
  getLocalizedAsset,
  getLocalizedRegimeText,
} from "./regimes.js";
import {
  computeEfficientFrontier,
  computePortfolioMetrics,
  normalizeWeights,
  simulateQuarterMarket,
  solveQuantOptimalPortfolio,
} from "./solver.js";
import type {
  AssetSpec,
  FrontierPoint,
  GameSaveState,
  LevelSpec,
  MarketSimulationResult,
  QuantOptimalResult,
  QuarterRegime,
} from "./types.js";

if (typeof window !== "undefined") {
  let wasmUrl: string;
  if (import.meta.env.DEV) {
    wasmUrl = new URL("/highs.wasm", window.location.origin).href;
  } else {
    const base = import.meta.env.BASE_URL || "/";
    if (base.startsWith("/")) {
      const cleanBase = base.endsWith("/") ? base : `${base}/`;
      wasmUrl = new URL(`${cleanBase}highs.wasm`, window.location.origin).href;
    } else {
      wasmUrl = new URL("../../highs.wasm", window.location.href).href;
    }
  }
  setHighsWasmUrl(wasmUrl);
}

const STORAGE_KEY = "washi_quant_survival_save_v2";

interface StaticStrings {
  pageTitle: string;
  backLink: string;
  backLinkTitle: string;
  brandSubtitle: string;
  recordTitle: string;
  langGroupAria: string;
  helpBtn: string;
  helpBtnTitle: string;
  newRunBtn: string;
  newRunBtnTitle: string;
  scoreboardAria: string;
  quarterLabel: string;
  youLabel: string;
  aiLabel: string;
  floorLabel: string;
  floorSub: string;
  universeHeading: string;
  universeSub: string;
  allocHeading: string;
  allocSub: string;
  equalBtn: string;
  equalBtnTitle: string;
  hedgeBtn: string;
  hedgeBtnTitle: string;
  corrHeading: string;
  corrMatrixAria: string;
  telemetryPanelAria: string;
  labelRuinProb: string;
  labelExpReturn: string;
  chartFrontierTitle: string;
  chartFrontierLegend: string;
  frontierSvgAria: string;
  chartBattleTitle: string;
  battleSvgAria: string;
  ghostLegendText: string;
  defaultTicker: string;
  executeBtn: string;
  executingBtn: string;
  nextQuarterBtn: string;
  retryRunBtn: string;
  helpDialogTitle: string;
  helpDialogCloseAria: string;
  helpDialogOk: string;
  helpDialogHtml: string;
  strategyTipHtml: string;
  frontierGuideText: string;
  unlockDialogTitle: string;
  unlockDialogOk: string;
}

const UI_TEXT: Record<GameLang, StaticStrings> = {
  ja: {
    pageTitle: "QUANT SURVIVAL | クオンツ運用サバイバル",
    backLink: "← ゲーム一覧",
    backLinkTitle: "ゲーム一覧へ戻る",
    brandSubtitle: "vs WaSHI-QP エンドレス運用バトル",
    recordTitle: "自己ベスト記録（最高到達ステージ・最高総資産）",
    langGroupAria: "Language",
    helpBtn: "? ルール",
    helpBtnTitle: "遊び方とレベルアップの仕組み",
    newRunBtn: "↻ リセット",
    newRunBtnTitle: "初期資金$100MからLevel 1を再開",
    scoreboardAria: "運用資産スコアボード",
    quarterLabel: "CURRENT LEVEL",
    youLabel: "YOUR FUND (AUM)",
    aiLabel: "RIVAL: WaSHI-QP",
    floorLabel: "LIQUIDATION FLOOR",
    floorSub: "これ未満で即ロスカット退場",
    universeHeading: "1. 銘柄プールから選択 (DRAFT)",
    universeSub: "アンロックされた銘柄から組み入れたい銘柄をタップして選択してください",
    allocHeading: "2. 選択銘柄の配分 (合計 100%)",
    allocSub: "スライダーを動かすと自動で合計100%に正規化されます",
    equalBtn: "均等配分",
    equalBtnTitle: "選択銘柄に均等配分する",
    hedgeBtn: "逆相関ブレンド",
    hedgeBtnTitle: "逆相関ペアを組み合わせたバランス配分を試す",
    corrHeading: "選択銘柄の相関係数マトリクス (青 = 逆相関ヘッジ効果大)",
    corrMatrixAria: "資産間相関係数マトリクス",
    telemetryPanelAria: "リスク計器盤と市場シミュレーション",
    labelRuinProb: "今期の破綻確率 (RUIN PROB)",
    labelExpReturn: "期待リターン (E[R])",
    chartFrontierTitle: "リスク・リターン平面 ＆ 効率的フロンティア",
    chartFrontierLegend: "● YOU   ◆ WaSHI-QP",
    frontierSvgAria: "効率的フロンティアとリスク・リターンプロット",
    chartBattleTitle: "60営業日 リアルタイム資産推移 (YOU vs WaSHI-QP)",
    battleSvgAria: "60営業日リアルタイム資産推移チャート",
    ghostLegendText: "単体100%全ツッパ比較",
    defaultTicker:
      "銘柄を選択して配分を調整し、[MARKET OPEN] を押すと60日間の市場シミュレーションが始まります。",
    executeBtn: "▶ MARKET OPEN (60日間バトル開始)",
    executingBtn: "⏳ MARKET RUNNING (60日間取引中...)",
    nextQuarterBtn: "次のレベルへ進む ▶",
    retryRunBtn: "↻ このレベルを再挑戦",
    helpDialogTitle: "QUANT SURVIVAL — ルールと生き残り方",
    helpDialogCloseAria: "閉じる",
    helpDialogOk: "閉じる",
    helpDialogHtml: `
      <h3>1. ルールと勝利条件</h3>
      <p>あなたはクオンツファンドの運用責任者です。初期資金 <strong>$100.0M</strong> からスタートし、毎期（60営業日）ライバルAI（WaSHI-QP）と競い合います。</p>
      <ul>
        <li><strong>ロスカット即死</strong>：途中の暴落などで資産がロスカットライン（約 -7.5%）を割ると、その瞬間に<strong>運用停止・即死退場（ゲームオーバー）</strong>になります。</li>
        <li><strong>ステージクリア</strong>：① 60日間ロスカットされずに生存し、② 期末資産でライバルAIを上回れば<strong>クリア! 次のステージへ進み新銘柄が解放</strong>されます。</li>
      </ul>

      <h3>2. 勝つための配分セオリー（何が正解？）</h3>
      <ul>
        <li><strong>株式100%全ツッパはNG</strong>：リターンを狙って株や個別株だけに全額賭けると、途中の暴落ショックで一発ロスカットになります。</li>
        <li><strong>逆相関ヘッジを混ぜる</strong>：相関係数マトリクスで「青色」に光る資産（例: 株式に対して国債や金）は、株が下落した時に逆行高してファンドを守ってくれます。</li>
        <li><strong>黄金比率の目安</strong>：株式・成長株に50〜70%、国債や金に20〜30%程度を配分すると、<strong>「破綻確率（RUIN PROB）」をほぼ0%に保ったまま</strong>AIの期待リターンを上回ることができます。</li>
      </ul>

      <h3>3. 効率的フロンティア ＆ リスク・リターン平面の見方</h3>
      <ul>
        <li><strong>横軸（リスク σ）</strong>：ポートフォリオの価格のブレ幅。左に行くほど値動きが穏やかで安全です。</li>
        <li><strong>縦軸（期待リターン E[R]）</strong>：ポートフォリオの年間見込み収益率。上に行くほど高リターンです。</li>
        <li><strong>点線の曲線（効率的フロンティア）</strong>：現代ポートフォリオ理論に基づく「これ以上リスクを下げてリターンを上げることはできない」という<strong>理想の限界ライン</strong>です。逆相関の資産をうまく組み合わせると、曲線が左上へ大きく膨らみます。</li>
        <li><strong>● YOU（青丸）</strong>：あなたの現在のポートフォリオ。</li>
        <li><strong>◆ WaSHI-QP（黄ダイヤ）</strong>：ライバルAI。凸二次計画法（Convex QP）によってフロンティア線上の最適点にいます。</li>
        <li><strong>操作のコツ</strong>：スライダーを動かして、青丸（●）を点線のフロンティアに近づけつつ、黄ダイヤ（◆）より高い位置に持っていくのが勝利への最短ルートです!</li>
      </ul>
    `,
    strategyTipHtml:
      "<strong>💡 攻略のヒント</strong>: 株式100%だと途中の暴落ショックで即ロスカット退場します。相関係数マトリクスで青い「逆相関」の資産（国債や金）を20〜30%混ぜることで、破綻確率をほぼ0%に抑えつつAIの目標リターンを上回ることができます!",
    frontierGuideText:
      "【グラフの見方】横軸: リスクσ（価格のブレ幅・左ほど安全） / 縦軸: 期待リターンE[R]（見込み収益率・上ほど高リターン） / 点線: 効率的フロンティア（これ以上リスクを抑えられない理想の限界曲線）。スライダーで青い●を点線に近づけ、AI(◆)より上を狙うのがセオリーです。",
    unlockDialogTitle: "✨ LEVEL CLEAR & 新銘柄アンロック!",
    unlockDialogOk: "次のステージへ挑む ▶",
    statExpReturnTitle: "期待リターン E[R]",
    statVolTitle: "ボラティリティ σ",
    statRetBadgeTitle: "期待リターン",
    statVolBadgeTitle: "ボラティリティ (リスク)",
    sliderAriaSuffix: "投資比率スライダー",
    corrStrongNegTooltip: "強い逆相関：リスク圧縮効果が極めて高い",
    targetBadgePrefix: "目標",
    metricVolLabel: "変動リスク (σ)",
    frontierAxisRisk: "リスク σ →",
    idleChartSub: "[MARKET OPEN] を押すとレースがスタートします",
    aiOptimalPrefix: "WaSHI-QP 最適配分",
  },
  en: {
    pageTitle: "QUANT SURVIVAL | Endless Portfolio Duel",
    backLink: "← Games",
    backLinkTitle: "Back to Game Portal",
    brandSubtitle: "vs WaSHI-QP Endless AUM Duel",
    recordTitle: "Best record (Highest Level & Peak AUM)",
    langGroupAria: "Language",
    helpBtn: "? Rules",
    helpBtnTitle: "How to play and progress",
    newRunBtn: "↻ Reset",
    newRunBtnTitle: "Restart fresh from Level 1 ($100M)",
    scoreboardAria: "Asset Under Management Scoreboard",
    quarterLabel: "CURRENT LEVEL",
    youLabel: "YOUR FUND (AUM)",
    aiLabel: "RIVAL: WaSHI-QP",
    floorLabel: "LIQUIDATION FLOOR",
    floorSub: "Breaching this floor ends your run",
    universeHeading: "1. Select from Universe Pool (DRAFT)",
    universeSub: "Tap unlocked assets to include them in your active portfolio",
    allocHeading: "2. Active Portfolio Weights (Total 100%)",
    allocSub: "Adjusting any slider automatically rebalances total weights to 100%",
    equalBtn: "Equal Weight",
    equalBtnTitle: "Distribute capital equally across selected assets",
    hedgeBtn: "Hedge Blend",
    hedgeBtnTitle: "Try a balanced blend of negatively correlated assets",
    corrHeading: "Asset Correlation Matrix (Blue = Strong Negative Hedge)",
    corrMatrixAria: "Asset Correlation Matrix",
    telemetryPanelAria: "Risk Telemetry and Market Simulation",
    labelRuinProb: "LEVEL RUIN PROBABILITY",
    labelExpReturn: "EXPECTED RETURN (E[R])",
    chartFrontierTitle: "Risk-Return Plane & Efficient Frontier",
    chartFrontierLegend: "● YOU   ◆ WaSHI-QP",
    frontierSvgAria: "Risk-Return Efficient Frontier Plot",
    chartBattleTitle: "60-Day Live AUM Battle (YOU vs WaSHI-QP)",
    battleSvgAria: "60-Day Live Asset Battle Chart",
    ghostLegendText: "100% Single-Stock Benchmark",
    defaultTicker:
      "Pick your assets, adjust weights, and click [MARKET OPEN] to launch the 60-day battle.",
    executeBtn: "▶ MARKET OPEN (Launch 60-Day Battle)",
    executingBtn: "⏳ MARKET RUNNING (Simulating 60 Days...)",
    nextQuarterBtn: "Advance to Next Level ▶",
    retryRunBtn: "↻ Retry This Level",
    helpDialogTitle: "QUANT SURVIVAL — Rules & Mechanics",
    helpDialogCloseAria: "Close",
    helpDialogOk: "Got It",
    helpDialogHtml: `
      <h3>1. Objectives & Win Conditions</h3>
      <p>You manage a quantitative portfolio starting with <strong>$100.0M</strong> AUM. Each quarter (60 trading days), you compete against rival algorithm WaSHI-QP.</p>
      <ul>
        <li><strong>Instant Liquidation</strong>: If fund capital falls below the liquidation floor (~ -7.5% drawdown) on any trading day, your fund is <strong>instantly liquidated and the run ends immediately</strong>.</li>
        <li><strong>Stage Clear</strong>: Survive the full 60 days without liquidation AND finish with higher ending AUM than WaSHI-QP to <strong>advance and unlock new assets</strong>!</li>
      </ul>

      <h3>2. The Winning Strategy (What is the right move?)</h3>
      <ul>
        <li><strong>Avoid 100% in a Single Asset</strong>: Concentrating all capital into stocks causes catastrophic liquidation when market pullback shocks hit.</li>
        <li><strong>Hedge with Negative Correlation</strong>: Assets highlighted in blue in the Correlation Matrix (e.g. Bonds and Gold vs Equities) rise or stay resilient when stocks plunge, buffering drawdowns.</li>
        <li><strong>Balanced Allocation Recipe</strong>: Allocating 50–70% to growth equities and 20–30% to bonds/gold keeps <strong>Ruin Probability near 0%</strong> while comfortably beating AI's expected return.</li>
      </ul>

      <h3>3. Understanding the Risk-Return Plane & Efficient Frontier</h3>
      <ul>
        <li><strong>Horizontal Axis (Risk σ)</strong>: Volatility / standard deviation of returns. Further left is safer and calmer.</li>
        <li><strong>Vertical Axis (Expected Return E[R])</strong>: Projected annual return. Higher means greater earnings potential.</li>
        <li><strong>Dashed Curve (Efficient Frontier)</strong>: The mathematical boundary of optimal portfolios from Modern Portfolio Theory. Portfolios cannot beat this boundary. Combining negatively correlated assets bends this curve toward the upper-left (higher return, lower risk).</li>
        <li><strong>● YOU (Blue dot)</strong>: Your current active portfolio.</li>
        <li><strong>◆ WaSHI-QP (Amber diamond)</strong>: Rival AI, computed via convex Quadratic Programming (QP) to sit on the optimal frontier point.</li>
        <li><strong>Tactical Goal</strong>: Move the sliders to pull your blue dot (●) close to the dashed frontier line while positioning it slightly higher than the yellow diamond (◆)!</li>
      </ul>
    `,
    strategyTipHtml:
      "<strong>💡 Strategy Tip</strong>: 100% in equities triggers instant liquidation during mid-quarter shocks. Blending 20–30% in negatively correlated assets (Bonds or Gold) cushions drawdowns and suppresses ruin risk, helping you beat AI reliably!",
    frontierGuideText:
      "[How to Read Chart] X-axis: Risk σ (volatility, left is safer) / Y-axis: Expected Return E[R] (higher is better) / Dashed curve: Efficient Frontier (the optimal boundary where risk is minimized for each return level). Move sliders to pull your blue dot (●) toward the frontier curve and above AI (◆)!",
    unlockDialogTitle: "✨ LEVEL CLEAR & ASSETS UNLOCKED!",
    unlockDialogOk: "Advance to Next Stage ▶",
    statExpReturnTitle: "Expected Return E[R]",
    statVolTitle: "Volatility σ",
    statRetBadgeTitle: "Expected Return",
    statVolBadgeTitle: "Volatility (Risk)",
    sliderAriaSuffix: "allocation slider",
    corrStrongNegTooltip: "Strong negative correlation: high portfolio risk reduction",
    targetBadgePrefix: "TARGET",
    metricVolLabel: "Portfolio Volatility (σ)",
    frontierAxisRisk: "Risk σ →",
    idleChartSub: "Click [MARKET OPEN] to start the simulation duel",
    aiOptimalPrefix: "WaSHI-QP Optimal Allocation",
  },
  zh: {
    pageTitle: "QUANT SURVIVAL | 量化生存战",
    backLink: "← 游戏列表",
    backLinkTitle: "返回游戏列表",
    brandSubtitle: "vs WaSHI-QP 无尽资产管理对决",
    recordTitle: "最佳记录（最高到达关卡与最高资产）",
    langGroupAria: "Language",
    helpBtn: "? 规则",
    helpBtnTitle: "玩法说明与进阶机制",
    newRunBtn: "↻ 重置",
    newRunBtnTitle: "从初始资金$100M重新开始第1关",
    scoreboardAria: "基金管理规模记分板",
    quarterLabel: "CURRENT LEVEL",
    youLabel: "YOUR FUND (AUM)",
    aiLabel: "RIVAL: WaSHI-QP",
    floorLabel: "LIQUIDATION FLOOR",
    floorSub: "跌破此强平线即刻出局",
    universeHeading: "1. 从标的池精选资产 (DRAFT)",
    universeSub: "点击已解锁资产将其纳入当前投资组合",
    allocHeading: "2. 选中资产权重配置 (合计 100%)",
    allocSub: "拖动滑块时会自动将总权重归一化为100%",
    equalBtn: "均等配置",
    equalBtnTitle: "将资金平均分配至选中资产",
    hedgeBtn: "负相关对冲",
    hedgeBtnTitle: "尝试结合负相关资产的对冲配置",
    corrHeading: "选中资产相关系数矩阵 (蓝色 = 强负相关对冲)",
    corrMatrixAria: "资产相关系数矩阵",
    telemetryPanelAria: "风险仪表与市场模拟",
    labelRuinProb: "本关爆仓概率 (RUIN PROB)",
    labelExpReturn: "预期收益率 (E[R])",
    chartFrontierTitle: "风险收益平面与有效前沿",
    chartFrontierLegend: "● YOU   ◆ WaSHI-QP",
    frontierSvgAria: "有效前沿与风险收益散点图",
    chartBattleTitle: "60交易日 实时净值对决 (YOU vs WaSHI-QP)",
    battleSvgAria: "60交易日实时净值对决图表",
    ghostLegendText: "100%全仓单资产对照",
    defaultTicker: "精选资产并调整权重后，点击 [MARKET OPEN] 开启60交易日行情对决。",
    executeBtn: "▶ MARKET OPEN (开始60日行情对决)",
    executingBtn: "⏳ MARKET RUNNING (60日行情模拟中...)",
    nextQuarterBtn: "进入下一关 ▶",
    retryRunBtn: "↻ 重新挑战本关",
    helpDialogTitle: "量化生存战 — 游戏规则与晋级指南",
    helpDialogCloseAria: "关闭",
    helpDialogOk: "明白了",
    helpDialogHtml: `
      <h3>1. 游戏目标与通关规则</h3>
      <p>您担任量化对冲基金主管，初始管理规模 <strong>$100.0M</strong>。每个季度（60个交易日）与量化AI模型 WaSHI-QP 展开净值对决。</p>
      <ul>
        <li><strong>盘中即刻强平</strong>：一旦净值在任意交易日跌破强平底线（约 -7.5% 回撤），基金将<strong>即刻强平并终止模拟（游戏结束）</strong>。</li>
        <li><strong>通关晋级</strong>：① 60交易日内未被强平且平稳存活，② 期末资产超越对手 WaSHI-QP，即可<strong>通关并解锁全新标的资产</strong>!</li>
      </ul>

      <h3>2. 通关制胜策略（怎样的配置才算正确？）</h3>
      <ul>
        <li><strong>切忌100%全仓单一高波资产</strong>：全仓股票或热门个股在遭遇突发黑天鹅或回调冲击时，极易直接击穿强平线。</li>
        <li><strong>善用负相关资产对冲</strong>：在相关系数矩阵中显示为蓝色的资产对（如股票与国债、黄金），在股票暴跌时会逆市上扬或提供坚实缓冲。</li>
        <li><strong>黄金配置比例参考</strong>：将50%〜70%配置于成长股票，20%〜30%配置于国债或黄金，可在将<strong>爆仓概率（RUIN PROB）压低至接近0%</strong>的同时，稳稳超越AI的目标收益率。</li>
      </ul>

      <h3>3. 风险收益平面与有效前沿解读</h3>
      <ul>
        <li><strong>横轴（风险 σ）</strong>：组合净值波动率。越偏左代表走势越平稳安全。</li>
        <li><strong>纵轴（预期回报 E[R]）</strong>：组合年化预期收益率。越偏上代表潜在回报越高。</li>
        <li><strong>虚线（有效前沿边界）</strong>：源于现代资产组合理论（MPT）的最优边界曲线，代表给定风险下的极限收益。引入负相关资产会让曲线向左上方大幅拱起。</li>
        <li><strong>● YOU（蓝色圆点）</strong>：您当前的实际投资组合位置。</li>
        <li><strong>◆ WaSHI-QP（黄色菱形）</strong>：竞争对手AI，通过凸二次规划（QP）精确求解定位在最优有效前沿曲线上。</li>
        <li><strong>操作要领</strong>：拖动滑块，让蓝色圆点(●)贴近虚线前沿，并保持在黄色菱形(◆)的上方即可锁定胜局!</li>
      </ul>
    `,
    strategyTipHtml:
      "<strong>💡 通关指南</strong>: 若100%全仓股票，遭遇突发回撤冲击时会直接触发强平出局。结合相关系数矩阵中显示为蓝色的负相关避险资产（国债或黄金）20%〜30%，可在将爆仓风险降至极低的同时稳定超越AI!",
    frontierGuideText:
      "【图表解读】横轴：风险σ（波动率，越偏左越稳健）/ 纵轴：预期回报E[R]（年化见顶收益，越偏上越高）/ 虚线：有效前沿（同等风险下收益最大化的理想极限曲线）。调节滑块将蓝色圆点(●)推向虚线边界并超越AI(◆)是获胜关键!",
    unlockDialogTitle: "✨ 恭喜通关! 新资产已解锁!",
    unlockDialogOk: "挑战下一关 ▶",
    statExpReturnTitle: "预期收益率 E[R]",
    statVolTitle: "波动率 σ",
    statRetBadgeTitle: "预期收益率",
    statVolBadgeTitle: "波动率 (风险)",
    sliderAriaSuffix: "配置权重滑块",
    corrStrongNegTooltip: "强负相关：资产对冲与分散风险效果极佳",
    targetBadgePrefix: "目标",
    metricVolLabel: "组合波动率 (σ)",
    frontierAxisRisk: "风险 σ →",
    idleChartSub: "点击 [MARKET OPEN] 开始净值模拟对决",
    aiOptimalPrefix: "WaSHI-QP 最优资产配置",
  },
};

let currentLang: GameLang = getGameLang();
let currentLevel = 1;
let highestLevel = 1;
let playerAum = 100.0;
let aiAum = 100.0;
let stageStartAum = 100.0;
let peakAum = 100.0;
let selectedAssetIds: string[] = ["sp500", "bond", "gold"];
let currentLevelSpec: LevelSpec = getLevelSpec(1);
let currentRegime: QuarterRegime = buildSubsetRegime(1, selectedAssetIds);
let playerWeights: number[] = [0.5, 0.3, 0.2];
let aiOptimal: QuantOptimalResult | null = null;
let aiOptimalRegimeKey: string | null = null;
let currentSolveGeneration = 0;
let frontierPoints: FrontierPoint[] = [];
let isSimulating = false;
let lastSimulation: MarketSimulationResult | null = null;
let animTimerId: number | null = null;

function loadSaveState(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<GameSaveState>;
    currentLevel = Math.max(1, Number(parsed.currentLevel) || 1);
    highestLevel = Math.max(currentLevel, Number(parsed.highestLevel) || currentLevel);
    stageStartAum = Math.max(10.0, Number(parsed.stageStartAum) || Number(parsed.playerAum) || 100.0);
    playerAum = stageStartAum;
    aiAum = stageStartAum;
    peakAum = Math.max(playerAum, Number(parsed.peakAum) || playerAum);

    currentLevelSpec = getLevelSpec(currentLevel);
    let picks: string[] = [];
    if (Array.isArray(parsed.selectedAssetIds) && parsed.selectedAssetIds.length > 0) {
      picks = parsed.selectedAssetIds.filter((id) =>
        currentLevelSpec.unlockedAssetIds.includes(id)
      );
    }
    selectedAssetIds = autoPickLevelAssets(picks, currentLevelSpec);
  } catch {
    // Keep defaults on read error
  }
}

function saveGameState(): void {
  if (typeof window === "undefined") return;
  const state: GameSaveState = {
    currentLevel,
    highestLevel,
    playerAum,
    aiAum,
    stageStartAum,
    peakAum: Math.max(peakAum, playerAum),
    selectedAssetIds,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

function resetToFreshRun(): void {
  currentLevel = 1;
  playerAum = 100.0;
  aiAum = 100.0;
  stageStartAum = 100.0;
  currentLevelSpec = getLevelSpec(1);
  selectedAssetIds = ["sp500", "bond", "gold"];
  currentRegime = buildSubsetRegime(1, selectedAssetIds);
  playerWeights = [0.5, 0.3, 0.2];
  lastSimulation = null;
  saveGameState();
  refreshRegimeAndSolvers();
}

function formatMoney(millions: number): string {
  if (millions >= 1000) {
    return `$${(millions / 1000).toFixed(2)}B`;
  }
  return `$${millions.toFixed(1)}M`;
}

function formatSignedPct(val: number): string {
  const pct = val * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export function applyQuantStaticTranslations(lang: GameLang): void {
  currentLang = lang;
  setGameLang(lang);
  if (typeof document === "undefined") return;

  if (document.documentElement) {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  }

  const t = pickLang(lang, UI_TEXT);
  document.title = t.pageTitle;

  const setElText = (id: string, text: string, title?: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    if (title !== undefined) {
      el.title = title;
      el.setAttribute("title", title);
    }
  };

  const setElAria = (id: string, label: string) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute("aria-label", label);
  };

  setElText("back-link", t.backLink, t.backLinkTitle);
  setElText("brand-subtitle", t.brandSubtitle);
  const recBadge = document.getElementById("best-record-badge");
  if (recBadge) {
    recBadge.title = t.recordTitle;
    recBadge.setAttribute("title", t.recordTitle);
  }
  setElAria("lang-switch-group", t.langGroupAria);
  setElText("btn-help", t.helpBtn, t.helpBtnTitle);
  setElText("btn-new-run", t.newRunBtn, t.newRunBtnTitle);

  setElAria("scoreboard-strip", t.scoreboardAria);
  setElText("hud-quarter-label", t.quarterLabel);
  setElText("hud-you-label", t.youLabel);
  setElText("hud-ai-label", t.aiLabel);
  setElText("hud-floor-label", t.floorLabel);
  setElText("hud-floor-sub", t.floorSub);

  setElText("universe-heading", t.universeHeading);
  setElText("universe-sub", t.universeSub);
  setElText("alloc-heading", t.allocHeading);
  setElText("alloc-sub", t.allocSub);
  setElText("btn-equal-weight", t.equalBtn, t.equalBtnTitle);
  setElText("btn-balance-hedge", t.hedgeBtn, t.hedgeBtnTitle);
  setElText("corr-heading", t.corrHeading);
  setElAria("corr-matrix-container", t.corrMatrixAria);

  setElAria("telemetry-panel", t.telemetryPanelAria);
  setElText("label-ruin-prob", t.labelRuinProb);
  setElText("label-exp-return", t.labelExpReturn);
  setElText("chart-frontier-title", t.chartFrontierTitle);
  setElText("chart-frontier-legend", t.chartFrontierLegend);
  setElAria("frontier-svg", t.frontierSvgAria);
  setElText("frontier-guide-text", t.frontierGuideText);
  setElText("chart-battle-title", t.chartBattleTitle);
  setElAria("battle-svg", t.battleSvgAria);
  setElText("ghost-legend-text", t.ghostLegendText);

  const tipEl = document.getElementById("strategy-tip-text");
  if (tipEl) {
    tipEl.innerHTML = t.strategyTipHtml;
  }

  if (!isSimulating && !lastSimulation) {
    setElText("news-ticker-text", t.defaultTicker);
  }

  setElText("btn-execute", isSimulating ? t.executingBtn : t.executeBtn);
  setElText("btn-next-quarter", t.nextQuarterBtn);
  setElText("btn-retry-run", t.retryRunBtn);

  setElText("help-dialog-title", t.helpDialogTitle);
  setElText("btn-help-ok", t.helpDialogOk);
  const helpBody = document.getElementById("help-dialog-body");
  if (helpBody) {
    helpBody.innerHTML = t.helpDialogHtml;
  }

  setElText("unlock-dialog-title", t.unlockDialogTitle);
  setElText("btn-unlock-ok", t.unlockDialogOk);

  for (const closeBtn of document.querySelectorAll("[data-close-dialog]")) {
    closeBtn.setAttribute("aria-label", t.helpDialogCloseAria);
  }

  for (const btn of document.querySelectorAll("[data-lang-btn]")) {
    const btnLang = btn.getAttribute("data-lang-btn");
    btn.classList.toggle("is-active", btnLang === lang);
  }

  renderRecordBadge();
  renderScoreboard();
  renderUniversePicker();
  renderAssetList();
  renderCorrelationMatrix();
  renderTelemetryAndCharts();
  if (lastSimulation) {
    showOutcomeBanner(lastSimulation);
  }
}

function renderRecordBadge(): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById("best-record-badge");
  if (!el) return;
  el.textContent = `🏆 BEST: Lv.${highestLevel} · ${formatMoney(peakAum)}`;
}

function renderScoreboard(): void {
  if (typeof document === "undefined") return;
  const regText = getLocalizedRegimeText(currentRegime, currentLang);
  const titleEl = document.getElementById("hud-regime-title");
  if (titleEl) titleEl.textContent = regText.title;

  const forecastEl = document.getElementById("hud-regime-forecast");
  if (forecastEl) forecastEl.textContent = regText.forecast;

  const capEl = document.getElementById("hud-cap-badge");
  if (capEl) {
    const capPct = Math.round(currentRegime.maxWeightPerAsset * 100);
    capEl.textContent =
      currentLang === "ja"
        ? `上限 ${capPct}%/銘柄`
        : currentLang === "zh"
          ? `单资产上限 ${capPct}%`
          : `MAX ${capPct}%/ASSET`;
  }

  const pAumEl = document.getElementById("hud-player-aum");
  if (pAumEl) pAumEl.textContent = formatMoney(playerAum);

  const pDeltaEl = document.getElementById("hud-player-delta");
  if (pDeltaEl) {
    const diff = playerAum - aiAum;
    const sign = diff >= 0 ? "+" : "";
    pDeltaEl.textContent = `vs WaSHI-QP: ${sign}${diff.toFixed(1)}M`;
  }

  const aAumEl = document.getElementById("hud-ai-aum");
  if (aAumEl) aAumEl.textContent = formatMoney(aiAum);

  const aPersonaEl = document.getElementById("hud-ai-persona");
  if (aPersonaEl) aPersonaEl.textContent = regText.rivalPersona;

  const floorValEl = document.getElementById("hud-floor-value");
  if (floorValEl) {
    if (lastSimulation) {
      const floorRate = lastSimulation.liquidationFloorRate ?? currentRegime.liquidationFloor;
      floorValEl.textContent = `${formatSignedPct(floorRate)} (${formatMoney(lastSimulation.liquidationAumFloor)})`;
    } else {
      const floorAum = playerAum * (1 + currentRegime.liquidationFloor);
      floorValEl.textContent = `${formatSignedPct(currentRegime.liquidationFloor)} (${formatMoney(floorAum)})`;
    }
  }
}

function renderUniversePicker(): void {
  if (typeof document === "undefined" || typeof document.createElement !== "function") return;
  const container = document.getElementById("universe-grid");
  const counterEl = document.getElementById("universe-pick-counter");
  if (!container) return;

  const maxPicks = currentLevelSpec.maxPicks;
  const currentCount = selectedAssetIds.length;
  if (counterEl) {
    counterEl.textContent =
      currentLang === "ja"
        ? `選択: ${currentCount} / ${maxPicks} 銘柄`
        : currentLang === "zh"
          ? `已选: ${currentCount} / ${maxPicks} 标的`
          : `SELECTED: ${currentCount} / ${maxPicks} ASSETS`;
  }

  container.innerHTML = "";
  const isMaxReached = currentCount >= maxPicks;

  for (const assetId of currentLevelSpec.unlockedAssetIds) {
    const asset = getAssetSpecById(assetId, currentLevel + 1);
    const loc = getLocalizedAsset(asset, currentLang);
    const isSelected = selectedAssetIds.includes(assetId);
    const isNew = currentLevelSpec.newAssetIds.includes(assetId);
    const isDisabled = !isSelected && isMaxReached;

    const card = document.createElement("div");
    card.className = `universe-card ${isSelected ? "is-selected" : ""} ${isDisabled ? "is-disabled" : ""}`;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-pressed", isSelected ? "true" : "false");
    card.title = `${loc.name} — ${loc.roleDesc}`;

    const t = pickLang(currentLang, UI_TEXT);
    card.innerHTML = `
      ${isNew ? '<span class="badge-new-asset">✨NEW</span>' : ""}
      <div class="card-top-row">
        <span class="card-ticker" style="color: ${asset.color}">${asset.ticker}</span>
        <span class="card-category-pill">${asset.category}</span>
      </div>
      <div class="card-name">${loc.name}</div>
      <div class="card-stats">
        <span class="stat-ret" title="${t.statExpReturnTitle}">${formatSignedPct(asset.expectedReturn)}</span>
        <span class="stat-vol" title="${t.statVolTitle}">σ${(asset.volatility * 100).toFixed(0)}%</span>
      </div>
    `;

    card.addEventListener("click", () => {
      if (isSimulating) return;
      toggleAssetSelection(assetId);
    });

    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (isSimulating) return;
        toggleAssetSelection(assetId);
      }
    });

    container.appendChild(card);
  }
}

function toggleAssetSelection(assetId: string): void {
  const idx = selectedAssetIds.indexOf(assetId);
  if (idx >= 0) {
    // Do not allow deselecting if it is the last asset
    if (selectedAssetIds.length <= 1) return;
    selectedAssetIds.splice(idx, 1);
  } else {
    if (selectedAssetIds.length >= currentLevelSpec.maxPicks) return;
    selectedAssetIds.push(assetId);
  }

  saveGameState();
  refreshRegimeAndSolvers();
}

function refreshRegimeAndSolvers(): void {
  const solveGen = ++currentSolveGeneration;
  currentRegime = buildSubsetRegime(currentLevel, selectedAssetIds);
  const regimeKey = `${currentLevel}:${currentRegime.selectedAssetIds.join(",")}`;

  // Invalidate cached AI optimal so old draft weights are never reused
  aiOptimal = null;
  aiOptimalRegimeKey = null;

  playerWeights = normalizeWeights(
    new Array<number>(currentRegime.assets.length).fill(1 / currentRegime.assets.length),
    currentRegime.maxWeightPerAsset
  );

  renderScoreboard();
  renderUniversePicker();
  renderAssetList();
  renderCorrelationMatrix();

  // Async solve QP for AI rival and pre-calculate efficient frontier
  solveQuantOptimalPortfolio(currentRegime)
    .then((res) => {
      if (solveGen !== currentSolveGeneration) return;
      aiOptimal = res;
      aiOptimalRegimeKey = regimeKey;
      frontierPoints = computeEfficientFrontier(currentRegime, 9);
      renderTelemetryAndCharts();
    })
    .catch(() => {
      // Fallback handles gracefully
    });
}

function renderAssetList(): void {
  if (typeof document === "undefined" || typeof document.createElement !== "function") return;
  const listEl = document.getElementById("asset-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  const n = currentRegime.assets.length;
  const t = pickLang(currentLang, UI_TEXT);
  currentRegime.assets.forEach((asset, idx) => {
    const loc = getLocalizedAsset(asset, currentLang);
    const weight = playerWeights[idx] ?? 0;
    const weightPct = (weight * 100).toFixed(1);

    const row = document.createElement("div");
    row.className = "asset-row";
    row.innerHTML = `
      <div class="asset-row-top">
        <div class="asset-meta">
          <span class="asset-color-swatch" style="background: ${asset.color}"></span>
          <span class="asset-ticker">${asset.ticker}</span>
          <span class="asset-name">${loc.name}</span>
        </div>
        <div class="asset-metrics-badge">
          <span class="badge-ret" title="${t.statRetBadgeTitle}">${formatSignedPct(asset.expectedReturn)}</span>
          <span class="badge-vol" title="${t.statVolBadgeTitle}">σ ${(asset.volatility * 100).toFixed(0)}%</span>
          <span class="asset-weight-value" id="weight-val-${idx}">${weightPct}%</span>
        </div>
      </div>
      <div class="slider-track-wrap">
        <input
          type="range"
          class="weight-slider"
          id="slider-${idx}"
          min="0"
          max="${Math.round(currentRegime.maxWeightPerAsset * 100)}"
          step="1"
          value="${Math.round(weight * 100)}"
          aria-label="${asset.ticker} ${t.sliderAriaSuffix}"
          ${isSimulating ? "disabled" : ""}
        />
      </div>
      <div class="asset-desc-sub">${loc.roleDesc}</div>
    `;

    const slider = row.querySelector(`#slider-${idx}`) as HTMLInputElement;
    if (slider) {
      slider.addEventListener("input", (e) => {
        const val = Number((e.target as HTMLInputElement).value) / 100;
        adjustSingleWeight(idx, val);
      });
    }

    listEl.appendChild(row);
  });
}

function adjustSingleWeight(index: number, newWeightRaw: number): void {
  if (isSimulating) return;
  const n = currentRegime.assets.length;
  const cap = currentRegime.maxWeightPerAsset;
  const targetW = Math.min(cap, Math.max(0, newWeightRaw));

  const next = playerWeights.slice();
  const othersIndices = [];
  let othersSum = 0;
  for (let i = 0; i < n; i++) {
    if (i !== index) {
      othersIndices.push(i);
      othersSum += next[i];
    }
  }

  next[index] = targetW;
  const remainder = 1.0 - targetW;

  if (othersIndices.length > 0) {
    if (othersSum > 1e-6) {
      for (const j of othersIndices) {
        next[j] = (next[j] / othersSum) * remainder;
      }
    } else {
      const share = remainder / othersIndices.length;
      for (const j of othersIndices) {
        next[j] = share;
      }
    }
  }

  playerWeights = normalizeWeights(next, cap);
  updateWeightDisplays();
  renderTelemetryAndCharts();
}

function updateWeightDisplays(): void {
  playerWeights.forEach((w, i) => {
    const valEl = document.getElementById(`weight-val-${i}`);
    if (valEl) valEl.textContent = `${(w * 100).toFixed(1)}%`;
    const slider = document.getElementById(`slider-${i}`) as HTMLInputElement;
    if (slider) slider.value = String(Math.round(w * 100));
  });
}

function renderCorrelationMatrix(): void {
  if (typeof document === "undefined" || typeof document.createElement !== "function") return;
  const container = document.getElementById("corr-matrix-container");
  if (!container) return;
  container.innerHTML = "";

  const assets = currentRegime.assets;
  const n = assets.length;
  const corr = currentRegime.correlation;

  const table = document.createElement("table");
  table.className = "corr-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.innerHTML = `<th class="corr-corner">R</th>`;
  for (let j = 0; j < n; j++) {
    headRow.innerHTML += `<th style="color: ${assets[j].color}">${assets[j].ticker}</th>`;
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (let i = 0; i < n; i++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<th style="color: ${assets[i].color}">${assets[i].ticker}</th>`;
    for (let j = 0; j < n; j++) {
      const val = corr[i][j];
      const td = document.createElement("td");
      const valText = val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
      td.textContent = valText;

      if (i === j) {
        td.className = "corr-cell diag";
      } else if (val < -0.3) {
        td.className = "corr-cell strong-neg";
        td.title = pickLang(currentLang, UI_TEXT).corrStrongNegTooltip;
      } else if (val < 0) {
        td.className = "corr-cell mod-neg";
      } else if (val > 0.6) {
        td.className = "corr-cell strong-pos";
      } else {
        td.className = "corr-cell neutral";
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

function renderTelemetryAndCharts(): void {
  if (typeof document === "undefined") return;
  const pMetrics = computePortfolioMetrics(currentRegime, playerWeights);

  const ruinEl = document.getElementById("metric-ruin-prob");
  if (ruinEl) {
    ruinEl.textContent = `${(pMetrics.ruinProbability * 100).toFixed(1)}%`;
  }

  const ruinBadge = document.getElementById("badge-ruin-status");
  if (ruinBadge) {
    if (pMetrics.ruinProbability < 0.05) {
      ruinBadge.textContent = "SAFE";
      ruinBadge.className = "risk-status-pill safe";
    } else if (pMetrics.ruinProbability < 0.15) {
      ruinBadge.textContent = "MODERATE";
      ruinBadge.className = "risk-status-pill mod";
    } else {
      ruinBadge.textContent = "HIGH DANGER";
      ruinBadge.className = "risk-status-pill danger";
    }
  }

  const ruinBar = document.getElementById("ruin-prob-bar");
  if (ruinBar && ruinBar.style) {
    const pct = Math.min(100, Math.max(2, pMetrics.ruinProbability * 250));
    ruinBar.style.width = `${pct}%`;
  }

  const aiRuinEl = document.getElementById("metric-ai-ruin-compare");
  if (aiRuinEl && aiOptimal) {
    aiRuinEl.textContent = `WaSHI-QP: ${(aiOptimal.metrics.ruinProbability * 100).toFixed(1)}%`;
  }

  const expRetEl = document.getElementById("metric-exp-return");
  if (expRetEl) {
    expRetEl.textContent = formatSignedPct(pMetrics.expectedReturn);
  }

  const t = pickLang(currentLang, UI_TEXT);
  const targetBadge = document.getElementById("metric-target-badge");
  if (targetBadge) {
    targetBadge.textContent = `${t.targetBadgePrefix} ${formatSignedPct(currentRegime.targetReturn)}`;
    targetBadge.className =
      pMetrics.expectedReturn >= currentRegime.targetReturn
        ? "target-pill achieved"
        : "target-pill";
  }

  const aiRetEl = document.getElementById("metric-ai-return-compare");
  if (aiRetEl && aiOptimal) {
    aiRetEl.textContent = `WaSHI-QP: ${formatSignedPct(aiOptimal.metrics.expectedReturn)}`;
  }

  const volRowEl = document.getElementById("metric-vol-row");
  if (volRowEl) {
    volRowEl.textContent = `${t.metricVolLabel}: ${(pMetrics.volatility * 100).toFixed(1)}% / Sharpe: ${pMetrics.sharpeRatio.toFixed(2)}`;
  }

  renderFrontierSvg(pMetrics);
  if (!isSimulating && !lastSimulation) {
    renderIdleBattleSvg();
  }
}

function renderFrontierSvg(pMetrics: { volatility: number; expectedReturn: number }): void {
  const svg = document.getElementById("frontier-svg");
  if (!svg) return;

  const w = 360;
  const h = 190;
  const padL = 44;
  const padR = 20;
  const padT = 20;
  const padB = 30;

  const minX = 0.02;
  const maxX = 0.32;
  const minY = 0.02;
  const maxY = 0.28;

  const toX = (v: number) => padL + ((v - minX) / (maxX - minX)) * (w - padL - padR);
  const toY = (r: number) => h - padB - ((r - minY) / (maxY - minY)) * (h - padT - padB);

  let pathD = "";
  if (frontierPoints.length > 0) {
    pathD = frontierPoints
      .map((pt, i) => `${i === 0 ? "M" : "L"} ${toX(pt.volatility).toFixed(1)} ${toY(pt.expectedReturn).toFixed(1)}`)
      .join(" ");
  }

  let assetDots = "";
  currentRegime.assets.forEach((a) => {
    const ax = toX(a.volatility);
    const ay = toY(a.expectedReturn);
    assetDots += `
      <circle cx="${ax}" cy="${ay}" r="3.5" fill="${a.color}" opacity="0.8" />
      <text x="${ax + 5}" y="${ay - 4}" fill="${a.color}" font-size="8.5" font-family="JetBrains Mono">${a.ticker}</text>
    `;
  });

  const px = toX(pMetrics.volatility);
  const py = toY(pMetrics.expectedReturn);

  let aiDot = "";
  if (aiOptimal) {
    const ax = toX(aiOptimal.metrics.volatility);
    const ay = toY(aiOptimal.metrics.expectedReturn);
    aiDot = `<polygon points="${ax},${ay - 6} ${ax + 6},${ay} ${ax},${ay + 6} ${ax - 6},${ay}" fill="#fbbf24" stroke="#000" stroke-width="1.2" />`;
  }

  svg.innerHTML = `
    <!-- Grid -->
    <line x1="${padL}" y1="${toY(0.05)}" x2="${w - padR}" y2="${toY(0.05)}" stroke="rgba(148,163,184,0.12)" />
    <line x1="${padL}" y1="${toY(0.10)}" x2="${w - padR}" y2="${toY(0.10)}" stroke="rgba(148,163,184,0.12)" />
    <line x1="${padL}" y1="${toY(0.15)}" x2="${w - padR}" y2="${toY(0.15)}" stroke="rgba(148,163,184,0.12)" />
    <line x1="${padL}" y1="${toY(0.20)}" x2="${w - padR}" y2="${toY(0.20)}" stroke="rgba(148,163,184,0.12)" />
    <!-- Axes -->
    <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="rgba(148,163,184,0.3)" />
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="rgba(148,163,184,0.3)" />
    <!-- Axis Labels -->
    <text x="${padL - 6}" y="${toY(0.05) + 3}" fill="#64748b" font-size="9" text-anchor="end" font-family="JetBrains Mono">5%</text>
    <text x="${padL - 6}" y="${toY(0.10) + 3}" fill="#64748b" font-size="9" text-anchor="end" font-family="JetBrains Mono">10%</text>
    <text x="${padL - 6}" y="${toY(0.15) + 3}" fill="#64748b" font-size="9" text-anchor="end" font-family="JetBrains Mono">15%</text>
    <text x="${padL - 6}" y="${toY(0.20) + 3}" fill="#64748b" font-size="9" text-anchor="end" font-family="JetBrains Mono">20%</text>
    <text x="${w - padR}" y="${h - padB + 16}" fill="#64748b" font-size="9" text-anchor="end" font-family="JetBrains Mono">${pickLang(currentLang, UI_TEXT).frontierAxisRisk}</text>
    <text x="${padL}" y="${padT - 6}" fill="#64748b" font-size="9" font-family="JetBrains Mono">↑ E[R]</text>
    <!-- Frontier curve -->
    ${pathD ? `<path d="${pathD}" fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="3,3" opacity="0.65" />` : ""}
    <!-- Asset Scatter -->
    ${assetDots}
    <!-- AI Optimal Diamond -->
    ${aiDot}
    <!-- Player Dot -->
    <circle cx="${px}" cy="${py}" r="6" fill="#38bdf8" stroke="#ffffff" stroke-width="2" />
  `;
}

function renderIdleBattleSvg(): void {
  const svg = document.getElementById("battle-svg");
  if (!svg) return;
  const w = 420;
  const h = 190;
  svg.innerHTML = `
    <rect width="${w}" height="${h}" fill="transparent" />
    <text x="${w / 2}" y="${h / 2 - 6}" fill="#64748b" font-size="12" text-anchor="middle" font-family="JetBrains Mono">
      60-DAY LIVE AUM SIMULATION
    </text>
    <text x="${w / 2}" y="${h / 2 + 14}" fill="#475569" font-size="10" text-anchor="middle">
      ${pickLang(currentLang, UI_TEXT).idleChartSub}
    </text>
  `;
}

function renderBattleSvgFrame(
  sim: MarketSimulationResult,
  dayLimit: number
): void {
  const svg = document.getElementById("battle-svg");
  if (!svg) return;

  const w = 420;
  const h = 190;
  const padL = 50;
  const padR = 20;
  const padT = 20;
  const padB = 26;

  const pSeries = sim.playerAumSeries.slice(0, dayLimit + 1);
  const aSeries = sim.aiAumSeries.slice(0, dayLimit + 1);
  const gSeries = sim.ghostSeries ? sim.ghostSeries.aumSeries.slice(0, dayLimit + 1) : [];

  let minAum = Math.min(...pSeries, ...aSeries, sim.liquidationAumFloor * 0.98);
  let maxAum = Math.max(...pSeries, ...aSeries, playerAum * 1.05);
  if (gSeries.length > 0) {
    minAum = Math.min(minAum, ...gSeries);
    maxAum = Math.max(maxAum, ...gSeries);
  }
  minAum = Math.floor(minAum / 5) * 5;
  maxAum = Math.ceil(maxAum / 5) * 5;

  const toX = (d: number) => padL + (d / 60) * (w - padL - padR);
  const toY = (a: number) => h - padB - ((a - minAum) / (maxAum - minAum || 1)) * (h - padT - padB);

  const floorY = toY(sim.liquidationAumFloor);

  const toPathD = (series: number[]) =>
    series.map((val, d) => `${d === 0 ? "M" : "L"} ${toX(d).toFixed(1)} ${toY(val).toFixed(1)}`).join(" ");

  const pPath = toPathD(pSeries);
  const aPath = toPathD(aSeries);
  const gPath = gSeries.length > 0 ? toPathD(gSeries) : "";

  let shockMarkers = "";
  sim.shocks.forEach((s) => {
    if (s.day <= dayLimit) {
      const sx = toX(s.day);
      shockMarkers += `
        <line x1="${sx}" y1="${padT}" x2="${sx}" y2="${h - padB}" stroke="#f43f5e" stroke-width="1" stroke-dasharray="2,2" opacity="0.6" />
        <polygon points="${sx - 4},${padT} ${sx + 4},${padT} ${sx},${padT + 6}" fill="#f43f5e" />
      `;
    }
  });

  const curDay = dayLimit;
  const pCurY = toY(pSeries[curDay]);
  const aCurY = toY(aSeries[curDay]);
  const pCurX = toX(curDay);

  svg.innerHTML = `
    <!-- Floor Danger Zone -->
    <rect x="${padL}" y="${floorY}" width="${w - padL - padR}" height="${h - padB - floorY}" fill="rgba(244,63,94,0.12)" />
    <line x1="${padL}" y1="${floorY}" x2="${w - padR}" y2="${floorY}" stroke="#f43f5e" stroke-width="1.5" stroke-dasharray="3,3" />
    <text x="${w - padR - 4}" y="${floorY - 4}" fill="#f43f5e" font-size="8.5" text-anchor="end" font-family="JetBrains Mono">
      FLOOR ${formatMoney(sim.liquidationAumFloor)}
    </text>

    <!-- Axes & Labels -->
    <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="rgba(148,163,184,0.2)" />
    <text x="${padL - 6}" y="${toY(playerAum) + 3}" fill="#64748b" font-size="8.5" text-anchor="end" font-family="JetBrains Mono">
      ${formatMoney(playerAum)}
    </text>
    <text x="${toX(1)}" y="${h - 8}" fill="#64748b" font-size="8.5" font-family="JetBrains Mono">D1</text>
    <text x="${toX(30)}" y="${h - 8}" fill="#64748b" font-size="8.5" text-anchor="middle" font-family="JetBrains Mono">D30</text>
    <text x="${toX(60)}" y="${h - 8}" fill="#64748b" font-size="8.5" text-anchor="end" font-family="JetBrains Mono">D60</text>

    <!-- Shocks -->
    ${shockMarkers}

    <!-- Ghost Single-Stock Trajectory (Dashed Red) -->
    ${gPath ? `<path d="${gPath}" fill="none" stroke="#f43f5e" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.65" />` : ""}

    <!-- Rival AI Trajectory (Amber) -->
    <path d="${aPath}" fill="none" stroke="#fbbf24" stroke-width="2.2" stroke-linecap="round" />
    <circle cx="${pCurX}" cy="${aCurY}" r="3.5" fill="#fbbf24" />

    <!-- Player Trajectory (Cyan) -->
    <path d="${pPath}" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" />
    <circle cx="${pCurX}" cy="${pCurY}" r="4.5" fill="#38bdf8" stroke="#ffffff" stroke-width="1.5" />

    <!-- Liquidation Callout Badge -->
    ${sim.playerLiquidated && dayLimit >= (sim.playerLiquidatedDay ?? 60)
      ? `
      <g transform="translate(${Math.min(w - padR - 75, Math.max(padL + 5, pCurX - 35))}, ${Math.max(padT + 12, pCurY - 20)})">
        <rect x="0" y="0" width="75" height="18" rx="4" fill="#dc2626" opacity="0.95" />
        <text x="37.5" y="12" fill="#ffffff" font-size="8.5" font-weight="bold" text-anchor="middle" font-family="JetBrains Mono">
          💥 LIQUIDATED
        </text>
      </g>
      `
      : ""}
  `;

  const counterEl = document.getElementById("chart-day-counter");
  if (counterEl) {
    if (sim.playerLiquidated && dayLimit >= (sim.playerLiquidatedDay ?? 60)) {
      counterEl.textContent = `DAY ${curDay} / 60 [LIQUIDATED]`;
      counterEl.classList.add("liquidated-badge");
    } else {
      counterEl.textContent = `DAY ${curDay} / 60`;
      counterEl.classList.remove("liquidated-badge");
    }
  }
}

async function runMarketSimulation(): Promise<void> {
  if (isSimulating) return;
  isSimulating = true;
  lastSimulation = null;

  const btnExec = document.getElementById("btn-execute") as HTMLButtonElement;
  const btnNext = document.getElementById("btn-next-quarter");
  const btnRetry = document.getElementById("btn-retry-run");
  const banner = document.getElementById("outcome-banner");
  const ghostLegend = document.getElementById("chart-ghost-legend");

  if (btnExec) {
    btnExec.disabled = true;
    btnExec.textContent = pickLang(currentLang, UI_TEXT).executingBtn;
  }
  if (btnNext) btnNext.hidden = true;
  if (btnRetry) btnRetry.hidden = true;
  if (banner) banner.hidden = true;
  if (ghostLegend) ghostLegend.hidden = true;

  // Ensure AI weights are ready for the active draft
  const currentKey = `${currentLevel}:${currentRegime.selectedAssetIds.join(",")}`;
  let aiWeights: number[];
  if (aiOptimal && aiOptimalRegimeKey === currentKey) {
    aiWeights = aiOptimal.weights;
  } else {
    const solved = await solveQuantOptimalPortfolio(currentRegime);
    aiOptimal = solved;
    aiOptimalRegimeKey = currentKey;
    aiWeights = solved.weights;
  }

  const result = simulateQuarterMarket({
    regime: currentRegime,
    playerWeights,
    aiWeights,
    playerStartAum: stageStartAum,
    aiStartAum: stageStartAum,
  });

  lastSimulation = result;

  // Animate 60 days smoothly over ~2.4 seconds
  let currentDay = 0;
  const stepInterval = 40;

  if (animTimerId !== null) {
    window.clearInterval(animTimerId);
  }

  animTimerId = window.setInterval(() => {
    currentDay += 1;
    renderBattleSvgFrame(result, currentDay);

    const hitShock = result.shocks.find((s) => s.day === currentDay);
    if (hitShock) {
      const tickerEl = document.getElementById("news-ticker-text");
      if (tickerEl) {
        tickerEl.textContent = `[DAY ${hitShock.day} SHOCK] ${pickLang(currentLang, hitShock.headline)}`;
      }
    }

    const hitPlayerLiquidation =
      result.playerLiquidated &&
      result.playerLiquidatedDay !== null &&
      currentDay >= result.playerLiquidatedDay;

    if (hitPlayerLiquidation || currentDay >= result.days) {
      if (animTimerId !== null) {
        window.clearInterval(animTimerId);
        animTimerId = null;
      }
      isSimulating = false;
      if (btnExec) {
        btnExec.disabled = false;
        btnExec.textContent = pickLang(currentLang, UI_TEXT).executeBtn;
      }
      onSimulationComplete(result);
    }
  }, stepInterval);
}

function onSimulationComplete(sim: MarketSimulationResult): void {
  playerAum = Math.max(0, sim.playerEndAum);
  aiAum = Math.max(0, sim.aiEndAum);
  peakAum = Math.max(peakAum, playerAum);

  const ghostLegend = document.getElementById("chart-ghost-legend");
  const ghostLegendText = document.getElementById("ghost-legend-text");
  if (ghostLegend && sim.ghostSeries) {
    ghostLegend.hidden = false;
    if (ghostLegendText) {
      const ghostStatus = sim.ghostSeries.liquidatedDay
        ? (currentLang === "ja"
            ? `[D${sim.ghostSeries.liquidatedDay}で即死退場]`
            : currentLang === "zh"
              ? `[第${sim.ghostSeries.liquidatedDay}日爆仓出局]`
              : `[Liquidated on Day ${sim.ghostSeries.liquidatedDay}]`)
        : (currentLang === "en"
            ? `[Ending: ${formatMoney(sim.ghostSeries.aumSeries[sim.days])}]`
            : `[期末: ${formatMoney(sim.ghostSeries.aumSeries[sim.days])}]`);
      ghostLegendText.textContent = `${pickLang(currentLang, sim.ghostSeries.label)} ${ghostStatus}`;
    }
  }

  renderScoreboard();
  renderRecordBadge();
  showOutcomeBanner(sim);
  saveGameState();

  const isWin = !sim.playerLiquidated && (sim.playerReturn >= sim.aiReturn || sim.aiLiquidated);
  if (isWin) {
    // Show unlock modal if next level has new assets
    showUnlockDialog(currentLevel + 1);
  }
}

function showOutcomeBanner(sim: MarketSimulationResult): void {
  const banner = document.getElementById("outcome-banner");
  const titleEl = document.getElementById("outcome-title");
  const detailEl = document.getElementById("outcome-detail");
  const weightsEl = document.getElementById("outcome-ai-weights");
  const btnNext = document.getElementById("btn-next-quarter");
  const btnRetry = document.getElementById("btn-retry-run");

  if (!banner || !titleEl || !detailEl || !weightsEl) return;
  banner.hidden = false;

  const playerWon = !sim.playerLiquidated && (sim.playerReturn >= sim.aiReturn || sim.aiLiquidated);
  const playerDied = sim.playerLiquidated;

  if (playerDied) {
    banner.className = "outcome-banner liquidated";
    titleEl.textContent =
      currentLang === "ja"
        ? `LEVEL ${currentLevel}: ロスカット破綻 (LIQUIDATED)`
        : currentLang === "zh"
          ? `第 ${currentLevel} 关：强平爆仓 (LIQUIDATED)`
          : `LEVEL ${currentLevel}: LIQUIDATED (GAME OVER)`;
    detailEl.textContent =
      currentLang === "ja"
        ? `Day ${sim.playerLiquidatedDay ?? 60} にロスカットライン (${formatMoney(sim.liquidationAumFloor)}) を割り込みました。守りの資産（BONDやGOLD）を混ぜて再挑戦しましょう。`
        : currentLang === "zh"
          ? `在第 ${sim.playerLiquidatedDay ?? 60} 交易日跌破强平线 (${formatMoney(sim.liquidationAumFloor)})。请搭配避险资产（国债或黄金）重试。`
          : `Fund breached the liquidation floor (${formatMoney(sim.liquidationAumFloor)}) on Day ${sim.playerLiquidatedDay ?? 60}. Incorporate defensive anchors like Bonds or Gold to stabilize variance.`;

    if (btnRetry) btnRetry.hidden = false;
    if (btnNext) btnNext.hidden = true;
  } else if (playerWon) {
    banner.className = "outcome-banner survived";
    titleEl.textContent =
      currentLang === "ja"
        ? `🏆 LEVEL ${currentLevel} クリア! WaSHI-QP に勝利!`
        : currentLang === "zh"
          ? `🏆 第 ${currentLevel} 关通关! 战胜 WaSHI-QP!`
          : `🏆 LEVEL ${currentLevel} CLEARED! Defeated WaSHI-QP!`;
    const delta = sim.playerEndAum - sim.aiEndAum;
    detailEl.textContent =
      currentLang === "ja"
        ? `あなたの運用益 ${formatSignedPct(sim.playerReturn)} (${formatMoney(sim.playerEndAum)}) が AI の ${formatSignedPct(sim.aiReturn)} を上回りました (+${formatMoney(delta)})! 新銘柄が解放されます。`
        : currentLang === "zh"
          ? `您的回报率 ${formatSignedPct(sim.playerReturn)} (${formatMoney(sim.playerEndAum)}) 超越了 AI 的 ${formatSignedPct(sim.aiReturn)} (+${formatMoney(delta)})! 已解锁全新标的。`
          : `Your quarterly return of ${formatSignedPct(sim.playerReturn)} (${formatMoney(sim.playerEndAum)}) beat AI's ${formatSignedPct(sim.aiReturn)} (+${formatMoney(delta)})! New assets unlocked.`;

    if (btnNext) btnNext.hidden = false;
    if (btnRetry) btnRetry.hidden = true;
  } else {
    banner.className = "outcome-banner survived";
    titleEl.textContent =
      currentLang === "ja"
        ? `LEVEL ${currentLevel}: 生存したが AI に惜敗…`
        : currentLang === "zh"
          ? `第 ${currentLevel} 关：存活但收益落后于 AI`
          : `LEVEL ${currentLevel}: Survived but Underperformed AI`;
    detailEl.textContent =
      currentLang === "ja"
        ? `破綻は回避しましたが、AI (WaSHI-QP) の期末資産 (${formatMoney(sim.aiEndAum)}) に届きませんでした。銘柄の組み合わせを工夫して再挑戦してみましょう。`
        : currentLang === "zh"
          ? `成功规避了爆仓，但期末资产未超越 AI (${formatMoney(sim.aiEndAum)})。请优化持仓组合再次挑战。`
          : `Survived without liquidation, but final AUM lagged behind WaSHI-QP (${formatMoney(sim.aiEndAum)}). Tune your asset selection and retry!`;

    if (btnRetry) btnRetry.hidden = false;
    if (btnNext) btnNext.hidden = true;
  }

  if (aiOptimal) {
    const aiItems = currentRegime.assets
      .map((a, i) => `${a.ticker}: ${(aiOptimal!.weights[i] * 100).toFixed(0)}%`)
      .join(" · ");
    const prefix = pickLang(currentLang, UI_TEXT).aiOptimalPrefix;
    weightsEl.textContent = `${prefix}: [ ${aiItems} ]`;
  }
}

function showUnlockDialog(nextLvl: number): void {
  const dialog = document.getElementById("unlock-dialog") as HTMLDialogElement;
  const body = document.getElementById("unlock-dialog-body");
  if (!dialog || !body) return;

  const nextSpec = getLevelSpec(nextLvl);
  if (nextSpec.newAssetIds.length === 0) return;

  let newCardsHtml = '<div class="unlock-asset-grid">';
  for (const id of nextSpec.newAssetIds) {
    const asset = getAssetSpecById(id, nextLvl + 1);
    const loc = getLocalizedAsset(asset, currentLang);
    newCardsHtml += `
      <div class="unlock-asset-card">
        <div class="unlock-asset-header">
          <span class="unlock-asset-ticker" style="color: ${asset.color}">${asset.ticker}</span>
          <span class="card-category-pill">${asset.category}</span>
        </div>
        <div class="unlock-asset-name">${loc.name}</div>
        <div class="card-stats">
          <span class="stat-ret">E[R]: ${formatSignedPct(asset.expectedReturn)}</span>
          <span class="stat-vol">σ: ${(asset.volatility * 100).toFixed(0)}%</span>
        </div>
        <div class="unlock-asset-desc">${loc.roleDesc}</div>
      </div>
    `;
  }
  newCardsHtml += "</div>";

  const descText =
    currentLang === "ja"
      ? `<p>おめでとうございます! <strong>Level ${currentLevel}</strong> を見事にクリアしました!<br>
         次の <strong>Level ${nextLvl}</strong> では、以下の新銘柄がアンロックされ、銘柄プールから最大 <strong>${nextSpec.maxPicks} 銘柄</strong> を選択できるようになります!</p>`
      : currentLang === "zh"
        ? `<p>恭喜通关! 您已成功攻克 <strong>第 ${currentLevel} 关</strong>!<br>
           在全新的 <strong>第 ${nextLvl} 关</strong> 中，以下新标的已加入资产池，可选持仓上限提升至 <strong>${nextSpec.maxPicks} 只</strong>!</p>`
        : `<p>Congratulations! You conquered <strong>Level ${currentLevel}</strong>!<br>
           In <strong>Level ${nextLvl}</strong>, the following new assets are unlocked and you can select up to <strong>${nextSpec.maxPicks} assets</strong>!</p>`;

  body.innerHTML = `${descText}${newCardsHtml}`;

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  }
}

function advanceToNextLevel(): void {
  currentLevel += 1;
  highestLevel = Math.max(highestLevel, currentLevel);
  currentLevelSpec = getLevelSpec(currentLevel);

  // Equal starting AUM for both player and rival in the new stage
  stageStartAum = playerAum;
  aiAum = playerAum;
  lastSimulation = null;

  // Auto-pick newly unlocked assets if room permits up to maxPicks
  selectedAssetIds = autoPickLevelAssets(selectedAssetIds, currentLevelSpec);

  saveGameState();
  refreshRegimeAndSolvers();

  const banner = document.getElementById("outcome-banner");
  if (banner) banner.hidden = true;
  const btnNext = document.getElementById("btn-next-quarter");
  if (btnNext) btnNext.hidden = true;
  const ghostLegend = document.getElementById("chart-ghost-legend");
  if (ghostLegend) ghostLegend.hidden = true;
}

function retryCurrentLevel(): void {
  // Fair retry from the stage's initial capital for both player and AI
  playerAum = stageStartAum;
  aiAum = stageStartAum;
  lastSimulation = null;

  const banner = document.getElementById("outcome-banner");
  if (banner) banner.hidden = true;
  const btnRetry = document.getElementById("btn-retry-run");
  if (btnRetry) btnRetry.hidden = true;
  const ghostLegend = document.getElementById("chart-ghost-legend");
  if (ghostLegend) ghostLegend.hidden = true;

  saveGameState();
  refreshRegimeAndSolvers();
}

function setupEventListeners(): void {
  const btnExec = document.getElementById("btn-execute");
  if (btnExec) btnExec.addEventListener("click", runMarketSimulation);

  const btnNext = document.getElementById("btn-next-quarter");
  if (btnNext) btnNext.addEventListener("click", advanceToNextLevel);

  const btnRetry = document.getElementById("btn-retry-run");
  if (btnRetry) btnRetry.addEventListener("click", retryCurrentLevel);

  const btnNewRun = document.getElementById("btn-new-run");
  if (btnNewRun) {
    btnNewRun.addEventListener("click", () => {
      const msg =
        currentLang === "ja"
          ? "初期資金 $100M、Level 1 から新しくやり直しますか？"
          : currentLang === "zh"
            ? "确定要从初始资金 $100M 重新开始第1关吗？"
            : "Reset progress and restart fresh from Level 1 ($100M)?";
      if (typeof window !== "undefined" && window.confirm && window.confirm(msg)) {
        resetToFreshRun();
      }
    });
  }

  const btnEqual = document.getElementById("btn-equal-weight");
  if (btnEqual) {
    btnEqual.addEventListener("click", () => {
      if (isSimulating) return;
      const n = currentRegime.assets.length;
      playerWeights = normalizeWeights(
        new Array<number>(n).fill(1 / n),
        currentRegime.maxWeightPerAsset
      );
      updateWeightDisplays();
      renderTelemetryAndCharts();
    });
  }

  const btnHedge = document.getElementById("btn-balance-hedge");
  if (btnHedge) {
    btnHedge.addEventListener("click", () => {
      if (isSimulating) return;
      const n = currentRegime.assets.length;
      const weights = new Array<number>(n).fill(0);
      let bondOrGoldIdx = -1;
      let stockIdx = -1;

      currentRegime.assets.forEach((a, i) => {
        if (a.category === "broad" && a.id === "bond") bondOrGoldIdx = i;
        else if (a.category === "commodity" && bondOrGoldIdx < 0) bondOrGoldIdx = i;
        else if (stockIdx < 0) stockIdx = i;
      });

      if (bondOrGoldIdx >= 0 && stockIdx >= 0) {
        weights[bondOrGoldIdx] = 0.45;
        weights[stockIdx] = 0.55;
      } else {
        weights.fill(1 / n);
      }

      playerWeights = normalizeWeights(weights, currentRegime.maxWeightPerAsset);
      updateWeightDisplays();
      renderTelemetryAndCharts();
    });
  }

  for (const btn of document.querySelectorAll("[data-lang-btn]")) {
    btn.addEventListener("click", () => {
      const lang = btn.getAttribute("data-lang-btn") as GameLang;
      if (lang) applyQuantStaticTranslations(lang);
    });
  }

  // Dialog open / close handlers
  const btnHelp = document.getElementById("btn-help");
  const helpDialog = document.getElementById("help-dialog") as HTMLDialogElement;
  if (btnHelp && helpDialog) {
    btnHelp.addEventListener("click", () => {
      if (typeof helpDialog.showModal === "function") {
        helpDialog.showModal();
      }
    });
  }

  const unlockDialog = document.getElementById("unlock-dialog") as HTMLDialogElement;
  const btnUnlockOk = document.getElementById("btn-unlock-ok");
  if (btnUnlockOk && unlockDialog) {
    btnUnlockOk.addEventListener("click", () => {
      unlockDialog.close();
      advanceToNextLevel();
    });
  }

  for (const btn of document.querySelectorAll("[data-close-dialog]")) {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-close-dialog");
      if (targetId) {
        const dlg = document.getElementById(targetId) as HTMLDialogElement;
        if (dlg && typeof dlg.close === "function") dlg.close();
      }
    });
  }

  // Backdrop click fallback
  for (const dlg of document.querySelectorAll("dialog")) {
    dlg.addEventListener("click", (e) => {
      const rect = dlg.getBoundingClientRect();
      const inDialog =
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width;
      if (!inDialog && typeof dlg.close === "function") {
        dlg.close();
      }
    });
  }
}

// Initialization on DOMContentLoaded
if (typeof document !== "undefined") {
  loadSaveState();
  currentRegime = buildSubsetRegime(currentLevel, selectedAssetIds);
  playerWeights = normalizeWeights(
    new Array<number>(currentRegime.assets.length).fill(1 / currentRegime.assets.length),
    currentRegime.maxWeightPerAsset
  );

  setupEventListeners();
  applyQuantStaticTranslations(currentLang);

  solveQuantOptimalPortfolio(currentRegime)
    .then((res) => {
      aiOptimal = res;
      frontierPoints = computeEfficientFrontier(currentRegime, 9);
      renderTelemetryAndCharts();
    })
    .catch(() => {
      // Fallback handles gracefully
    });
}
