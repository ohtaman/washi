import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeCellSize,
  createEmptyFences,
  diagnoseAndSuggestFenceHint,
  evaluatePasture,
  resolveTargetScore,
  selectVerifiedOptimal,
  solveOptimalPasture,
} from "../examples/web-demo/games/mofumofu-sheep/solver.js";
import type { OptimalPastureResult } from "../examples/web-demo/games/mofumofu-sheep/types.js";
import {
  CAMPAIGN_STAGES,
  generateVerifiedPastureStage,
  getLocalizedStageText,
} from "../examples/web-demo/games/mofumofu-sheep/stages.js";
import {
  getDayLabel,
  getMonsterLocalized,
  getOpeningMovieCutsLocalized,
  getPrologueSlidesLocalized,
  getStageLocalized,
} from "../examples/web-demo/games/demon-castle-shift/i18n-data.js";
import {
  loadCampaignStage,
  loadEndlessStage,
  resetSaveDataForTest,
  switchCastleLanguage,
} from "../examples/web-demo/games/demon-castle-shift/main.js";
import { CAMPAIGN_STAGES as CASTLE_STAGES } from "../examples/web-demo/games/demon-castle-shift/stages.js";
import { applyStaticTranslations as applySheepStaticTranslations } from "../examples/web-demo/games/mofumofu-sheep/main.js";

describe("Mofumofu Sheep Pasture Enclosure Puzzle (HiGHS MILP)", () => {
  it("has 12 progressive campaign stages (4 tiny tutorials + 8 optimization puzzles)", () => {
    expect(CAMPAIGN_STAGES.length).toBe(12);
  });

  for (const stage of CAMPAIGN_STAGES) {
    it(`solves campaign ${stage.id} (${stage.title}) to Optimal, requires all ${stage.maxFences} fences, and matches targetScore`, async () => {
      const emptyFences = createEmptyFences(stage.grid.length, stage.grid[0].length);
      const emptyEval = evaluatePasture(stage, emptyFences);
      expect(emptyEval.isSafe).toBe(false);
      expect(emptyEval.breachPath.length).toBeGreaterThan(1);

      const res = await solveOptimalPasture(stage);
      expect(res.status).toBe("Optimal");
      expect(res.verified).toBe(true);
      expect(res.optimalFenceCount).toBe(stage.maxFences);
      expect(res.optimalScore).toBe(stage.targetScore);

      const independentEval = evaluatePasture(stage, res.optimalFences);
      expect(independentEval.isSafe).toBe(true);
      expect(independentEval.isOverBudget).toBe(false);
      expect(independentEval.pastureScore).toBe(stage.targetScore);
      expect(independentEval.breachPath).toEqual([]);
    });
  }

  it("verifies Stage 1 is a tiny 3x4 1-fence intro where placing at (1, 1) achieves targetScore", async () => {
    const stage1 = CAMPAIGN_STAGES[0];
    expect(stage1.grid.length).toBe(3);
    expect(stage1.grid[0].length).toBe(4);
    const opt = await solveOptimalPasture(stage1);
    expect(opt.optimalFences[1][1]).toBe(true);
    expect(opt.optimalScore).toBe(7);
  });

  it("verifies Stage 6 requires placing a double-duty fence directly on the poison mushroom (1, 2)", async () => {
    const stage6 = CAMPAIGN_STAGES[5];
    const opt = await solveOptimalPasture(stage6);
    expect(opt.optimalFences[1][2]).toBe(true); // crushes M(1, 2) while blocking the upper path
    expect(opt.optimalEvaluation.breakdown.mushroomCount).toBe(0);
    expect(opt.optimalScore).toBe(26);
  });

  it("verifies Stage 7 Twist: optimal solution walks THROUGH the poison mushroom (2, 4) instead of crushing it", async () => {
    const stage7 = CAMPAIGN_STAGES[6];
    const opt = await solveOptimalPasture(stage7);
    expect(opt.optimalFences[2][4]).toBe(false); // do NOT crush M(2, 4)
    expect(opt.optimalFences[3][5]).toBe(true); // block at (3, 5) while keeping the East Sanctuary open
    expect(opt.optimalEvaluation.breakdown.mushroomCount).toBe(1); // intentionally accepts -5 to gain +15
    expect(opt.optimalScore).toBe(26);

    // Verify that naively crushing M(2, 4) is safe but fails the stage targetScore (16 < 26)
    const naiveFences = createEmptyFences(stage7.grid.length, stage7.grid[0].length);
    naiveFences[0][2] = true;
    naiveFences[2][4] = true;
    naiveFences[4][2] = true;
    const naiveEval = evaluatePasture(stage7, naiveFences);
    expect(naiveEval.isSafe).toBe(true);
    expect(naiveEval.pastureScore).toBe(16);
    expect(naiveEval.pastureScore).toBeLessThan(stage7.targetScore);
  });

  it("diagnoses suboptimal safe fences and suggests optimal next fence via HiGHS", async () => {
    const stage2 = CAMPAIGN_STAGES[1];
    const opt = await solveOptimalPasture(stage2);
    const fences = createEmptyFences(stage2.grid.length, stage2.grid[0].length);

    // 1. From empty board, hint suggests (1, 1)
    const hint1 = await diagnoseAndSuggestFenceHint(stage2, fences, opt);
    expect(hint1.status).toBe("can_achieve_optimal");
    expect(hint1.action).toBe("place");
    expect(hint1.targetCell).toEqual({ row: 1, col: 1 });

    // 2. Place a suboptimal fence at (1, 3) that misses the strawberry
    fences[1][3] = true;
    const subHint = await diagnoseAndSuggestFenceHint(stage2, fences, opt);
    expect(subHint.action).toBe("remove");
    expect(subHint.targetCell).toEqual({ row: 1, col: 3 });
  });

  it("generates guaranteed-solvable random pasture stages verified by HiGHS", async () => {
    for (const seed of [101, 202, 303]) {
      const stage = await generateVerifiedPastureStage(seed);
      const optimalResult = await solveOptimalPasture(stage);
      expect(optimalResult.status).toBe("Optimal");
      expect(optimalResult.verified).toBe(true);
      expect(optimalResult.optimalScore).toBe(stage.targetScore);

      const check = evaluatePasture(stage, optimalResult.optimalFences);
      expect(check.isSafe).toBe(true);
      expect(check.pastureScore).toBe(optimalResult.optimalScore);
    }
  });

  it("enforces editorial & i18n rules across Portal, Games, and Theory Articles (no 核心, no ！, no algorithm names on Portal, full ja/en/zh)", () => {
    const gamesRoot = resolve(__dirname, "../examples/web-demo/games");
    const portalHtml = readFileSync(resolve(gamesRoot, "index.html"), "utf8");
    const sheepTheoryHtml = readFileSync(
      resolve(gamesRoot, "mofumofu-sheep-theory/index.html"),
      "utf8"
    );
    const castleTheoryHtml = readFileSync(
      resolve(gamesRoot, "demon-castle-shift-theory/index.html"),
      "utf8"
    );

    // 1. Neither theory page contains "核心"
    expect(sheepTheoryHtml).not.toContain("核心");
    expect(castleTheoryHtml).not.toContain("核心");

    // 2. None of the files contain full-width exclamation mark "！"
    const filesToCheck = [
      "index.html",
      "mofumofu-sheep-theory/index.html",
      "demon-castle-shift-theory/index.html",
      "mofumofu-sheep/index.html",
      "mofumofu-sheep/main.ts",
      "mofumofu-sheep/stages.ts",
      "mofumofu-sheep/solver.ts",
      "demon-castle-shift/index.html",
      "demon-castle-shift/main.ts",
      "demon-castle-shift/stages.ts",
      "demon-castle-shift/characters.ts",
      "demon-castle-shift/solver.ts",
      "demon-castle-shift/i18n-data.ts",
    ];
    for (const relPath of filesToCheck) {
      const content = readFileSync(resolve(gamesRoot, relPath), "utf8");
      expect(content, `${relPath} should not contain ！`).not.toContain("！");
    }

    // 3. Portal hides specific algorithm names and uses "解説記事を読む" / "Read Article" / "阅读解说文章"
    expect(portalHtml).toContain("解説記事を読む");
    expect(portalHtml).toContain("Read Article");
    expect(portalHtml).toContain("阅读解说文章");
    expect(portalHtml).not.toContain("シフト最適化");
    expect(portalHtml).not.toContain("最小カット");
    expect(portalHtml).not.toContain("最大重み連結領域");
    expect(portalHtml).not.toContain("MILP");

    // 4. Both theory pages and both games provide ja, en, zh localization
    expect(sheepTheoryHtml).toContain('data-lang-section="ja"');
    expect(sheepTheoryHtml).toContain('data-lang-section="en"');
    expect(sheepTheoryHtml).toContain('data-lang-section="zh"');
    expect(castleTheoryHtml).toContain('data-lang-section="ja"');
    expect(castleTheoryHtml).toContain('data-lang-section="en"');
    expect(castleTheoryHtml).toContain('data-lang-section="zh"');

    // Verify Mofumofu Sheep stage localization
    const sheepS1En = getLocalizedStageText(CAMPAIGN_STAGES[0], "en");
    const sheepS1Zh = getLocalizedStageText(CAMPAIGN_STAGES[0], "zh");
    expect(sheepS1En.title).toBe("First Fence");
    expect(sheepS1Zh.title).toBe("第一道栅栏");
    expect(sheepS1En.title).not.toBe(CAMPAIGN_STAGES[0].title);
    expect(sheepS1Zh.title).not.toBe(CAMPAIGN_STAGES[0].title);

    // Verify Demon Castle Shift localization
    const dragoEn = getMonsterLocalized("drago", "en");
    const dragoZh = getMonsterLocalized("drago", "zh");
    expect(dragoEn.name).toBe("Drago");
    expect(dragoZh.name).toBe("德拉戈");
    expect(getOpeningMovieCutsLocalized("en").length).toBeGreaterThanOrEqual(4);
    expect(getOpeningMovieCutsLocalized("zh").length).toBeGreaterThanOrEqual(4);
    expect(getPrologueSlidesLocalized("en")).toHaveLength(3);
    expect(getPrologueSlidesLocalized("zh")).toHaveLength(3);
    const castleS1En = getStageLocalized(CASTLE_STAGES[0], "en");
    const castleS1Zh = getStageLocalized(CASTLE_STAGES[0], "zh");
    expect(castleS1En.title).not.toBe(CASTLE_STAGES[0].title);
    expect(castleS1Zh.title).not.toBe(CASTLE_STAGES[0].title);

    // 5. Chinese weekday labels already include "周" (周一..周五) and must not be double-prefixed as "周${dayName}"
    expect(getDayLabel(0, "zh")).toBe("周一");
    const castleMainTs = readFileSync(resolve(gamesRoot, "demon-castle-shift/main.ts"), "utf8");
    expect(castleMainTs).not.toContain("周${dayName}");
  });

  it("switches static UI buttons, tooltips, aria-labels, wax seals, and #stage-heading to en and zh", async () => {
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

    const createHtmlMockDocument = (html: string) => {
      const byId = new Map<string, MockElement>();
      const langBtns: MockElement[] = [];
      const waxSeals: MockElement[] = [];
      const closeBtns: MockElement[] = [];
      const bgmBtns: MockElement[] = [];

      const tagRegex = /<([a-zA-Z0-9-]+)\b([^>]*)>/g;
      for (const match of html.matchAll(tagRegex)) {
        const attrsRaw = match[2];
        const attrs = new Map<string, string>();
        for (const attrMatch of attrsRaw.matchAll(
          /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g
        )) {
          attrs.set(attrMatch[1], attrMatch[2] ?? "");
        }
        const id = attrs.get("id") ?? "";
        const cls = attrs.get("class") ?? "";
        const hasWaxSeal = cls.split(/\s+/).includes("grimoire-wax-seal");
        const hasCloseDialog = attrs.has("data-close-dialog");
        const hasLangBtn = attrs.has("data-lang-btn");
        const hasBgmToggle = attrs.has("data-bgm-toggle");

        if (!id && !hasWaxSeal && !hasCloseDialog && !hasLangBtn && !hasBgmToggle) {
          continue;
        }

        const el: MockElement = {
          id,
          textContent: "__JA_INITIAL__",
          innerHTML: "__JA_INITIAL__",
          title: attrs.get("title") ?? "__JA_TITLE__",
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

        if (id) byId.set(id, el);
        if (hasWaxSeal) waxSeals.push(el);
        if (hasCloseDialog) closeBtns.push(el);
        if (hasLangBtn) langBtns.push(el);
        if (hasBgmToggle) bgmBtns.push(el);
      }

      return {
        documentElement: { lang: "ja" },
        title: "",
        getElementById: (id: string) => byId.get(id) ?? null,
        querySelectorAll: (selector: string) => {
          if (selector === "[data-lang-btn]") return langBtns;
          if (selector === ".grimoire-wax-seal") return waxSeals;
          if (selector === "[data-close-dialog]") return closeBtns;
          if (selector === "[data-bgm-toggle]") return bgmBtns;
          return [];
        },
        byId,
        waxSeals,
        closeBtns,
      };
    };

    const gamesRoot = resolve(__dirname, "../examples/web-demo/games");
    const castleHtml = readFileSync(resolve(gamesRoot, "demon-castle-shift/index.html"), "utf8");
    const sheepHtml = readFileSync(resolve(gamesRoot, "mofumofu-sheep/index.html"), "utf8");

    const prevDocument = (globalThis as { document?: unknown }).document;
    try {
      // --- 1. Demon Castle Shift behavioral DOM localization ---
      const castleDoc = createHtmlMockDocument(castleHtml);
      (globalThis as { document?: unknown }).document = castleDoc;

      resetSaveDataForTest();
      await loadCampaignStage(0, false);

      switchCastleLanguage("en");
      expect(castleDoc.documentElement.lang).toBe("en");
      expect(castleDoc.title).toContain("Demon Castle 24h Guard Shift");
      expect(castleDoc.byId.get("btn-title-start")?.textContent).toBe("Start New Game");
      expect(castleDoc.byId.get("btn-title-continue")?.textContent).toBe("Continue");
      expect(castleDoc.byId.get("btn-title-roster")?.textContent).toBe("📖 Guard Grimoire");
      expect(castleDoc.byId.get("btn-title-help")?.textContent).toBe("How to Play");
      expect(castleDoc.byId.get("btn-back-title")?.textContent).toBe("← Title");
      expect(castleDoc.byId.get("btn-back-title")?.title).toBe("Back to Title Screen");
      expect(castleDoc.byId.get("btn-roster")?.textContent).toBe("📖 Grimoire");
      expect(castleDoc.byId.get("btn-roster")?.title).toBe(
        "Grimoire of all 20 Demon Castle guards and pair affinities"
      );
      expect(castleDoc.byId.get("btn-help")?.textContent).toBe("Rules");
      expect(castleDoc.byId.get("btn-hint-one")?.textContent).toBe("💡 Hint");
      expect(castleDoc.byId.get("btn-hint-one")?.title).toBe("Fill 1 cell from the model shift");
      expect(castleDoc.byId.get("btn-reset")?.textContent).toBe("Clear All");
      expect(castleDoc.byId.get("dialogue-box")?.title).toBe(
        "Click to reveal full message or advance"
      );
      expect(castleDoc.byId.get("btn-dispatch")?.textContent).toBe("⚔️ Guard with This Shift");
      expect(castleDoc.byId.get("btn-op-skip")?.textContent).toBe("Skip ⏭");
      expect(castleDoc.byId.get("op-stage-viewport")?.title).toBe("Click to advance");
      expect(castleDoc.byId.get("btn-op-finish")?.textContent).toBe("Begin Story");
      expect(castleDoc.byId.get("btn-op-next-cut")?.textContent).toBe("Next ▶");
      expect(castleDoc.byId.get("btn-prologue-skip")?.textContent).toBe("Skip ⏭");
      expect(castleDoc.byId.get("btn-prologue-prev")?.textContent).toBe("Prev");
      expect(castleDoc.byId.get("btn-prologue-next")?.textContent).toBe("Next");
      expect(castleDoc.byId.get("grimoire-close-btn")?.textContent).toBe("✕ Close Tome");
      expect(castleDoc.waxSeals.length).toBeGreaterThanOrEqual(1);
      for (const seal of castleDoc.waxSeals) {
        expect(seal.textContent).toBe("Seal");
      }
      expect(castleDoc.closeBtns.length).toBeGreaterThanOrEqual(3);
      for (const closeBtn of castleDoc.closeBtns) {
        expect(closeBtn.getAttribute("aria-label")).toBe("Close");
      }
      expect(castleDoc.byId.get("stage-heading")?.textContent).toBe(
        getStageLocalized(CASTLE_STAGES[0], "en").title
      );

      switchCastleLanguage("zh");
      expect(castleDoc.documentElement.lang).toBe("zh");
      expect(castleDoc.title).toContain("魔王城的24小时警备排班");
      expect(castleDoc.byId.get("btn-title-start")?.textContent).toBe("从头开始游玩");
      expect(castleDoc.byId.get("btn-title-continue")?.textContent).toBe("继续游戏");
      expect(castleDoc.byId.get("btn-title-roster")?.textContent).toBe("📖 警备队名鉴");
      expect(castleDoc.byId.get("btn-title-help")?.textContent).toBe("玩法说明");
      expect(castleDoc.byId.get("btn-back-title")?.textContent).toBe("← 标题");
      expect(castleDoc.byId.get("btn-back-title")?.title).toBe("返回标题画面");
      expect(castleDoc.byId.get("btn-roster")?.textContent).toBe("📖 名鉴");
      expect(castleDoc.byId.get("btn-roster")?.title).toBe(
        "魔王城全20名成员名鉴与搭档相性一览"
      );
      expect(castleDoc.byId.get("btn-help")?.textContent).toBe("规则");
      expect(castleDoc.byId.get("btn-hint-one")?.textContent).toBe("💡 提示");
      expect(castleDoc.byId.get("btn-hint-one")?.title).toBe("填入1格示范排班");
      expect(castleDoc.byId.get("btn-reset")?.textContent).toBe("清空重排");
      expect(castleDoc.byId.get("dialogue-box")?.title).toBe("点击显示完整信息或继续");
      expect(castleDoc.byId.get("btn-dispatch")?.textContent).toBe("⚔️ 按此班表出击警备");
      expect(castleDoc.byId.get("btn-op-skip")?.textContent).toBe("跳过 ⏭");
      expect(castleDoc.byId.get("op-stage-viewport")?.title).toBe("点击继续");
      expect(castleDoc.byId.get("btn-op-finish")?.textContent).toBe("开始物语");
      expect(castleDoc.byId.get("btn-op-next-cut")?.textContent).toBe("下一步 ▶");
      expect(castleDoc.byId.get("btn-prologue-skip")?.textContent).toBe("跳过 ⏭");
      expect(castleDoc.byId.get("btn-prologue-prev")?.textContent).toBe("上一页");
      expect(castleDoc.byId.get("btn-prologue-next")?.textContent).toBe("下一步");
      expect(castleDoc.byId.get("grimoire-close-btn")?.textContent).toBe("✕ 合上书卷");
      for (const seal of castleDoc.waxSeals) {
        expect(seal.textContent).toBe("印");
      }
      for (const closeBtn of castleDoc.closeBtns) {
        expect(closeBtn.getAttribute("aria-label")).toBe("关闭");
      }
      expect(castleDoc.byId.get("stage-heading")?.textContent).toBe(
        getStageLocalized(CASTLE_STAGES[0], "zh").title
      );

      // Verify #stage-heading on Endless stage (includes localized difficulty suffix)
      await loadEndlessStage(6, false);
      switchCastleLanguage("en");
      const endlessHeadingEn = castleDoc.byId.get("stage-heading")?.textContent ?? "";
      expect(endlessHeadingEn).toContain("Main Gate Shift");
      expect(endlessHeadingEn).toContain("(Difficulty: Standard (5 Guards))");
      expect(endlessHeadingEn).not.toContain("難易度");

      switchCastleLanguage("zh");
      const endlessHeadingZh = castleDoc.byId.get("stage-heading")?.textContent ?? "";
      expect(endlessHeadingZh).toContain("正门防卫排班");
      expect(endlessHeadingZh).toContain("（难度：标准（5人值班））");
      expect(endlessHeadingZh).not.toContain("難易度");

      // --- 2. Mofumofu Sheep behavioral DOM localization ---
      const sheepDoc = createHtmlMockDocument(sheepHtml);
      (globalThis as { document?: unknown }).document = sheepDoc;

      applySheepStaticTranslations("en");
      expect(sheepDoc.documentElement.lang).toBe("en");
      expect(sheepDoc.title).toContain("Fluffy Sheep Pasture");
      expect(sheepDoc.byId.get("back-link")?.textContent).toBe("← Portal");
      expect(sheepDoc.byId.get("back-link")?.title).toBe("Back to Game Portal");
      expect(sheepDoc.byId.get("total-stars-badge")?.title).toBe("Cleared stages");
      expect(sheepDoc.byId.get("btn-show-optimal")?.textContent).toBe("✨ View Model Solution");
      expect(sheepDoc.byId.get("btn-next-stage")?.textContent).toBe("Next Stage ▶");
      expect(sheepDoc.byId.get("stage-strip")?.getAttribute("aria-label")).toBe("Stage Selection");
      expect(sheepDoc.byId.get("board-grid")?.getAttribute("aria-label")).toBe(
        "Pasture Puzzle Board"
      );
      expect(sheepDoc.byId.get("btn-undo-label")?.textContent).toBe("Undo");
      expect(sheepDoc.byId.get("btn-undo")?.title).toBe("Undo 1 move (Z key)");
      expect(sheepDoc.byId.get("btn-restart-label")?.textContent).toBe("Restart");
      expect(sheepDoc.byId.get("btn-restart")?.title).toBe("Restart stage (R key)");
      expect(sheepDoc.byId.get("btn-hint-label")?.textContent).toBe("1-Move Hint");
      expect(sheepDoc.byId.get("btn-hint")?.title).toBe(
        "Highlight the next recommended move on the board (H key)"
      );
      expect(sheepDoc.byId.get("btn-new-random-label")?.textContent).toBe("Another Pasture");
      expect(sheepDoc.byId.get("btn-new-random")?.title).toBe("Move to another pasture");
      expect(sheepDoc.byId.get("legend-sheep")?.title).toBe(
        "Sheep (+2 pts, protect from wolves)"
      );
      expect(sheepDoc.byId.get("legend-grass")?.title).toBe("Meadow (+1 pt)");
      expect(sheepDoc.byId.get("legend-strawberry")?.title).toBe("Wild Strawberry (+5 pts)");
      expect(sheepDoc.byId.get("legend-mushroom")?.title).toBe(
        "Poison Mushroom (-5 pts, can be covered with a fence)"
      );
      expect(sheepDoc.byId.get("legend-bridge")?.title).toBe(
        "Stone Bridge (+1 pt, passable, cannot place fence)"
      );
      expect(sheepDoc.byId.get("legend-wall")?.textContent).toBe("💧🪨 Wall");
      expect(sheepDoc.byId.get("legend-wall")?.title).toBe(
        "Water & Rock (impassable natural wall)"
      );

      applySheepStaticTranslations("zh");
      expect(sheepDoc.documentElement.lang).toBe("zh");
      expect(sheepDoc.title).toContain("毛茸茸绵羊围牧场");
      expect(sheepDoc.byId.get("back-link")?.textContent).toBe("← 返回列表");
      expect(sheepDoc.byId.get("back-link")?.title).toBe("返回游戏列表");
      expect(sheepDoc.byId.get("total-stars-badge")?.title).toBe("已通关关卡数");
      expect(sheepDoc.byId.get("btn-show-optimal")?.textContent).toBe("✨ 查看示范解答");
      expect(sheepDoc.byId.get("btn-next-stage")?.textContent).toBe("下一关 ▶");
      expect(sheepDoc.byId.get("stage-strip")?.getAttribute("aria-label")).toBe("关卡选择");
      expect(sheepDoc.byId.get("board-grid")?.getAttribute("aria-label")).toBe("牧场解谜棋盘");
      expect(sheepDoc.byId.get("btn-undo-label")?.textContent).toBe("撤销一步");
      expect(sheepDoc.byId.get("btn-undo")?.title).toBe("撤销一步 (Z键)");
      expect(sheepDoc.byId.get("btn-restart-label")?.textContent).toBe("重新开始");
      expect(sheepDoc.byId.get("btn-restart")?.title).toBe("从头重新开始 (R键)");
      expect(sheepDoc.byId.get("btn-hint-label")?.textContent).toBe("一步提示");
      expect(sheepDoc.byId.get("btn-hint")?.title).toBe("在棋盘上高亮提示下一步操作 (H键)");
      expect(sheepDoc.byId.get("btn-new-random-label")?.textContent).toBe("换一个牧场");
      expect(sheepDoc.byId.get("btn-new-random")?.title).toBe("前往另一个牧场");
      expect(sheepDoc.byId.get("legend-sheep")?.title).toBe("绵羊（+2分・保护对象）");
      expect(sheepDoc.byId.get("legend-grass")?.title).toBe("草地（+1分）");
      expect(sheepDoc.byId.get("legend-strawberry")?.title).toBe("野草莓（+5分）");
      expect(sheepDoc.byId.get("legend-mushroom")?.title).toBe("毒蘑菇（-5分・可用栅栏盖住）");
      expect(sheepDoc.byId.get("legend-bridge")?.title).toBe(
        "石桥（+1分・可通行・不可放栅栏）"
      );
      expect(sheepDoc.byId.get("legend-wall")?.textContent).toBe("💧🪨 障碍墙");
      expect(sheepDoc.byId.get("legend-wall")?.title).toBe(
        "水池与岩石（不可通行的天然墙壁）"
      );
    } finally {
      if (prevDocument === undefined) {
        delete (globalThis as { document?: unknown }).document;
      } else {
        (globalThis as { document?: unknown }).document = prevDocument;
      }
    }
  });

  it("preserves authored stage.targetScore and ignores unverified solver results when optimization fails", async () => {
    const stage4 = CAMPAIGN_STAGES[3];
    const empty = createEmptyFences(stage4.grid.length, stage4.grid[0].length);
    const failedResult: OptimalPastureResult = {
      status: "Error",
      optimalFences: empty,
      optimalScore: 0,
      optimalFenceCount: 0,
      optimalEvaluation: evaluatePasture(stage4, empty),
      solveTimeMs: 1,
      verified: false,
    };

    expect(selectVerifiedOptimal(failedResult)).toBeNull();
    expect(resolveTargetScore(stage4, failedResult)).toBe(stage4.targetScore);
    expect(resolveTargetScore(stage4, null)).toBe(stage4.targetScore);

    // Hint diagnosis also ignores an unverified cached result and falls back to solving properly
    const hint = await diagnoseAndSuggestFenceHint(stage4, empty, failedResult);
    expect(hint.status).toBe("can_achieve_optimal");
    expect(hint.action).toBe("place");
    expect(hint.targetCell).toEqual({ row: 0, col: 1 });
  });

  it("scales cell size to fit narrow 375px mobile viewports for 7x7 boards without overflowing", () => {
    // Desktop / unconstrained fallback preserves ideal cell sizes
    expect(computeCellSize(3, 4)).toBe(88);
    expect(computeCellSize(7, 7)).toBe(60);

    // 375px mobile viewport (~299px available inner board width): 7 * cellSize + 6 * 7 <= 299
    const mobileCellSize = computeCellSize(7, 7, 299, 7);
    expect(mobileCellSize).toBe(36);
    expect(7 * mobileCellSize + 6 * 7).toBeLessThanOrEqual(299);
  });
});
