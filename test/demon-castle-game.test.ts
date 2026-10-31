import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ALL_PAIR_RELATIONS,
  MONSTERS,
} from "../examples/web-demo/games/demon-castle-shift/characters.js";
import {
  CALENDAR_ERA_NAME,
  CAMPAIGN_STAGES,
  computeAdaptiveDifficultyTier,
  formatCastleCalendarMonth,
  generateAdaptiveStage,
  generateRandomStage,
  generateRetryCampaignStage,
  getCastleCalendarYearMonth,
} from "../examples/web-demo/games/demon-castle-shift/stages.js";
import {
  computeSlotWinProbability,
  createEmptySchedule,
  diagnoseScheduleWithHighs,
  evaluateSchedule,
  generateVerifiedStageWithHighs,
  rollStageBattles,
  solveOptimalSchedule,
} from "../examples/web-demo/games/demon-castle-shift/solver.js";
import {
  ALL_MONSTER_IDS,
  BALANCE_CONFIG,
  type StagePlayRecord,
} from "../examples/web-demo/games/demon-castle-shift/types.js";
import {
  getActiveStageStateForTest,
  hasSavedProgress,
  isEndlessModeUnlocked,
  loadCampaignStage,
  loadEndlessStage,
  recordStageBreachFailure,
  recordStageVictory,
  resetSaveDataForTest,
  type SaveData,
} from "../examples/web-demo/games/demon-castle-shift/main.js";

describe("Demon Castle 24-Hour Guard Shift Game Solver & Stages (HiGHS only)", () => {
  for (const stage of CAMPAIGN_STAGES) {
    it(`solves campaign stage ${stage.id} (${stage.title}) to Optimal and matches independent evaluator`, async () => {
      const res = await solveOptimalSchedule(stage);
      expect(res.status).toBe("Optimal");
      expect(res.verified).toBe(true);
      expect(res.maxViolation).toBeLessThanOrEqual(1e-6);
      expect(res.lpString).toContain("Maximize");

      const evalResult = evaluateSchedule(stage, res.optimalSchedule);
      expect(evalResult.isValid).toBe(true);
      expect(evalResult.violations).toEqual([]);
      expect(evalResult.totalScore).toBe(res.optimalScore);
    });
  }

  it("generates guaranteed-feasible random weekly stages across multiple seeds", async () => {
    for (let seed = 1; seed <= 8; seed++) {
      const stage = generateRandomStage(seed * 1337);
      const res = await solveOptimalSchedule(stage);
      expect(res.status).toBe("Optimal");
      expect(res.verified).toBe(true);

      const evalResult = evaluateSchedule(stage, res.optimalSchedule);
      expect(evalResult.isValid).toBe(true);
      expect(evalResult.totalScore).toBe(res.optimalScore);
    }
  });

  it("diagnoses conflicting and dead-end shift assignments using HiGHS", async () => {
    const stage = CAMPAIGN_STAGES[0]; // Stage 1 (includes Drago who cannot work 2 consecutive days)
    const badSchedule = createEmptySchedule(stage.availableMonsters, stage.numDays);
    badSchedule.drago[0] = "day";
    badSchedule.drago[1] = "day"; // Violates Drago's maxConsecutiveDays = 1

    const evalRes = evaluateSchedule(stage, badSchedule);
    expect(evalRes.isValid).toBe(false);
    expect(evalRes.violations.some((v) => v.category === "consecutive" && v.monsterId === "drago")).toBe(true);

    const diag = await diagnoseScheduleWithHighs(stage, badSchedule);
    expect(diag.status).toBe("Infeasible");
    expect(diag.conflicts.some((c) => c.includes("drago"))).toBe(true);
    expect(diag.messages.length).toBeGreaterThan(0);
  });

  it("completes STAGE 1 valid schedule by following interactive tutorialSteps in order and uses Star-Moon Calendar (1073 years ago)", () => {
    const refDate = new Date(2026, 9, 20); // October 2026 -> 2026 - 1073 = 953年10月
    expect(getCastleCalendarYearMonth(1, refDate)).toEqual({
      eraName: CALENDAR_ERA_NAME,
      year: 953,
      month: 10,
    });
    expect(formatCastleCalendarMonth(3, true, refDate)).toBe(`${CALENDAR_ERA_NAME} 953年12月`);
    expect(formatCastleCalendarMonth(4, true, refDate)).toBe(`${CALENDAR_ERA_NAME} 954年1月`);
    expect(formatCastleCalendarMonth(4, false, refDate)).toBe("1月");

    const stage1 = CAMPAIGN_STAGES[0];
    expect(stage1.numDays).toBe(3);
    expect(stage1.subtitle).toContain(CALENDAR_ERA_NAME);
    expect(stage1.title).not.toContain("STAGE");
    expect(stage1.lilithIntro).toContain("一緒に");
    expect(stage1.tutorialSteps).toBeDefined();
    expect(stage1.tutorialSteps!.length).toBeGreaterThan(0);

    const schedule = createEmptySchedule(stage1.availableMonsters, stage1.numDays);
    for (const step of stage1.tutorialSteps!) {
      expect(step.shortCallout).toBeTruthy();
      schedule[step.monsterId][step.day] = step.targetShift;
    }

    const evalRes = evaluateSchedule(stage1, schedule);
    expect(evalRes.isValid).toBe(true);
    expect(evalRes.violations).toEqual([]);
  });

  it("adjusts adaptive endless difficulty tier based on player history and solves all tiers to Optimal", async () => {
    const strugglingHistory: StagePlayRecord[] = [
      { weekNumber: 3, rank: "B", scoreRatio: 0.78, hintsUsed: 4, failedAttempts: 3 },
      { weekNumber: 4, rank: "B", scoreRatio: 0.8, hintsUsed: 3, failedAttempts: 2 },
      { weekNumber: 5, rank: "B", scoreRatio: 0.79, hintsUsed: 3, failedAttempts: 2 },
    ];
    const gentleTier = computeAdaptiveDifficultyTier(strugglingHistory, 6);
    expect(gentleTier).toBeLessThanOrEqual(2);

    const masterHistory: StagePlayRecord[] = [
      { weekNumber: 5, rank: "S", scoreRatio: 1.0, hintsUsed: 0, failedAttempts: 0 },
      { weekNumber: 6, rank: "S", scoreRatio: 1.0, hintsUsed: 0, failedAttempts: 0 },
      { weekNumber: 7, rank: "S", scoreRatio: 0.98, hintsUsed: 0, failedAttempts: 0 },
    ];
    const highTier = computeAdaptiveDifficultyTier(masterHistory, 12);
    expect(highTier).toBeGreaterThanOrEqual(4);

    const historiesByTarget: StagePlayRecord[][] = [
      strugglingHistory,
      [{ weekNumber: 5, rank: "B", scoreRatio: 0.81, hintsUsed: 2, failedAttempts: 1 }],
      [],
      masterHistory,
      masterHistory,
    ];

    for (let i = 0; i < historiesByTarget.length; i++) {
      const weekNum = 6 + i * 2;
      const stage = generateAdaptiveStage(weekNum, historiesByTarget[i], (i + 1) * 997);
      expect(stage.weekNumber).toBe(weekNum);
      expect(stage.difficultyTier).toBeDefined();
      expect(stage.difficultyLabel).toBeTruthy();

      const res = await solveOptimalSchedule(stage);
      expect(res.status).toBe("Optimal");
      expect(res.verified).toBe(true);

      const evalRes = evaluateSchedule(stage, res.optimalSchedule);
      expect(evalRes.isValid).toBe(true);
      expect(evalRes.totalScore).toBe(res.optimalScore);
    }
  });

  it("keeps all stage titles, intros, briefings, and lore free of technical solver jargon and exclamation marks", () => {
    const allStages = [...CAMPAIGN_STAGES, generateRandomStage(42)];
    const forbiddenJargon = /\b(WaSHI|HiGHS|Z3|MIP|SMT|unsatCore|Feasible)\b/i;
    const forbiddenExclamation = /[！!♪]/;

    for (const stage of allStages) {
      expect(stage.title).not.toMatch(forbiddenJargon);
      expect(stage.subtitle).not.toMatch(forbiddenJargon);
      expect(stage.lilithIntro).not.toMatch(forbiddenJargon);
      expect(stage.lilithHint).not.toMatch(forbiddenJargon);
      expect(stage.newRuleTitle ?? "").not.toMatch(forbiddenJargon);
      expect(stage.newRuleSummary ?? "").not.toMatch(forbiddenJargon);

      expect(stage.title).not.toMatch(forbiddenExclamation);
      expect(stage.subtitle).not.toMatch(forbiddenExclamation);
      expect(stage.lilithIntro).not.toMatch(forbiddenExclamation);
      expect(stage.lilithHint).not.toMatch(forbiddenExclamation);
      expect(stage.newRuleTitle ?? "").not.toMatch(forbiddenExclamation);
      expect(stage.newRuleSummary ?? "").not.toMatch(forbiddenExclamation);
      expect(stage.lilithIntro).not.toContain("迎撃");
      expect(stage.lilithHint).not.toContain("迎撃");
      for (const req of stage.requirements) {
        expect(req.enemyQuote ?? "").not.toMatch(forbiddenExclamation);
      }
    }
  });

  it("computes log-normal win probabilities without a +2σ upper cap (nothing is 100% certain)", async () => {
    const stage1 = CAMPAIGN_STAGES[0];
    const req400 = stage1.requirements[1]; // expectedPower = 320, target = 400
    expect(computeSlotWinProbability(0, req400)).toBe(0);
    expect(computeSlotWinProbability(200, req400)).toBe(0);
    expect(computeSlotWinProbability(320, req400)).toBe(50);
    expect(computeSlotWinProbability(360, req400)).toBeGreaterThan(80);
    expect(computeSlotWinProbability(400, req400)).toBeGreaterThanOrEqual(95);
    expect(computeSlotWinProbability(400, req400)).toBeLessThan(100);
    expect(computeSlotWinProbability(500, req400)).toBe(99);

    const opt = await solveOptimalSchedule(stage1);
    const evalRes = evaluateSchedule(stage1, opt.optimalSchedule);
    expect(evalRes.canDispatch).toBe(true);

    // Median roll (u2 = 0.25 => cos(2π * 0.25) = 0 => Z = 0) produces exact expectedPower and wins all slots
    const medianOutcomes = rollStageBattles(stage1, evalRes, () => 0.25);
    expect(medianOutcomes.length).toBe(stage1.requirements.length);
    for (const o of medianOutcomes) {
      expect(o.actualEnemyPower).toBe(o.expectedEnemyPower);
      expect(o.isWin).toBe(true);
    }

    // Verify Hero raids do not occur 2x every day on a well-defended schedule, and castleMaxHp is 1 (all raids must be won)
    expect(BALANCE_CONFIG.castleMaxHp).toBe(1);
    const activeRaids = medianOutcomes.filter((o) => o.hasRaid);
    expect(activeRaids.length).toBeGreaterThanOrEqual(2);
    expect(activeRaids.length).toBeLessThan(medianOutcomes.length);

    // Extreme upper-tail roll (u1 = 1e-4, u2 = 1.0 => Z ≈ +4.29) can exceed the old +2σ target (400)
    let callIdx = 0;
    const surgeRng = () => (callIdx++ % 2 === 0 ? 1e-4 : 1.0);
    const surgeOutcomes = rollStageBattles(stage1, evalRes, surgeRng);
    expect(surgeOutcomes[1].actualEnemyPower).toBeGreaterThan(400);
  });

  it("defines 20 unique defensive castle monsters with usualPost and both positive (+100) and negative (-150) pair relations", () => {
    expect(ALL_MONSTER_IDS.length).toBe(20);
    for (const mId of ALL_MONSTER_IDS) {
      const m = MONSTERS[mId];
      expect(m).toBeDefined();
      expect(m.usualPost.length).toBeGreaterThan(0);
      expect(m.portrait).toMatch(/^\.\/char-[a-z]+\.jpg$/);
    }

    const posRels = ALL_PAIR_RELATIONS.filter((r) => r.moraleDelta > 0);
    const negRels = ALL_PAIR_RELATIONS.filter((r) => r.moraleDelta < 0);
    expect(posRels.length).toBeGreaterThanOrEqual(15);
    expect(negRels.length).toBeGreaterThanOrEqual(8);

    // STAGE 5 expands to 6 members and includes incompatible (-150) pairs
    const stage5 = CAMPAIGN_STAGES[4];
    expect(stage5.availableMonsters.length).toBe(6);
    expect(stage5.activeRelations.some((r) => r.moraleDelta < 0)).toBe(true);

    // Verify placing an incompatible pair (Carmilla + Dullahan) in the same slot deducts 150 defense power
    const testSched = createEmptySchedule(stage5.availableMonsters, stage5.numDays);
    testSched.carmilla[0] = "night";
    testSched.dullahan[0] = "night";
    const evalConflict = evaluateSchedule(stage5, testSched);
    const night0 = evalConflict.slotStatuses.find((s) => s.day === 0 && s.shift === "night")!;
    // Carmilla night (400) + Dullahan night (400) - 150 conflict = 650
    expect(night0.currentPower).toBe(650);

    const outcomes = rollStageBattles(stage5, evalConflict, () => 0.5);
    const outcomeNight0 = outcomes.find((o) => o.day === 0 && o.shift === "night")!;
    expect(outcomeNight0.hasConflict).toBe(true);
    expect(outcomeNight0.conflictTitle).toContain("同番拒否");
    expect(outcomeNight0.isFullMoon).toBe(false);

    // Full-moon slot in STAGE 5 (day 2 Wednesday night) carries isFullMoon = true into SlotBattleOutcome
    const outcomeFullMoon = outcomes.find((o) => o.day === 2 && o.shift === "night")!;
    expect(outcomeFullMoon.isFullMoon).toBe(true);

    // CSS background url() paths must use public-root /games/demon-castle-shift/ so Vite rewrites them for assets/ bundles
    const cssText = readFileSync(
      resolve(import.meta.dirname, "../examples/web-demo/games/demon-castle-shift/style.css"),
      "utf8"
    );
    expect(cssText).not.toMatch(/url\(["']?\.\/[^)"']+\.jpg["']?\)/);
    expect(cssText).toContain('url("/games/demon-castle-shift/bg-castle-hall.jpg")');
  });

  it("regenerates freshly randomized, solvable campaign stage variants on retry after defense failure", async () => {
    for (let idx = 0; idx < CAMPAIGN_STAGES.length; idx++) {
      const base = CAMPAIGN_STAGES[idx];
      const retry1 = generateRetryCampaignStage(idx, 1);
      const retry2 = generateRetryCampaignStage(idx, 2);

      expect(retry1.id).toBe(base.id);
      expect(retry1.weekNumber).toBe(base.weekNumber);
      expect(retry1.numDays).toBe(base.numDays);
      expect(retry1.availableMonsters.length).toBe(base.availableMonsters.length);

      const res1 = await solveOptimalSchedule(retry1);
      expect(res1.status).toBe("Optimal");
      expect(res1.verified).toBe(true);

      const res2 = await solveOptimalSchedule(retry2);
      expect(res2.status).toBe("Optimal");
      expect(res2.verified).toBe(true);

      // Verify retry1 and retry2 are not identical (different roster or different requirement powers)
      const sig1 = `${retry1.availableMonsters.join(",")}:${retry1.requirements.map((r) => r.requiredPower).join(",")}`;
      const sig2 = `${retry2.availableMonsters.join(",")}:${retry2.requirements.map((r) => r.requiredPower).join(",")}`;
      expect(sig1).not.toBe(sig2);
    }

    // Verify generateVerifiedStageWithHighs automatically skips an infeasible candidate and finds an Optimal one
    let attemptsCalled = 0;
    const { stage: verifiedStage, optimalResult } = await generateVerifiedStageWithHighs((attempt) => {
      attemptsCalled++;
      const cand = generateRetryCampaignStage(0, attempt + 1);
      if (attempt === 0) {
        // Deliberately make attempt 0 infeasible (impossible requiredPower = 9999)
        return {
          ...cand,
          requirements: cand.requirements.map((r, i) => (i === 0 ? { ...r, requiredPower: 9999 } : r)),
        };
      }
      return cand;
    });
    expect(attemptsCalled).toBe(2);
    expect(optimalResult.status).toBe("Optimal");
    expect(optimalResult.verified).toBe(true);
    expect(evaluateSchedule(verifiedStage, optimalResult.optimalSchedule).isValid).toBe(true);
  });

  it("preserves failed-attempt history across stage reloads so adaptive difficulty applies retry penalties", async () => {
    resetSaveDataForTest();
    await loadCampaignStage(0, false);
    expect(getActiveStageStateForTest().failedAttemptsThisStage).toBe(0);

    // Breach 1 -> return to title and reload stage 1
    recordStageBreachFailure();
    expect(getActiveStageStateForTest().saveData.stageRetryCounts["week-1"]).toBe(1);
    await loadCampaignStage(0, false);
    expect(getActiveStageStateForTest().failedAttemptsThisStage).toBe(1);

    // Breach 2 -> return to title and reload stage 1
    recordStageBreachFailure();
    expect(getActiveStageStateForTest().saveData.stageRetryCounts["week-1"]).toBe(2);
    await loadCampaignStage(0, false);
    expect(getActiveStageStateForTest().failedAttemptsThisStage).toBe(2);

    // Clear stage 1 on the third attempt -> StagePlayRecord must retain failedAttempts: 2
    recordStageVictory(1, 1);
    const { saveData } = getActiveStageStateForTest();
    expect(saveData.playHistory.length).toBe(1);
    expect(saveData.playHistory[0].weekNumber).toBe(1);
    expect(saveData.playHistory[0].failedAttempts).toBe(2);
    expect(saveData.stageFailedAttempts["week-1"]).toBe(0);

    // Subsequent replay of cleared stage 1 starts with 0 pending failures while keeping retry seed count
    await loadCampaignStage(0, false);
    expect(getActiveStageStateForTest().failedAttemptsThisStage).toBe(0);
    expect(getActiveStageStateForTest().saveData.stageRetryCounts["week-1"]).toBe(2);
    expect(isEndlessModeUnlocked()).toBe(false);

    // Clearing stage 5 (index 4) unlocks week 6 endless mode
    await loadCampaignStage(4, false);
    recordStageVictory(1, 1);
    expect(getActiveStageStateForTest().saveData.highestUnlockedWeek).toBe(6);
    expect(isEndlessModeUnlocked()).toBe(true);
  });

  it("discards stale asynchronous stage loads when another stage is selected before verification finishes", async () => {
    resetSaveDataForTest();
    await loadCampaignStage(0, false);
    // Mark week-1 as having a retry so loadCampaignStage(0) awaits generateVerifiedStageWithHighs
    recordStageBreachFailure();

    // Start an async retry load for week-1 (or endless week-6) and immediately select week-2 before it completes
    const staleEndlessLoad = loadEndlessStage(6, false);
    const newerCampaignLoad = loadCampaignStage(1, false);
    await Promise.all([staleEndlessLoad, newerCampaignLoad]);

    const state = getActiveStageStateForTest();
    expect(state.currentStageIndex).toBe(1);
    expect(state.currentStage.id).toBe("week-2");
  });

  it("verifies mobile layout resilience: 100dvh, safe-area-insets, sticky table column, and accessible touch targets (Issue #123)", () => {
    const cssPath = resolve(__dirname, "../examples/web-demo/games/demon-castle-shift/style.css");
    const css = readFileSync(cssPath, "utf-8");

    // 1. Dynamic viewport units (100dvh) for mobile browser address bars
    expect(css).toContain("min-height: 100dvh;");
    expect(css).toContain("height: 100dvh;");

    // 2. Safe area inset handling for bottom toolbars and gestures
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toMatch(/\.rpg-dialogue-dock\s*\{[^}]*bottom:\s*max\([^;]*env\(safe-area-inset-bottom\)/s);

    // 3. Shift matrix horizontal scroll & sticky first column
    expect(css).toContain("border-collapse: separate;");
    expect(css).toMatch(/\.shift-matrix thead th\.col-monster\s*\{[^}]*position:\s*sticky;[^}]*left:\s*0;/s);
    expect(css).toMatch(/\.raid-row th\s*\{[^}]*position:\s*sticky;[^}]*left:\s*0;/s);
    expect(css).toMatch(/\.monster-row-th\s*\{[^}]*position:\s*sticky;[^}]*left:\s*0;/s);

    // 4. Mobile media query (@media (max-width: 768px)) with touch target size >= 44x44px and bottom clearance
    const mobile768BlockMatch = css.match(/@media\s*\(max-width:\s*768px\)\s*\{([\s\S]*?)\n\}\n\n@media/);
    expect(mobile768BlockMatch).toBeTruthy();
    const mobile768Block = mobile768BlockMatch![1];
    expect(mobile768Block).toMatch(/\.shift-btn\s*\{[^}]*min-height:\s*44px;/);
    expect(mobile768Block).toMatch(/\.shift-btn\s*\{[^}]*min-width:\s*44px;/);
    expect(mobile768Block).toMatch(/\.board-container\s*\{[^}]*padding-bottom:\s*5rem;/);
    expect(mobile768Block).toMatch(/\.shift-matrix thead th\.col-monster\s*\{[^}]*width:\s*168px;/);
  });

  it("verifies mobile smartphone adaptations across title, navigation, modals, and battle scenes", () => {
    const cssPath = resolve(__dirname, "../examples/web-demo/games/demon-castle-shift/style.css");
    const css = readFileSync(cssPath, "utf-8");
    const htmlPath = resolve(__dirname, "../examples/web-demo/games/demon-castle-shift/index.html");
    const html = readFileSync(htmlPath, "utf-8");

    // 1. General dialog viewport containment & scrollability
    expect(css).toMatch(/\.game-dialog\s*\{[^}]*max-height:\s*90dvh;/);
    expect(css).toMatch(/\.game-dialog\s*\{[^}]*overflow-y:\s*auto;/);

    // 2. Audio button contains short & extra spans for responsive display
    expect(html).toContain('class="btn-audio-short"');
    expect(html).toContain('class="btn-audio-extra"');

    const mobile768BlockMatch = css.match(/@media\s*\(max-width:\s*768px\)\s*\{([\s\S]*?)\n\}\n\n@media/);
    expect(mobile768BlockMatch).toBeTruthy();
    const mobile768Block = mobile768BlockMatch![1];

    expect(mobile768Block).toMatch(/\.btn-audio\s+\.btn-audio-extra\s*\{[^}]*display:\s*none;/);

    // 3. Title screen buttons adapt to fluid full-width on mobile without fixed 320px blowout
    expect(mobile768Block).toMatch(/\.btn-title-primary\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;/);
    expect(mobile768Block).toMatch(/\.btn-title-secondary\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;/);

    // 4. Horizontal scroll for stage navigation pills on narrow viewports
    expect(mobile768Block).toMatch(/\.stage-progress-nav\s*\{[^}]*overflow-x:\s*auto;/);

    // 5. Grimoire roster adapts to single-column card layout on mobile
    expect(mobile768Block).toMatch(/\.grimoire-pages-grid\s*\{[^}]*grid-template-columns:\s*1fr;/);

    // 6. Full-screen battle cutscene switches versus display to single column on mobile
    expect(mobile768Block).toMatch(/\.battle-cutin-versus\s*\{[^}]*grid-template-columns:\s*1fr;/);
    expect(mobile768Block).toMatch(/\.result-hero-actions\s*\{[^}]*flex-direction:\s*column;/);

    // 7. Extra narrow mobile viewports (<= 420px) scale monster column width and touch targets
    const mobile420BlockMatch = css.match(/@media\s*\(max-width:\s*420px\)\s*\{([\s\S]*?)\n\}\n\n/);
    expect(mobile420BlockMatch).toBeTruthy();
    const mobile420Block = mobile420BlockMatch![1];
    expect(mobile420Block).toMatch(/\.shift-matrix thead th\.col-monster\s*\{[^}]*width:\s*150px;/);
    expect(mobile420Block).toMatch(/\.shift-btn\s*\{[^}]*min-width:\s*42px;/);
  });

  it("detects saved player progress to skip title and movie when resuming by default", () => {
    const emptySave: SaveData = {
      unlockedStageIndex: 0,
      highestUnlockedWeek: 1,
      clearedRanks: {},
      playHistory: [],
      stageRetryCounts: {},
      stageFailedAttempts: {},
      unlockAllDemo: false,
      openingMovieSeen: false,
    };
    expect(hasSavedProgress(emptySave)).toBe(false);

    const clearedWeek1Save: SaveData = {
      ...emptySave,
      unlockedStageIndex: 1,
      highestUnlockedWeek: 2,
      clearedRanks: { "week-1": "S" },
      playHistory: [
        {
          weekNumber: 1,
          rank: "S",
          scoreRatio: 1.0,
          hintsUsed: 0,
          failedAttempts: 0,
        },
      ],
      openingMovieSeen: true,
    };
    expect(hasSavedProgress(clearedWeek1Save)).toBe(true);

    const movieOnlySave: SaveData = {
      ...emptySave,
      openingMovieSeen: true,
    };
    expect(hasSavedProgress(movieOnlySave)).toBe(true);

    const endlessSave: SaveData = {
      ...emptySave,
      highestUnlockedWeek: 6,
    };
    expect(hasSavedProgress(endlessSave)).toBe(true);
  });
});
