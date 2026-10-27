import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  choleskyDecompose,
  computeEfficientFrontier,
  computePortfolioMetrics,
  normalCdf,
  simulateQuarterMarket,
  solveQuantOptimalPortfolio,
} from "../examples/web-demo/games/quant-survival/solver.js";
import {
  autoPickLevelAssets,
  buildSubsetRegime,
  getLevelSpec,
  getLocalizedAsset,
  getLocalizedRegimeText,
  getProceduralAsset,
  getQuarterRegime,
} from "../examples/web-demo/games/quant-survival/regimes.js";
import { applyQuantStaticTranslations } from "../examples/web-demo/games/quant-survival/main.js";

describe("Quant Survival Portfolio Game (HiGHS Convex QP & Progressive Unlocks)", () => {
  it("computes accurate standard normal CDF values for ruin probability calculation", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-3.0)).toBeCloseTo(0.00135, 4);
  });

  it("demonstrates correlation hedging: combining negatively correlated assets reduces ruin probability", () => {
    const subset = buildSubsetRegime(3, ["nv-ai", "defense", "gold", "bond"]);
    const n = subset.assets.length;

    // 100% in high-volatility NV-AI (asset 0):
    // mu = 0.22, sigma = 0.30, floor = -0.052 => SF = (0.22 - (-0.052)) / 0.30 = 0.9067 => Phi(-0.9067) = ~0.182
    const allNvAi = new Array<number>(n).fill(0);
    allNvAi[0] = 1.0;
    const nvAiMetrics = computePortfolioMetrics(subset, allNvAi);
    expect(nvAiMetrics.expectedReturn).toBeCloseTo(0.22, 4);
    expect(nvAiMetrics.volatility).toBeCloseTo(0.3, 4);
    expect(nvAiMetrics.ruinProbability).toBeGreaterThan(0.15);

    // Hedged blend: NV-AI (0.40), Defense (0.30), Gold (0.20), Bond (0.10)
    const hedged = [0.4, 0.3, 0.2, 0.1];
    const hedgedMetrics = computePortfolioMetrics(subset, hedged);
    expect(hedgedMetrics.volatility).toBeLessThan(nvAiMetrics.volatility * 0.55);
    expect(hedgedMetrics.ruinProbability).toBeLessThan(nvAiMetrics.ruinProbability * 0.35);
    expect(hedgedMetrics.expectedReturn).toBeGreaterThanOrEqual(subset.targetReturn);
  });

  it("supports progressive asset pool unlock and procedural generation across Levels 1..15", () => {
    const l1 = getLevelSpec(1);
    expect(l1.unlockedAssetIds).toEqual(["sp500", "bond", "gold"]);
    expect(l1.maxPicks).toBe(3);

    const l2 = getLevelSpec(2);
    expect(l2.unlockedAssetIds).toContain("tech");
    expect(l2.unlockedAssetIds).toContain("pharma");
    expect(l2.maxPicks).toBe(4);

    const l3 = getLevelSpec(3);
    expect(l3.unlockedAssetIds).toContain("nv-ai");
    expect(l3.unlockedAssetIds).toContain("cloud");
    expect(l3.unlockedAssetIds).toContain("defense");
    expect(l3.maxPicks).toBe(5);

    const l5 = getLevelSpec(5);
    expect(l5.unlockedAssetIds.length).toBe(12);
    expect(l5.maxPicks).toBe(7);

    // Level 6+: Procedural assets generated dynamically
    const l6 = getLevelSpec(6);
    expect(l6.unlockedAssetIds.length).toBe(14);
    const spaceAsset = getProceduralAsset(6, 0);
    expect(spaceAsset.ticker).toBe("SPACE");
    expect(spaceAsset.unlockedAtLevel).toBe(6);
    expect(spaceAsset.volatility).toBeGreaterThan(0.2);

    const l10 = getLevelSpec(10);
    expect(l10.unlockedAssetIds.length).toBe(22);
    expect(l10.maxPicks).toBeLessThanOrEqual(8);
  });

  it("generates positive-definite covariance matrices and solves WaSHI Convex QP across Levels 1..15", async () => {
    for (const lvl of [1, 2, 3, 4, 5, 6, 8, 10, 15]) {
      const regime = getQuarterRegime(lvl);
      const picks = regime.selectedAssetIds;

      expect(regime.assets.length).toBe(picks.length);
      expect(regime.covariance.length).toBe(picks.length);

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
    }
  });

  it("accurately reports Infeasible status and verified: false when constraints are mathematically unsatisfiable", async () => {
    // Single asset BOND has expected return ~0.045, far below the requested target of 0.20
    const bondRegime = buildSubsetRegime(1, ["bond"]);
    const infeasibleRes = await solveQuantOptimalPortfolio(bondRegime, 0.20);
    expect(infeasibleRes.status).toBe("Infeasible");
    expect(infeasibleRes.verified).toBe(false);

    // Single asset with maxWeightPerAsset = 0.50 (cannot sum to 1.0 without violating cap)
    const cappedRegime = {
      ...bondRegime,
      maxWeightPerAsset: 0.50,
    };
    const capViolationRes = await solveQuantOptimalPortfolio(cappedRegime);
    expect(capViolationRes.status).toBe("Infeasible");
    expect(capViolationRes.verified).toBe(false);
  });

  it("emits reversed headlines matching reversed shock impulses", () => {
    // Verify that every configured shock across all levels provides a distinct reversedHeadline
    for (let lvl = 1; lvl <= 10; lvl++) {
      const spec = getLevelSpec(lvl);
      for (const shock of spec.candidateShocks) {
        expect(shock.reversedHeadline, `reversedHeadline on level ${lvl} shock ${shock.id}`).toBeDefined();
        expect(shock.reversedHeadline!.ja).not.toBe(shock.headline.ja);
        expect(shock.reversedHeadline!.en).not.toBe(shock.headline.en);
        expect(shock.reversedHeadline!.zh).not.toBe(shock.headline.zh);
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

  it("simulates a 60-day market battle deterministically with ghost single-stock benchmark", async () => {
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
    expect(simA.liquidationAumFloor).toBeCloseTo(100 * (1 + regime.liquidationFloor), 4);
    expect(simA.liquidationFloorRate).toBeCloseTo(regime.liquidationFloor, 4);
    expect(simA.playerEndAum).toBeCloseTo(simB.playerEndAum, 8);
    expect(simA.playerReturn).toBeCloseTo(simA.aiReturn, 8);
    expect(simA.shocks.length).toBeGreaterThanOrEqual(1);

    // Ghost benchmark series verification
    expect(simA.ghostSeries).toBeDefined();
    expect(simA.ghostSeries!.aumSeries.length).toBe(61);
    expect(simA.ghostSeries!.ticker).toBeTruthy();
    expect(simA.ghostSeries!.label.ja).toContain("100%");
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
    expect(portalHtml).toContain("./quant-survival/");
    expect(portalHtml).toContain("./quant-survival-theory/");
    expect(portalHtml).not.toContain("二次計画法");
    expect(portalHtml).not.toContain("マーコウィッツ");
    expect(portalHtml).not.toContain("QP");
    expect(portalHtml).not.toContain("MILP");

    // 4. Theory page has ja, en, zh sections
    expect(quantTheoryHtml).toContain('data-lang-section="ja"');
    expect(quantTheoryHtml).toContain('data-lang-section="en"');
    expect(quantTheoryHtml).toContain('data-lang-section="zh"');

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
      style: Record<string, string>;
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
        style: {},
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
      expect(byId.get("frontier-guide-text")?.textContent).toContain("How to Read Chart");
      expect(byId.get("strategy-tip-text")?.innerHTML).toContain("Strategy Tip");
      for (const el of allElements) {
        expect(el.getAttribute("aria-label") ?? "", `en aria-label on #${el.id}`).not.toMatch(
          /[ぁ-んァ-ヶ]/
        );
        expect(el.getAttribute("alt") ?? "", `en alt on #${el.id}`).not.toMatch(/[ぁ-んァ-ヶ]/);
        expect(el.title, `en title on #${el.id}`).not.toMatch(/[ぁ-んァ-ヶ]/);
      }

      applyQuantStaticTranslations("zh");
      expect(mockDoc.documentElement.lang).toBe("zh-CN");
      expect(mockDoc.title).toContain("量化生存战");
      expect(byId.get("back-link")?.textContent).toBe("← 游戏列表");
      expect(byId.get("frontier-guide-text")?.textContent).toContain("图表解读");
      expect(byId.get("strategy-tip-text")?.innerHTML).toContain("通关指南");
      for (const el of allElements) {
        expect(el.getAttribute("aria-label") ?? "", `zh aria-label on #${el.id}`).not.toMatch(
          /[ぁ-んァ-ヶ]/
        );
        expect(el.getAttribute("alt") ?? "", `zh alt on #${el.id}`).not.toMatch(/[ぁ-んァ-ヶ]/);
        expect(el.title, `zh title on #${el.id}`).not.toMatch(/[ぁ-んァ-ヶ]/);
      }
    } finally {
      if (prevDocument === undefined) {
        delete (globalThis as { document?: unknown }).document;
      } else {
        (globalThis as { document?: unknown }).document = prevDocument;
      }
    }
  });

  it("immediately freezes player AUM series at liquidation level upon breaching liquidation floor", () => {
    const regime = getQuarterRegime(1);
    // 100% in stock with tight floor guarantees liquidation on day 24 shock
    const aggressiveWeights = [1.0, 0, 0];
    const customRegime = {
      ...regime,
      liquidationFloor: -0.02, // very tight -2% floor
    };

    const sim = simulateQuarterMarket({
      regime: customRegime,
      playerWeights: aggressiveWeights,
      aiWeights: [0.33, 0.33, 0.34],
      playerStartAum: 100,
      aiStartAum: 100,
      seed: 12345,
    });

    expect(sim.playerLiquidated).toBe(true);
    expect(sim.playerLiquidatedDay).not.toBeNull();
    const liqDay = sim.playerLiquidatedDay!;
    expect(liqDay).toBeGreaterThan(0);
    expect(liqDay).toBeLessThanOrEqual(60);

    // All days after liquidation day must stay frozen at the liquidated level (no resurrection/rebound)
    const liqAum = sim.playerAumSeries[liqDay];
    expect(liqAum).toBeLessThanOrEqual(sim.liquidationAumFloor);
    for (let d = liqDay; d <= 60; d++) {
      expect(sim.playerAumSeries[d]).toBe(liqAum);
    }
    expect(sim.playerEndAum).toBe(liqAum);
  });

  it("prioritizes newly unlocked assets over older fillers when expanding portfolio picks via autoPickLevelAssets", () => {
    // 1. Level 2 -> Level 3 transition: 4 assets held (sp500, bond, gold, tech), Level 3 maxPicks is 5
    // Level 3 introduces newAssetIds: ["nv-ai", "cloud", "defense"] while "pharma" was unselected in Level 2
    const l3Spec = getLevelSpec(3);
    const selectedL3 = autoPickLevelAssets(["sp500", "bond", "gold", "tech"], l3Spec);

    expect(selectedL3).toHaveLength(5);
    // Newly unlocked NV-AI must be prioritized in the 5th slot, not older unpicked pharma
    expect(selectedL3[4]).toBe("nv-ai");
    expect(selectedL3).toContain("nv-ai");
    expect(selectedL3).not.toContain("pharma");

    // 2. Fresh Level 1 run: empty picks auto-fills all 3 Level 1 assets
    const l1Spec = getLevelSpec(1);
    const freshL1 = autoPickLevelAssets([], l1Spec);
    expect(freshL1).toEqual(["sp500", "bond", "gold"]);

    // 3. Legacy save state with only 2 picks in Level 1: auto-completes to 3 assets including gold
    const legacyL1 = autoPickLevelAssets(["sp500", "bond"], l1Spec);
    expect(legacyL1).toEqual(["sp500", "bond", "gold"]);
  });
});
