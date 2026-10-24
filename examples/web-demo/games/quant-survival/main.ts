/// <reference types="vite/client" />
import { setHighsWasmUrl } from "../../../../src/index.js";
import { getGameLang, pickLang, setGameLang, type GameLang } from "../i18n.js";
import {
  getLocalizedAsset,
  getLocalizedRegimeText,
  getQuarterRegime,
} from "./regimes.js";
import {
  computeEfficientFrontier,
  computePortfolioMetrics,
  normalizeWeights,
  simulateQuarterMarket,
  solveQuantOptimalPortfolio,
} from "./solver.js";
import type {
  FrontierPoint,
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

const STORAGE_KEY = "washi_quant_survival_record_v1";

interface SaveRecord {
  bestQuarter: number;
  peakAum: number;
}

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
  allocPanelAria: string;
  allocHeading: string;
  allocSub: string;
  equalBtn: string;
  equalBtnTitle: string;
  hedgeBtn: string;
  hedgeBtnTitle: string;
  assetListAria: string;
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
  defaultTicker: string;
  executeBtn: string;
  executingBtn: string;
  nextQuarterBtn: string;
  retryRunBtn: string;
  helpDialogTitle: string;
  helpDialogCloseAria: string;
  helpDialogOk: string;
  helpDialogHtml: string;
}

const UI_TEXT: Record<GameLang, StaticStrings> = {
  ja: {
    pageTitle: "QUANT SURVIVAL | クオンツ運用サバイバル",
    backLink: "← ゲーム一覧",
    backLinkTitle: "ゲーム一覧へ戻る",
    brandSubtitle: "vs WaSHI-QP エンドレス運用バトル",
    recordTitle: "自己ベスト記録（最高到達期・最高総資産）",
    langGroupAria: "Language",
    helpBtn: "? ルール",
    helpBtnTitle: "遊び方と破綻確率の仕組み",
    newRunBtn: "↻ リセット",
    newRunBtnTitle: "初期資産$100Mから新しく始める",
    scoreboardAria: "運用資産スコアボード",
    quarterLabel: "CURRENT QUARTER",
    youLabel: "YOUR FUND (AUM)",
    aiLabel: "RIVAL: WaSHI-QP",
    floorLabel: "LIQUIDATION FLOOR",
    floorSub: "これ未満で即ロスカット退場",
    allocPanelAria: "ポートフォリオ配分パネル",
    allocHeading: "1. ポートフォリオ配分 (合計 100%)",
    allocSub: "スライダーを動かすと自動で合計100%に正規化されます",
    equalBtn: "均等配分",
    equalBtnTitle: "全銘柄に均等配分する",
    hedgeBtn: "逆相関ブレンド",
    hedgeBtnTitle: "逆相関ペアを組み合わせたバランス配分を試す",
    assetListAria: "投資対象銘柄リスト",
    corrHeading: "資産間相関係数マトリクス (青 = 逆相関ヘッジ効果大)",
    corrMatrixAria: "資産間相関係数マトリクス",
    telemetryPanelAria: "リスク計器盤と市場シミュレーション",
    labelRuinProb: "期末フロア割れ確率 (参考値)",
    labelExpReturn: "期待リターン (E[R])",
    chartFrontierTitle: "リスク・リターン平面 ＆ 効率的フロンティア",
    chartFrontierLegend: "● YOU   ◆ WaSHI-QP",
    frontierSvgAria: "効率的フロンティアとリスク・リターンプロット",
    chartBattleTitle: "60営業日 リアルタイム資産推移 (YOU vs WaSHI-QP)",
    battleSvgAria: "60営業日リアルタイム資産推移チャート",
    defaultTicker:
      "配分を調整して [MARKET OPEN] を押すと、60日間の市場シミュレーションが始まります。",
    executeBtn: "▶ MARKET OPEN (60日間バトル開始)",
    executingBtn: "⏳ MARKET RUNNING (60日間取引中...)",
    nextQuarterBtn: "次の四半期へ進む ▶",
    retryRunBtn: "↻ 初期資金 $100M から再挑戦",
    helpDialogTitle: "QUANT SURVIVAL — ルールと生き残り方",
    helpDialogCloseAria: "閉じる",
    helpDialogOk: "閉じる",
    helpDialogHtml: `
      <p>あなたはクオンツファンドの運用責任者です。初期資金 <strong>$100.0M</strong> からスタートし、毎期（60営業日）の市場ショックを乗り越えて資産を複利で増やし続けます。</p>
      <ul>
        <li><strong>ロスカット退場（LIQUIDATION FLOOR）</strong>：期中の資産または期末資産が「破綻ライン」を割り込むと即ゲームオーバーです。</li>
        <li><strong>破綻確率を下げるコツ（逆相関ヘッジ）</strong>：高リターン銘柄（TECHやQNTX）だけに集中投資すると、暴落イベントで簡単に破綻します。相関係数がマイナス（青色）の銘柄（GOLDやDFNSなど）を組み合わせると、期待リターンを高く保ったまま破綻確率だけを劇的に引き下げられます。</li>
        <li><strong>期末フロア割れ確率（参考値）</strong>：期末リターンを正規分布で近似し、破綻ラインを下回る確率を見積もった目安です。期中の一時的な下落やニュースショックは含まないため、実際に退場する確率はこれより高くなります。</li>
        <li><strong>ライバル WaSHI-QP</strong>：ブラウザ内の二次計画法ソルバーが毎期リアルタイムに最小分散ポートフォリオを構築して並走します。破綻せずにどこまで資産を伸ばせるか競いましょう。</li>
      </ul>
    `,
  },
  en: {
    pageTitle: "QUANT SURVIVAL | Endless Portfolio Duel",
    backLink: "← Games",
    backLinkTitle: "Back to Game Portal",
    brandSubtitle: "vs WaSHI-QP Endless AUM Duel",
    recordTitle: "Personal best record (Highest Quarter & Peak AUM)",
    langGroupAria: "Language",
    helpBtn: "? Rules",
    helpBtnTitle: "How to play and compress ruin probability",
    newRunBtn: "↻ Reset",
    newRunBtnTitle: "Start a fresh run from $100M AUM",
    scoreboardAria: "Asset Under Management Scoreboard",
    quarterLabel: "CURRENT QUARTER",
    youLabel: "YOUR FUND (AUM)",
    aiLabel: "RIVAL: WaSHI-QP",
    floorLabel: "LIQUIDATION FLOOR",
    floorSub: "Falling below this line ends your run",
    allocPanelAria: "Portfolio Allocation Controls",
    allocHeading: "1. Portfolio Weights (Total 100%)",
    allocSub: "Adjusting any slider automatically rebalances total weights to 100%",
    equalBtn: "Equal Weight",
    equalBtnTitle: "Distribute capital equally across all assets",
    hedgeBtn: "Hedge Blend",
    hedgeBtnTitle: "Try a balanced blend of negatively correlated assets",
    assetListAria: "Investable Assets",
    corrHeading: "Asset Correlation Matrix (Blue = Negative Correlation Hedge)",
    corrMatrixAria: "Asset Correlation Matrix",
    telemetryPanelAria: "Risk Telemetry and Market Simulation",
    labelRuinProb: "QUARTER-END SHORTFALL PROB. (ESTIMATE)",
    labelExpReturn: "EXPECTED RETURN (E[R])",
    chartFrontierTitle: "Risk-Return Plane & Efficient Frontier",
    chartFrontierLegend: "● YOU   ◆ WaSHI-QP",
    frontierSvgAria: "Risk-Return Efficient Frontier Plot",
    chartBattleTitle: "60-Day Live AUM Battle (YOU vs WaSHI-QP)",
    battleSvgAria: "60-Day Live Asset Battle Chart",
    defaultTicker:
      "Tune your weights and press [MARKET OPEN] to launch the 60-day market simulation.",
    executeBtn: "▶ MARKET OPEN (Launch 60-Day Battle)",
    executingBtn: "⏳ MARKET RUNNING (Simulating 60 Days...)",
    nextQuarterBtn: "Advance to Next Quarter ▶",
    retryRunBtn: "↻ Start New Run from $100M",
    helpDialogTitle: "QUANT SURVIVAL — Rules & Survival Guide",
    helpDialogCloseAria: "Close",
    helpDialogOk: "Got It",
    helpDialogHtml: `
      <p>You manage a quantitative hedge fund starting with <strong>$100.0M</strong> AUM. Compound your capital quarter after quarter without breaching the liquidation floor.</p>
      <ul>
        <li><strong>Liquidation Floor</strong>: If your fund drops below the red liquidation floor during or at the end of the 60-day quarter, you are liquidated (Game Over).</li>
        <li><strong>Correlation Hedging</strong>: Going 100% into a single high-return asset invites disaster when macro shocks hit. Combine negatively correlated assets (highlighted in blue, such as TECH + GOLD or NRGY) to slash ruin probability while preserving upside.</li>
        <li><strong>Quarter-End Shortfall Probability (Estimate)</strong>: A normal approximation of the chance that your quarter-end return finishes below the floor. It ignores intra-quarter dips and news shocks, so your actual liquidation risk is higher than this gauge.</li>
        <li><strong>Rival WaSHI-QP</strong>: Compete side-by-side against a live quadratic optimizer solving for minimum portfolio variance each quarter.</li>
      </ul>
    `,
  },
  zh: {
    pageTitle: "QUANT SURVIVAL | 量化生存战",
    backLink: "← 游戏列表",
    backLinkTitle: "返回游戏列表",
    brandSubtitle: "vs WaSHI-QP 无尽资产管理对决",
    recordTitle: "个人最佳记录（最高到达季度与最高总资产）",
    langGroupAria: "Language",
    helpBtn: "? 规则",
    helpBtnTitle: "玩法说明与降低爆仓概率技巧",
    newRunBtn: "↻ 重置",
    newRunBtnTitle: "从初始资金$100M重新开始",
    scoreboardAria: "基金管理规模记分板",
    quarterLabel: "CURRENT QUARTER",
    youLabel: "YOUR FUND (AUM)",
    aiLabel: "RIVAL: WaSHI-QP",
    floorLabel: "LIQUIDATION FLOOR",
    floorSub: "跌破此强平线即刻爆仓出局",
    allocPanelAria: "投资组合权重控制面板",
    allocHeading: "1. 投资组合配置 (合计 100%)",
    allocSub: "拖动滑块时会自动将总权重归一化为100%",
    equalBtn: "均等配置",
    equalBtnTitle: "将资金平均分配至所有资产",
    hedgeBtn: "负相关对冲",
    hedgeBtnTitle: "尝试结合负相关资产的对冲配置",
    assetListAria: "可投资资产列表",
    corrHeading: "资产相关系数矩阵 (蓝色 = 强负相关对冲效应)",
    corrMatrixAria: "资产相关系数矩阵",
    telemetryPanelAria: "风险仪表与市场模拟",
    labelRuinProb: "季末跌破强平线概率（参考值）",
    labelExpReturn: "预期收益率 (E[R])",
    chartFrontierTitle: "风险收益平面与有效前沿",
    chartFrontierLegend: "● YOU   ◆ WaSHI-QP",
    frontierSvgAria: "有效前沿与风险收益散点图",
    chartBattleTitle: "60交易日 实时净值对决 (YOU vs WaSHI-QP)",
    battleSvgAria: "60交易日实时净值对决图表",
    defaultTicker: "调整资产权重后点击 [MARKET OPEN] 启动60交易日市场行情模拟。",
    executeBtn: "▶ MARKET OPEN (开始60日行情对决)",
    executingBtn: "⏳ MARKET RUNNING (60日行情模拟中...)",
    nextQuarterBtn: "进入下一季度 ▶",
    retryRunBtn: "↻ 从初始资金 $100M 重新挑战",
    helpDialogTitle: "量化生存战 — 游戏规则与生存指南",
    helpDialogCloseAria: "关闭",
    helpDialogOk: "明白了",
    helpDialogHtml: `
      <p>你将作为量化基金经理，从 <strong>$100.0M</strong> 初始资金出发，在每个季度（60个交易日）的随机宏观冲击下实现复利增长。</p>
      <ul>
        <li><strong>强平爆仓线（Liquidation Floor）</strong>：若盘中或季末净值跌破红色强平线，基金即刻清盘出局。</li>
        <li><strong>利用负相关对冲风险</strong>：重仓单一高收益资产极易在市场冲击中爆仓。搭配相关系数为负（蓝色标记，如TECH搭配GOLD或DFNS）的资产，可以在保持预期回报的同时大幅压低爆仓概率。</li>
        <li><strong>季末跌破强平线概率（参考值）</strong>：以正态分布近似季末收益率，估算其低于强平线的概率。该数值不包含季度中途的暂时下跌与新闻冲击，因此实际出局概率会高于此仪表。</li>
        <li><strong>对手 WaSHI-QP</strong>：与浏览器内实时求解最小方差投资组合的对手同台竞技，挑战最高存活季度与最高资产规模。</li>
      </ul>
    `,
  },
};

let currentLang: GameLang = getGameLang();
let currentQuarter = 1;
let playerAum = 100.0;
let aiAum = 100.0;
let currentRegime: QuarterRegime = getQuarterRegime(1);
let playerWeights: number[] = [];
let aiOptimal: QuantOptimalResult | null = null;
let frontierPoints: FrontierPoint[] = [];
let isSimulating = false;
let lastSimulation: MarketSimulationResult | null = null;
let animTimerId: number | null = null;

function loadRecord(): SaveRecord {
  if (typeof window === "undefined") {
    return { bestQuarter: 1, peakAum: 100.0 };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { bestQuarter: 1, peakAum: 100.0 };
    const parsed = JSON.parse(raw) as Partial<SaveRecord>;
    return {
      bestQuarter: Math.max(1, Number(parsed.bestQuarter) || 1),
      peakAum: Math.max(100.0, Number(parsed.peakAum) || 100.0),
    };
  } catch {
    return { bestQuarter: 1, peakAum: 100.0 };
  }
}

function saveRecord(quarter: number, aum: number): SaveRecord {
  const prev = loadRecord();
  const next: SaveRecord = {
    bestQuarter: Math.max(prev.bestQuarter, quarter),
    peakAum: Math.max(prev.peakAum, aum),
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage errors
    }
  }
  return next;
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

  // Ensure document.documentElement.lang is exact lang code ("ja" | "en" | "zh")
  if (document.documentElement) {
    document.documentElement.lang = lang;
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

  setElAria("allocation-panel", t.allocPanelAria);
  setElText("alloc-heading", t.allocHeading);
  setElText("alloc-sub", t.allocSub);
  setElText("btn-equal-weight", t.equalBtn, t.equalBtnTitle);
  setElText("btn-balance-hedge", t.hedgeBtn, t.hedgeBtnTitle);
  setElAria("asset-list", t.assetListAria);
  setElText("corr-heading", t.corrHeading);
  setElAria("corr-matrix-container", t.corrMatrixAria);

  setElAria("telemetry-panel", t.telemetryPanelAria);
  setElText("label-ruin-prob", t.labelRuinProb);
  setElText("label-exp-return", t.labelExpReturn);
  setElText("chart-frontier-title", t.chartFrontierTitle);
  setElText("chart-frontier-legend", t.chartFrontierLegend);
  setElAria("frontier-svg", t.frontierSvgAria);
  setElText("chart-battle-title", t.chartBattleTitle);
  setElAria("battle-svg", t.battleSvgAria);

  if (!isSimulating && !lastSimulation) {
    setElText("news-ticker-text", t.defaultTicker);
  } else if (lastSimulation && lastSimulation.shocks.length > 0) {
    const lastShock = lastSimulation.shocks[lastSimulation.shocks.length - 1];
    setElText(
      "news-ticker-text",
      `[DAY ${lastShock.day}] ${pickLang(lang, lastShock.headline)}`
    );
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

  for (const closeBtn of document.querySelectorAll("[data-close-dialog]")) {
    closeBtn.setAttribute("aria-label", t.helpDialogCloseAria);
  }

  for (const btn of document.querySelectorAll("[data-lang-btn]")) {
    const btnLang = btn.getAttribute("data-lang-btn");
    btn.classList.toggle("is-active", btnLang === lang);
  }

  renderRecordBadge();
  renderScoreboard();
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
  const rec = loadRecord();
  el.textContent = `🏆 BEST: Q${rec.bestQuarter} · ${formatMoney(rec.peakAum)}`;
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
    pDeltaEl.textContent =
      currentLang === "ja"
        ? `vs WaSHI-QP: ${sign}${diff.toFixed(1)}M`
        : currentLang === "zh"
          ? `对比 WaSHI-QP: ${sign}${diff.toFixed(1)}M`
          : `vs WaSHI-QP: ${sign}${diff.toFixed(1)}M`;
  }

  const aAumEl = document.getElementById("hud-ai-aum");
  if (aAumEl) aAumEl.textContent = formatMoney(aiAum);

  const aPersonaEl = document.getElementById("hud-ai-persona");
  if (aPersonaEl) aPersonaEl.textContent = regText.rivalPersona;

  const floorValEl = document.getElementById("hud-floor-value");
  if (floorValEl) {
    const floorAum = playerAum * (1 + currentRegime.liquidationFloor);
    floorValEl.textContent = `${formatSignedPct(currentRegime.liquidationFloor)} (${formatMoney(floorAum)})`;
  }
}

function findStrongestNegativeCorrPeer(assetIndex: number): string {
  const row = currentRegime.correlation[assetIndex];
  let bestJ = -1;
  let minCorr = 0;
  for (let j = 0; j < row.length; j++) {
    if (j === assetIndex) continue;
    if (row[j] < minCorr) {
      minCorr = row[j];
      bestJ = j;
    }
  }
  if (bestJ < 0 || minCorr > -0.2) return "";
  const peer = currentRegime.assets[bestJ];
  return `vs ${peer.ticker} ${minCorr.toFixed(2)}`;
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
  const rem = Math.max(0, 1 - targetW);
  if (othersSum > 1e-6) {
    for (const j of othersIndices) {
      next[j] = (next[j] / othersSum) * rem;
    }
  } else {
    for (const j of othersIndices) {
      next[j] = rem / othersIndices.length;
    }
  }

  playerWeights = normalizeWeights(next, cap);
  renderAssetList();
  renderTelemetryAndCharts();
}

function renderAssetList(): void {
  if (typeof document === "undefined") return;
  const container = document.getElementById("asset-list");
  if (!container) return;

  const capPct = Math.round(currentRegime.maxWeightPerAsset * 100);
  const rowsHtml = currentRegime.assets
    .map((asset, i) => {
      const loc = getLocalizedAsset(asset, currentLang);
      const wPct = Math.round((playerWeights[i] ?? 0) * 100);
      const hedgeBadge = findStrongestNegativeCorrPeer(i);
      const muLabel =
        currentLang === "ja"
          ? `期待+${(asset.expectedReturn * 100).toFixed(1)}%`
          : currentLang === "zh"
            ? `预期+${(asset.expectedReturn * 100).toFixed(1)}%`
            : `E[R] +${(asset.expectedReturn * 100).toFixed(1)}%`;
      const volLabel = `σ ${(asset.volatility * 100).toFixed(1)}%`;
      const decAria =
        currentLang === "ja"
          ? `${asset.ticker}（${loc.name}）の配分を5%減らす`
          : currentLang === "zh"
            ? `减少 ${asset.ticker}（${loc.name}）权重 5%`
            : `Decrease ${asset.ticker} (${loc.name}) weight by 5%`;
      const sliderAria =
        currentLang === "ja"
          ? `${asset.ticker}（${loc.name}）の配分比率`
          : currentLang === "zh"
            ? `${asset.ticker}（${loc.name}）配置权重`
            : `${asset.ticker} (${loc.name}) portfolio weight`;
      const incAria =
        currentLang === "ja"
          ? `${asset.ticker}（${loc.name}）の配分を5%増やす`
          : currentLang === "zh"
            ? `增加 ${asset.ticker}（${loc.name}）权重 5%`
            : `Increase ${asset.ticker} (${loc.name}) weight by 5%`;

      return `
        <div class="asset-row" role="listitem">
          <div class="asset-row-top">
            <div class="asset-id-cluster">
              <span class="ticker-badge" style="background:${asset.color}">${asset.ticker}</span>
              <span class="asset-name">${loc.name}</span>
            </div>
            <div class="asset-stats-badges">
              <span class="stat-mu">${muLabel}</span>
              <span class="stat-vol">${volLabel}</span>
            </div>
          </div>
          <div class="asset-controls-row">
            <button type="button" class="btn-step" data-step-idx="${i}" data-step-delta="-0.05" aria-label="${decAria}" title="${decAria}">-</button>
            <input
              type="range"
              class="weight-slider"
              min="0"
              max="${capPct}"
              step="1"
              value="${wPct}"
              data-slider-idx="${i}"
              aria-label="${sliderAria}"
            />
            <button type="button" class="btn-step" data-step-idx="${i}" data-step-delta="0.05" aria-label="${incAria}" title="${incAria}">+</button>
            <span class="weight-pct">${wPct}%</span>
          </div>
          <div class="asset-role-line">
            <span>${loc.roleDesc}</span>
            ${hedgeBadge ? `<span class="hedge-chip">${hedgeBadge}</span>` : ""}
          </div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = rowsHtml;

  if (typeof container.querySelectorAll === "function") {
    for (const slider of container.querySelectorAll("[data-slider-idx]")) {
      slider.addEventListener("input", (e) => {
        const idx = Number((e.currentTarget as HTMLElement).getAttribute("data-slider-idx"));
        const val = Number((e.currentTarget as HTMLInputElement).value) / 100;
        adjustSingleWeight(idx, val);
      });
    }
    for (const btn of container.querySelectorAll("[data-step-idx]")) {
      btn.addEventListener("click", (e) => {
        const el = e.currentTarget as HTMLElement;
        const idx = Number(el.getAttribute("data-step-idx"));
        const delta = Number(el.getAttribute("data-step-delta"));
        adjustSingleWeight(idx, (playerWeights[idx] ?? 0) + delta);
      });
    }
  }
}

function renderCorrelationMatrix(): void {
  if (typeof document === "undefined") return;
  const container = document.getElementById("corr-matrix-container");
  if (!container) return;

  const assets = currentRegime.assets;
  const corr = currentRegime.correlation;

  let html = `<table class="corr-table"><thead><tr><th></th>`;
  for (const a of assets) {
    html += `<th>${a.ticker}</th>`;
  }
  html += `</tr></thead><tbody>`;

  for (let i = 0; i < assets.length; i++) {
    html += `<tr><th>${assets[i].ticker}</th>`;
    for (let j = 0; j < assets.length; j++) {
      const val = corr[i][j];
      let bg = "transparent";
      let color = "#cbd5e1";
      if (i === j) {
        bg = "rgba(148, 163, 184, 0.1)";
        color = "#64748b";
      } else if (val <= -0.45) {
        bg = "rgba(56, 189, 248, 0.25)";
        color = "#7dd3fc";
      } else if (val < -0.15) {
        bg = "rgba(56, 189, 248, 0.12)";
        color = "#bae6fd";
      } else if (val >= 0.4) {
        bg = "rgba(244, 63, 94, 0.2)";
        color = "#fda4af";
      }
      html += `<td style="background:${bg};color:${color}">${val.toFixed(2)}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  container.innerHTML = html;
}

function renderTelemetryAndCharts(): void {
  if (typeof document === "undefined") return;
  const pMetrics = computePortfolioMetrics(currentRegime, playerWeights);
  const aiMetrics = aiOptimal?.metrics ?? computePortfolioMetrics(currentRegime, playerWeights);

  const ruinPct = pMetrics.ruinProbability * 100;
  const aiRuinPct = aiMetrics.ruinProbability * 100;

  const ruinEl = document.getElementById("metric-ruin-prob");
  if (ruinEl) {
    ruinEl.textContent = `${ruinPct.toFixed(1)}%`;
    if (ruinEl.style) {
      ruinEl.style.color =
        ruinPct <= 3.0 ? "#34d399" : ruinPct <= 10.0 ? "#fbbf24" : "#fb7185";
    }
  }

  const badgeEl = document.getElementById("badge-ruin-status");
  if (badgeEl) {
    if (ruinPct <= 3.0) {
      badgeEl.className = "risk-status-pill safe";
      badgeEl.textContent =
        currentLang === "ja" ? "SAFE (低リスク)" : currentLang === "zh" ? "SAFE (安全)" : "SAFE";
    } else if (ruinPct <= 10.0) {
      badgeEl.className = "risk-status-pill caution";
      badgeEl.textContent =
        currentLang === "ja"
          ? "CAUTION (注意)"
          : currentLang === "zh"
            ? "CAUTION (警戒)"
            : "CAUTION";
    } else {
      badgeEl.className = "risk-status-pill danger";
      badgeEl.textContent =
        currentLang === "ja"
          ? "DANGER (危険)"
          : currentLang === "zh"
            ? "DANGER (高危)"
            : "DANGER";
    }
  }

  const aiRuinEl = document.getElementById("metric-ai-ruin-compare");
  if (aiRuinEl) {
    aiRuinEl.textContent = `WaSHI-QP: ${aiRuinPct.toFixed(1)}%`;
  }

  const barEl = document.getElementById("ruin-prob-bar");
  if (barEl) {
    const widthPct = Math.min(100, Math.max(3, ruinPct * 3.2));
    barEl.setAttribute("style", `width: ${widthPct.toFixed(1)}%`);
  }

  const targetBadge = document.getElementById("metric-target-badge");
  if (targetBadge) {
    const tPct = (currentRegime.targetReturn * 100).toFixed(1);
    targetBadge.textContent =
      currentLang === "ja"
        ? `目標 +${tPct}%`
        : currentLang === "zh"
          ? `目标 +${tPct}%`
          : `TARGET +${tPct}%`;
  }

  const expRetEl = document.getElementById("metric-exp-return");
  if (expRetEl) {
    expRetEl.textContent = formatSignedPct(pMetrics.expectedReturn);
  }

  const aiRetEl = document.getElementById("metric-ai-return-compare");
  if (aiRetEl) {
    aiRetEl.textContent = `WaSHI-QP: ${formatSignedPct(aiMetrics.expectedReturn)}`;
  }

  const volRowEl = document.getElementById("metric-vol-row");
  if (volRowEl) {
    const volPct = (pMetrics.volatility * 100).toFixed(1);
    const sharpe = pMetrics.sharpeRatio.toFixed(2);
    volRowEl.textContent =
      currentLang === "ja"
        ? `変動リスク (σ): ${volPct}% / Sharpe: ${sharpe}`
        : currentLang === "zh"
          ? `波动率 (σ): ${volPct}% / 夏普比率: ${sharpe}`
          : `Volatility (σ): ${volPct}% / Sharpe: ${sharpe}`;
  }

  renderFrontierSvg(pMetrics, aiMetrics);
  if (!isSimulating && !lastSimulation) {
    renderBattleSvgPreview();
  }
}

function renderFrontierSvg(
  pMetrics: ReturnType<typeof computePortfolioMetrics>,
  aiMetrics: ReturnType<typeof computePortfolioMetrics>
): void {
  const svg = document.getElementById("frontier-svg");
  if (!svg) return;

  const w = 360;
  const h = 190;
  const padL = 42;
  const padR = 18;
  const padT = 16;
  const padB = 26;

  const allVols = [
    ...currentRegime.assets.map((a) => a.volatility),
    ...frontierPoints.map((p) => p.volatility),
    pMetrics.volatility,
    aiMetrics.volatility,
  ];
  const allRets = [
    ...currentRegime.assets.map((a) => a.expectedReturn),
    ...frontierPoints.map((p) => p.expectedReturn),
    pMetrics.expectedReturn,
    aiMetrics.expectedReturn,
  ];

  const minVol = Math.max(0, Math.min(...allVols) - 0.02);
  const maxVol = Math.max(...allVols) + 0.03;
  const minRet = Math.min(...allRets) - 0.015;
  const maxRet = Math.max(...allRets) + 0.02;

  const xOf = (vol: number) =>
    padL + ((vol - minVol) / Math.max(1e-6, maxVol - minVol)) * (w - padL - padR);
  const yOf = (ret: number) =>
    h - padB - ((ret - minRet) / Math.max(1e-6, maxRet - minRet)) * (h - padT - padB);

  const frontierPath = frontierPoints
    .map((pt, idx) => `${idx === 0 ? "M" : "L"}${xOf(pt.volatility).toFixed(1)},${yOf(pt.expectedReturn).toFixed(1)}`)
    .join(" ");

  const targetY = yOf(currentRegime.targetReturn);

  const assetDots = currentRegime.assets
    .map((a) => {
      const cx = xOf(a.volatility).toFixed(1);
      const cy = yOf(a.expectedReturn).toFixed(1);
      return `
        <circle cx="${cx}" cy="${cy}" r="3.5" fill="${a.color}" opacity="0.85" />
        <text x="${Number(cx) + 5}" y="${Number(cy) + 3}" fill="#94a3b8" font-size="8.5" font-family="JetBrains Mono">${a.ticker}</text>
      `;
    })
    .join("");

  const px = xOf(pMetrics.volatility).toFixed(1);
  const py = yOf(pMetrics.expectedReturn).toFixed(1);
  const ax = xOf(aiMetrics.volatility).toFixed(1);
  const ay = yOf(aiMetrics.expectedReturn).toFixed(1);

  svg.innerHTML = `
    <rect x="${padL}" y="${padT}" width="${w - padL - padR}" height="${h - padT - padB}" fill="#0b1324" rx="6" />
    <line x1="${padL}" y1="${targetY.toFixed(1)}" x2="${w - padR}" y2="${targetY.toFixed(1)}" stroke="rgba(56,189,248,0.28)" stroke-dasharray="3 3" />
    <path d="${frontierPath}" fill="none" stroke="#10b981" stroke-width="2" opacity="0.8" />
    ${assetDots}
    <!-- Rival WaSHI-QP Diamond -->
    <polygon points="${ax},${Number(ay) - 6} ${Number(ax) + 6},${ay} ${ax},${Number(ay) + 6} ${Number(ax) - 6},${ay}" fill="#f59e0b" stroke="#080d19" stroke-width="1.2" />
    <!-- Player Circle -->
    <circle cx="${px}" cy="${py}" r="6" fill="#38bdf8" stroke="#e0f2fe" stroke-width="1.8" />
    <text x="${padL + 4}" y="${h - 7}" fill="#64748b" font-size="9" font-family="JetBrains Mono">Risk (σ) →</text>
    <text x="6" y="${padT + 10}" fill="#64748b" font-size="9" font-family="JetBrains Mono">E[R]</text>
  `;
}

function renderBattleSvgPreview(): void {
  const svg = document.getElementById("battle-svg");
  if (!svg) return;
  const w = 420;
  const h = 190;
  const padL = 46;
  const padR = 16;
  const padT = 16;
  const padB = 24;

  const startY = padT + (h - padT - padB) * 0.48;
  const floorY = padT + (h - padT - padB) * 0.82;
  const floorAum = playerAum * (1 + currentRegime.liquidationFloor);

  svg.innerHTML = `
    <rect x="${padL}" y="${padT}" width="${w - padL - padR}" height="${h - padT - padB}" fill="#0b1324" rx="6" />
    <line x1="${padL}" y1="${startY.toFixed(1)}" x2="${w - padR}" y2="${startY.toFixed(1)}" stroke="rgba(148,163,184,0.25)" stroke-dasharray="3 3" />
    <line x1="${padL}" y1="${floorY.toFixed(1)}" x2="${w - padR}" y2="${floorY.toFixed(1)}" stroke="#f43f5e" stroke-width="1.5" stroke-dasharray="4 3" />
    <text x="${padL + 6}" y="${(floorY - 5).toFixed(1)}" fill="#fb7185" font-size="9" font-family="JetBrains Mono">LIQUIDATION FLOOR (${formatMoney(floorAum)})</text>
    <text x="${padL + 6}" y="${(startY - 6).toFixed(1)}" fill="#94a3b8" font-size="9" font-family="JetBrains Mono">START ${formatMoney(playerAum)}</text>
  `;
}

function renderBattleSvgFrame(sim: MarketSimulationResult, dayStep: number): void {
  const svg = document.getElementById("battle-svg");
  if (!svg) return;

  const w = 420;
  const h = 190;
  const padL = 46;
  const padR = 16;
  const padT = 16;
  const padB = 24;

  const pSlice = sim.playerAumSeries.slice(0, dayStep + 1);
  const aSlice = sim.aiAumSeries.slice(0, dayStep + 1);

  const allVals = [
    ...sim.playerAumSeries,
    ...sim.aiAumSeries,
    sim.liquidationAumFloor * 0.985,
  ];
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals, sim.playerAumSeries[0] * 1.08);

  const xOf = (d: number) => padL + (d / sim.days) * (w - padL - padR);
  const yOf = (val: number) =>
    h - padB - ((val - minVal) / Math.max(1e-6, maxVal - minVal)) * (h - padT - padB);

  const pPath = pSlice
    .map((v, idx) => `${idx === 0 ? "M" : "L"}${xOf(idx).toFixed(1)},${yOf(v).toFixed(1)}`)
    .join(" ");
  const aPath = aSlice
    .map((v, idx) => `${idx === 0 ? "M" : "L"}${xOf(idx).toFixed(1)},${yOf(v).toFixed(1)}`)
    .join(" ");

  const floorY = yOf(sim.liquidationAumFloor);
  const startY = yOf(sim.playerAumSeries[0]);
  const lastPx = xOf(dayStep).toFixed(1);
  const lastPy = yOf(pSlice[pSlice.length - 1]).toFixed(1);
  const lastAy = yOf(aSlice[aSlice.length - 1]).toFixed(1);

  svg.innerHTML = `
    <rect x="${padL}" y="${padT}" width="${w - padL - padR}" height="${h - padT - padB}" fill="#0b1324" rx="6" />
    <line x1="${padL}" y1="${startY.toFixed(1)}" x2="${w - padR}" y2="${startY.toFixed(1)}" stroke="rgba(148,163,184,0.2)" stroke-dasharray="3 3" />
    <line x1="${padL}" y1="${floorY.toFixed(1)}" x2="${w - padR}" y2="${floorY.toFixed(1)}" stroke="#f43f5e" stroke-width="1.6" stroke-dasharray="4 3" />
    <path d="${aPath}" fill="none" stroke="#f59e0b" stroke-width="2" />
    <path d="${pPath}" fill="none" stroke="#38bdf8" stroke-width="2.5" />
    <circle cx="${lastPx}" cy="${lastAy}" r="3.5" fill="#f59e0b" />
    <circle cx="${lastPx}" cy="${lastPy}" r="4.5" fill="#38bdf8" stroke="#fff" stroke-width="1.2" />
    <text x="4" y="${floorY.toFixed(1)}" fill="#fb7185" font-size="8.5" font-family="JetBrains Mono">FLOOR</text>
  `;
}

async function loadQuarter(quarter: number): Promise<void> {
  if (animTimerId !== null && typeof window !== "undefined") {
    window.clearInterval(animTimerId);
    animTimerId = null;
  }
  isSimulating = false;
  lastSimulation = null;
  currentQuarter = quarter;
  currentRegime = getQuarterRegime(quarter);

  const n = currentRegime.assets.length;
  playerWeights = new Array<number>(n).fill(1 / n);
  frontierPoints = computeEfficientFrontier(currentRegime, 9);

  // Solve Rival WaSHI-QP optimal portfolio
  aiOptimal = await solveQuantOptimalPortfolio(currentRegime);

  if (typeof document !== "undefined") {
    const outcomeBanner = document.getElementById("outcome-banner");
    if (outcomeBanner) outcomeBanner.hidden = true;

    const btnExec = document.getElementById("btn-execute") as HTMLButtonElement | null;
    if (btnExec) {
      btnExec.hidden = false;
      btnExec.disabled = false;
      btnExec.textContent = pickLang(currentLang, UI_TEXT).executeBtn;
    }

    const btnNext = document.getElementById("btn-next-quarter");
    if (btnNext) btnNext.hidden = true;

    const btnRetry = document.getElementById("btn-retry-run");
    if (btnRetry) btnRetry.hidden = true;

    const dayCounter = document.getElementById("chart-day-counter");
    if (dayCounter) dayCounter.textContent = "DAY 0 / 60";

    const tickerText = document.getElementById("news-ticker-text");
    if (tickerText) tickerText.textContent = pickLang(currentLang, UI_TEXT).defaultTicker;
  }

  renderRecordBadge();
  renderScoreboard();
  renderAssetList();
  renderCorrelationMatrix();
  renderTelemetryAndCharts();
}

async function runMarketSimulation(): Promise<void> {
  if (isSimulating) return;
  isSimulating = true;

  if (!aiOptimal) {
    aiOptimal = await solveQuantOptimalPortfolio(currentRegime);
  }

  const sim = simulateQuarterMarket({
    regime: currentRegime,
    playerWeights,
    aiWeights: aiOptimal.weights,
    playerStartAum: playerAum,
    aiStartAum: aiAum,
  });
  lastSimulation = sim;

  const btnExec = document.getElementById("btn-execute") as HTMLButtonElement | null;
  if (btnExec) {
    btnExec.disabled = true;
    btnExec.textContent = pickLang(currentLang, UI_TEXT).executingBtn;
  }

  let day = 0;
  const finishSimulation = () => {
    isSimulating = false;
    playerAum = Math.max(0, Number(sim.playerEndAum.toFixed(2)));
    aiAum = Math.max(10, Number(sim.aiEndAum.toFixed(2)));

    if (!sim.playerLiquidated) {
      saveRecord(currentQuarter + 1, playerAum);
    } else {
      saveRecord(currentQuarter, Math.max(playerAum, sim.playerAumSeries[0]));
    }

    renderRecordBadge();
    renderScoreboard();
    showOutcomeBanner(sim);
  };

  if (typeof window === "undefined") {
    finishSimulation();
    return;
  }

  animTimerId = window.setInterval(() => {
    day += 2;
    if (day > sim.days) day = sim.days;

    const dayCounter = document.getElementById("chart-day-counter");
    if (dayCounter) dayCounter.textContent = `DAY ${day} / ${sim.days}`;

    renderBattleSvgFrame(sim, day);

    const hitShock = sim.shocks.find((s) => Math.abs(s.day - day) <= 1);
    if (hitShock) {
      const tickerText = document.getElementById("news-ticker-text");
      if (tickerText) {
        const msg = pickLang(currentLang, hitShock.headline);
        tickerText.textContent = `[DAY ${hitShock.day}] ${msg}`;
      }
    }

    if (day >= sim.days) {
      if (animTimerId !== null) {
        window.clearInterval(animTimerId);
        animTimerId = null;
      }
      finishSimulation();
    }
  }, 45);
}

function showOutcomeBanner(sim: MarketSimulationResult): void {
  if (typeof document === "undefined") return;
  const banner = document.getElementById("outcome-banner");
  const titleEl = document.getElementById("outcome-title");
  const detailEl = document.getElementById("outcome-detail");
  const aiWeightsEl = document.getElementById("outcome-ai-weights");
  const btnExec = document.getElementById("btn-execute");
  const btnNext = document.getElementById("btn-next-quarter");
  const btnRetry = document.getElementById("btn-retry-run");

  if (!banner || !titleEl || !detailEl || !aiWeightsEl) return;

  banner.hidden = false;
  banner.classList.toggle("liquidated", sim.playerLiquidated);

  const pRetStr = formatSignedPct(sim.playerReturn);
  const aRetStr = formatSignedPct(sim.aiReturn);

  if (sim.playerLiquidated) {
    titleEl.textContent =
      currentLang === "ja"
        ? `LIQUIDATED — Q${currentQuarter} ロスカット退場`
        : currentLang === "zh"
          ? `LIQUIDATED — Q${currentQuarter} 触发强平出局`
          : `LIQUIDATED — Q${currentQuarter} Margin Call`;
    detailEl.textContent =
      currentLang === "ja"
        ? `今期損益 ${pRetStr} (最終資産 ${formatMoney(playerAum)}) が破綻ラインを下回りました。WaSHI-QP 今期損益: ${aRetStr}`
        : currentLang === "zh"
          ? `本季收益 ${pRetStr} (最终资产 ${formatMoney(playerAum)}) 跌破强平线。WaSHI-QP 本季收益: ${aRetStr}`
          : `Quarter return ${pRetStr} (End AUM ${formatMoney(playerAum)}) breached the liquidation floor. WaSHI-QP return: ${aRetStr}`;

    if (btnExec) btnExec.hidden = true;
    if (btnNext) btnNext.hidden = true;
    if (btnRetry) btnRetry.hidden = false;
  } else {
    const beatAi = sim.playerReturn >= sim.aiReturn;
    titleEl.textContent =
      currentLang === "ja"
        ? `Q${currentQuarter} SURVIVED · ${beatAi ? "YOU BEAT WaSHI-QP" : "SURVIVED QUARTER"}`
        : currentLang === "zh"
          ? `Q${currentQuarter} 存活成功 · ${beatAi ? "击败 WaSHI-QP" : "顺利过关"}`
          : `Q${currentQuarter} SURVIVED · ${beatAi ? "YOU BEAT WaSHI-QP" : "QUARTER CLEARED"}`;
    detailEl.textContent =
      currentLang === "ja"
        ? `あなた: ${pRetStr} (総資産 ${formatMoney(playerAum)}) ／ WaSHI-QP: ${aRetStr} (総資産 ${formatMoney(aiAum)})`
        : currentLang === "zh"
          ? `你的收益: ${pRetStr} (总资产 ${formatMoney(playerAum)}) ／ WaSHI-QP: ${aRetStr} (总资产 ${formatMoney(aiAum)})`
          : `YOU: ${pRetStr} (AUM ${formatMoney(playerAum)}) / WaSHI-QP: ${aRetStr} (AUM ${formatMoney(aiAum)})`;

    if (btnExec) btnExec.hidden = true;
    if (btnNext) btnNext.hidden = false;
    if (btnRetry) btnRetry.hidden = true;
  }

  if (aiOptimal) {
    const breakdown = currentRegime.assets
      .map((a, idx) => `${a.ticker} ${Math.round((aiOptimal?.weights[idx] ?? 0) * 100)}%`)
      .join(" · ");
    aiWeightsEl.textContent = `WaSHI-QP Portfolio: ${breakdown}`;
  }
}

function initDomEvents(): void {
  if (typeof document === "undefined") return;

  for (const btn of document.querySelectorAll("[data-lang-btn]")) {
    btn.addEventListener("click", () => {
      const lang = btn.getAttribute("data-lang-btn");
      if (lang === "ja" || lang === "en" || lang === "zh") {
        applyQuantStaticTranslations(lang);
      }
    });
  }

  const btnEqual = document.getElementById("btn-equal-weight");
  btnEqual?.addEventListener("click", () => {
    if (isSimulating) return;
    const n = currentRegime.assets.length;
    playerWeights = new Array<number>(n).fill(1 / n);
    renderAssetList();
    renderTelemetryAndCharts();
  });

  const btnHedge = document.getElementById("btn-balance-hedge");
  btnHedge?.addEventListener("click", () => {
    if (isSimulating) return;
    const n = currentRegime.assets.length;
    const raw = currentRegime.assets.map((a) => {
      if (a.id === "tech" || a.id === "frontier") return 0.28;
      if (a.id === "gold" || a.id === "defense") return 0.28;
      if (a.id === "energy") return 0.22;
      return 0.12;
    });
    if (raw.length === n) {
      playerWeights = normalizeWeights(raw, currentRegime.maxWeightPerAsset);
      renderAssetList();
      renderTelemetryAndCharts();
    }
  });

  const btnExec = document.getElementById("btn-execute");
  btnExec?.addEventListener("click", () => {
    void runMarketSimulation();
  });

  const btnNext = document.getElementById("btn-next-quarter");
  btnNext?.addEventListener("click", () => {
    void loadQuarter(currentQuarter + 1);
  });

  const startFreshRun = () => {
    playerAum = 100.0;
    aiAum = 100.0;
    void loadQuarter(1);
  };

  const btnRetry = document.getElementById("btn-retry-run");
  btnRetry?.addEventListener("click", startFreshRun);

  const btnNewRun = document.getElementById("btn-new-run");
  btnNewRun?.addEventListener("click", startFreshRun);

  const helpDialog = document.getElementById("help-dialog") as HTMLDialogElement | null;
  const btnHelp = document.getElementById("btn-help");
  const btnCloseHelp = document.getElementById("btn-close-help");
  const btnHelpOk = document.getElementById("btn-help-ok");

  btnHelp?.addEventListener("click", () => {
    if (helpDialog && typeof helpDialog.showModal === "function") {
      helpDialog.showModal();
    }
  });

  const closeHelp = () => {
    if (helpDialog && typeof helpDialog.close === "function") {
      helpDialog.close();
    }
  };
  btnCloseHelp?.addEventListener("click", closeHelp);
  btnHelpOk?.addEventListener("click", closeHelp);

  // Fallback for browsers without native <dialog closedby="any"> support
  if (
    helpDialog &&
    typeof HTMLDialogElement !== "undefined" &&
    !("closedBy" in HTMLDialogElement.prototype)
  ) {
    helpDialog.addEventListener("click", (event: MouseEvent) => {
      if (event.target !== helpDialog) return;
      const rect = helpDialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (isDialogContent) return;
      helpDialog.close();
    });
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  initDomEvents();
  applyQuantStaticTranslations(currentLang);
  void loadQuarter(1);
}
