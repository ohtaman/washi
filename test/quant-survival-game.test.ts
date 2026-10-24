import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  choleskyDecompose,
  computeAnalyticalMinimumVariancePortfolio,
  computeEfficientFrontier,
  computePortfolioMetrics,
  evaluateFundTrack,
  normalCdf,
  quantizeWeightsToPercent,
  roundWeightsToHundred,
  simulateQuarterMarket,
  solveQuantOptimalPortfolio,
} from "../examples/web-demo/games/quant-survival/solver.js";
import {
  getLocalizedAsset,
  getLocalizedRegimeText,
  getQuarterRegime,
} from "../examples/web-demo/games/quant-survival/regimes.js";
import {
  advanceQuarter,
  applyQuantStaticTranslations,
  formatLiquidationDetail,
  getQuantGameState,
  latestRevealedShock,
  resolveDisplayedFloorAum,
  startMarketSimulation,
} from "../examples/web-demo/games/quant-survival/main.js";

describe("Quant Survival Portfolio Game (HiGHS Convex QP)", () => {
  it("computes accurate standard normal CDF values for ruin probability calculation", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-3.0)).toBeCloseTo(0.00135, 4);
  });

  it("demonstrates correlation hedging: combining negatively correlated assets reduces ruin probability", () => {
    const q1 = getQuarterRegime(1);
    const n = q1.assets.length;

    // 100% in high-volatility Tech (asset 0):
    // mu = 0.16, sigma = 0.24, floor = -0.055 => SF = 0.215 / 0.24 = 0.895833 => Phi(-0.895833) = 0.18517
    const allTech = new Array<number>(n).fill(0);
    allTech[0] = 1.0;
    const techMetrics = computePortfolioMetrics(q1, allTech);
    expect(techMetrics.expectedReturn).toBeCloseTo(0.16, 5);
    expect(techMetrics.volatility).toBeCloseTo(0.24, 4);
    expect(techMetrics.safetyFirstRatio).toBeCloseTo(0.215 / 0.24, 4);
    expect(techMetrics.ruinProbability).toBeCloseTo(0.1852, 3);

    // Hedged blend of Tech (0.45), Defense (0.30), and Gold (0.25):
    // mu = 0.45*0.16 + 0.30*0.115 + 0.25*0.085 = 0.12775
    const hedged = new Array<number>(n).fill(0);
    hedged[0] = 0.45;
    hedged[1] = 0.30;
    hedged[2] = 0.25;
    const hedgedMetrics = computePortfolioMetrics(q1, hedged);
    expect(hedgedMetrics.expectedReturn).toBeCloseTo(0.12775, 5);
    expect(hedgedMetrics.volatility).toBeCloseTo(0.08625, 4);
    expect(hedgedMetrics.ruinProbability).toBeCloseTo(0.0171, 3);

    expect(hedgedMetrics.volatility).toBeLessThan(techMetrics.volatility * 0.65);
    expect(hedgedMetrics.ruinProbability).toBeLessThan(techMetrics.ruinProbability);
    expect(hedgedMetrics.expectedReturn).toBeGreaterThanOrEqual(q1.targetReturn);
  });

  it("generates positive-definite covariance matrices and solves WaSHI Convex QP to Optimal across Endless Quarters 1..15", async () => {
    for (const q of [1, 2, 3, 4, 5, 6, 8, 10, 15]) {
      const regime = getQuarterRegime(q);
      const regimeAgain = getQuarterRegime(q);
      expect(regimeAgain.id).toBe(regime.id);
      expect(regimeAgain.covariance).toEqual(regime.covariance);

      // Cholesky decomposition must succeed with strictly positive diagonal entries
      const L = choleskyDecompose(regime.covariance);
      expect(L.length).toBe(regime.assets.length);
      for (let i = 0; i < L.length; i++) {
        expect(L[i][i]).toBeGreaterThan(0);
      }

      // Solve WaSHI Convex QP for rival AI portfolio
      const qpResult = await solveQuantOptimalPortfolio(regime);
      expect(qpResult.status).toBe("Optimal");
      expect(qpResult.verified).toBe(true);
      expect(qpResult.weights.length).toBe(regime.assets.length);

      const weightSum = qpResult.weights.reduce((acc, val) => acc + val, 0);
      expect(weightSum).toBeCloseTo(1.0, 4);

      for (const w of qpResult.weights) {
        expect(w).toBeGreaterThanOrEqual(-1e-5);
        expect(w).toBeLessThanOrEqual(regime.maxWeightPerAsset + 1e-4);
      }

      // Independent evaluation of the optimal weights must satisfy targetReturn and minimize variance
      const optMetrics = computePortfolioMetrics(regime, qpResult.weights);
      expect(optMetrics.expectedReturn).toBeGreaterThanOrEqual(regime.targetReturn - 1e-4);

      // Perturb weights toward equal-weight and confirm that if equal-weight meets targetReturn,
      // the QP solution has lower or equal variance
      const equalWeight = new Array<number>(regime.assets.length).fill(1 / regime.assets.length);
      const eqMetrics = computePortfolioMetrics(regime, equalWeight);
      if (eqMetrics.expectedReturn >= regime.targetReturn - 1e-5) {
        expect(optMetrics.variance).toBeLessThanOrEqual(eqMetrics.variance + 1e-5);
      }
    }
  });

  it("computes a monotonically increasing Efficient Frontier curve", () => {
    const regime = getQuarterRegime(2);
    const frontier = computeEfficientFrontier(regime, 7);
    expect(frontier.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < frontier.length; i++) {
      expect(frontier[i].expectedReturn).toBeGreaterThanOrEqual(frontier[i - 1].expectedReturn - 1e-6);
      expect(frontier[i].volatility).toBeGreaterThanOrEqual(frontier[i - 1].volatility - 1e-4);
    }
  });

  it("simulates a 60-day market battle deterministically and compounds or liquidates accurately", async () => {
    const regime = getQuarterRegime(1);
    const qpResult = await solveQuantOptimalPortfolio(regime);
    const playerWeights = qpResult.weights.slice();

    const simA = simulateQuarterMarket({
      regime,
      playerWeights,
      aiWeights: qpResult.weights,
      playerStartAum: 100,
      aiStartAum: 100,
      seed: 424242,
    });
    const simB = simulateQuarterMarket({
      regime,
      playerWeights,
      aiWeights: qpResult.weights,
      playerStartAum: 100,
      aiStartAum: 100,
      seed: 424242,
    });

    expect(simA.days).toBe(60);
    expect(simA.playerAumSeries.length).toBe(61);
    expect(simA.aiAumSeries.length).toBe(61);
    expect(simA.playerEndAum).toBeCloseTo(simB.playerEndAum, 8);
    expect(simA.playerReturn).toBeCloseTo(simA.aiReturn, 8);
    expect(simA.shocks.length).toBeGreaterThanOrEqual(1);

    // After the quarter, the scoreboard must keep showing the floor that was applied
    // (quarter-start $100M * (1 - 5.5%) = $94.5M), not one recomputed from the ending AUM
    expect(resolveDisplayedFloorAum(100, regime, null)).toBeCloseTo(94.5, 8);
    expect(resolveDisplayedFloorAum(110, regime, simA)).toBeCloseTo(94.5, 8);
  });

  it("liquidates on any intra-quarter floor breach and rejects infeasible targets", async () => {
    const q1 = getQuarterRegime(1);
    const n = q1.assets.length;
    const allTech = new Array<number>(n).fill(0);
    allTech[0] = 1;
    const hedged = new Array<number>(n).fill(0);
    hedged[0] = 0.45;
    hedged[1] = 0.3;
    hedged[2] = 0.25;

    let sawIntraQuarterOnlyBreach = false;
    for (let s = 1; s <= 300; s++) {
      const sim = simulateQuarterMarket({
        regime: q1,
        playerWeights: allTech,
        aiWeights: hedged,
        playerStartAum: 100,
        aiStartAum: 100,
        seed: s * 7919,
      });
      // Liquidation is a barrier event: any daily AUM observation below the floor ends the run
      const breached = sim.playerAumSeries.some((v) => v < sim.liquidationAumFloor);
      expect(sim.playerLiquidated).toBe(breached);
      if (breached && sim.playerEndAum >= sim.liquidationAumFloor) {
        sawIntraQuarterOnlyBreach = true;
      }
    }
    // The gauge is a terminal-return estimate, so paths that breach and recover must exist
    expect(sawIntraQuarterOnlyBreach).toBe(true);

    // News headlines must describe the direction of the impulse actually applied
    let sawReversed = false;
    let sawForward = false;
    for (const q of [1, 2, 3, 4, 5]) {
      const regime = getQuarterRegime(q);
      const w = new Array<number>(regime.assets.length).fill(0);
      w[0] = 1; // all-in on asset 0 so the sign of playerImpact reveals the applied direction
      for (let s = 1; s <= 40; s++) {
        const sim = simulateQuarterMarket({
          regime,
          playerWeights: w,
          aiWeights: w,
          playerStartAum: 100,
          aiStartAum: 100,
          seed: s * 104729 + q,
        });
        for (const fired of sim.shocks) {
          const spec = regime.candidateShocks.find((c) => c.day === fired.day);
          expect(spec).toBeDefined();
          if (!spec) continue;
          const forwardImpact = spec.assetImpulses[0];
          const appliedForward = Math.sign(fired.playerImpact) === Math.sign(forwardImpact);
          expect(fired.reversed).toBe(!appliedForward);
          expect(fired.headline).toEqual(appliedForward ? spec.headline : spec.reversedHeadline);
          if (appliedForward) sawForward = true;
          else sawReversed = true;
        }
      }
    }
    expect(sawForward).toBe(true);
    expect(sawReversed).toBe(true);

    // The ticker only reveals shocks the animation has reached (announced within 1 day)
    const q1Sim = simulateQuarterMarket({
      regime: q1,
      playerWeights: allTech,
      aiWeights: hedged,
      playerStartAum: 100,
      aiStartAum: 100,
      seed: 31337,
    });
    const [firstShock, secondShock] = q1Sim.shocks; // Q1 shocks fire on day 22 and 44
    expect(latestRevealedShock(q1Sim, 0)).toBeNull();
    expect(latestRevealedShock(q1Sim, 20)).toBeNull();
    expect(latestRevealedShock(q1Sim, 21)?.day).toBe(firstShock.day);
    expect(latestRevealedShock(q1Sim, 42)?.day).toBe(firstShock.day);
    expect(latestRevealedShock(q1Sim, 60)?.day).toBe(secondShock.day);

    // The liquidation banner must report the actual breach day and intra-quarter low,
    // not attribute the breach to the (recovered) quarter-end values
    let recovered: ReturnType<typeof simulateQuarterMarket> | null = null;
    for (let s = 1; s <= 300 && !recovered; s++) {
      const sim = simulateQuarterMarket({
        regime: q1,
        playerWeights: allTech,
        aiWeights: hedged,
        playerStartAum: 100,
        aiStartAum: 100,
        seed: s * 7919,
      });
      if (sim.playerLiquidated && sim.playerEndAum >= sim.liquidationAumFloor) recovered = sim;
    }
    expect(recovered).not.toBeNull();
    if (recovered) {
      const floorAum = recovered.liquidationAumFloor;
      const firstBreachDay = recovered.playerAumSeries.findIndex((v) => v < floorAum);
      expect(recovered.playerLiquidatedDay).toBe(firstBreachDay);
      const en = formatLiquidationDetail("en", recovered);
      expect(en).toContain(`DAY ${firstBreachDay}`);
      expect(en).toContain(`$${Math.min(...recovered.playerAumSeries).toFixed(1)}M`);
      expect(en).toContain("$94.5M");
      expect(formatLiquidationDetail("ja", recovered)).toContain(`DAY ${firstBreachDay}`);
      expect(formatLiquidationDetail("zh", recovered)).toContain(`第 ${firstBreachDay} 个交易日`);
    }

    // Analytical fallback must satisfy feasible Q1 targetReturn (10.5%)
    const fallbackFeasible = computeAnalyticalMinimumVariancePortfolio(q1, q1.targetReturn);
    expect(fallbackFeasible.metrics.expectedReturn).toBeGreaterThanOrEqual(q1.targetReturn - 1e-4);
    expect(fallbackFeasible.metrics.isNormalized).toBe(true);
    expect(fallbackFeasible.metrics.isWithinCap).toBe(true);

    // Unachievable targetReturn (e.g. 50%) must NOT be marked Optimal / verified: true
    const impossibleResult = await solveQuantOptimalPortfolio(q1, 0.5);
    expect(impossibleResult.status).toBe("Infeasible");
    expect(impossibleResult.verified).toBe(false);
  });

  it("enforces editorial & i18n rules across Portal, Quant Survival, and Theory Article (no 核心, no ！, no algorithm names on Portal, full ja/en/zh)", () => {
    const gamesRoot = resolve(__dirname, "../examples/web-demo/games");
    const portalHtml = readFileSync(resolve(gamesRoot, "index.html"), "utf8");
    const quantTheoryHtml = readFileSync(
      resolve(gamesRoot, "quant-survival-theory/index.html"),
      "utf8"
    );

    // 1. Theory page must not contain "核心"
    expect(quantTheoryHtml).not.toContain("核心");

    // 2. None of the files contain full-width exclamation mark "！"
    const filesToCheck = [
      "index.html",
      "quant-survival-theory/index.html",
      "quant-survival/index.html",
      "quant-survival/main.ts",
      "quant-survival/regimes.ts",
      "quant-survival/solver.ts",
      "quant-survival/types.ts",
    ];
    for (const relPath of filesToCheck) {
      const content = readFileSync(resolve(gamesRoot, relPath), "utf8");
      expect(content, `${relPath} should not contain ！`).not.toContain("！");
      expect(content, `${relPath} should not contain 核心`).not.toContain("核心");
    }

    // 3. Portal Card 3 is live (not coming-soon) and hides algorithm names
    expect(portalHtml).toContain('./quant-survival/');
    expect(portalHtml).toContain('./quant-survival-theory/');
    expect(portalHtml).not.toContain("二次計画法");
    expect(portalHtml).not.toContain("マーコウィッツ");
    expect(portalHtml).not.toContain("QP");
    expect(portalHtml).not.toContain("MILP");

    // 3b. Game UI files must not expose "WaSHI-QP" or solver/algorithm names
    for (const gameUiPath of [
      "quant-survival/index.html",
      "quant-survival/main.ts",
      "quant-survival/regimes.ts",
    ]) {
      const uiContent = readFileSync(resolve(gamesRoot, gameUiPath), "utf8");
      expect(uiContent, `${gameUiPath} should not contain WaSHI-QP`).not.toContain("WaSHI-QP");
      expect(uiContent, `${gameUiPath} should not contain 二次計画法`).not.toContain("二次計画法");
      expect(uiContent, `${gameUiPath} should not contain マーコウィッツ`).not.toContain(
        "マーコウィッツ"
      );
      expect(uiContent, `${gameUiPath} should not contain Markowitz`).not.toContain("Markowitz");
    }

    // 4. Theory page has ja, en, zh sections and distinguishes quarter-end shortfall estimate from intra-quarter barrier
    expect(quantTheoryHtml).toContain('data-lang-section="ja"');
    expect(quantTheoryHtml).toContain('data-lang-section="en"');
    expect(quantTheoryHtml).toContain('data-lang-section="zh"');
    expect(quantTheoryHtml).toContain("期末フロア割れ確率");
    expect(quantTheoryHtml).toContain("quarter-end shortfall probability (estimate)");
    expect(quantTheoryHtml).toContain("季末跌破强平线概率");

    // 5. Regime & asset localization
    const q1 = getQuarterRegime(1);
    const textJa = getLocalizedRegimeText(q1, "ja");
    const textEn = getLocalizedRegimeText(q1, "en");
    const textZh = getLocalizedRegimeText(q1, "zh");
    expect(textEn.title).not.toBe(textJa.title);
    expect(textZh.title).not.toBe(textJa.title);

    const assetEn = getLocalizedAsset(q1.assets[0], "en");
    const assetZh = getLocalizedAsset(q1.assets[0], "zh");
    expect(assetEn.name).not.toMatch(/[ぁ-んァ-ヶ]/);
    expect(assetZh.name).not.toMatch(/[ぁ-んァ-ヶ]/);
  });

  it("switches all static UI elements, tooltips, and aria-labels in quant-survival to en and zh with zero leftover Japanese kana", () => {
    interface MockElement {
      id: string;
      textContent: string;
      innerHTML: string;
      title: string;
      hidden: boolean;
      open: boolean;
      dataset: Record<string, string>;
      classList: {
        toggle: () => void;
        add: () => void;
        remove: () => void;
      };
      setAttribute: (attr: string, val: string) => void;
      getAttribute: (attr: string) => string | null;
    }

    const gamesRoot = resolve(__dirname, "../examples/web-demo/games");
    const quantHtml = readFileSync(resolve(gamesRoot, "quant-survival/index.html"), "utf8");

    const byId = new Map<string, MockElement>();
    const allElements: MockElement[] = [];
    const langBtns: MockElement[] = [];
    const closeBtns: MockElement[] = [];

    const tagRegex = /<([a-zA-Z0-9-]+)\b([^>]*)>/g;
    for (const match of quantHtml.matchAll(tagRegex)) {
      const attrsRaw = match[2];
      const attrs = new Map<string, string>();
      for (const attrMatch of attrsRaw.matchAll(/([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g)) {
        attrs.set(attrMatch[1], attrMatch[2] ?? "");
      }
      const id = attrs.get("id") ?? "";
      const hasLangBtn = attrs.has("data-lang-btn");
      const hasCloseDialog = attrs.has("data-close-dialog");
      const hasAriaLabel = attrs.has("aria-label");
      const hasTitle = attrs.has("title");
      const hasAlt = attrs.has("alt");

      if (!id && !hasLangBtn && !hasCloseDialog && !hasAriaLabel && !hasTitle && !hasAlt) {
        continue;
      }

      const el: MockElement = {
        id,
        textContent: "__JA_INITIAL__",
        innerHTML: "__JA_INITIAL__",
        title: attrs.get("title") ?? "",
        hidden: attrs.has("hidden"),
        open: false,
        dataset: hasLangBtn ? { langBtn: attrs.get("data-lang-btn") ?? "" } : {},
        classList: {
          toggle: () => {},
          add: () => {},
          remove: () => {},
        },
        setAttribute: (attr: string, val: string) => {
          attrs.set(attr, val);
        },
        getAttribute: (attr: string) => attrs.get(attr) ?? null,
      };

      allElements.push(el);
      if (id) byId.set(id, el);
      if (hasLangBtn) langBtns.push(el);
      if (hasCloseDialog) closeBtns.push(el);
    }

    const mockDoc = {
      documentElement: { lang: "ja" },
      title: "",
      getElementById: (id: string) => byId.get(id) ?? null,
      querySelectorAll: (selector: string) => {
        if (selector === "[data-lang-btn]") return langBtns;
        if (selector === "[data-close-dialog]") return closeBtns;
        return [];
      },
    };

    const prevDocument = (globalThis as { document?: unknown }).document;
    try {
      (globalThis as { document?: unknown }).document = mockDoc;

      applyQuantStaticTranslations("en");
      expect(mockDoc.documentElement.lang).toBe("en");
      expect(mockDoc.title).toContain("QUANT SURVIVAL");
      expect(byId.get("back-link")?.textContent).toBe("← Games");
      expect(byId.get("btn-execute")?.textContent).toContain("MARKET OPEN");
      expect(byId.get("label-ruin-prob")?.textContent).toContain("ESTIMATE");
      const assetListHtmlEn = byId.get("asset-list")?.innerHTML ?? "";
      expect(assetListHtmlEn).toContain("Decrease TECH");
      expect(assetListHtmlEn).toContain("portfolio weight");
      expect(assetListHtmlEn).not.toMatch(/[ぁ-んァ-ヶ]/);
      for (const el of allElements) {
        expect(el.getAttribute("aria-label") ?? "", `en aria-label on #${el.id}`).not.toMatch(
          /[ぁ-んァ-ヶ]/
        );
        expect(el.getAttribute("alt") ?? "", `en alt on #${el.id}`).not.toMatch(/[ぁ-んァ-ヶ]/);
        expect(el.title, `en title on #${el.id}`).not.toMatch(/[ぁ-んァ-ヶ]/);
      }

      applyQuantStaticTranslations("zh");
      expect(mockDoc.documentElement.lang).toBe("zh");
      expect(mockDoc.title).toContain("量化生存战");
      expect(byId.get("back-link")?.textContent).toBe("← 游戏列表");
      const assetListHtmlZh = byId.get("asset-list")?.innerHTML ?? "";
      expect(assetListHtmlZh).toContain("减少 TECH");
      expect(assetListHtmlZh).toContain("配置权重");
      expect(assetListHtmlZh).not.toContain("Decrease ");
      expect(assetListHtmlZh).not.toMatch(/[ぁ-んァ-ヶ]/);
      for (const el of allElements) {
        expect(el.getAttribute("aria-label") ?? "", `zh aria-label on #${el.id}`).not.toMatch(
          /[ぁ-んァ-ヶ]/
        );
        expect(el.getAttribute("alt") ?? "", `zh alt on #${el.id}`).not.toMatch(/[ぁ-んァ-ヶ]/);
        expect(el.title, `zh title on #${el.id}`).not.toMatch(/[ぁ-んァ-ヶ]/);
      }

      applyQuantStaticTranslations("ja");
      const assetListHtmlJa = byId.get("asset-list")?.innerHTML ?? "";
      expect(assetListHtmlJa).toContain("の配分を5%減らす");
      expect(assetListHtmlJa).toContain("の配分比率");
      expect(assetListHtmlJa).not.toContain("Decrease ");
    } finally {
      if (prevDocument === undefined) {
        delete (globalThis as { document?: unknown }).document;
      } else {
        (globalThis as { document?: unknown }).document = prevDocument;
      }
    }
  });

  it("ignores repeated next-quarter requests while the rival solve is pending", async () => {
    expect(getQuantGameState().quarter).toBe(1);
    // Double-click on "Advance to Next Quarter" before the first solve resolves
    const first = advanceQuarter();
    const second = advanceQuarter();
    expect(getQuantGameState().isLoading).toBe(true);
    await Promise.all([first, second]);

    const state = getQuantGameState();
    expect(state.quarter).toBe(2);
    expect(state.regimeId).toBe(getQuarterRegime(2).id);
    expect(state.aiWeightsLength).toBe(getQuarterRegime(2).assets.length);
    expect(state.isLoading).toBe(false);
  });

  it("keeps the outcome hidden when the language is switched during the 60-day animation", async () => {
    interface FakeEl {
      textContent: string;
      innerHTML: string;
      title: string;
      hidden: boolean;
      disabled: boolean;
      className: string;
      style: Record<string, string>;
      classList: { toggle: () => void };
      setAttribute: () => void;
      getAttribute: () => null;
    }
    const els = new Map<string, FakeEl>();
    const el = (id: string): FakeEl => {
      let e = els.get(id);
      if (!e) {
        e = {
          textContent: "",
          innerHTML: "",
          title: "",
          hidden: id === "outcome-banner" || id === "btn-next-quarter" || id === "btn-retry-run",
          disabled: false,
          className: "",
          style: {},
          classList: { toggle: () => {} },
          setAttribute: () => {},
          getAttribute: () => null,
        };
        els.set(id, e);
      }
      return e;
    };
    const mockDoc = {
      documentElement: { lang: "ja" },
      title: "",
      getElementById: el,
      querySelectorAll: () => [],
    };
    let tick: (() => void) | null = null;
    const mockWin = {
      setInterval: (cb: () => void) => {
        tick = cb;
        return 1;
      },
      clearInterval: () => {
        tick = null;
      },
    };

    const g = globalThis as { document?: unknown; window?: unknown };
    const prevDoc = g.document;
    const prevWin = g.window;
    try {
      g.document = mockDoc;
      g.window = mockWin;

      await startMarketSimulation();
      expect(tick).not.toBeNull();

      // Switch language before the animation reaches any shock or the end
      applyQuantStaticTranslations("en");
      expect(el("outcome-banner").hidden).toBe(true);
      expect(el("btn-next-quarter").hidden).toBe(true);
      expect(el("btn-retry-run").hidden).toBe(true);
      expect(el("news-ticker-text").textContent).toContain("MARKET OPEN");
      expect(el("btn-execute").textContent).toContain("MARKET RUNNING");

      // Finish the animation: the outcome is revealed only now
      for (let i = 0; i < 40 && tick; i++) tick();
      expect(tick).toBeNull();
      expect(el("outcome-banner").hidden).toBe(false);
      expect(
        el("btn-next-quarter").hidden === false || el("btn-retry-run").hidden === false
      ).toBe(true);
    } finally {
      if (prevDoc === undefined) delete g.document;
      else g.document = prevDoc;
      if (prevWin === undefined) delete g.window;
      else g.window = prevWin;
    }
  });

  it("evaluates player and rival tracks symmetrically via evaluateFundTrack (including intra-quarter floor breach and recovery)", () => {
    // 60 days of constant drift (0.16 / 60) must yield the exact 16.0% quarterly return shown on the UI
    const steadyQuarter = Array.from({ length: 60 }, () => [0.16 / 60]);
    const steadyTrack = evaluateFundTrack(steadyQuarter, [1.0], 100, -0.055);
    expect(steadyTrack.totalReturn).toBeCloseTo(0.16, 8);
    expect(steadyTrack.endAum).toBeCloseTo(116.0, 6);
    expect(steadyTrack.liquidated).toBe(false);

    // 3-day synthetic market where asset 0 drops -8% on day 1 (breaching -5% floor) and rallies +12% on day 2
    const dailyReturns = [[-0.08], [0.12], [0.01]];
    const track = evaluateFundTrack(dailyReturns, [1.0], 100, -0.05);
    expect(track.liquidationAumFloor).toBeCloseTo(95.0, 6);
    expect(track.minAum).toBeCloseTo(92.0, 6);
    expect(track.endAum).toBeCloseTo(105.0, 6);
    expect(track.liquidated).toBe(true);
    expect(track.liquidatedDay).toBe(1);

    // Verify simulateQuarterMarket applies the exact same barrier liquidation logic to both player and rival
    const q1 = getQuarterRegime(1);
    const n = q1.assets.length;
    const allTech = new Array<number>(n).fill(0);
    allTech[0] = 1.0;

    let foundIntraQuarterRecovery = false;
    for (let seed = 1; seed <= 120; seed++) {
      const sim = simulateQuarterMarket({
        regime: q1,
        playerWeights: allTech,
        aiWeights: allTech,
        playerStartAum: 100,
        aiStartAum: 100,
        seed,
      });
      expect(sim.aiAumSeries).toEqual(sim.playerAumSeries);
      expect(sim.aiLiquidated).toBe(sim.playerLiquidated);
      expect(sim.aiLiquidatedDay).toBe(sim.playerLiquidatedDay);

      if (sim.aiLiquidated && sim.aiEndAum >= sim.liquidationAumFloor) {
        foundIntraQuarterRecovery = true;
        expect(sim.aiLiquidatedDay).not.toBeNull();
      }
    }
    expect(foundIntraQuarterRecovery).toBe(true);
  });

  it("resets rival starting AUM to match the player's current AUM at the start of each quarter", async () => {
    await advanceQuarter();
    const afterAdvance = getQuantGameState();
    expect(afterAdvance.playerAum).toBeGreaterThan(0);
    expect(afterAdvance.aiAum).toBe(afterAdvance.playerAum);
  });

  it("reports rival liquidation day when both or rival breach the floor", () => {
    const q1 = getQuarterRegime(1);
    const n = q1.assets.length;
    const allTech = new Array<number>(n).fill(0);
    allTech[0] = 1.0;

    let bothLiquidatedSim = null;
    for (let seed = 1; seed <= 50; seed++) {
      const candidate = simulateQuarterMarket({
        regime: q1,
        playerWeights: allTech,
        aiWeights: allTech,
        playerStartAum: 100,
        aiStartAum: 100,
        seed,
      });
      if (candidate.playerLiquidated && candidate.aiLiquidated) {
        bothLiquidatedSim = candidate;
        break;
      }
    }
    expect(bothLiquidatedSim).not.toBeNull();
    if (!bothLiquidatedSim) return;

    const jaText = formatLiquidationDetail("ja", bothLiquidatedSim);
    const enText = formatLiquidationDetail("en", bothLiquidatedSim);
    const zhText = formatLiquidationDetail("zh", bothLiquidatedSim);

    expect(jaText).toContain(`DAY ${bothLiquidatedSim.aiLiquidatedDay}`);
    expect(enText).toContain(`RIVAL also liquidated on DAY ${bothLiquidatedSim.aiLiquidatedDay}`);
    expect(zhText).toContain(`第 ${bothLiquidatedSim.aiLiquidatedDay} 日触发强平`);
  });

  it("preserves an exact 100% total in displayed percentages and quantized weights across 4, 5, and 6-asset regimes", () => {
    // 6-asset equal allocation (Q4/Q5): 100 / 6 = 16.666...% => [17, 17, 17, 17, 16, 16] = 100%
    const sixEqual = roundWeightsToHundred(new Array(6).fill(1 / 6), 0.5);
    expect(sixEqual).toEqual([17, 17, 17, 17, 16, 16]);
    expect(sixEqual.reduce((a, b) => a + b, 0)).toBe(100);

    for (let q = 1; q <= 8; q++) {
      const reg = getQuarterRegime(q);
      const n = reg.assets.length;
      const cap = reg.maxWeightPerAsset;
      const capPct = Math.round(cap * 100);

      const eqPcts = roundWeightsToHundred(new Array(n).fill(1 / n), cap);
      expect(eqPcts.reduce((a, b) => a + b, 0)).toBe(100);
      for (const p of eqPcts) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(capPct);
      }

      const eqWeights = quantizeWeightsToPercent(new Array(n).fill(1 / n), cap);
      expect(eqWeights.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 8);
      expect(eqWeights.map((w) => Math.round(w * 100))).toEqual(eqPcts);
    }
  });
});
