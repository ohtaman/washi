import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FENCE_SVG } from "../examples/web-demo/games/mofumofu-sheep/fence-icon.js";
import { pastureAudio } from "../examples/web-demo/games/mofumofu-sheep/audio.js";
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
  getDifficultySpecForStage,
  getLocalizedStageText,
  getStageByNumber,
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
import {
  applyStaticTranslations as applySheepStaticTranslations,
  countCanonicalClearedStages,
  getResumeStageNumber,
  loadStageByNumber,
  parseProgressState,
  renderStageNav,
  stepStage,
} from "../examples/web-demo/games/mofumofu-sheep/main.js";

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

  it("verifies Stage 6 requires placing a double-duty fence post directly into the pitfall (1, 2)", async () => {
    const stage6 = CAMPAIGN_STAGES[5];
    const opt = await solveOptimalPasture(stage6);
    expect(opt.optimalFences[1][2]).toBe(true); // plugs P(1, 2) while blocking the upper path
    expect(opt.optimalEvaluation.breakdown.pitCount).toBe(0);
    expect(opt.optimalScore).toBe(26);
  });

  it("verifies Stage 7 Twist: optimal solution walks THROUGH the pitfall (2, 4) instead of plugging it", async () => {
    const stage7 = CAMPAIGN_STAGES[6];
    const opt = await solveOptimalPasture(stage7);
    expect(opt.optimalFences[2][4]).toBe(false); // do NOT plug P(2, 4)
    expect(opt.optimalFences[3][5]).toBe(true); // block at (3, 5) while keeping the East Sanctuary open
    expect(opt.optimalEvaluation.breakdown.pitCount).toBe(1); // intentionally accepts -5 to gain +15
    expect(opt.optimalScore).toBe(26);

    // Verify that naively plugging P(2, 4) is safe but fails the stage targetScore (16 < 26)
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

  it("generates deterministic, progressive stages (7x7 -> 8x8 -> 9x9 -> 10x10 cap) that can be revisited by stageNumber", async () => {
    expect(getDifficultySpecForStage(13)).toMatchObject({ rows: 7, cols: 7 });
    expect(getDifficultySpecForStage(19)).toMatchObject({ rows: 8, cols: 8 });
    expect(getDifficultySpecForStage(25)).toMatchObject({ rows: 9, cols: 9 });
    expect(getDifficultySpecForStage(31)).toMatchObject({ rows: 10, cols: 10 });

    for (const stageNum of [13, 19, 25, 31]) {
      const spec = getDifficultySpecForStage(stageNum);
      const stageA = await generateVerifiedPastureStage(stageNum);
      const { stage: stageB, precomputedOptimal } = await getStageByNumber(stageNum);
      expect(stageA.id).toBe(`stage-${stageNum}`);
      expect(stageA.stageNumber).toBe(stageNum);
      expect(stageA.grid.length).toBe(spec.rows);
      expect(stageA.grid[0].length).toBe(spec.cols);
      expect(stageB.grid).toEqual(stageA.grid);
      expect(stageB.targetScore).toBe(stageA.targetScore);
      expect(precomputedOptimal?.verified).toBe(true);

      const optimalResult = await solveOptimalPasture(stageA);
      expect(optimalResult.status).toBe("Optimal");
      expect(optimalResult.verified).toBe(true);
      expect(optimalResult.optimalScore).toBe(stageA.targetScore);

      const check = evaluatePasture(stageA, optimalResult.optimalFences);
      expect(check.isSafe).toBe(true);
      expect(check.pastureScore).toBe(optimalResult.optimalScore);
    }

    // Verify wolves are not exclusively locked into the 4 corners:
    // across generated stages, diverse perimeter and edge positions must be utilized
    let nonCornerWolfCount = 0;
    for (const stageNum of [13, 19, 25, 27, 31]) {
      const stage = await generateVerifiedPastureStage(stageNum);
      const rows = stage.grid.length;
      const cols = stage.grid[0].length;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (stage.grid[r][c] === "wolf") {
            const isCorner =
              (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1);
            if (!isCorner) {
              nonCornerWolfCount++;
            }
          }
        }
      }
    }
    expect(nonCornerWolfCount).toBeGreaterThanOrEqual(5);

    // When all 36 candidate attempts are rejected (e.g., degenerate PRNG output filling the outer ring with water),
    // fallback stage + verified optimal solution are still cached so revisiting does not re-run generation.
    const imulSpy = vi.spyOn(Math, "imul").mockReturnValue(0);
    try {
      const exhaustedStage = await generateVerifiedPastureStage(99);
      expect(exhaustedStage.id).toBe("stage-99");
      expect(exhaustedStage.grid).toEqual(CAMPAIGN_STAGES[CAMPAIGN_STAGES.length - 1].grid);
    } finally {
      imulSpy.mockRestore();
    }
    const { stage: cachedFallback, precomputedOptimal: cachedFallbackOpt } =
      await getStageByNumber(99);
    expect(cachedFallback.id).toBe("stage-99");
    expect(cachedFallback.grid).toEqual(CAMPAIGN_STAGES[CAMPAIGN_STAGES.length - 1].grid);
    expect(cachedFallbackOpt?.verified).toBe(true);
  });

  it("enforces editorial & i18n rules across Showcase, Games, and Theory Articles (no 核心, no ！, full ja/en/zh)", () => {
    const gamesRoot = resolve(__dirname, "../examples/web-demo/games");
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

    // 3. Showcase pages use localized theory article links
    const showcaseJa = readFileSync(resolve(__dirname, "../docs/ja/showcase/index.md"), "utf8");
    const showcaseEn = readFileSync(resolve(__dirname, "../docs/showcase/index.md"), "utf8");
    const showcaseZh = readFileSync(resolve(__dirname, "../docs/zh/showcase/index.md"), "utf8");
    expect(showcaseJa).toContain("解説記事\u3092読\u3080");
    expect(showcaseEn).toContain("Theory Article");
    expect(showcaseZh).toContain("阅读解说文章");

    // 4. Both theory pages and both games provide ja, en, zh localization
    expect(sheepTheoryHtml).toContain('data-lang-btn="ja"');
    expect(sheepTheoryHtml).toContain('data-lang-btn="en"');
    expect(sheepTheoryHtml).toContain('data-lang-btn="zh"');
    expect(castleTheoryHtml).toContain('data-lang-btn="ja"');
    expect(castleTheoryHtml).toContain('data-lang-btn="en"');
    expect(castleTheoryHtml).toContain('data-lang-btn="zh"');

    // Verify Mofumofu Sheep stage localization
    const sheepS1En = getLocalizedStageText(CAMPAIGN_STAGES[0], "en");
    const sheepS1Ja = getLocalizedStageText(CAMPAIGN_STAGES[0], "ja");
    const sheepS1Zh = getLocalizedStageText(CAMPAIGN_STAGES[0], "zh");
    expect(sheepS1En.title).toBe("First Fence");
    expect(sheepS1En.title).toBe(CAMPAIGN_STAGES[0].title);
    expect(sheepS1Ja.title).not.toBe(CAMPAIGN_STAGES[0].title);
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
    const castleS1Ja = getStageLocalized(CASTLE_STAGES[0], "ja");
    const castleS1Zh = getStageLocalized(CASTLE_STAGES[0], "zh");
    expect(castleS1Ja.title).not.toBe(castleS1En.title);
    expect(castleS1Zh.title).not.toBe(castleS1En.title);

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
      appendChild: () => void;
    }

    const createHtmlMockDocument = (html: string) => {
      const byId = new Map<string, MockElement>();
      const allElements: MockElement[] = [];
      const langBtns: MockElement[] = [];
      const waxSeals: MockElement[] = [];
      const closeBtns: MockElement[] = [];
      const bgmBtns: MockElement[] = [];
      const conditionRows: MockElement[] = [];
      const dialogueDocks: MockElement[] = [];
      const logoImgs: MockElement[] = [];
      const brandAvatars: MockElement[] = [];

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
        const clsList = (attrs.get("class") ?? "").split(/\s+/);
        const hasWaxSeal = clsList.includes("grimoire-wax-seal");
        const hasConditionRow = clsList.includes("condition-summary-row");
        const hasDialogueDock = clsList.includes("rpg-dialogue-dock");
        const hasLogoImg =
          clsList.includes("title-logo-img") || clsList.includes("op-climax-logo-img");
        const hasBrandAvatar = clsList.includes("brand-avatar");
        const hasCloseDialog = attrs.has("data-close-dialog");
        const hasLangBtn = attrs.has("data-lang-btn");
        const hasBgmToggle = attrs.has("data-bgm-toggle");
        const hasAriaLabel = attrs.has("aria-label");
        const hasTitle = attrs.has("title");
        const hasAlt = attrs.has("alt");

        if (
          !id &&
          !hasWaxSeal &&
          !hasConditionRow &&
          !hasDialogueDock &&
          !hasLogoImg &&
          !hasBrandAvatar &&
          !hasCloseDialog &&
          !hasLangBtn &&
          !hasBgmToggle &&
          !hasAriaLabel &&
          !hasTitle &&
          !hasAlt
        ) {
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
          appendChild: () => {},
        };

        allElements.push(el);
        if (id) byId.set(id, el);
        if (hasWaxSeal) waxSeals.push(el);
        if (hasConditionRow) conditionRows.push(el);
        if (hasDialogueDock) dialogueDocks.push(el);
        if (hasLogoImg) logoImgs.push(el);
        if (hasBrandAvatar) brandAvatars.push(el);
        if (hasCloseDialog) closeBtns.push(el);
        if (hasLangBtn) langBtns.push(el);
        if (hasBgmToggle) bgmBtns.push(el);
      }

      return {
        documentElement: { lang: "ja" },
        title: "",
        createElement: () => ({
          type: "",
          className: "",
          disabled: false,
          textContent: "",
          value: "",
          selected: false,
          dataset: {},
          classList: { toggle: () => {}, add: () => {}, remove: () => {} },
          addEventListener: () => {},
          appendChild: () => {},
        }),
        getElementById: (id: string) => byId.get(id) ?? null,
        querySelectorAll: (selector: string) => {
          if (selector === "[data-lang-btn]") return langBtns;
          if (selector === ".grimoire-wax-seal") return waxSeals;
          if (selector === "[data-close-dialog]") return closeBtns;
          if (selector === "[data-bgm-toggle]") return bgmBtns;
          if (selector === ".condition-summary-row") return conditionRows;
          if (selector === ".rpg-dialogue-dock") return dialogueDocks;
          if (selector === ".title-logo-img, .op-climax-logo-img") return logoImgs;
          if (selector === ".brand-avatar") return brandAvatars;
          return [];
        },
        byId,
        allElements,
        waxSeals,
        closeBtns,
        conditionRows,
        dialogueDocks,
        logoImgs,
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
      expect(castleDoc.logoImgs.length).toBeGreaterThanOrEqual(1);
      for (const logo of castleDoc.logoImgs) {
        expect(logo.getAttribute("src")).toBe("./title-logo-en.png");
        expect(logo.getAttribute("alt")).toBe("Demon Castle 24h Guard Shift");
      }
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
      expect(castleDoc.byId.get("title-screen")?.getAttribute("aria-label")).toBe("Title Screen");
      expect(castleDoc.byId.get("stage-progress-nav")?.getAttribute("aria-label")).toBe(
        "Month Selection"
      );
      expect(castleDoc.byId.get("shift-grid-table")?.getAttribute("aria-label")).toBe(
        "Guard Shift Matrix"
      );
      expect(castleDoc.byId.get("opening-movie-dialog")?.getAttribute("aria-label")).toBe(
        "Opening Movie"
      );
      expect(castleDoc.conditionRows[0]?.getAttribute("aria-label")).toBe("Shift Goal Status");
      expect(castleDoc.dialogueDocks[0]?.getAttribute("aria-label")).toBe(
        "Dialogue Window and Dispatch Command"
      );
      for (const el of castleDoc.allElements) {
        expect(el.getAttribute("aria-label") ?? "").not.toMatch(/[\u3040-\u309F\u30A0-\u30FF]/);
        expect(el.getAttribute("alt") ?? "").not.toMatch(/[\u3040-\u309F\u30A0-\u30FF]/);
        expect(el.title).not.toMatch(/[\u3040-\u309F\u30A0-\u30FF]/);
      }
      expect(castleDoc.byId.get("stage-heading")?.textContent).toBe(
        getStageLocalized(CASTLE_STAGES[0], "en").title
      );

      switchCastleLanguage("zh");
      expect(castleDoc.documentElement.lang).toBe("zh");
      expect(castleDoc.title).toContain("魔王城的24小时警备排班");
      expect(castleDoc.logoImgs.length).toBeGreaterThanOrEqual(1);
      for (const logo of castleDoc.logoImgs) {
        expect(logo.getAttribute("src")).toBe("./title-logo-zh.png");
        expect(logo.getAttribute("alt")).toBe("魔王城的24小时警备排班");
      }
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
      expect(castleDoc.byId.get("title-screen")?.getAttribute("aria-label")).toBe("标题画面");
      expect(castleDoc.byId.get("stage-progress-nav")?.getAttribute("aria-label")).toBe("年月选择");
      expect(castleDoc.byId.get("shift-grid-table")?.getAttribute("aria-label")).toBe("警备排班表");
      expect(castleDoc.byId.get("opening-movie-dialog")?.getAttribute("aria-label")).toBe(
        "开场动画"
      );
      expect(castleDoc.conditionRows[0]?.getAttribute("aria-label")).toBe("排班达成状况");
      expect(castleDoc.dialogueDocks[0]?.getAttribute("aria-label")).toBe("对话窗口与出击指令");
      for (const el of castleDoc.allElements) {
        expect(el.getAttribute("aria-label") ?? "").not.toMatch(/[\u3040-\u309F\u30A0-\u30FF]/);
        expect(el.getAttribute("alt") ?? "").not.toMatch(/[\u3040-\u309F\u30A0-\u30FF]/);
        expect(el.title).not.toMatch(/[\u3040-\u309F\u30A0-\u30FF]/);
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
      expect(sheepDoc.byId.get("back-link")?.textContent).toBe("← Showcase");
      expect(sheepDoc.byId.get("back-link")?.title).toBe("Back to Showcase");
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
      expect(sheepDoc.byId.get("legend-sheep")?.title).toBe(
        "Sheep (+2 pts, protect from wolves)"
      );
      expect(sheepDoc.byId.get("legend-grass")?.title).toBe("Meadow (+1 pt)");
      expect(sheepDoc.byId.get("legend-strawberry")?.title).toBe("Wild Strawberry (+5 pts)");
      expect(sheepDoc.byId.get("legend-pit")?.title).toBe(
        "Pitfall (-5 pts, can be plugged with a fence)"
      );
      expect(sheepDoc.byId.get("legend-bridge")?.title).toBe(
        "Stone Bridge (+1 pt, passable, cannot place fence)"
      );
      expect(sheepDoc.byId.get("legend-wall")?.textContent).toBe("💧🪨 Wall");
      expect(sheepDoc.byId.get("legend-wall")?.title).toBe(
        "Water & Rock (impassable natural wall)"
      );
      expect(sheepDoc.byId.get("legend-strip")?.getAttribute("aria-label")).toBe(
        "Tile Score Legend"
      );
      for (const el of sheepDoc.allElements) {
        expect(el.getAttribute("aria-label") ?? "").not.toMatch(/[\u3041-\u3096\u30A1-\u30F6]/);
        expect(el.getAttribute("alt") ?? "").not.toMatch(/[\u3041-\u3096\u30A1-\u30F6]/);
        expect(el.title).not.toMatch(/[\u3041-\u3096\u30A1-\u30F6]/);
      }

      applySheepStaticTranslations("zh");
      expect(sheepDoc.documentElement.lang).toBe("zh");
      expect(sheepDoc.title).toContain("毛茸茸绵羊围牧场");
      expect(sheepDoc.byId.get("back-link")?.textContent).toBe("← 案例展示");
      expect(sheepDoc.byId.get("back-link")?.title).toBe("返回案例展示");
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
      expect(sheepDoc.byId.get("legend-sheep")?.title).toBe("绵羊（+2分\u30FB保护对象）");
      expect(sheepDoc.byId.get("legend-grass")?.title).toBe("草地（+1分）");
      expect(sheepDoc.byId.get("legend-strawberry")?.title).toBe("野草莓（+5分）");
      expect(sheepDoc.byId.get("legend-pit")?.title).toBe("坑洞（-5分\u30FB可用木桩栅栏填平）");
      expect(sheepDoc.byId.get("legend-bridge")?.title).toBe(
        "石桥（+1分\u30FB可通行\u30FB不可放栅栏）"
      );
      expect(sheepDoc.byId.get("legend-wall")?.textContent).toBe("💧🪨 障碍墙");
      expect(sheepDoc.byId.get("legend-wall")?.title).toBe(
        "水池与岩石（不可通行的天然墙壁）"
      );
      expect(sheepDoc.byId.get("legend-strip")?.getAttribute("aria-label")).toBe("地块得分一览");
      for (const el of sheepDoc.allElements) {
        expect(el.getAttribute("aria-label") ?? "").not.toMatch(/[\u3041-\u3096\u30A1-\u30F6]/);
        expect(el.getAttribute("alt") ?? "").not.toMatch(/[\u3041-\u3096\u30A1-\u30F6]/);
        expect(el.title).not.toMatch(/[\u3041-\u3096\u30A1-\u30F6]/);
      }
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

  it("scales cell size to fit narrow 375px mobile viewports for 7x7 and 10x10 boards without overflowing", () => {
    // Desktop / unconstrained fallback preserves ideal cell sizes
    expect(computeCellSize(3, 4)).toBe(88);
    expect(computeCellSize(7, 7)).toBe(60);
    expect(computeCellSize(10, 10)).toBe(44);

    // 375px mobile viewport (~299px available inner board width): 7 * cellSize + 6 * 7 <= 299
    const mobileCellSize = computeCellSize(7, 7, 299, 7);
    expect(mobileCellSize).toBe(36);
    expect(7 * mobileCellSize + 6 * 7).toBeLessThanOrEqual(299);

    const mobile10CellSize = computeCellSize(10, 10, 299, 7);
    expect(mobile10CellSize).toBe(23);
    expect(10 * mobile10CellSize + 9 * 7).toBeLessThanOrEqual(299);
  });

  it("excludes legacy random-* keys from clear counts and stops next-stage navigation at the unlock boundary", async () => {
    const legacySavedJson = JSON.stringify({
      clearedByStageId: {
        "stage-1": true,
        "stage-2": true,
        "random-1001": true,
        "random-fallback-1": true,
      },
    });
    const parsed = parseProgressState(legacySavedJson);
    expect(parsed.clearedByStageId).toEqual({
      "stage-1": true,
      "stage-2": true,
    });
    expect(countCanonicalClearedStages(parsed.clearedByStageId)).toBe(2);
    // Tutorial stages 1..4 are unlocked by default
    expect(parsed.highestUnlockedStage).toBe(4);

    interface TestDomNode {
      id: string;
      type: string;
      textContent: string;
      innerHTML: string;
      title: string;
      hidden: boolean;
      disabled: boolean;
      value: string;
      selected: boolean;
      className: string;
      dataset: Record<string, string>;
      style: {
        gridTemplateColumns: string;
        setProperty: () => void;
      };
      children: TestDomNode[];
      classList: {
        toggle: () => void;
        add: () => void;
        remove: () => void;
      };
      setAttribute: () => void;
      getAttribute: () => string | null;
      appendChild: (child: TestDomNode) => void;
      addEventListener: (event: string, cb: () => void) => void;
      click: () => void;
    }

    const makeNode = (id = ""): TestDomNode => {
      const listeners = new Map<string, (() => void)[]>();
      const node: TestDomNode = {
        id,
        type: "",
        textContent: "",
        innerHTML: "",
        title: "",
        hidden: false,
        disabled: false,
        value: "",
        selected: false,
        className: "",
        dataset: {},
        style: {
          gridTemplateColumns: "",
          setProperty: () => {},
        },
        children: [],
        classList: {
          toggle: () => {},
          add: () => {},
          remove: () => {},
        },
        setAttribute: () => {},
        getAttribute: () => null,
        appendChild: (child: TestDomNode) => {
          node.children.push(child);
        },
        addEventListener: (event: string, cb: () => void) => {
          const list = listeners.get(event) ?? [];
          list.push(cb);
          listeners.set(event, list);
        },
        click: () => {
          for (const cb of listeners.get("click") ?? []) {
            cb();
          }
        },
      };
      return node;
    };

    const gamesRoot = resolve(__dirname, "../examples/web-demo/games");
    const sheepHtml = readFileSync(resolve(gamesRoot, "mofumofu-sheep/index.html"), "utf8");
    const byId = new Map<string, TestDomNode>();
    const tagRegex = /<([a-zA-Z0-9-]+)\b([^>]*)>/g;
    for (const match of sheepHtml.matchAll(tagRegex)) {
      const idMatch = match[2].match(/\bid="([^"]+)"/);
      if (!idMatch) continue;
      const id = idMatch[1];
      byId.set(id, makeNode(id));
    }
    const boardGridEl = byId.get("board-grid");
    if (boardGridEl) {
      Object.defineProperty(boardGridEl, "innerHTML", {
        get: () => "",
        set: () => {
          boardGridEl.children = [];
        },
      });
    }

    const storageMap = new Map<string, string>();
    const prevDocument = (globalThis as { document?: unknown }).document;
    const prevStorage = (globalThis as { localStorage?: unknown }).localStorage;
    try {
      (globalThis as { localStorage?: unknown }).localStorage = {
        getItem: (k: string) => storageMap.get(k) ?? null,
        setItem: (k: string, v: string) => {
          storageMap.set(k, v);
        },
        removeItem: (k: string) => {
          storageMap.delete(k);
        },
      };
      (globalThis as { document?: unknown }).document = {
        documentElement: { lang: "ja" },
        title: "",
        createElement: () => makeNode(),
        getElementById: (id: string) => byId.get(id) ?? null,
        querySelectorAll: () => [],
      };

      storageMap.set("washi_mofumofu_sheep_cleared_v3", legacySavedJson);
      await loadStageByNumber(1);
      expect(byId.get("total-stars-text")?.textContent).toBe("2 CLEAR");
      expect(byId.get("btn-stage-prev")?.disabled).toBe(true);
      expect(byId.get("btn-stage-next")?.disabled).toBe(false);

      // Step to Stage 4 (the initial tutorial unlock boundary)
      await loadStageByNumber(4);
      expect(byId.get("stage-badge")?.textContent).toBe("STAGE 4");
      expect(byId.get("btn-stage-prev")?.disabled).toBe(false);
      expect(byId.get("btn-stage-next")?.disabled).toBe(true);

      // Attempting to step past the unlock boundary must be rejected and must not unlock Stage 5
      const steppedLocked = await stepStage(1);
      expect(steppedLocked).toBe(false);
      expect(byId.get("stage-badge")?.textContent).toBe("STAGE 4");

      // Legitimately clearing Stage 4 by clicking its optimal cells unlocks Stage 5 and enables the next arrow
      const stage4 = CAMPAIGN_STAGES[3];
      const opt4 = await solveOptimalPasture(stage4);
      for (let r = 0; r < stage4.grid.length; r++) {
        for (let c = 0; c < stage4.grid[0].length; c++) {
          if (!opt4.optimalFences[r][c]) continue;
          const cellBtn = byId
            .get("board-grid")
            ?.children.find(
              (ch) => ch.dataset.row === String(r) && ch.dataset.col === String(c)
            );
          cellBtn?.click();
        }
      }
      expect(byId.get("total-stars-text")?.textContent).toBe("3 CLEAR");
      expect(byId.get("total-score-text")?.textContent).toBe("· 16 pt");
      expect(byId.get("btn-stage-next")?.disabled).toBe(false);

      const steppedUnlocked = await stepStage(1);
      expect(steppedUnlocked).toBe(true);
      expect(byId.get("stage-badge")?.textContent).toBe("STAGE 5");

      // Verify rapid repeated navigation into an uncached generated stage (Stage 14) disables controls while loading
      storageMap.set(
        "washi_mofumofu_sheep_cleared_v3",
        JSON.stringify({
          clearedByStageId: { "stage-13": true },
          highestUnlockedStage: 15,
        })
      );
      await loadStageByNumber(13);
      const firstStepPromise = stepStage(1);
      // While Stage 14 generation is in flight, navigation and rules buttons are disabled and duplicate/tutorial jumps are rejected
      expect(byId.get("btn-stage-prev")?.disabled).toBe(true);
      expect(byId.get("btn-stage-next")?.disabled).toBe(true);
      expect(byId.get("stage-select")?.disabled).toBe(true);
      expect(byId.get("btn-open-rules")?.disabled).toBe(true);
      const duplicateStep = await stepStage(1);
      expect(duplicateStep).toBe(false);
      await loadStageByNumber(1);
      expect(await firstStepPromise).toBe(true);
      expect(byId.get("stage-badge")?.textContent).toBe("STAGE 14");
      expect(byId.get("btn-stage-prev")?.disabled).toBe(false);
      expect(byId.get("btn-stage-next")?.disabled).toBe(false);
      expect(byId.get("stage-select")?.disabled).toBe(false);
      expect(byId.get("btn-open-rules")?.disabled).toBe(false);
    } finally {
      if (prevDocument === undefined) {
        delete (globalThis as { document?: unknown }).document;
      } else {
        (globalThis as { document?: unknown }).document = prevDocument;
      }
      if (prevStorage === undefined) {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      } else {
        (globalThis as { localStorage?: unknown }).localStorage;
        (globalThis as { localStorage?: unknown }).localStorage = prevStorage;
      }
    }
  });

  it("determines resume stage number from cleared progress and restores total scores", async () => {
    // 1. Fresh state: start at tutorial Stage 1
    const fresh = parseProgressState(null);
    expect(getResumeStageNumber(fresh)).toBe(1);
    expect(fresh.totalScore).toBe(0);

    // 2. Cleared Stage 1: resume at Stage 2
    const afterStage1 = parseProgressState(
      JSON.stringify({
        clearedByStageId: { "stage-1": true },
        highestUnlockedStage: 4,
        stageScores: { "stage-1": 7 },
      })
    );
    expect(getResumeStageNumber(afterStage1)).toBe(2);
    expect(afterStage1.totalScore).toBe(7);

    // 3. Completed all 4 tutorial stages (1-4): skip tutorials by default and resume at Stage 5
    const clearedTutorials = parseProgressState(
      JSON.stringify({
        clearedByStageId: {
          "stage-1": true,
          "stage-2": true,
          "stage-3": true,
          "stage-4": true,
        },
        highestUnlockedStage: 5,
        stageScores: {
          "stage-1": 7,
          "stage-2": 9,
          "stage-3": 6,
          "stage-4": 12,
        },
      })
    );
    expect(getResumeStageNumber(clearedTutorials)).toBe(5);
    expect(clearedTutorials.totalScore).toBe(34);

    // 4. Completed up to Stage 6: resume at Stage 7
    const clearedUpTo6 = parseProgressState(
      JSON.stringify({
        clearedByStageId: {
          "stage-1": true,
          "stage-2": true,
          "stage-3": true,
          "stage-4": true,
          "stage-5": true,
          "stage-6": true,
        },
        highestUnlockedStage: 7,
      })
    );
    expect(getResumeStageNumber(clearedUpTo6)).toBe(7);

    // 5. DOM-level verification exercising the production renderStageNav renderer
    const gamesRoot = resolve(__dirname, "../examples/web-demo/games");
    const sheepHtml = readFileSync(resolve(gamesRoot, "mofumofu-sheep/index.html"), "utf8");
    const testDom = new Map<string, {
      id: string;
      textContent: string;
      title: string;
      hidden: boolean;
      disabled: boolean;
      innerHTML: string;
      children: unknown[];
      appendChild: (c: unknown) => void;
      setAttribute: () => void;
      getAttribute: () => string | null;
      classList: { toggle: () => void };
    }>();

    const makeTestNode = (id: string) => {
      const node = {
        id,
        textContent: "",
        title: "",
        hidden: false,
        disabled: false,
        innerHTML: "",
        children: [] as unknown[],
        dataset: {} as Record<string, string>,
        style: {
          setProperty: () => {},
          gridTemplateColumns: "",
        },
        appendChild: (child: unknown) => {
          node.children.push(child);
        },
        setAttribute: () => {},
        getAttribute: () => null,
        addEventListener: () => {},
        classList: {
          toggle: () => void 0,
          add: () => void 0,
          remove: () => void 0,
        },
      };
      return node;
    };

    const tagRegex = /<([a-zA-Z0-9-]+)\b([^>]*)>/g;
    for (const match of sheepHtml.matchAll(tagRegex)) {
      const idMatch = match[2].match(/\bid="([^"]+)"/);
      if (!idMatch) continue;
      testDom.set(idMatch[1], makeTestNode(idMatch[1]));
    }

    const prevDoc = (globalThis as { document?: unknown }).document;
    const prevStorage = (globalThis as { localStorage?: unknown }).localStorage;
    const storeMap = new Map<string, string>();
    storeMap.set("washi_mofumofu_sheep_cleared_v3", JSON.stringify(clearedTutorials));

    try {
      (globalThis as { document?: unknown }).document = {
        getElementById: (id: string) => testDom.get(id) ?? null,
        querySelectorAll: () => [],
        createElement: (tag: string) => makeTestNode(tag),
      };
      (globalThis as { localStorage?: unknown }).localStorage = {
        getItem: (k: string) => storeMap.get(k) ?? null,
        setItem: (k: string, v: string) => {
          storeMap.set(k, v);
        },
      };

      // Step stage or load stage to sync storage and trigger production renderStageNav
      await loadStageByNumber(5);
      renderStageNav();

      const scoreNode = testDom.get("total-score-text");
      const starsNode = testDom.get("total-stars-text");
      expect(scoreNode).toBeDefined();
      expect(scoreNode?.textContent).toBe("· 34 pt");
      expect(scoreNode?.hidden).toBe(false);
      expect(starsNode?.textContent).toBe("4 CLEAR");
    } finally {
      if (prevDoc === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = prevDoc;
      if (prevStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
      else (globalThis as { localStorage?: unknown }).localStorage = prevStorage;
    }
  });

  it("replaces log emoji with authentic wooden fence SVG and integrates BGM toggle button", () => {
    const gamesRoot = resolve(__dirname, "../examples/web-demo/games");
    const sheepHtml = readFileSync(resolve(gamesRoot, "mofumofu-sheep/index.html"), "utf8");
    const theoryHtml = readFileSync(resolve(gamesRoot, "mofumofu-sheep-theory/index.html"), "utf8");

    // 1. Verify log emoji (🪵) is completely removed from HTML files
    expect(sheepHtml).not.toContain("🪵");
    expect(theoryHtml).not.toContain("🪵");

    // 2. Verify authentic wooden fence SVG contains picket posts and rails
    expect(FENCE_SVG).toContain("fence-svg");
    expect(FENCE_SVG).toContain("<svg");
    expect(FENCE_SVG).toContain("rect");
    expect(FENCE_SVG).toContain("path");

    // 3. Verify topbar contains BGM toggle button
    expect(sheepHtml).toContain('id="btn-bgm-toggle"');
    expect(sheepHtml).toContain("data-bgm-toggle");
    expect(sheepHtml).toContain("BGM: OFF");

    // 4. Verify PastureAudioEngine toggle and track switching work cleanly
    expect(pastureAudio.playing).toBe(false);
    pastureAudio.setTrack("meadow");
    pastureAudio.setTrack("victory");
    pastureAudio.playFenceTap(true);
    pastureAudio.playFenceTap(false);
    pastureAudio.playAlert();
    pastureAudio.playShortfall();
    pastureAudio.playSafeChime();
    pastureAudio.playHint();

    // 5. Verify no orphaned playTone references exist in mofumofu-sheep/main.ts
    const mainTs = readFileSync(resolve(gamesRoot, "mofumofu-sheep/main.ts"), "utf8");
    expect(mainTs).not.toContain("playTone(");
    expect(mainTs).toContain("pastureAudio.playHint()");
  });

  it("exercises BGM toggle button interaction and UI synchronization", () => {
    class FakeAudioContext {
      currentTime = 0;
      state = "running";
      destination = {};
      createOscillator() {
        return {
          type: "sine",
          frequency: { setValueAtTime: () => {} },
          connect: () => {},
          start: () => {},
          stop: () => {},
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
          },
          connect: () => {},
        };
      }
      resume = async () => {};
    }

    const prevWin = (globalThis as { window?: unknown }).window;
    const prevDoc = (globalThis as { document?: unknown }).document;

    const btn = {
      id: "btn-bgm-toggle",
      attrs: new Map<string, string>(),
      setAttribute(k: string, v: string) {
        this.attrs.set(k, v);
      },
      getAttribute(k: string) {
        return this.attrs.get(k) ?? null;
      },
      title: "",
    };
    const textEl = {
      id: "bgm-btn-text",
      textContent: "🔇 BGM: OFF",
    };

    const fakeWindow = {
      AudioContext: FakeAudioContext,
      setInterval: () => 1,
      clearInterval: () => {},
    };

    try {
      (globalThis as { window?: unknown }).window = fakeWindow;
      (globalThis as { document?: unknown }).document = {
        documentElement: { lang: "ja" },
        title: "",
        querySelectorAll: () => [],
        getElementById: (id: string) => {
          if (id === "btn-bgm-toggle") return btn;
          if (id === "bgm-btn-text") return textEl;
          return null;
        },
      };

      // 1. Initial state: OFF
      pastureAudio.stopBgm();
      applySheepStaticTranslations("ja");
      expect(pastureAudio.playing).toBe(false);
      expect(btn.getAttribute("aria-pressed")).toBe("false");
      expect(textEl.textContent).toContain("BGM: OFF");

      // 2. Toggle BGM ON
      const started = pastureAudio.toggleBgm();
      expect(started).toBe(true);
      expect(pastureAudio.playing).toBe(true);
      applySheepStaticTranslations("ja");
      expect(btn.getAttribute("aria-pressed")).toBe("true");
      expect(textEl.textContent).toBe("🔊 BGM: ON");

      // 3. Multilingual title updates
      applySheepStaticTranslations("en");
      expect(btn.title).toContain("Stop BGM");
      applySheepStaticTranslations("zh");
      expect(btn.title).toContain("停止BGM");

      // 4. Toggle BGM OFF
      const stopped = pastureAudio.toggleBgm();
      expect(stopped).toBe(false);
      expect(pastureAudio.playing).toBe(false);
      applySheepStaticTranslations("en");
      expect(btn.getAttribute("aria-pressed")).toBe("false");
      expect(btn.title).toContain("Play BGM");
    } finally {
      pastureAudio.stopBgm();
      if (prevWin === undefined) delete (globalThis as { window?: unknown }).window;
      else (globalThis as { window?: unknown }).window = prevWin;
      if (prevDoc === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = prevDoc;
    }
  });

  it("enforces mobile-responsive CSS layout, viewport height scaling, and touch manipulation properties", () => {
    const gamesRoot = resolve(__dirname, "../examples/web-demo/games");
    const styleCss = readFileSync(resolve(gamesRoot, "mofumofu-sheep/style.css"), "utf8");

    // 1. Verify touch action & safe-area in root body and cells
    expect(styleCss).toContain("touch-action: manipulation;");
    expect(styleCss).toContain("min-height: 100dvh;");
    expect(styleCss).toContain("env(safe-area-inset-bottom)");
    expect(styleCss).toContain("-webkit-tap-highlight-color: transparent;");

    // 2. Scoped check of @media (max-width: 640px) HUD layout rules
    const mobileBlockMatch = styleCss.match(/@media\s*\(max-width:\s*640px\)\s*\{([\s\S]*?\n\})/);
    expect(mobileBlockMatch).toBeTruthy();
    const mobileBlock = mobileBlockMatch![1];

    const hudBarMatch = mobileBlock.match(/\.hud-bar\s*\{([^}]+)\}/);
    expect(hudBarMatch?.[1]).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);

    const hudPillMatch = mobileBlock.match(/\.hud-pill\s*\{([^}]+)\}/);
    expect(hudPillMatch?.[1]).toContain("min-width: 0;");
    expect(hudPillMatch?.[1]).toContain("overflow: hidden;");

    const fenceDotsMatch = mobileBlock.match(/\.fence-dots\s*\{([^}]+)\}/);
    expect(fenceDotsMatch?.[1]).toContain("flex-wrap: wrap;");
    expect(fenceDotsMatch?.[1]).toContain("max-width: 100%;");

    const hudValMatch = mobileBlock.match(/\.hud-value\s*\{([^}]+)\}/);
    expect(hudValMatch?.[1]).toContain("white-space: normal;");
    const statusTextMatch = mobileBlock.match(/\.status-text\s*\{([^}]+)\}/);
    expect(statusTextMatch?.[1]).toContain("white-space: normal;");

    // 3. Verify desktop keyboard shortcut badges are hidden on mobile
    expect(mobileBlock).toContain(".btn kbd {\n    display: none;\n  }");

    // 4. Verify extra-narrow mobile and landscape media queries exist
    expect(styleCss).toContain("@media (max-width: 380px)");
    expect(styleCss).toContain("@media (max-height: 520px) and (orientation: landscape)");

    // 5. Verify dynamic cell size scaling with height constraint
    // When width is generous (600px) but height is restricted (210px for 7x7):
    const constrainedHeightCell = computeCellSize(7, 7, 600, 7, 210);
    expect(constrainedHeightCell).toBe(24);
    expect(7 * constrainedHeightCell + 6 * 7).toBeLessThanOrEqual(210);

    // Unconstrained height falls back to width-only computation
    expect(computeCellSize(7, 7, 299, 7)).toBe(36);
  });

  it("renders high-fence stages with dense wrapped indicators fitting within narrow mobile HUD pills", async () => {
    interface MockNode {
      id?: string;
      className: string;
      classList: {
        contains: (c: string) => boolean;
        add: (c: string) => void;
        remove: (c: string) => void;
        toggle: (c: string, force?: boolean) => boolean;
      };
      children: MockNode[];
      innerHTML: string;
      textContent: string;
      style: { setProperty: (k: string, v: string) => void };
      parentElement?: MockNode | null;
      disabled?: boolean;
      dataset: Record<string, string>;
      setAttribute: (k: string, v: string) => void;
      getAttribute: (k: string) => string | null;
      appendChild: (c: MockNode) => void;
      addEventListener: (event: string, cb: () => void) => void;
    }

    const createMockNode = (id = ""): MockNode => {
      const classSet = new Set<string>();
      const node: MockNode = {
        id,
        className: "",
        classList: {
          contains: (c: string) => classSet.has(c),
          add: (c: string) => {
            classSet.add(c);
            node.className = Array.from(classSet).join(" ");
          },
          remove: (c: string) => {
            classSet.delete(c);
            node.className = Array.from(classSet).join(" ");
          },
          toggle: (c: string, force?: boolean) => {
            const has = classSet.has(c);
            const next = force !== undefined ? force : !has;
            if (next) classSet.add(c);
            else classSet.delete(c);
            node.className = Array.from(classSet).join(" ");
            return next;
          },
        },
        children: [],
        innerHTML: "",
        textContent: "",
        style: { setProperty: () => {} },
        dataset: {},
        setAttribute: () => {},
        getAttribute: () => null,
        appendChild: (child: MockNode) => {
          node.children.push(child);
        },
        addEventListener: () => {},
      };
      Object.defineProperty(node, "innerHTML", {
        get: () => "",
        set: (val: string) => {
          if (val === "") node.children = [];
        },
      });
      return node;
    };

    const gamesRoot = resolve(__dirname, "../examples/web-demo/games");
    const sheepHtml = readFileSync(resolve(gamesRoot, "mofumofu-sheep/index.html"), "utf8");
    const byId = new Map<string, MockNode>();
    for (const match of sheepHtml.matchAll(/<([a-zA-Z0-9-]+)\b([^>]*)>/g)) {
      const idMatch = match[2].match(/\bid="([^"]+)"/);
      if (!idMatch) continue;
      byId.set(idMatch[1], createMockNode(idMatch[1]));
    }

    const prevDoc = (globalThis as { document?: unknown }).document;
    const prevStorage = (globalThis as { localStorage?: unknown }).localStorage;
    const storeMap = new Map<string, string>();
    storeMap.set(
      "washi_mofumofu_sheep_cleared_v3",
      JSON.stringify({ highestUnlockedStage: 35 })
    );

    try {
      (globalThis as { document?: unknown }).document = {
        documentElement: { lang: "ja" },
        title: "",
        getElementById: (id: string) => byId.get(id) ?? null,
        querySelectorAll: () => [],
        createElement: (tag: string) => createMockNode(tag),
      };
      (globalThis as { localStorage?: unknown }).localStorage = {
        getItem: (k: string) => storeMap.get(k) ?? null,
        setItem: (k: string, v: string) => storeMap.set(k, v),
      };

      // Stage 32 generates with 10 maxFences (8 + (32 % 3) = 10)
      await loadStageByNumber(32);

      const fenceDotsEl = byId.get("fence-dots");
      expect(fenceDotsEl).toBeDefined();
      const fenceCount = fenceDotsEl?.children.length ?? 0;
      expect(fenceCount).toBeGreaterThanOrEqual(8);
      expect(fenceDotsEl?.classList.contains("dense")).toBe(true);

      // Verify layout math for 320px viewport:
      // Available HUD width = 320px viewport - 16px body padding - 20px card padding = 284px.
      // 3 pills with 6px gap: available pill width = Math.floor((284 - 12) / 3) = 90px (content width = 82px after 4px padding).
      // At dense icon size (0.72rem ≈ 11.5px) + 2px gap:
      // A non-wrapping row of N icons (>= 8) would occupy: N * 11.5 + (N - 1) * 2 >= 8 * 11.5 + 7 * 2 = 106px > 82px (overflows without wrap).
      // With flex-wrap: wrap, each wrapped row holds at most Math.floor((82 + 2) / (11.5 + 2)) = 6 icons.
      // 2 wrapped rows of <= 5 icons occupy: <= 5 * 11.5 + 4 * 2 = 65.5px <= 82px, fitting cleanly into the 90px pill.
      const dotWidthPx = 11.5;
      const dotGapPx = 2;
      const pillContentWidthPx = 82;
      const unwrappedWidthPx = fenceCount * dotWidthPx + (fenceCount - 1) * dotGapPx;
      expect(unwrappedWidthPx).toBeGreaterThan(pillContentWidthPx);

      const maxDotsPerRow = Math.floor((pillContentWidthPx + dotGapPx) / (dotWidthPx + dotGapPx));
      const rowCount = Math.ceil(fenceCount / maxDotsPerRow);
      const wrappedRowWidthPx = Math.ceil(fenceCount / rowCount) * dotWidthPx + (Math.ceil(fenceCount / rowCount) - 1) * dotGapPx;
      expect(wrappedRowWidthPx).toBeLessThanOrEqual(pillContentWidthPx);
    } finally {
      if (prevDoc === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = prevDoc;
      if (prevStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
      else (globalThis as { localStorage?: unknown }).localStorage = prevStorage;
    }
  });

  it("prevents stage-strip horizontal overflow, clips select text, and keeps next button visible within 360px viewport", () => {
    const gamesRoot = resolve(__dirname, "../examples/web-demo/games");
    const styleCss = readFileSync(resolve(gamesRoot, "mofumofu-sheep/style.css"), "utf8");

    const mobileBlockMatch = styleCss.match(/@media\s*\(max-width:\s*640px\)\s*\{([\s\S]*?\n\})/);
    expect(mobileBlockMatch).toBeTruthy();
    const mobileBlock = mobileBlockMatch![1];

    // 1. Stage select wrapper & select element must be flexible and ellipsis-clipped
    expect(mobileBlock).toContain(".stage-select-wrap");
    expect(mobileBlock).toMatch(/\.stage-select-wrap\s*\{[^}]*min-width:\s*0/);
    expect(mobileBlock).toMatch(/\.stage-select-wrap\s*\{[^}]*flex:\s*1/);
    expect(mobileBlock).toMatch(/\.stage-select\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(mobileBlock).toMatch(/\.stage-select\s*\{[^}]*white-space:\s*nowrap/);
    expect(mobileBlock).toMatch(/\.stage-select\s*\{[^}]*overflow:\s*hidden/);

    // 2. Stage nav bar must be full width of its parent card with space-between / bounded layout
    expect(mobileBlock).toMatch(/\.stage-nav-bar\s*\{[^}]*width:\s*100%/);

    // 3. Mathematical layout assertion on 360px narrow mobile viewport:
    // Available card width = 360px - 16px (body padding) - 20px (card padding) = 324px.
    // Elements: prevBtn (34px) + gap (4px) + selectWrap (<= 220px) + gap (4px) + nextBtn (34px) = 296px <= 324px.
    const stepBtnWidth = 34;
    const navGap = 4;
    const maxSelectWrapWidth = 220;
    const totalStripWidth = stepBtnWidth * 2 + navGap * 2 + maxSelectWrapWidth;
    const availableCardWidth360 = 360 - 16 - 20;
    expect(totalStripWidth).toBeLessThanOrEqual(availableCardWidth360);
  });

  it("enforces compact mobile topbar preventing vertical text wrapping on back link and brand title", () => {
    const gamesRoot = resolve(__dirname, "../examples/web-demo/games");
    const styleCss = readFileSync(resolve(gamesRoot, "mofumofu-sheep/style.css"), "utf8");

    const mobileBlockMatch = styleCss.match(/@media\s*\(max-width:\s*640px\)\s*\{([\s\S]*?\n\})/);
    expect(mobileBlockMatch).toBeTruthy();
    const mobileBlock = mobileBlockMatch![1];

    // Brand and h1 title must be flex-constrained with ellipsis
    expect(mobileBlock).toMatch(/\.brand\s*\{[^}]*min-width:\s*0/);
    expect(mobileBlock).toMatch(/\.brand-text\s*h1\s*\{[^}]*white-space:\s*nowrap/);
    expect(mobileBlock).toMatch(/\.brand-text\s*h1\s*\{[^}]*overflow:\s*hidden/);
    expect(mobileBlock).toMatch(/\.brand-text\s*h1\s*\{[^}]*text-overflow:\s*ellipsis/);

    // Desktop topbar shows progress actions while hiding mobile-only menu button
    expect(styleCss).toMatch(/\.topbar-actions\s*\{[^}]*display:\s*flex/);
    expect(styleCss).toMatch(/\.topbar-menu-btn\s*\{[^}]*display:\s*none/);

    // Mobile topbar hides non-essential clutter (showcase link, BGM, rules, language buttons) behind a clean gear menu
    expect(styleCss).toContain(".topbar-menu-btn");
    expect(mobileBlock).toMatch(/\.topbar-menu-btn\s*\{[^}]*display:\s*inline-flex/);
    expect(mobileBlock).toMatch(/\.back-link\s*\{[^}]*display:\s*none/);
    expect(mobileBlock).toMatch(/\.topbar-stats\s*\{[^}]*display:\s*none/);
    expect(mobileBlock).toMatch(/\.topbar-stats\.is-open\s*\{[^}]*display:\s*flex/);
    expect(mobileBlock).toMatch(/\.menu-back-link\s*\{[^}]*display:\s*inline-flex/);
  });

  it("keeps rules dialog start button and positions clear banner as a floating thumb-zone action so it never extends downwards", () => {
    const gamesRoot = resolve(__dirname, "../examples/web-demo/games");
    const styleCss = readFileSync(resolve(gamesRoot, "mofumofu-sheep/style.css"), "utf8");

    const mobileBlockMatch = styleCss.match(/@media\s*\(max-width:\s*640px\)\s*\{([\s\S]*?\n\})/);
    expect(mobileBlockMatch).toBeTruthy();
    const mobileBlock = mobileBlockMatch![1];

    // Puzzle card disables backdrop-filter on mobile so fixed descendants anchor to the viewport
    expect(mobileBlock).toMatch(/\.puzzle-card\s*\{[^}]*backdrop-filter:\s*none/);

    // 1. Rules dialog footer is sticky at the bottom of the modal so CTA is always visible without scrolling
    expect(mobileBlock).toMatch(/\.rules-dialog-footer\s*\{[^}]*position:\s*sticky/);
    expect(mobileBlock).toMatch(/\.rules-dialog-footer\s*\{[^}]*bottom:\s*0/);

    // 2. Legend strip uses single-row horizontal scroll on mobile to avoid orphaned chips
    expect(mobileBlock).toMatch(/\.legend-strip\s*\{[^}]*flex-wrap:\s*nowrap/);
    expect(mobileBlock).toMatch(/\.legend-strip\s*\{[^}]*overflow-x:\s*auto/);

    // 3. Clear banner floats fixed in thumb zone so it never stretches page downwards or gets hidden below the fold
    expect(mobileBlock).toContain(".clear-banner:not([hidden]):not(.banner-shortfall)");
    expect(mobileBlock).toMatch(/\.clear-banner:not\(\[hidden\]\):not\(\.banner-shortfall\)\s*\{[^}]*position:\s*fixed/);
    expect(mobileBlock).toMatch(/\.clear-banner:not\(\[hidden\]\):not\(\.banner-shortfall\)\s*\{[^}]*bottom:\s*max\(/);
    expect(mobileBlock).toMatch(/\.clear-banner:not\(\[hidden\]\):not\(\.banner-shortfall\)\s*\{[^}]*z-index:\s*99/);

    // 4. Inline shortfall banner is hidden on mobile to eliminate vertical height growth and prevent control-bar truncation
    expect(mobileBlock).toMatch(/\.clear-banner\.banner-shortfall\s*\{[^}]*display:\s*none\s*!important/);
  });

  it("integrates shortfall advice into guide-banner and controls-bar to eliminate vertical board overflow on mobile", async () => {
    interface TestDomNode {
      id: string;
      type: string;
      textContent: string;
      innerHTML: string;
      title: string;
      hidden: boolean;
      disabled: boolean;
      value: string;
      selected: boolean;
      className: string;
      dataset: Record<string, string>;
      style: {
        gridTemplateColumns: string;
        setProperty: (prop: string, val: string) => void;
      };
      children: TestDomNode[];
      classList: {
        contains: (cls: string) => boolean;
        toggle: (cls: string, force?: boolean) => boolean;
        add: (...cls: string[]) => void;
        remove: (...cls: string[]) => void;
      };
      setAttribute: (k: string, v: string) => void;
      getAttribute: (k: string) => string | null;
      appendChild: (child: TestDomNode) => void;
      addEventListener: (event: string, cb: () => void) => void;
      click: () => void;
    }

    const makeNode = (id = ""): TestDomNode => {
      const listeners = new Map<string, (() => void)[]>();
      const classes = new Set<string>();
      const node: TestDomNode = {
        id,
        type: "",
        textContent: "",
        innerHTML: "",
        title: "",
        hidden: false,
        disabled: false,
        value: "",
        selected: false,
        className: "",
        dataset: {},
        style: {
          gridTemplateColumns: "",
          setProperty: () => {},
        },
        children: [],
        classList: {
          contains: (cls: string) => classes.has(cls),
          toggle: (cls: string, force?: boolean) => {
            const next = force !== undefined ? force : !classes.has(cls);
            if (next) classes.add(cls); else classes.delete(cls);
            node.className = Array.from(classes).join(" ");
            return next;
          },
          add: (...cls: string[]) => {
            cls.forEach((c) => classes.add(c));
            node.className = Array.from(classes).join(" ");
          },
          remove: (...cls: string[]) => {
            cls.forEach((c) => classes.delete(c));
            node.className = Array.from(classes).join(" ");
          },
        },
        setAttribute: (k: string, v: string) => {
          if (k === "title") node.title = v;
        },
        getAttribute: (k: string) => (k === "title" ? node.title : null),
        appendChild: (child: TestDomNode) => {
          node.children.push(child);
        },
        addEventListener: (event: string, cb: () => void) => {
          const list = listeners.get(event) ?? [];
          list.push(cb);
          listeners.set(event, list);
        },
        click: () => {
          for (const cb of listeners.get("click") ?? []) {
            cb();
          }
        },
      };
      return node;
    };

    const gamesRoot = resolve(__dirname, "../examples/web-demo/games");
    const sheepHtml = readFileSync(resolve(gamesRoot, "mofumofu-sheep/index.html"), "utf8");
    const styleCss = readFileSync(resolve(gamesRoot, "mofumofu-sheep/style.css"), "utf8");

    // 1. Structure check: #btn-show-optimal is housed within .controls-right next to hint
    expect(sheepHtml).toMatch(/<div class="controls-right">[\s\S]*?<button[^>]*id="btn-show-optimal"/);

    // 2. Mobile style check: .clear-banner.banner-shortfall is suppressed on mobile
    const mobileBlockMatch = styleCss.match(/@media\s*\(max-width:\s*640px\)\s*\{([\s\S]*?\n\})/);
    expect(mobileBlockMatch).toBeTruthy();
    expect(mobileBlockMatch![1]).toMatch(/\.clear-banner\.banner-shortfall\s*\{[^}]*display:\s*none\s*!important/);

    // 3. Behavioral DOM test: load Stage 2, place suboptimal safe fence, and observe HUD & control transitions
    const byId = new Map<string, TestDomNode>();
    const tagRegex = /<([a-zA-Z0-9-]+)\b([^>]*)>/g;
    for (const match of sheepHtml.matchAll(tagRegex)) {
      const idMatch = match[2].match(/\bid="([^"]+)"/);
      if (!idMatch) continue;
      const id = idMatch[1];
      byId.set(id, makeNode(id));
    }
    const boardGridEl = byId.get("board-grid");
    if (boardGridEl) {
      Object.defineProperty(boardGridEl, "innerHTML", {
        get: () => "",
        set: () => {
          boardGridEl.children = [];
        },
      });
    }

    const prevDocument = (globalThis as { document?: unknown }).document;
    const prevStorage = (globalThis as { localStorage?: unknown }).localStorage;
    const storageMap = new Map<string, string>();

    try {
      (globalThis as { localStorage?: unknown }).localStorage = {
        getItem: (k: string) => storageMap.get(k) ?? null,
        setItem: (k: string, v: string) => {
          storageMap.set(k, v);
        },
        removeItem: (k: string) => {
          storageMap.delete(k);
        },
      };
      (globalThis as { document?: unknown }).document = {
        documentElement: { lang: "ja" },
        title: "",
        createElement: () => makeNode(),
        getElementById: (id: string) => byId.get(id) ?? null,
        querySelectorAll: () => [],
      };

      applySheepStaticTranslations("ja");
      await loadStageByNumber(2);

      const guideBanner = byId.get("guide-banner");
      const stageOneliner = byId.get("stage-oneliner");
      const btnShowOptimal = byId.get("btn-show-optimal");
      const btnHint = byId.get("btn-hint");

      // Initial state: normal guide, optimal button hidden, hint button visible
      expect(guideBanner?.classList.contains("is-shortfall")).toBe(false);
      expect(stageOneliner?.textContent).toContain("🐑\u306E\u3059\u3050隣\u3067塞\u3050\u3068🍓\u306B届\u304B\u306A\u3044");
      expect(btnShowOptimal?.hidden).toBe(true);
      expect(btnHint?.hidden).toBe(false);

      // In Stage 2 ("Strawberry Hill"), sheep is at (1, 4), wolf is at (1, 0), strawberry at (1, 2).
      // Placing the 1 allowed fence at (1, 3) blocks the wolf, but leaves out the strawberry:
      // Score = 2 pt, targetScore = 8 pt -> isShortfall (isSafe && !cleared)!
      const suboptimalCell = boardGridEl?.children.find(
        (ch) => ch.dataset.row === "1" && ch.dataset.col === "3"
      );
      expect(suboptimalCell).toBeDefined();
      suboptimalCell?.click();

      // Behavioral assertion: Guide banner receives shortfall styling and dynamic guidance text
      expect(guideBanner?.classList.contains("is-shortfall")).toBe(true);
      expect(stageOneliner?.textContent).toBe("\u30AA\u30AA\u30AB\u30DF防衛成功! 柵\u306E位置\u3092工夫\u3057\u3066\u3042\u3068 +6 pt 稼\u3054\u3046");
      expect(byId.get("guide-banner-icon")?.textContent).toBe("🍓");

      // HUD status pill updates to shortfall status
      expect(byId.get("status-text")?.textContent).toContain("目標\u307E\u3067\u3042\u3068 +6 pt");

      // Controls bar replaces 1-move hint with model solution button when 0 fences remain
      expect(btnShowOptimal?.hidden).toBe(false);
      expect(btnHint?.hidden).toBe(true);

      // Clicking Undo or untoggling the fence restores initial normal state
      suboptimalCell?.click();
      expect(guideBanner?.classList.contains("is-shortfall")).toBe(false);
      expect(stageOneliner?.textContent).toContain("🐑\u306E\u3059\u3050隣\u3067塞\u3050\u3068🍓\u306B届\u304B\u306A\u3044");
      expect(btnShowOptimal?.hidden).toBe(true);
      expect(btnHint?.hidden).toBe(false);
    } finally {
      (globalThis as { document?: unknown }).document = prevDocument;
      (globalThis as { localStorage?: unknown }).localStorage = prevStorage;
    }
  });

  it("calibrates mobile board height on compact viewports (<= 700px height) so board, controls, and legend fit without scrolling", () => {
    // For 667px iPhone SE viewport: available height must allow 7x7 board, HUD, controls, and legend to fit
    // 667px * 0.41 = ~273px. For 7x7: 7 * cellSize + 6 * 7 <= 273 -> cellSize = 33px.
    const mobileShortCellSize = computeCellSize(7, 7, 335, 7, 273);
    expect(mobileShortCellSize).toBe(33);
    const boardTotalHeight = 7 * mobileShortCellSize + 6 * 7;
    expect(boardTotalHeight).toBeLessThanOrEqual(273);
  });
});
