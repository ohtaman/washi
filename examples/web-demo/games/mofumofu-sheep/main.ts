/// <reference types="vite/client" />
import { setHighsWasmUrl } from "../../../../src/index.js";
import { pastureAudio } from "./audio.js";
import { FENCE_SVG } from "./fence-icon.js";
import { getGameLang, pickLang, setGameLang, type GameLang } from "../i18n.js";
import enCatalog from "./locales/en.json";
import jaCatalog from "./locales/ja.json";
import zhCatalog from "./locales/zh.json";

const CATALOGS: Record<GameLang, typeof enCatalog> = {
  en: enCatalog,
  ja: jaCatalog,
  zh: zhCatalog,
};

export function t(
  key: string,
  params?: Record<string, string | number>,
  lang: GameLang = currentLang
): string {
  const catalog = CATALOGS[lang] ?? CATALOGS.en;
  const parts = key.split(".");
  let val: any = catalog;
  for (const part of parts) {
    val = val?.[part];
    if (val === undefined) break;
  }
  if (val === undefined) {
    let fallback: any = CATALOGS.en;
    for (const part of parts) {
      fallback = fallback?.[part];
      if (fallback === undefined) break;
    }
    val = fallback ?? key;
  }
  if (typeof val !== "string") return String(val ?? key);
  if (!params) return val;
  return val.replace(/\{(\w+)\}/g, (_, k) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`
  );
}

import {
  cloneFences,
  computeCellSize,
  computeFenceDiffSummary,
  createEmptyFences,
  diagnoseAndSuggestFenceHint,
  evaluatePasture,
  resolveTargetScore,
  selectVerifiedOptimal,
  solveOptimalPasture,
} from "./solver.js";
import {
  CAMPAIGN_STAGES,
  getLocalizedStageText,
  getStageByNumber,
  getStageTitleByNumber,
} from "./stages.js";
import {
  TILE_META,
  type FenceGrid,
  type HintDiagnosis,
  type OptimalPastureResult,
  type PastureEvaluation,
  type StagePuzzle,
} from "./types.js";

// Ensure HiGHS WASM resolves cleanly in local dev, preview, and GitHub Pages (/washi/games/mofumofu-sheep/)
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

const STORAGE_KEY = "washi_mofumofu_sheep_cleared_v3";
const TUTORIAL_STAGE_COUNT = 4;
const CANONICAL_STAGE_ID_RE = /^stage-([1-9]\d*)$/;

export interface ProgressState {
  clearedByStageId: Record<string, boolean>;
  highestUnlockedStage: number;
  stageScores?: Record<string, number>;
  totalScore?: number;
}

export function countCanonicalClearedStages(
  clearedByStageId: Record<string, boolean>
): number {
  let count = 0;
  for (const [id, cleared] of Object.entries(clearedByStageId)) {
    if (cleared === true && CANONICAL_STAGE_ID_RE.test(id)) {
      count++;
    }
  }
  return count;
}

export function getResumeStageNumber(progressState: ProgressState): number {
  const clearedCount = countCanonicalClearedStages(progressState.clearedByStageId);
  if (clearedCount === 0) {
    return 1;
  }
  const maxUnlocked = Math.max(
    TUTORIAL_STAGE_COUNT,
    typeof progressState.highestUnlockedStage === "number" &&
      Number.isFinite(progressState.highestUnlockedStage)
      ? Math.floor(progressState.highestUnlockedStage)
      : TUTORIAL_STAGE_COUNT
  );
  // Resume from the first uncleared stage up to the highest unlocked stage
  for (let s = 1; s <= maxUnlocked; s++) {
    if (!progressState.clearedByStageId[`stage-${s}`]) {
      return s;
    }
  }
  // If all unlocked stages are cleared, stay at the latest unlocked stage
  return maxUnlocked;
}

export function parseProgressState(raw: string | null): ProgressState {
  const defaultMax = TUTORIAL_STAGE_COUNT;
  if (!raw) {
    return {
      clearedByStageId: {},
      highestUnlockedStage: defaultMax,
      stageScores: {},
      totalScore: 0,
    };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ProgressState>;
    const rawCleared = parsed.clearedByStageId ?? {};
    const clearedByStageId: Record<string, boolean> = {};
    let maxFromCleared = defaultMax;
    for (const [id, cleared] of Object.entries(rawCleared)) {
      if (cleared !== true) continue;
      const m = id.match(CANONICAL_STAGE_ID_RE);
      if (m) {
        clearedByStageId[id] = true;
        maxFromCleared = Math.max(maxFromCleared, Number(m[1]) + 1);
      }
    }
    const savedUnlocked =
      typeof parsed.highestUnlockedStage === "number" &&
      Number.isFinite(parsed.highestUnlockedStage)
        ? Math.floor(parsed.highestUnlockedStage)
        : defaultMax;

    const rawScores = parsed.stageScores && typeof parsed.stageScores === "object"
      ? parsed.stageScores
      : {};
    const stageScores: Record<string, number> = {};
    let computedTotal = 0;
    for (const [id, sc] of Object.entries(rawScores)) {
      if (typeof sc === "number" && Number.isFinite(sc) && CANONICAL_STAGE_ID_RE.test(id)) {
        const rounded = Math.round(sc);
        stageScores[id] = rounded;
        computedTotal += rounded;
      }
    }
    const totalScore =
      typeof parsed.totalScore === "number" && Number.isFinite(parsed.totalScore)
        ? Math.max(parsed.totalScore, computedTotal)
        : computedTotal;

    return {
      clearedByStageId,
      highestUnlockedStage: Math.max(defaultMax, savedUnlocked, maxFromCleared),
      stageScores,
      totalScore,
    };
  } catch {
    return {
      clearedByStageId: {},
      highestUnlockedStage: defaultMax,
      stageScores: {},
      totalScore: 0,
    };
  }
}

let storageWritable = true;

function loadProgress(): ProgressState {
  try {
    return parseProgressState(localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseProgressState(null);
  }
}

function syncProgressFromStorage(): void {
  if (!storageWritable) return;
  try {
    if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
      const next = parseProgressState(localStorage.getItem(STORAGE_KEY));
      progress.clearedByStageId = next.clearedByStageId;
      progress.highestUnlockedStage = next.highestUnlockedStage;
      progress.stageScores = next.stageScores;
      progress.totalScore = next.totalScore;
    }
  } catch {
    // Ignore storage errors
  }
}

function saveProgress(progressState: ProgressState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progressState));
  } catch {
    storageWritable = false;
  }
}

// Sound effects and BGM (Juice & Atmosphere)
function playFencePlaceSound(): void {
  pastureAudio.playFenceTap(true);
}

function playFenceRemoveSound(): void {
  pastureAudio.playFenceTap(false);
}

function playRejectSound(): void {
  pastureAudio.playAlert();
}

function playShortfallSound(): void {
  pastureAudio.playShortfall();
}

function playClearChime(): void {
  pastureAudio.playSafeChime();
}

function syncAudioButtonUi(): void {
  const playing = pastureAudio.playing;
  const btn = document.getElementById("btn-bgm-toggle");
  const textEl = document.getElementById("bgm-btn-text");
  if (!btn || !textEl) return;
  btn.setAttribute("aria-pressed", String(playing));
  textEl.textContent = playing ? t("bgmTagOn") : t("bgmTagOff");
  btn.title = playing ? t("bgmOff") : t("bgmOn");
}

// Application State
const progress = loadProgress();
let currentLang: GameLang = getGameLang();
let currentStage: StagePuzzle = CAMPAIGN_STAGES[0];
let currentFences: FenceGrid = createEmptyFences(
  currentStage.grid.length,
  currentStage.grid[0].length
);
let undoStack: FenceGrid[] = [];
let currentEval: PastureEvaluation = evaluatePasture(currentStage, currentFences);
let cachedOptimal: OptimalPastureResult | null = null;
let solverFailed = false;
let activeHint: HintDiagnosis | null = null;
let wasClearedBeforeMove = false;
let showingModelAnswer = false;
let userFencesBeforeOptimal: FenceGrid | null = null;
let solveToken = 0;
let isStageLoading = false;
let inFlightLoadPromise: Promise<void> | null = null;

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing required DOM element: #${id}`);
  }
  return el as T;
}

export function applyStaticTranslations(langOverride?: GameLang): void {
  if (langOverride) {
    currentLang = langOverride;
    setGameLang(langOverride);
  }
  if (typeof document === "undefined") return;
  document.documentElement.lang = currentLang;
  document.title = t("title", undefined, currentLang);

  const setText = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  const setHtml = (id: string, html: string) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };
  const setTitle = (id: string, title: string) => {
    const el = document.getElementById(id);
    if (el) el.title = title;
  };
  const setAttr = (id: string, attr: string, val: string) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute(attr, val);
  };

  setText("back-link", t("backToShowcaseShort", undefined, currentLang));
  setTitle("back-link", t("backToShowcase", undefined, currentLang));
  const backLink = document.getElementById("back-link") as HTMLAnchorElement | null;
  if (backLink) {
    backLink.href = t("showcaseUrl", undefined, currentLang);
  }
  const menuShowcaseLink = document.getElementById("menu-showcase-link") as HTMLAnchorElement | null;
  if (menuShowcaseLink) {
    menuShowcaseLink.href = backLink?.href ?? t("showcaseUrl", undefined, currentLang);
  }
  setTitle("menu-showcase-link", t("backToShowcase", undefined, currentLang));
  setText("menu-back-label", t("showcaseShort", undefined, currentLang) || "Showcase");
  setTitle("btn-topbar-menu", t("menu", undefined, currentLang));
  setAttr("btn-topbar-menu", "aria-label", t("openMenu", undefined, currentLang));

  setText("app-title", t("appTitle", undefined, currentLang));
  setText("app-subtitle", t("appSubtitle", undefined, currentLang));
  setText("btn-open-rules-label", t("howToPlay", undefined, currentLang));
  setTitle("btn-open-rules", t("howToPlayTooltip", undefined, currentLang));
  setTitle("total-stars-badge", t("clearedStages", undefined, currentLang));

  setAttr("stage-strip", "aria-label", t("stageSelect", undefined, currentLang));
  const prevLabel = t("prevStage", undefined, currentLang);
  setTitle("btn-stage-prev", prevLabel);
  setAttr("btn-stage-prev", "aria-label", prevLabel);

  const nextLabel = t("nextStage", undefined, currentLang);
  setTitle("btn-stage-next", nextLabel);
  setAttr("btn-stage-next", "aria-label", nextLabel);

  setAttr("stage-select", "aria-label", t("selectStageNumber", undefined, currentLang));
  setTitle("stage-select", t("jumpToReached", undefined, currentLang));

  setText("hud-fence-label", t("remainingFences", undefined, currentLang));
  setText("hud-score-label", t("currentAndTargetScore", undefined, currentLang));

  setText("btn-show-optimal", t("btnSolve", undefined, currentLang));
  setTitle("btn-show-optimal", t("btnSolveTitle", undefined, currentLang));
  setText("btn-revert-solution", t("btnRevertSolution", undefined, currentLang));
  setTitle("btn-revert-solution", t("btnRevertSolutionTitle", undefined, currentLang));
  setText("btn-next-stage", t("btnNextStage", undefined, currentLang));
  setAttr("board-grid", "aria-label", t("boardAria", undefined, currentLang));
  setAttr("legend-strip", "aria-label", t("legendStripAria", undefined, currentLang));
  document.querySelectorAll<HTMLImageElement>(".brand-avatar").forEach((el) => {
    el.setAttribute("alt", t("mascotAlt", undefined, currentLang));
  });

  setText("btn-undo-label", t("btnUndo", undefined, currentLang));
  setTitle("btn-undo", t("btnUndoTitle", undefined, currentLang));

  setText("btn-restart-label", t("btnRestart", undefined, currentLang));
  setTitle("btn-restart", t("btnRestartTitle", undefined, currentLang));

  setText("btn-hint-label", t("btnHint", undefined, currentLang));
  setTitle("btn-hint", t("btnHintTitle", undefined, currentLang));

  setTitle("legend-sheep", t("legendSheep", undefined, currentLang));
  setTitle("legend-grass", t("legendGrass", undefined, currentLang));
  setTitle("legend-strawberry", t("legendStrawberry", undefined, currentLang));
  setTitle("legend-pit", t("legendPit", undefined, currentLang));
  setHtml("legend-bridge", t("legendBridgeLabel", undefined, currentLang));
  setTitle("legend-bridge", t("legendBridge", undefined, currentLang));
  setText("legend-wall", t("legendWallLabel", undefined, currentLang));
  setTitle("legend-wall", t("legendWall", undefined, currentLang));

  // Rules Modal Translations
  setText("rules-dialog-title", t("rulesTitle", undefined, currentLang));
  setAttr("btn-close-rules", "aria-label", t("rulesClose", undefined, currentLang));
  setText("rule-step1-title", t("step1Title", undefined, currentLang));
  setText("rule-step1-desc", t("step1Desc", undefined, currentLang));
  setText("rule-step2-title", t("step2Title", undefined, currentLang));
  setText("rule-step2-desc", t("step2Desc", undefined, currentLang));
  setText("rule-step3-title", t("step3Title", undefined, currentLang));
  setText("rule-step3-desc", t("step3Desc", undefined, currentLang));
  setText("rules-tutorials-heading", t("tutorialHeader", undefined, currentLang));
  setText("btn-rules-start", t("btnGotIt", undefined, currentLang));

  renderTutorialButtonsInDialog();

  document.querySelectorAll<HTMLButtonElement>("[data-lang-btn]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.langBtn === currentLang);
  });

  syncAudioButtonUi();
}

function renderTutorialButtonsInDialog(): void {
  const gridEl = document.getElementById("rules-tutorial-grid");
  if (!gridEl) return;
  gridEl.innerHTML = "";
  for (let num = 1; num <= TUTORIAL_STAGE_COUNT; num++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tutorial-jump-btn";
    btn.disabled = isStageLoading;
    const title = getStageTitleByNumber(num, currentLang);
    btn.textContent = `Stage ${num}: ${title}`;
    btn.addEventListener("click", () => {
      if (isStageLoading) return;
      const dialog = getEl<HTMLDialogElement>("rules-dialog");
      if (dialog.open) dialog.close();
      void loadStageByNumber(num);
    });
    gridEl.appendChild(btn);
  }
}

function getTargetScore(): number {
  return resolveTargetScore(currentStage, cachedOptimal);
}

function isStageCleared(): boolean {
  return currentEval.isSafe && currentEval.pastureScore >= getTargetScore();
}

function getAvailableBoardWidth(): number | undefined {
  const stageEl = getEl<HTMLElement>("board-grid").parentElement;
  const viewportBound =
    typeof window !== "undefined" && window.innerWidth > 0
      ? Math.max(200, window.innerWidth - (window.innerWidth <= 480 ? 36 : 76))
      : undefined;
  if (stageEl && stageEl.clientWidth > 0) {
    const style = window.getComputedStyle(stageEl);
    const padLeft = Number.parseFloat(style.paddingLeft) || 0;
    const padRight = Number.parseFloat(style.paddingRight) || 0;
    const stageInner = Math.max(200, stageEl.clientWidth - padLeft - padRight - 4);
    return viewportBound !== undefined ? Math.min(stageInner, viewportBound) : stageInner;
  }
  return viewportBound;
}

function getAvailableBoardHeight(): number | undefined {
  if (typeof window === "undefined" || window.innerHeight <= 0) return undefined;
  const isLandscape = window.innerWidth > window.innerHeight;
  const isMobile = window.innerWidth <= 860 || window.innerHeight <= 600;
  if (isLandscape && isMobile) {
    return Math.max(160, window.innerHeight - 150);
  }
  if (isMobile) {
    const factor = window.innerHeight <= 700 ? 0.41 : 0.46;
    return Math.max(190, Math.floor(window.innerHeight * factor));
  }
  return undefined;
}

function getMaxUnlockedStage(): number {
  return Math.max(TUTORIAL_STAGE_COUNT, progress.highestUnlockedStage);
}

export function renderStageNav(): void {
  const totalStarsTextEl = getEl<HTMLElement>("total-stars-text");
  const clearedCount = countCanonicalClearedStages(progress.clearedByStageId);
  totalStarsTextEl.textContent = `${clearedCount} CLEAR`;

  const totalScore = progress.totalScore ?? 0;
  const totalScoreTextEl = document.getElementById("total-score-text");
  if (totalScoreTextEl) {
    if (totalScore > 0) {
      totalScoreTextEl.textContent = `· ${totalScore} pt`;
      totalScoreTextEl.hidden = false;
    } else {
      totalScoreTextEl.textContent = "";
      totalScoreTextEl.hidden = true;
    }
  }

  const totalStarsBadgeEl = document.getElementById("total-stars-badge");
  if (totalStarsBadgeEl) {
    if (totalScore > 0) {
      totalStarsBadgeEl.title = t("clearedSummary", { cleared: clearedCount, total: totalScore });
    } else {
      totalStarsBadgeEl.title = t("clearedStages");
    }
  }

  const maxUnlockedStage = getMaxUnlockedStage();
  const maxStageNum = Math.max(maxUnlockedStage, currentStage.stageNumber);

  const prevBtn = getEl<HTMLButtonElement>("btn-stage-prev");
  prevBtn.disabled = isStageLoading || currentStage.stageNumber <= 1;

  const nextBtn = getEl<HTMLButtonElement>("btn-stage-next");
  nextBtn.disabled = isStageLoading || currentStage.stageNumber >= maxUnlockedStage;

  const selectEl = getEl<HTMLSelectElement>("stage-select");
  selectEl.disabled = isStageLoading;
  selectEl.innerHTML = "";
  const openRulesBtn = document.getElementById("btn-open-rules") as HTMLButtonElement | null;
  if (openRulesBtn) {
    openRulesBtn.disabled = isStageLoading;
  }
  renderTutorialButtonsInDialog();
  for (let num = 1; num <= maxStageNum; num++) {
    const stageId = `stage-${num}`;
    const isCleared = Boolean(progress.clearedByStageId[stageId]);
    const title = getStageTitleByNumber(num, currentLang);
    const opt = document.createElement("option");
    opt.value = String(num);
    const starMark = isCleared ? " ★" : "";
    const tutPrefix =
      num <= TUTORIAL_STAGE_COUNT
        ? t("tutorialSuffix", { current: num, total: TUTORIAL_STAGE_COUNT })
        : "";
    opt.textContent = `STAGE ${num}: ${title}${tutPrefix}${starMark}`;
    if (num === currentStage.stageNumber) {
      opt.selected = true;
    }
    selectEl.appendChild(opt);
  }
}

function renderHud(): void {
  const stageBadgeEl = getEl<HTMLElement>("stage-badge");
  const stageTitleEl = getEl<HTMLElement>("stage-title");
  const stageOneLinerEl = getEl<HTMLElement>("stage-oneliner");
  const fenceDotsEl = getEl<HTMLElement>("fence-dots");
  const fenceCountTextEl = getEl<HTMLElement>("fence-count-text");
  const scoreTextEl = getEl<HTMLElement>("score-text");
  const hudStatusPillEl = getEl<HTMLElement>("hud-status-pill");
  const statusIconEl = getEl<HTMLElement>("status-icon");
  const statusTextEl = getEl<HTMLElement>("status-text");
  const clearBannerEl = getEl<HTMLElement>("clear-banner");
  const clearStarsEl = getEl<HTMLElement>("clear-stars");
  const clearHeadlineEl = getEl<HTMLElement>("clear-headline");
  const clearSubtextEl = getEl<HTMLElement>("clear-subtext");
  const btnShowOptimal = getEl<HTMLButtonElement>("btn-show-optimal");
  const btnNextStage = getEl<HTMLButtonElement>("btn-next-stage");
  const btnUndo = getEl<HTMLButtonElement>("btn-undo");
  const btnRestart = getEl<HTMLButtonElement>("btn-restart");
  const btnHint = getEl<HTMLButtonElement>("btn-hint");

  const isTutorial = currentStage.stageNumber <= TUTORIAL_STAGE_COUNT;
  stageBadgeEl.textContent = `STAGE ${currentStage.stageNumber}`;

  const tutorialChipEl = document.getElementById("tutorial-chip");
  if (tutorialChipEl) {
    tutorialChipEl.hidden = !isTutorial;
    if (isTutorial) {
      tutorialChipEl.textContent = t("tutorialTag", {
        current: currentStage.stageNumber,
        total: TUTORIAL_STAGE_COUNT,
      });
    }
  }

  const targetScore = getTargetScore();
  const cleared = isStageCleared();
  const isShortfall = !cleared && currentEval.isSafe;
  const diff = targetScore - currentEval.pastureScore;
  const optPits = cachedOptimal?.optimalEvaluation.breakdown.pitCount ?? 0;
  const hasAvoidablePit = currentEval.breakdown.pitCount > optPits;

  const guideBannerEl = document.getElementById("guide-banner");
  const guideIconEl = document.getElementById("guide-banner-icon");
  if (guideBannerEl) {
    guideBannerEl.classList.toggle("is-tutorial", isTutorial && !isShortfall);
    guideBannerEl.classList.toggle("is-shortfall", isShortfall);
  }
  if (guideIconEl) {
    guideIconEl.textContent = isShortfall
      ? (hasAvoidablePit ? "🕳️" : "🍓")
      : (isTutorial ? "🔰" : "🐑");
  }

  const localizedStage = getLocalizedStageText(currentStage, currentLang);
  stageTitleEl.textContent = localizedStage.title;
  if (isShortfall) {
    stageOneLinerEl.textContent = hasAvoidablePit
      ? t("adviceDefensePit", { diff })
      : t("adviceDefenseExpand", { diff });
  } else {
    stageOneLinerEl.textContent = localizedStage.oneLiner;
  }

  // Fence dots & remaining count
  const remaining = Math.max(0, currentStage.maxFences - currentEval.fencesUsed);
  fenceDotsEl.innerHTML = "";
  fenceDotsEl.classList.toggle("dense", currentStage.maxFences > 5);
  for (let i = 0; i < currentStage.maxFences; i++) {
    const dot = document.createElement("span");
    dot.className = "fence-dot";
    if (i >= remaining) dot.classList.add("used");
    dot.innerHTML = FENCE_SVG;
    fenceDotsEl.appendChild(dot);
  }
  fenceCountTextEl.textContent = t("remainingFencesText", {
    rem: remaining,
    max: currentStage.maxFences,
  });

  const displayCurrent = currentEval.isSafe ? `${currentEval.pastureScore}` : "—";
  scoreTextEl.textContent = t("scoreDisplay", {
    cur: displayCurrent,
    target: targetScore,
  });

  // Safety & Target status pill
  if (cleared) {
    hudStatusPillEl.className = "hud-pill status-safe";
    statusIconEl.textContent = "🎉";
    statusTextEl.textContent = t("statusTargetAchieved");
  } else if (currentEval.isSafe) {
    hudStatusPillEl.className = "hud-pill status-shortfall";
    statusIconEl.textContent = hasAvoidablePit ? "🕳️" : "🍓";
    statusTextEl.textContent = hasAvoidablePit
      ? t("statusPitDeduction", { diff })
      : t("statusNeedPoints", { diff });
  } else {
    hudStatusPillEl.className = "hud-pill status-danger";
    statusIconEl.textContent = "🐺";
    statusTextEl.textContent = t("statusWolfBreach");
  }

  const btnRevertSolution = document.getElementById("btn-revert-solution") as HTMLButtonElement | null;

  // Controls state
  btnUndo.disabled = undoStack.length === 0;
  btnRestart.disabled = currentEval.fencesUsed === 0 && undoStack.length === 0;
  btnHint.disabled = solverFailed;
  if (isShortfall && cachedOptimal?.verified) {
    btnShowOptimal.hidden = false;
    btnHint.hidden = remaining === 0;
  } else {
    btnShowOptimal.hidden = true;
    btnHint.hidden = false;
  }

  // Inline Clear / Shortfall Banner
  if (cleared) {
    clearBannerEl.hidden = false;
    if (showingModelAnswer) {
      clearBannerEl.className = "clear-banner banner-model-solution";
      clearStarsEl.textContent = "✨";
      clearHeadlineEl.textContent = t("solveBannerOptimal", undefined, currentLang);
      if (userFencesBeforeOptimal) {
        const diff = computeFenceDiffSummary(userFencesBeforeOptimal, currentFences);
        if (diff.userFenceCount > 0) {
          clearSubtextEl.textContent = t(
            "diffSummary",
            {
              added: diff.added,
              unnecessary: diff.unnecessary,
              matching: diff.matching,
            },
            currentLang
          );
        } else {
          clearSubtextEl.textContent = t(
            "diffSummaryNoFences",
            { count: diff.optimalFenceCount },
            currentLang
          );
        }
      } else {
        clearSubtextEl.textContent = t("clearBannerScore", {
          score: currentEval.pastureScore,
          target: targetScore,
        }, currentLang);
      }
      if (btnRevertSolution) {
        btnRevertSolution.hidden = !userFencesBeforeOptimal;
      }
    } else {
      clearBannerEl.className = "clear-banner";
      clearStarsEl.textContent = "★";
      clearHeadlineEl.textContent = t("clearBannerGolden", undefined, currentLang);
      clearSubtextEl.textContent = t("clearBannerScore", {
        score: currentEval.pastureScore,
        target: targetScore,
      }, currentLang);
      if (btnRevertSolution) {
        btnRevertSolution.hidden = true;
      }
    }
    btnShowOptimal.hidden = true;
    const canAdvanceNext =
      !showingModelAnswer || currentStage.stageNumber < getMaxUnlockedStage();
    btnNextStage.hidden = !canAdvanceNext;
    btnNextStage.disabled = isStageLoading;
    btnNextStage.textContent = t("btnAdvanceToStage", {
      n: currentStage.stageNumber + 1,
    });
  } else if (currentEval.isSafe) {
    if (btnRevertSolution) btnRevertSolution.hidden = true;
    const diff = targetScore - currentEval.pastureScore;
    clearBannerEl.hidden = false;
    clearBannerEl.className = "clear-banner banner-shortfall";
    clearStarsEl.textContent = hasAvoidablePit ? "🕳️" : "🍓";
    clearHeadlineEl.textContent = t("adviceSafeNeedPoints", { diff });
    clearSubtextEl.textContent = hasAvoidablePit
      ? t("clearSubtextPit", {
          score: currentEval.pastureScore,
          target: targetScore,
        })
      : t("clearSubtextExpand", {
          score: currentEval.pastureScore,
          target: targetScore,
        });
    btnShowOptimal.hidden = !cachedOptimal?.verified;
    btnNextStage.hidden = true;
  } else if (solverFailed) {
    if (btnRevertSolution) btnRevertSolution.hidden = true;
    clearBannerEl.hidden = false;
    clearBannerEl.className = "clear-banner banner-shortfall";
    clearStarsEl.textContent = "⚠️";
    clearHeadlineEl.textContent = t("adviceFallback");
    clearSubtextEl.textContent = t("adviceFallbackValid", {
      target: targetScore,
    });
    btnShowOptimal.hidden = true;
    btnNextStage.hidden = true;
  } else {
    if (btnRevertSolution) btnRevertSolution.hidden = true;
    clearBannerEl.hidden = true;
  }
}

function renderBoard(): void {
  const boardGridEl = getEl<HTMLElement>("board-grid");
  const rows = currentStage.grid.length;
  const cols = currentStage.grid[0]?.length ?? 0;
  const cellSize = computeCellSize(
    rows,
    cols,
    getAvailableBoardWidth(),
    7,
    getAvailableBoardHeight()
  );
  const cleared = isStageCleared();

  boardGridEl.style.setProperty("--cell-size", `${cellSize}px`);
  boardGridEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
  boardGridEl.innerHTML = "";

  const isDiffActive = showingModelAnswer && userFencesBeforeOptimal !== null;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = currentStage.grid[r][c];
      const meta = TILE_META[tile];
      const hasFence = Boolean(currentFences[r]?.[c]);
      const userHadFence = Boolean(isDiffActive && userFencesBeforeOptimal?.[r]?.[c]);

      const cellBtn = document.createElement("button");
      cellBtn.type = "button";
      cellBtn.className = `board-cell tile-${tile}`;
      cellBtn.dataset.row = String(r);
      cellBtn.dataset.col = String(c);

      if (!meta.canPlaceFence) {
        cellBtn.classList.add("cell-locked");
      }

      if (hasFence) {
        cellBtn.classList.add("has-fence");
        if (isDiffActive) {
          if (!userHadFence) {
            cellBtn.classList.add("diff-added");
            cellBtn.title = t("diffBadgeAdded", undefined, currentLang);
            const badge = document.createElement("span");
            badge.className = "cell-diff-badge badge-added";
            badge.textContent = "＋";
            cellBtn.appendChild(badge);
          } else {
            cellBtn.classList.add("diff-matching");
            cellBtn.title = t("diffBadgeMatching", undefined, currentLang);
            const badge = document.createElement("span");
            badge.className = "cell-diff-badge badge-matching";
            badge.textContent = "✓";
            cellBtn.appendChild(badge);
          }
        }
      } else if (isDiffActive && userHadFence) {
        cellBtn.classList.add("diff-unnecessary");
        cellBtn.title = t("diffBadgeUnnecessary", undefined, currentLang);
        const badge = document.createElement("span");
        badge.className = "cell-diff-badge badge-unnecessary";
        badge.textContent = "✕";
        cellBtn.appendChild(badge);

        const ghostFence = document.createElement("span");
        ghostFence.className = "cell-ghost-fence";
        ghostFence.innerHTML = `<span class="ghost-fence-icon">${FENCE_SVG}</span><span class="ghost-cross">✕</span>`;
        cellBtn.appendChild(ghostFence);
      } else if (cleared && currentEval.sheepReachable[r]?.[c]) {
        cellBtn.classList.add("in-safe-pasture");
      } else if (currentEval.isSafe && currentEval.sheepReachable[r]?.[c]) {
        cellBtn.classList.add("in-suboptimal-pasture");
      } else if (!currentEval.isSafe && currentEval.wolfReachable[r]?.[c]) {
        cellBtn.classList.add("wolf-territory");
      }

      // Stage 1 invitation pulse + floating callout when 0 fences are placed
      const isStage1Invite =
        currentStage.id === "stage-1" &&
        currentEval.fencesUsed === 0 &&
        r === 1 &&
        c === 1;
      if (isStage1Invite) {
        cellBtn.classList.add("invite-pulse");
        const inviteTag = document.createElement("span");
        inviteTag.className = "cell-invite-tag";
        inviteTag.textContent = t("tapInstruction");
        cellBtn.appendChild(inviteTag);
      }

      // 1-cell spotlight hint (only when player explicitly presses Hint)
      if (
        activeHint?.targetCell &&
        activeHint.targetCell.row === r &&
        activeHint.targetCell.col === c
      ) {
        cellBtn.classList.add(activeHint.action === "place" ? "hint-place" : "hint-remove");
      }

      const emojiSpan = document.createElement("span");
      emojiSpan.className = "cell-emoji";
      if (hasFence) {
        emojiSpan.innerHTML = FENCE_SVG;
      } else {
        emojiSpan.textContent = meta.emoji;
      }
      cellBtn.appendChild(emojiSpan);

      // Show what tile is underneath a placed fence (if it's a strawberry or pitfall)
      if (hasFence && (tile === "strawberry" || tile === "pit")) {
        const under = document.createElement("span");
        under.className = "cell-under-badge";
        under.textContent = meta.emoji;
        cellBtn.appendChild(under);
      } else if (!hasFence && tile === "strawberry") {
        const tag = document.createElement("span");
        tag.className = "cell-score-tag score-plus";
        tag.textContent = "+5";
        cellBtn.appendChild(tag);
      } else if (!hasFence && tile === "pit") {
        const tag = document.createElement("span");
        tag.className = "cell-score-tag score-minus";
        tag.textContent = "-5";
        cellBtn.appendChild(tag);
      }

      cellBtn.addEventListener("click", () => {
        onCellClick(r, c, cellBtn);
      });

      boardGridEl.appendChild(cellBtn);
    }
  }
}

function recordProgressIfCleared(): void {
  if (!isStageCleared() || showingModelAnswer) return;
  let changed = false;
  if (!progress.clearedByStageId[currentStage.id]) {
    progress.clearedByStageId[currentStage.id] = true;
    changed = true;
  }
  if (currentStage.stageNumber + 1 > progress.highestUnlockedStage) {
    progress.highestUnlockedStage = currentStage.stageNumber + 1;
    changed = true;
  }

  // Record stage score and aggregate total score across all cleared stages
  if (!progress.stageScores) {
    progress.stageScores = {};
  }
  const stageScore = currentEval.pastureScore;
  const prevScore = progress.stageScores[currentStage.id] ?? -Infinity;
  if (stageScore > prevScore) {
    progress.stageScores[currentStage.id] = stageScore;
    let sum = 0;
    for (const sc of Object.values(progress.stageScores)) {
      sum += sc;
    }
    progress.totalScore = sum;
    changed = true;
  }

  if (changed) {
    saveProgress(progress);
  }
}

function updateEvaluationAndRender(playCelebrationIfNewlyCleared = true): void {
  currentEval = evaluatePasture(currentStage, currentFences);
  const cleared = isStageCleared();

  if (cleared) {
    recordProgressIfCleared();
    if (playCelebrationIfNewlyCleared && !wasClearedBeforeMove) {
      playClearChime();
      pastureAudio.setTrack("victory");
    }
  } else {
    pastureAudio.setTrack("meadow");
    if (playCelebrationIfNewlyCleared && currentEval.isSafe) {
      playShortfallSound();
    }
  }

  wasClearedBeforeMove = cleared;
  renderStageNav();
  renderHud();
  renderBoard();
}

function onCellClick(row: number, col: number, cellEl: HTMLElement): void {
  const tile = currentStage.grid[row][col];
  const meta = TILE_META[tile];

  if (!meta.canPlaceFence) {
    playRejectSound();
    cellEl.classList.remove("shake-reject");
    void cellEl.offsetWidth;
    cellEl.classList.add("shake-reject");
    return;
  }

  const currentlyHasFence = Boolean(currentFences[row]?.[col]);
  if (!currentlyHasFence && currentEval.fencesUsed >= currentStage.maxFences) {
    playRejectSound();
    cellEl.classList.remove("shake-reject");
    void cellEl.offsetWidth;
    cellEl.classList.add("shake-reject");
    return;
  }

  undoStack.push(cloneFences(currentFences));
  showingModelAnswer = false;
  userFencesBeforeOptimal = null;
  activeHint = null;

  currentFences = cloneFences(currentFences);
  currentFences[row][col] = !currentlyHasFence;
  if (currentFences[row][col]) {
    playFencePlaceSound();
  } else {
    playFenceRemoveSound();
  }

  updateEvaluationAndRender(true);
}

function handleUndo(): void {
  const prev = undoStack.pop();
  if (!prev) return;
  currentFences = prev;
  showingModelAnswer = false;
  userFencesBeforeOptimal = null;
  activeHint = null;
  playFenceRemoveSound();
  updateEvaluationAndRender(false);
}

function handleRestart(): void {
  if (currentEval.fencesUsed === 0 && undoStack.length === 0) return;
  undoStack.push(cloneFences(currentFences));
  currentFences = createEmptyFences(currentStage.grid.length, currentStage.grid[0].length);
  showingModelAnswer = false;
  userFencesBeforeOptimal = null;
  activeHint = null;
  playFenceRemoveSound();
  updateEvaluationAndRender(false);
}

async function handleHint(): Promise<void> {
  if (solverFailed) return;
  const btnHint = getEl<HTMLButtonElement>("btn-hint");
  const myToken = solveToken;
  const fencesSnapshot = currentFences;
  btnHint.disabled = true;
  try {
    const diagnosis = await diagnoseAndSuggestFenceHint(
      currentStage,
      currentFences,
      cachedOptimal
    );
    if (myToken !== solveToken || currentFences !== fencesSnapshot) return;
    activeHint = diagnosis;
    renderBoard();
    pastureAudio.playHint();
  } catch {
    if (myToken !== solveToken) return;
    solverFailed = true;
    renderHud();
  } finally {
    btnHint.disabled = solverFailed;
  }
}

export function handleShowOptimal(): void {
  if (!cachedOptimal?.verified) return;
  userFencesBeforeOptimal = cloneFences(currentFences);
  undoStack.push(cloneFences(currentFences));
  currentFences = cloneFences(cachedOptimal.optimalFences);
  showingModelAnswer = true;
  activeHint = null;
  updateEvaluationAndRender(false);
}

export function handleRevertSolution(): void {
  if (!userFencesBeforeOptimal) return;
  currentFences = cloneFences(userFencesBeforeOptimal);
  userFencesBeforeOptimal = null;
  showingModelAnswer = false;
  activeHint = null;
  playFenceRemoveSound();
  updateEvaluationAndRender(false);
}

async function loadStage(
  stage: StagePuzzle,
  precomputedOptimal: OptimalPastureResult | null = null,
  myToken = ++solveToken
): Promise<void> {
  currentStage = stage;
  currentFences = createEmptyFences(stage.grid.length, stage.grid[0].length);
  undoStack = [];
  cachedOptimal = selectVerifiedOptimal(precomputedOptimal);
  solverFailed = false;
  activeHint = null;
  wasClearedBeforeMove = false;
  showingModelAnswer = false;
  userFencesBeforeOptimal = null;
  pastureAudio.setTrack("meadow");

  updateEvaluationAndRender(false);

  if (cachedOptimal) {
    return;
  }

  try {
    const solved = await solveOptimalPasture(stage);
    if (myToken !== solveToken) return;
    const verifiedOpt = selectVerifiedOptimal(solved);
    cachedOptimal = verifiedOpt;
    solverFailed = verifiedOpt === null;
  } catch {
    if (myToken !== solveToken) return;
    cachedOptimal = null;
    solverFailed = true;
  }
  updateEvaluationAndRender(false);
}

export async function loadStageByNumber(stageNumber: number): Promise<void> {
  if (isStageLoading && inFlightLoadPromise) {
    return inFlightLoadPromise;
  }
  syncProgressFromStorage();
  const targetNum = Math.max(1, Math.floor(stageNumber));
  const myToken = ++solveToken;
  isStageLoading = true;
  renderStageNav();
  renderHud();

  const promise = (async () => {
    try {
      const { stage, precomputedOptimal } = await getStageByNumber(targetNum);
      if (myToken !== solveToken) return;
      await loadStage(stage, precomputedOptimal, myToken);
    } finally {
      if (myToken === solveToken) {
        isStageLoading = false;
        inFlightLoadPromise = null;
        renderStageNav();
        renderHud();
      }
    }
  })();
  inFlightLoadPromise = promise;
  return promise;
}

export async function stepStage(delta: -1 | 1): Promise<boolean> {
  if (isStageLoading) {
    return false;
  }
  syncProgressFromStorage();
  const maxUnlockedStage = getMaxUnlockedStage();
  const targetNum = currentStage.stageNumber + delta;
  if (targetNum < 1 || targetNum > maxUnlockedStage) {
    return false;
  }
  await loadStageByNumber(targetNum);
  return true;
}

// Event Listeners
if (typeof document !== "undefined" && document.getElementById("board-grid")) {
  document.querySelectorAll<HTMLButtonElement>("[data-lang-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = btn.dataset.langBtn as GameLang;
      if (lang === "ja" || lang === "en" || lang === "zh") {
        applyStaticTranslations(lang);
        renderStageNav();
        renderHud();
        renderBoard();
      }
    });
  });

  getEl<HTMLButtonElement>("btn-stage-prev").addEventListener("click", () => {
    void stepStage(-1);
  });

  getEl<HTMLButtonElement>("btn-stage-next").addEventListener("click", () => {
    void stepStage(1);
  });

  const stageSelect = getEl<HTMLSelectElement>("stage-select");
  stageSelect.addEventListener("change", () => {
    const selected = Number(stageSelect.value);
    if (
      Number.isFinite(selected) &&
      selected >= 1 &&
      selected <= getMaxUnlockedStage()
    ) {
      void loadStageByNumber(selected);
    }
  });

  const rulesDialog = getEl<HTMLDialogElement>("rules-dialog");
  const menuBtn = document.getElementById("btn-topbar-menu");
  const statsDropdown = document.getElementById("topbar-stats");
  const menuBackdrop = document.getElementById("topbar-backdrop");

  const closeMenu = () => {
    statsDropdown?.classList.remove("is-open");
    menuBtn?.setAttribute("aria-expanded", "false");
    if (menuBackdrop) menuBackdrop.hidden = true;
  };

  if (menuBtn && statsDropdown) {
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = statsDropdown.classList.toggle("is-open");
      menuBtn.setAttribute("aria-expanded", String(isOpen));
      if (menuBackdrop) {
        menuBackdrop.hidden = !isOpen;
      }
    });
    menuBackdrop?.addEventListener("click", closeMenu);
    document.addEventListener("click", (e) => {
      if (!statsDropdown.contains(e.target as Node) && e.target !== menuBtn) {
        closeMenu();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && statsDropdown.classList.contains("is-open")) {
        closeMenu();
      }
    });
  }

  const bgmBtn = document.getElementById("btn-bgm-toggle");
  if (bgmBtn) {
    bgmBtn.addEventListener("click", () => {
      pastureAudio.toggleBgm();
      syncAudioButtonUi();
    });
  }
  getEl<HTMLButtonElement>("btn-open-rules").addEventListener("click", () => {
    closeMenu();
    renderTutorialButtonsInDialog();
    rulesDialog.showModal();
  });
  getEl<HTMLButtonElement>("btn-close-rules").addEventListener("click", () => {
    rulesDialog.close();
  });
  getEl<HTMLButtonElement>("btn-rules-start").addEventListener("click", () => {
    rulesDialog.close();
  });
  // Fallback for browsers without declarative <dialog closedby="any"> support
  if (typeof HTMLDialogElement !== "undefined" && !("closedBy" in HTMLDialogElement.prototype)) {
    rulesDialog.addEventListener("click", (event: MouseEvent) => {
      if (event.target !== rulesDialog) return;
      const rect = rulesDialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (isDialogContent) return;
      rulesDialog.close();
    });
  }

  getEl<HTMLButtonElement>("btn-undo").addEventListener("click", handleUndo);
  getEl<HTMLButtonElement>("btn-restart").addEventListener("click", handleRestart);
  getEl<HTMLButtonElement>("btn-hint").addEventListener("click", () => {
    void handleHint();
  });
  getEl<HTMLButtonElement>("btn-show-optimal").addEventListener("click", handleShowOptimal);
  const btnRevert = document.getElementById("btn-revert-solution");
  if (btnRevert) {
    btnRevert.addEventListener("click", handleRevertSolution);
  }
  getEl<HTMLButtonElement>("btn-next-stage").addEventListener("click", () => {
    void stepStage(1);
  });

  window.addEventListener("keydown", (ev: KeyboardEvent) => {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) {
      return;
    }
    const key = ev.key.toLowerCase();
    if (key === "z") {
      ev.preventDefault();
      handleUndo();
    } else if (key === "r" && !ev.metaKey && !ev.ctrlKey) {
      ev.preventDefault();
      handleRestart();
    } else if (key === "h" && !ev.metaKey && !ev.ctrlKey) {
      ev.preventDefault();
      void handleHint();
    }
  });

  const handleViewportChange = () => {
    renderBoard();
  };
  window.addEventListener("resize", handleViewportChange);
  window.addEventListener("orientationchange", handleViewportChange);

  // Initialize language & resume progression or start directly in Stage 1
  applyStaticTranslations();
  const resumeStage = getResumeStageNumber(progress);
  void loadStageByNumber(resumeStage);
}
