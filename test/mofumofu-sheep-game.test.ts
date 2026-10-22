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
import { CAMPAIGN_STAGES as CASTLE_STAGES } from "../examples/web-demo/games/demon-castle-shift/stages.js";

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
