/// <reference types="vite/client" />

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

import { setHighsWasmUrl } from "../../../../src/index.js";
import { getGameLang, pickLang, setGameLang, type GameLang } from "../i18n.js";
import { soundEngine } from "./audio.js";
import { ALL_PAIR_RELATIONS, LILITH_PROFILE, MONSTERS, getEffectivePower } from "./characters.js";
import {
  formatCastleCalendarMonthLocalized,
  getDayFullLabel,
  getDayLabel,
  getDifficultyLabelLocalized,
  getLilithProfileLocalized,
  getMonsterLocalized,
  getOpeningMovieCutsLocalized,
  getPrologueSlidesLocalized,
  getRelationLocalized,
  getRequestedOffReasonLocalized,
  getRequirementLocalized,
  getStageLocalized,
  getTutorialStepLocalized,
  getViolationLocalized,
} from "./i18n-data.js";
import {
  createEmptySchedule,
  diagnoseScheduleWithHighs,
  evaluateSchedule,
  generateVerifiedStageWithHighs,
  getStageDays,
  rollStageBattles,
  solveOptimalSchedule,
} from "./solver.js";
import {
  CAMPAIGN_STAGES,
  computeAdaptiveDifficultyTier,
  generateAdaptiveStage,
  generateRetryCampaignStage,
} from "./stages.js";
import {
  ALL_MONSTER_IDS,
  BALANCE_CONFIG,
  type ActiveShiftType,
  type DayIndex,
  type MonsterId,
  type OptimalSolveResult,
  type ScheduleEvaluation,
  type ScheduleGrid,
  type ShiftType,
  type SlotBattleOutcome,
  type StagePlayRecord,
  type StageScenario,
} from "./types.js";

// Ensure HiGHS WASM resolves cleanly in local dev, preview, and GitHub Pages (/washi/games/demon-castle-shift/)
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

let currentLang: GameLang = getGameLang();

// ============================================================================
// Persistent Save State
// ============================================================================

export interface SaveData {
  unlockedStageIndex: number;
  highestUnlockedWeek: number;
  clearedRanks: Record<string, "S" | "A" | "B">;
  playHistory: StagePlayRecord[];
  stageRetryCounts: Record<string, number>;
  stageFailedAttempts: Record<string, number>;
  unlockAllDemo: boolean;
  openingMovieSeen?: boolean;
}

const SAVE_STORAGE_KEY = "demon_castle_guard_shift_save_v2";

export function hasSavedProgress(data: SaveData): boolean {
  return (
    Boolean(data.openingMovieSeen) ||
    data.highestUnlockedWeek > 1 ||
    data.unlockedStageIndex > 0 ||
    Object.keys(data.clearedRanks).length > 0 ||
    data.playHistory.length > 0
  );
}

function loadSaveData(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const unlockedStageIndex =
        typeof parsed.unlockedStageIndex === "number" ? parsed.unlockedStageIndex : 0;
      const highestUnlockedWeek =
        typeof parsed.highestUnlockedWeek === "number"
          ? Math.max(1, parsed.highestUnlockedWeek)
          : unlockedStageIndex + 1;
      const stageRetryCounts =
        parsed.stageRetryCounts && typeof parsed.stageRetryCounts === "object"
          ? parsed.stageRetryCounts
          : {};
      const stageFailedAttempts =
        parsed.stageFailedAttempts && typeof parsed.stageFailedAttempts === "object"
          ? parsed.stageFailedAttempts
          : { ...stageRetryCounts };
      return {
        unlockedStageIndex,
        highestUnlockedWeek,
        clearedRanks: parsed.clearedRanks ?? {},
        playHistory: Array.isArray(parsed.playHistory) ? parsed.playHistory : [],
        stageRetryCounts,
        stageFailedAttempts,
        unlockAllDemo: Boolean(parsed.unlockAllDemo),
        openingMovieSeen: Boolean(parsed.openingMovieSeen),
      };
    }
  } catch {
    // Ignore storage errors in private browsing
  }
  return {
    unlockedStageIndex: 0,
    highestUnlockedWeek: 1,
    clearedRanks: {},
    playHistory: [],
    stageRetryCounts: {},
    stageFailedAttempts: {},
    unlockAllDemo: false,
    openingMovieSeen: false,
  };
}

function getCampaignStageScenario(stageIndex: number, attemptOffset = 0): StageScenario {
  const clampedIdx = Math.max(0, Math.min(CAMPAIGN_STAGES.length - 1, stageIndex));
  const retryCount = (saveData.stageRetryCounts[`week-${clampedIdx + 1}`] ?? 0) + attemptOffset;
  if (retryCount > 0) {
    return generateRetryCampaignStage(clampedIdx, retryCount);
  }
  return CAMPAIGN_STAGES[clampedIdx];
}

function getEndlessStageScenario(weekNumber: number, attemptOffset = 0): StageScenario {
  const retryCount = (saveData.stageRetryCounts[`week-${weekNumber}`] ?? 0) + attemptOffset;
  const seed = weekNumber * 7919 + saveData.playHistory.length * 101 + retryCount * 3571;
  return generateAdaptiveStage(weekNumber, saveData.playHistory, seed);
}

function persistSaveData(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// Active Game State & Typewriter Engine
// ============================================================================

let saveData: SaveData = loadSaveData();
let currentStageIndex = 0;
let currentStage: StageScenario = CAMPAIGN_STAGES[0];
let currentSchedule: ScheduleGrid = createEmptySchedule(
  currentStage.availableMonsters,
  getStageDays(currentStage).length
);
let cachedOptimalResult: OptimalSolveResult | null = null;
let currentEvaluation: ScheduleEvaluation = evaluateSchedule(currentStage, currentSchedule);
let prologueSlideIndex = 0;
let tutorialSkipped = false;
let hintsUsedThisStage = 0;
let failedAttemptsThisStage = 0;
let stageLoadGeneration = 0;

// Typewriter state for bottom RPG dialogue dock
let dockTimer: number | null = null;
let dockFullText = "";
let dockCharIndex = 0;

// Typewriter state for prologue dialog
let prologueTimer: number | null = null;
let prologueFullText = "";
let prologueCharIndex = 0;

// Opening movie state
let opCutIndex = 0;
let opAutoAdvanceTimer: number | null = null;
let opTypewriterTimer: number | null = null;
let opProceedToPrologueAfter = false;

let supportsDisplayTransition: boolean | undefined;

function canTransitionDisplay(): boolean {
  if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
  if (!document.body) return false;
  const probe = document.createElement("div");
  probe.style.cssText = "transition: display 1s allow-discrete !important; display: block;";
  document.body.appendChild(probe);
  void getComputedStyle(probe).display;
  probe.style.display = "none";
  supportsDisplayTransition = getComputedStyle(probe).display === "block";
  probe.remove();
  return supportsDisplayTransition;
}

function supportsTopLayerExit(): boolean {
  return Boolean(window.CSS?.supports?.("overlay", "auto") && canTransitionDisplay());
}

async function closeTopLayer(dialog: HTMLDialogElement): Promise<void> {
  if (!dialog.open) return;
  if (!supportsTopLayerExit()) {
    dialog.setAttribute("data-closing", "");
    const animations = dialog.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((r) => window.setTimeout(r, 400)),
      ]);
    }
    if (!dialog.hasAttribute("data-closing")) return;
    dialog.removeAttribute("data-closing");
  }
  dialog.close();
}

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing required DOM element: #${id}`);
  }
  return el as T;
}

/**
 * Displays a message in the bottom RPG conversation window with 1-character-at-a-time typewriter effect.
 */
function speakInDock(options: {
  speaker?: string;
  tag?: string;
  portrait?: string;
  text: string;
}): void {
  const lilith = getLilithProfileLocalized(currentLang);
  const portraitEl = getEl<HTMLImageElement>("dialogue-portrait");
  const speakerEl = getEl<HTMLElement>("dialogue-speaker");
  const tagEl = getEl<HTMLElement>("dialogue-tag");
  const textEl = getEl<HTMLElement>("dialogue-text");
  const cursorEl = getEl<HTMLElement>("dialogue-cursor");

  portraitEl.src = options.portrait ?? lilith.portrait;
  portraitEl.alt = options.speaker ?? lilith.name;
  speakerEl.textContent = options.speaker ?? lilith.name;
  tagEl.textContent = options.tag ?? lilith.title;

  if (dockTimer !== null) {
    window.clearInterval(dockTimer);
    dockTimer = null;
  }

  dockFullText = options.text;
  dockCharIndex = 0;
  textEl.textContent = "";
  cursorEl.textContent = "⋯";

  dockTimer = window.setInterval(() => {
    dockCharIndex++;
    if (dockCharIndex >= dockFullText.length) {
      textEl.textContent = dockFullText;
      cursorEl.textContent = "▼";
      if (dockTimer !== null) {
        window.clearInterval(dockTimer);
        dockTimer = null;
      }
      return;
    }
    textEl.textContent = dockFullText.slice(0, dockCharIndex);
  }, 22);
}

function finishDockTypewriterOrCycleStatus(): void {
  const textEl = getEl<HTMLElement>("dialogue-text");
  const cursorEl = getEl<HTMLElement>("dialogue-cursor");
  if (dockTimer !== null) {
    window.clearInterval(dockTimer);
    dockTimer = null;
    textEl.textContent = dockFullText;
    cursorEl.textContent = "▼";
    return;
  }
  // If already finished typing, show current stage guidance or next violation
  updateDefaultDockMessage();
}

/**
 * Light-dismiss setup: ONLY dialogs with `closedby="any"` (e.g. `#roster-dialog`, `#help-dialog`)
 * close on backdrop click or Escape. Story/progression dialogs (`#opening-movie-dialog`, `#prologue-dialog`,
 * `#briefing-dialog`, `#result-dialog`) never close or advance when clicking outside the dialog.
 */
function setupDialogLightDismiss(): void {
  const dialogs = document.querySelectorAll<HTMLDialogElement>("dialog.game-dialog");
  for (const dialog of dialogs) {
    const allowsLightDismiss = dialog.getAttribute("closedby") === "any";
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (allowsLightDismiss) {
        void closeTopLayer(dialog);
      }
    });
    if (allowsLightDismiss && !("closedBy" in HTMLDialogElement.prototype)) {
      dialog.addEventListener("click", (e: MouseEvent) => {
        if (e.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const clickedInDialog =
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;
        if (!clickedInDialog) {
          void closeTopLayer(dialog);
        }
      });
    }
  }

  document.querySelectorAll<HTMLButtonElement>("[data-close-dialog]").forEach((btn) => {
    btn.addEventListener("click", () => {
      soundEngine.playClick("off");
      const targetId = btn.getAttribute("data-close-dialog");
      if (targetId) {
        if (targetId === "briefing-dialog") {
          soundEngine.setSceneTrack("planning");
          syncAudioButtonUi();
          updateDefaultDockMessage();
        }
        void closeTopLayer(getEl<HTMLDialogElement>(targetId));
      }
    });
  });
}

// ============================================================================
// Scene 0.5: Cinematic Opening Movie Controller
// ============================================================================

function clearOpeningMovieTimer(): void {
  if (opAutoAdvanceTimer !== null) {
    window.clearTimeout(opAutoAdvanceTimer);
    opAutoAdvanceTimer = null;
  }
  if (opTypewriterTimer !== null) {
    window.clearInterval(opTypewriterTimer);
    opTypewriterTimer = null;
  }
}

function revealAllOpeningChars(): void {
  if (opTypewriterTimer !== null) {
    window.clearInterval(opTypewriterTimer);
    opTypewriterTimer = null;
  }
  document
    .querySelectorAll<HTMLElement>("#op-telop-lead .op-char, #op-telop-sub .op-char")
    .forEach((span) => span.classList.add("is-revealed"));
}

function toOpeningCharSpansHtml(text: string, initiallyRevealed = false): string {
  return Array.from(text)
    .map(
      (ch) =>
        `<span class="op-char${initiallyRevealed ? " is-revealed" : ""}">${ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === "&" ? "&amp;" : ch}</span>`
    )
    .join("");
}

function renderOpeningParticles(color: string): void {
  const layer = getEl<HTMLElement>("op-particles-layer");
  const items: string[] = [];
  for (let i = 0; i < 16; i++) {
    const left = (i * 19 + 7) % 94;
    const top = 18 + ((i * 29) % 72);
    const size = 4 + (i % 4) * 2;
    const delay = ((i * 0.31) % 3.2).toFixed(2);
    const dur = (3.4 + (i % 4) * 0.55).toFixed(2);
    items.push(
      `<span class="op-particle" style="left:${left}%;top:${top}%;width:${size}px;height:${size}px;background:${color};box-shadow:0 0 10px ${color};animation-delay:${delay}s;animation-duration:${dur}s;"></span>`
    );
  }
  layer.innerHTML = items.join("");
}

function renderOpeningCut(index: number): void {
  clearOpeningMovieTimer();
  const cuts = getOpeningMovieCutsLocalized(currentLang);
  opCutIndex = Math.max(0, Math.min(cuts.length - 1, index));
  const cut = cuts[opCutIndex];

  const leadEl = getEl<HTMLElement>("op-telop-lead");
  const subEl = getEl<HTMLElement>("op-telop-sub");
  // Keep climax title line revealed immediately for impact; reveal sub & story cuts 1 character at a time without shifting centered layout
  leadEl.innerHTML = toOpeningCharSpansHtml(cut.lead, Boolean(cut.isClimax));
  subEl.innerHTML = toOpeningCharSpansHtml(cut.sub, false);

  const charSpans = Array.from(
    document.querySelectorAll<HTMLElement>(
      "#op-telop-lead .op-char:not(.is-revealed), #op-telop-sub .op-char:not(.is-revealed)"
    )
  );
  let charPos = 0;
  if (charSpans.length > 0) {
    opTypewriterTimer = window.setInterval(() => {
      if (charPos >= charSpans.length) {
        if (opTypewriterTimer !== null) {
          window.clearInterval(opTypewriterTimer);
          opTypewriterTimer = null;
        }
        return;
      }
      charSpans[charPos].classList.add("is-revealed");
      charPos++;
    }, 26);
  }

  const progressFill = getEl<HTMLElement>("op-progress-fill");
  progressFill.style.width = `${Math.round(((opCutIndex + 1) / cuts.length) * 100)}%`;

  const imgEl = getEl<HTMLImageElement>("op-scene-img");
  imgEl.className = "op-scene-img";
  imgEl.src = cut.image;
  // Force reflow so Ken Burns animation restarts cleanly on every cut
  void imgEl.offsetWidth;
  imgEl.classList.add(cut.cameraClass);

  renderOpeningParticles(cut.particleColor);

  const climaxOverlay = getEl<HTMLElement>("op-climax-overlay");
  const finishBtn = getEl<HTMLButtonElement>("btn-op-finish");
  const nextCutBtn = getEl<HTMLButtonElement>("btn-op-next-cut");
  if (cut.isClimax) {
    climaxOverlay.hidden = false;
    finishBtn.textContent = opProceedToPrologueAfter
      ? t("ui.startStory")
      : t("ui.returnToTitle");
    nextCutBtn.textContent = opProceedToPrologueAfter
      ? t("ui.startStory_2")
      : t("ui.finish");
  } else {
    climaxOverlay.hidden = true;
    nextCutBtn.textContent = t("ui.next");
    opAutoAdvanceTimer = window.setTimeout(() => {
      if (opCutIndex < cuts.length - 1) {
        renderOpeningCut(opCutIndex + 1);
      }
    }, cut.durationMs);
  }
}

export function syncAudioButtonUi(): void {
  const playing = soundEngine.playing;
  document.querySelectorAll<HTMLButtonElement>("[data-bgm-toggle]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(playing));
    if (playing) {
      btn.innerHTML = `<span class="btn-audio-short">🔊 BGM: ON</span>`;
    } else {
      const extra = t("ui.clickForMusic");
      btn.innerHTML = `<span class="btn-audio-short">🔇 BGM: OFF</span><span class="btn-audio-extra">${extra}</span>`;
    }
  });
}

function openOpeningMovieDialog(proceedToPrologueAfter: boolean): void {
  opProceedToPrologueAfter = proceedToPrologueAfter;
  soundEngine.setSceneTrack("opening");
  syncAudioButtonUi();
  const dialog = getEl<HTMLDialogElement>("opening-movie-dialog");
  if (!dialog.open) {
    dialog.showModal();
  }
  renderOpeningCut(0);
}

function finishOpeningMovie(): void {
  clearOpeningMovieTimer();
  saveData.openingMovieSeen = true;
  persistSaveData(saveData);
  const dialog = getEl<HTMLDialogElement>("opening-movie-dialog");
  const shouldOpenPrologue = opProceedToPrologueAfter;
  opProceedToPrologueAfter = false;
  soundEngine.setSceneTrack(shouldOpenPrologue ? "prologue" : "title");
  syncAudioButtonUi();
  void closeTopLayer(dialog).then(() => {
    if (shouldOpenPrologue) {
      openPrologueDialog();
    }
  });
}

function advanceOpeningCut(forceNext = false): void {
  if (!forceNext && opTypewriterTimer !== null) {
    revealAllOpeningChars();
    return;
  }
  const cuts = getOpeningMovieCutsLocalized(currentLang);
  if (opCutIndex < cuts.length - 1) {
    renderOpeningCut(opCutIndex + 1);
  } else {
    finishOpeningMovie();
  }
}

// ============================================================================
// Scene Transitions (Title <-> Prologue <-> Main Game)
// ============================================================================

function showTitleScreen(): void {
  stageLoadGeneration++;
  const titleScreen = getEl<HTMLElement>("title-screen");
  const gameApp = getEl<HTMLElement>("game-app");
  titleScreen.hidden = false;
  gameApp.hidden = true;
  soundEngine.setSceneTrack("title");
  syncAudioButtonUi();

  const continueBtn = getEl<HTMLButtonElement>("btn-title-continue");
  const hasProgress =
    saveData.highestUnlockedWeek > 1 ||
    saveData.unlockedStageIndex > 0 ||
    Object.keys(saveData.clearedRanks).length > 0;
  continueBtn.hidden = !hasProgress;
  if (hasProgress) {
    if (saveData.highestUnlockedWeek > CAMPAIGN_STAGES.length) {
      const nextTier = computeAdaptiveDifficultyTier(
        saveData.playHistory,
        saveData.highestUnlockedWeek
      );
      const mLabel = formatCastleCalendarMonthLocalized(
        saveData.highestUnlockedWeek,
        false,
        currentLang
      );
      const dLabel = getDifficultyLabelLocalized(nextTier, currentLang);
      continueBtn.textContent = t("ui.continueDifficulty", { mLabel, dLabel });
    } else {
      const resumeIdx = Math.min(saveData.unlockedStageIndex, CAMPAIGN_STAGES.length - 1);
      const mLabel = formatCastleCalendarMonthLocalized(resumeIdx + 1, false, currentLang);
      continueBtn.textContent = t("ui.continue", { mLabel });
    }
  }
}

function enterGameScreen(stageIndex: number, showBriefingModal = true): void {
  const titleScreen = getEl<HTMLElement>("title-screen");
  const gameApp = getEl<HTMLElement>("game-app");
  titleScreen.hidden = true;
  gameApp.hidden = false;
  soundEngine.setSceneTrack(showBriefingModal ? "prologue" : "planning");
  syncAudioButtonUi();

  void loadCampaignStage(stageIndex, showBriefingModal);
}

function openPrologueDialog(): void {
  soundEngine.setSceneTrack("prologue");
  syncAudioButtonUi();
  prologueSlideIndex = 0;
  renderPrologueSlide();
  const dialog = getEl<HTMLDialogElement>("prologue-dialog");
  dialog.showModal();
}

function renderPrologueSlide(): void {
  const slides = getPrologueSlidesLocalized(currentLang);
  const slide = slides[prologueSlideIndex];
  const visualSceneEl = getEl<HTMLElement>("prologue-visual-scene");
  const vnCenterEl = getEl<HTMLElement>("prologue-vn-center");
  const hasVisual = slide.visualHtml.trim().length > 0;
  visualSceneEl.innerHTML = slide.visualHtml;
  visualSceneEl.hidden = !hasVisual;
  vnCenterEl.classList.toggle("is-greeting-solo", !hasVisual);

  getEl<HTMLElement>("prologue-step-indicator").textContent =
    `${prologueSlideIndex + 1} / ${slides.length}`;

  const headingEl = getEl<HTMLElement>("prologue-slide-heading");
  const textEl = getEl<HTMLElement>("prologue-slide-text");
  if (prologueTimer !== null) {
    window.clearInterval(prologueTimer);
    prologueTimer = null;
  }
  const headingLen = slide.heading.length;
  prologueFullText = slide.text;
  prologueCharIndex = 0;
  headingEl.textContent = "";
  textEl.textContent = "";

  const totalChars = headingLen + prologueFullText.length;
  prologueTimer = window.setInterval(() => {
    prologueCharIndex++;
    if (prologueCharIndex <= headingLen) {
      headingEl.textContent = slide.heading.slice(0, prologueCharIndex);
      return;
    }
    headingEl.textContent = slide.heading;
    const bodyChars = prologueCharIndex - headingLen;
    if (bodyChars >= prologueFullText.length) {
      textEl.textContent = prologueFullText;
      if (prologueTimer !== null) {
        window.clearInterval(prologueTimer);
        prologueTimer = null;
      }
      return;
    }
    textEl.textContent = prologueFullText.slice(0, bodyChars);
  }, 22);
  void totalChars;

  const dotsEl = getEl<HTMLElement>("prologue-dots");
  dotsEl.innerHTML = slides
    .map(
      (_, idx) => `<span class="prologue-dot ${idx === prologueSlideIndex ? "is-active" : ""}"></span>`
    )
    .join("");

  const prevBtn = getEl<HTMLButtonElement>("btn-prologue-prev");
  const nextBtn = getEl<HTMLButtonElement>("btn-prologue-next");
  prevBtn.disabled = prologueSlideIndex === 0;
  const firstMonth = formatCastleCalendarMonthLocalized(1, false, currentLang);
  nextBtn.textContent =
    prologueSlideIndex === slides.length - 1
      ? t("ui.proceedToShift", { firstMonth })
      : t("ui.next_2");
}

// ============================================================================
// Stage Loading & Stage Progression Navigation
// ============================================================================

export async function loadCampaignStage(stageIndex: number, openBriefing = true): Promise<void> {
  const loadGen = ++stageLoadGeneration;
  const clampedIdx = Math.max(0, Math.min(CAMPAIGN_STAGES.length - 1, stageIndex));
  const retryCount = saveData.stageRetryCounts[`week-${clampedIdx + 1}`] ?? 0;
  if (retryCount > 0) {
    const { stage, optimalResult } = await generateVerifiedStageWithHighs((attempt) =>
      getCampaignStageScenario(clampedIdx, attempt)
    );
    if (loadGen !== stageLoadGeneration) return;
    await loadStage(stage, clampedIdx, openBriefing, optimalResult, loadGen);
    return;
  }
  await loadStage(CAMPAIGN_STAGES[clampedIdx], clampedIdx, openBriefing, null, loadGen);
}

export async function loadEndlessStage(weekNumber: number, openBriefing = true): Promise<void> {
  const loadGen = ++stageLoadGeneration;
  const { stage, optimalResult } = await generateVerifiedStageWithHighs((attempt) =>
    getEndlessStageScenario(weekNumber, attempt)
  );
  if (loadGen !== stageLoadGeneration) return;
  await loadStage(stage, -1, openBriefing, optimalResult, loadGen);
}

async function loadStage(
  stage: StageScenario,
  stageIndex: number,
  openBriefing = true,
  precomputedOptimal: OptimalSolveResult | null = null,
  loadGen = ++stageLoadGeneration
): Promise<void> {
  if (loadGen !== stageLoadGeneration) return;
  currentStage = stage;
  currentStageIndex = stageIndex;
  const days = getStageDays(stage);
  currentSchedule = createEmptySchedule(stage.availableMonsters, days.length);
  cachedOptimalResult = precomputedOptimal;
  tutorialSkipped = false;
  hintsUsedThisStage = 0;
  const retryKey = `week-${stage.weekNumber}`;
  failedAttemptsThisStage =
    saveData.stageFailedAttempts[retryKey] ?? saveData.stageRetryCounts[retryKey] ?? 0;

  const hasDom =
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    Boolean(document.getElementById("stage-progress-nav"));
  if (hasDom) {
    renderStageProgressNav();
    renderStageHeading();

    refreshEvaluationAndBoard(true);

    if (openBriefing) {
      openBriefingDialog(stage);
    }
  } else {
    currentEvaluation = evaluateSchedule(currentStage, currentSchedule);
    if (typeof document !== "undefined") {
      renderStageHeading();
    }
  }

  if (!cachedOptimalResult) {
    try {
      const res = await solveOptimalSchedule(stage);
      if (loadGen === stageLoadGeneration && currentStage.id === stage.id) {
        cachedOptimalResult = res;
        if (hasDom) {
          refreshEvaluationAndBoard(false);
        }
      }
    } catch (err) {
      console.error("Background solver error:", err);
    }
  }
}

export function isEndlessModeUnlocked(data: SaveData = saveData): boolean {
  return data.unlockAllDemo || data.highestUnlockedWeek > CAMPAIGN_STAGES.length;
}

function renderStageProgressNav(): void {
  const nav = getEl<HTMLElement>("stage-progress-nav");
  const clearedTitle = t("ui.cleared");
  const buttonsHtml = CAMPAIGN_STAGES.map((st, idx) => {
    const isUnlocked =
      saveData.unlockAllDemo ||
      idx <= saveData.unlockedStageIndex ||
      idx + 1 <= saveData.highestUnlockedWeek;
    const isActive = currentStage.id === st.id;
    const isCleared = Boolean(saveData.clearedRanks[st.id]);
    const rankBadge = isCleared
      ? `<span class="stage-rank-mini" title="${clearedTitle}">✓</span>`
      : !isUnlocked
        ? `<span>🔒</span>`
        : "";
    const label = formatCastleCalendarMonthLocalized(idx + 1, false, currentLang);
    const fullEraTitle = formatCastleCalendarMonthLocalized(idx + 1, true, currentLang);
    return `<button type="button" class="stage-pill-btn ${isActive ? "is-active" : ""}" data-stage-idx="${idx}" ${!isUnlocked ? "disabled" : ""} title="${fullEraTitle}">
      <span>${label}</span>
      ${rankBadge}
    </button>`;
  }).join("");

  const endlessUnlocked = isEndlessModeUnlocked(saveData);
  const isEndlessActive = currentStageIndex === -1;
  const endlessWeek = isEndlessActive
    ? currentStage.weekNumber
    : Math.max(CAMPAIGN_STAGES.length + 1, saveData.highestUnlockedWeek);
  const endlessTier = computeAdaptiveDifficultyTier(saveData.playHistory, endlessWeek);
  const endlessMonth = formatCastleCalendarMonthLocalized(endlessWeek, false, currentLang);
  const endlessDiff = getDifficultyLabelLocalized(endlessTier, currentLang);
  const endlessMonthSpan = `<span class="stage-pill-month">${endlessMonth}</span>`;
  const diffLabel = t("ui.difficulty", { endlessDiff });
  const endlessDiffSpan = `<span class="stage-pill-diff">${diffLabel}</span>`;
  const endlessTooltip = t("ui.subsequentMonthsWithDifficulty");
  const randomBtnHtml = `<button type="button" class="stage-pill-btn stage-pill-endless ${isEndlessActive ? "is-active" : ""}" data-stage-random="true" ${!endlessUnlocked ? "disabled" : ""} title="${endlessTooltip}">
    <span>${endlessMonthSpan}${endlessDiffSpan}</span>
    ${!endlessUnlocked ? `<span>🔒</span>` : ""}
  </button>`;

  nav.innerHTML = buttonsHtml + randomBtnHtml;

  nav.querySelectorAll<HTMLButtonElement>("[data-stage-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-stage-idx"));
      soundEngine.playClick("day");
      void loadCampaignStage(idx, true);
    });
  });

  nav.querySelector<HTMLButtonElement>("[data-stage-random]")?.addEventListener("click", () => {
    if (!isEndlessModeUnlocked(saveData)) return;
    soundEngine.playClick("night");
    const targetWeek = Math.max(CAMPAIGN_STAGES.length + 1, saveData.highestUnlockedWeek);
    void loadEndlessStage(targetWeek, true);
  });
}

// ============================================================================
// Scene 3: Stage Briefing Dialog
// ============================================================================

let briefingTimer: number | null = null;

function openBriefingDialog(stage: StageScenario): void {
  const days = getStageDays(stage);
  const dialog = getEl<HTMLDialogElement>("briefing-dialog");
  const body = getEl<HTMLElement>("briefing-body");
  const locStage = getStageLocalized(stage, currentLang);
  const lilith = getLilithProfileLocalized(currentLang);
  const stepSummary = t("ui.daysGuardsOnDuty", { dayCount: days.length, guardCount: stage.availableMonsters.length });
  const startLabel = t("ui.startScheduling");
  const clickHint = t("ui.clickToRevealFullMessage");

  body.innerHTML = `
    <div id="briefing-stage-box" class="prologue-stage" style="margin-bottom:0.85rem;cursor:pointer;" title="${clickHint}">
      <img src="./char-lilith.jpg" alt="${lilith.name}" width="80" height="80" class="prologue-portrait" style="width:80px;height:80px;" />
      <div>
        <span class="prologue-step-indicator">${stepSummary}</span>
        <h3 style="margin:0.15rem 0 0.35rem;font-size:1.05rem;">${locStage.title}</h3>
        <p id="briefing-lilith-text" style="margin:0;font-size:0.86rem;line-height:1.65;color:var(--text-main);min-height:3.2em;"></p>
      </div>
    </div>

    <div class="briefing-new-rule-box">
      <h3>${locStage.newRuleTitle}</h3>
      <p>${locStage.newRuleSummary}</p>
    </div>

    <div style="display:flex;justify-content:flex-end;align-items:center;gap:0.6rem;flex-wrap:wrap;">
      <button id="btn-briefing-start" type="button" class="btn-dispatch" style="max-width:260px;">
        ${startLabel}
      </button>
    </div>
  `;

  if (!dialog.open) {
    dialog.showModal();
  }
  soundEngine.setSceneTrack("prologue");
  syncAudioButtonUi();

  const introTextEl = document.getElementById("briefing-lilith-text");
  const fullIntro = locStage.lilithIntro;
  if (briefingTimer !== null) {
    window.clearInterval(briefingTimer);
    briefingTimer = null;
  }
  if (introTextEl) {
    let charIdx = 0;
    introTextEl.textContent = "";
    briefingTimer = window.setInterval(() => {
      charIdx++;
      if (charIdx >= fullIntro.length) {
        introTextEl.textContent = fullIntro;
        if (briefingTimer !== null) {
          window.clearInterval(briefingTimer);
          briefingTimer = null;
        }
        return;
      }
      introTextEl.textContent = fullIntro.slice(0, charIdx);
    }, 22);
  }

  document.getElementById("briefing-stage-box")?.addEventListener("click", () => {
    if (briefingTimer !== null && introTextEl) {
      window.clearInterval(briefingTimer);
      briefingTimer = null;
      introTextEl.textContent = fullIntro;
    }
  });

  document.getElementById("btn-briefing-start")?.addEventListener("click", () => {
    if (briefingTimer !== null) {
      window.clearInterval(briefingTimer);
      briefingTimer = null;
    }
    soundEngine.playClick("day");
    soundEngine.setSceneTrack("planning");
    syncAudioButtonUi();
    dialog.close();
    updateDefaultDockMessage();
  });
}

// ============================================================================
// Scene 4: Clean Shift Table & Bottom RPG Conversation Window
// ============================================================================

function getActiveTutorialStep(): {
  stepIndex: number;
  totalSteps: number;
  day: DayIndex;
  monsterId: MonsterId;
  targetShift: ShiftType;
  shortCallout: string;
  instruction: string;
} | null {
  if (tutorialSkipped) return null;
  const steps = currentStage.tutorialSteps;
  if (!steps || steps.length === 0) return null;

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const currentCell = currentSchedule[s.monsterId]?.[s.day] ?? "off";
    if (currentCell !== s.targetShift) {
      const mName = getMonsterLocalized(s.monsterId, currentLang).name;
      const dLabel = getDayLabel(s.day, currentLang);
      const shiftLabel =
        s.targetShift === "day"
          ? t("ui.day_2")
          : s.targetShift === "night"
            ? t("ui.night_2")
            : t("ui.off_2");
      const baseStep = {
        stepIndex: i + 1,
        totalSteps: steps.length,
        day: s.day,
        monsterId: s.monsterId,
        targetShift: s.targetShift,
        shortCallout:
          s.shortCallout ??
          t("ui.setOnTo", { mName, dLabel, shiftLabel }),
        instruction: s.instruction,
      };
      const loc = getTutorialStepLocalized(baseStep, currentLang);
      return {
        ...baseStep,
        shortCallout: loc.shortCallout,
        instruction: loc.instruction,
      };
    }
  }
  return null;
}

export function getNextCycleShift(current: ShiftType, isFullMoonForbidden = false): ShiftType {
  if (current === "off") {
    return "day";
  }
  if (current === "day") {
    return isFullMoonForbidden ? "off" : "night";
  }
  return "off";
}

function renderShiftMatrix(): void {
  const table = getEl<HTMLTableElement>("shift-grid-table");
  const days = getStageDays(currentStage);
  const activeTutorial = getActiveTutorialStep();
  table.classList.toggle("is-tutorial-mode", Boolean(activeTutorial));

  const cellViolationMap = new Map<string, string[]>();
  for (const v of currentEvaluation.violations) {
    if (v.monsterId && v.day !== undefined) {
      const key = `${v.monsterId}_${v.day}`;
      const list = cellViolationMap.get(key) ?? [];
      const locV = getViolationLocalized(v, currentStage, currentLang);
      if (!list.includes(locV.shortBadge)) {
        list.push(locV.shortBadge);
      }
      cellViolationMap.set(key, list);
    }
  }

  const fullMoonTagText = t("ui.fullMoon");
  const dayHeadersHtml = days
    .map((d) => {
      const nightReq = currentStage.requirements.find((r) => r.day === d && r.shift === "night");
      const moonBadge = nightReq?.isFullMoon ? `<span class="moon-tag">${fullMoonTagText}</span>` : "";
      const isDimmedCol = activeTutorial && activeTutorial.day !== d;
      return `<th scope="col" class="${isDimmedCol ? "is-tutorial-dimmed-cell" : ""}">${getDayLabel(d, currentLang)}${moonBadge}</th>`;
    })
    .join("");

  const memberTitle = t("ui.guardMembers");
  const memberSub = t("ui.tapForDetails");
  const memberColLabel = `<span class="col-monster-title">${memberTitle}</span><span class="col-monster-sub">${memberSub}</span>`;
  const theadHtml = `
    <thead>
      <tr>
        <th scope="col" class="col-monster">${memberColLabel}</th>
        ${dayHeadersHtml}
      </tr>
    </thead>
  `;

  const buildRaidRow = (
    shift: ActiveShiftType,
    labelDesktop: string,
    labelMobile: string,
    rowClass: string
  ): string => {
    const cellsHtml = days
      .map((d) => {
        const slotStatus = currentEvaluation.slotStatuses.find(
          (s) => s.day === d && s.shift === shift
        );
        const req = currentStage.requirements.find((r) => r.day === d && r.shift === shift);
        if (!slotStatus || !req) return `<td>-</td>`;

        const {
          assignedMonsters,
          currentPower,
          expectedPower,
          powerMet,
          staffMet,
        } = slotStatus;
        const meetsExpected = currentPower >= expectedPower;
        const cellStateClass =
          powerMet && staffMet
            ? "is-satisfied"
            : meetsExpected && staffMet
              ? "is-probabilistic"
              : "is-deficit";
        const powerPillClass = powerMet ? "ok" : meetsExpected ? "warn" : "ng";
        const isRelatedRaid =
          activeTutorial &&
          activeTutorial.day === d &&
          activeTutorial.targetShift === shift;
        const isDimmedRaid = activeTutorial && !isRelatedRaid;
        const staffTextDesktop = t("ui.staff", { assignedCount: assignedMonsters.length, req_minStaff: req.minStaff });
        const staffTextMobile = t("ui.text", { assignedCount: assignedMonsters.length, req_minStaff: req.minStaff });
        const staffPillHtml =
          req.minStaff > 1 || !staffMet
            ? `<span class="meter-pill ${staffMet ? "ok" : "ng"}"><span class="meter-text-desktop">${staffTextDesktop}</span><span class="meter-text-mobile">${staffTextMobile}</span></span>`
            : "";
        const locReq = getRequirementLocalized(req, currentLang);
        const pwrTextDesktop = t("ui.defEst", { currentPower, expectedPower });
        const pwrTextMobile = `${currentPower} / ${expectedPower}`;

        return `
          <td class="raid-cell ${cellStateClass} ${isRelatedRaid ? "is-tutorial-related-raid" : ""} ${isDimmedRaid ? "is-tutorial-dimmed-cell" : ""}">
            <div class="raid-enemy-title">${locReq.enemyName}</div>
            <div class="raid-meters">
              ${staffPillHtml}
              <span class="meter-pill ${powerPillClass}">
                <span class="meter-text-desktop">${pwrTextDesktop}</span>
                <span class="meter-text-mobile">${pwrTextMobile}</span>
              </span>
            </div>
          </td>
        `;
      })
      .join("");

    return `
      <tr class="raid-row ${rowClass}">
        <th scope="row">
          <span class="raid-label-desktop">${labelDesktop}</span>
          <span class="raid-label-mobile">${labelMobile}</span>
        </th>
        ${cellsHtml}
      </tr>
    `;
  };

  const offBtnText = t("ui.off_2");
  const dayBtnText = t("ui.day_2");
  const nightBtnText = t("ui.night_2");

  const monsterRowsHtml = currentStage.availableMonsters
    .map((mId) => {
      const m = getMonsterLocalized(mId, currentLang);
      const assignedCount = days.filter((d) => currentSchedule[mId]?.[d] !== "off").length;
      const isOverMax = assignedCount > m.maxWeeklyShifts;
      const dayPower = getEffectivePower(mId, "day");
      const nightPower = getEffectivePower(mId, "night");
      const isDimmedRow = Boolean(activeTutorial && activeTutorial.monsterId !== mId);

      const cellsHtml = days
        .map((d) => {
          const currentShift: ShiftType = currentSchedule[mId]?.[d] ?? "off";
          const reqOff = currentStage.requestedDaysOff.find(
            (r) => r.monsterId === mId && r.day === d
          );
          const nightReq = currentStage.requirements.find(
            (r) => r.day === d && r.shift === "night"
          );
          const isFullMoonForbidden = Boolean(nightReq?.isFullMoon && m.fullMoonNightForbidden);
          const cellViolations = cellViolationMap.get(`${mId}_${d}`) ?? [];
          const hasViolation = cellViolations.length > 0;
          const isTargetCell =
            Boolean(activeTutorial) &&
            activeTutorial?.monsterId === mId &&
            activeTutorial?.day === d;
          const isDimmedCell = Boolean(activeTutorial && !isTargetCell && !isDimmedRow);

          if (reqOff) {
            const locReason = getRequestedOffReasonLocalized(reqOff.reason, mId, currentLang);
            const offLabelDesktop = t("ui.off_3", { locReason });
            const offLabelMobile = t("ui.off_2");
            return `
              <td class="shift-cell state-off cell-locked-pto ${isDimmedCell ? "is-tutorial-dimmed-cell" : ""}">
                <span class="locked-off-label" title="${locReason}">
                  <span class="locked-off-desktop">${offLabelDesktop}</span>
                  <span class="locked-off-mobile">${offLabelMobile}</span>
                </span>
              </td>
            `;
          }

          const isTutOff = isTargetCell && activeTutorial?.targetShift === "off";
          const isTutDay = isTargetCell && activeTutorial?.targetShift === "day";
          const isTutNight = isTargetCell && activeTutorial?.targetShift === "night";

          const tutStepPillText = activeTutorial
            ? t("ui.withLilith", { activeTutorial_stepIndex: activeTutorial.stepIndex, activeTutorial_totalSteps: activeTutorial.totalSteps })
            : "";
          const tutSkipBtnText = t("ui.buildOnMyOwn");

          const tutorialCalloutHtml =
            isTargetCell && activeTutorial
              ? `<div class="tutorial-callout-bubble" role="status">
                  <div class="tutorial-callout-header">
                    <span class="tutorial-step-pill">${tutStepPillText}</span>
                    <button type="button" class="tutorial-skip-btn" data-skip-tutorial="true">${tutSkipBtnText}</button>
                  </div>
                  <div class="tutorial-callout-text">${activeTutorial.shortCallout}</div>
                </div>`
              : "";

          // Check active synergy or conflict in this slot
          let activeConflictPartner = "";
          let activeSynergyPartner = "";
          if (currentShift !== "off") {
            for (const rel of currentStage.activeRelations) {
              const otherId =
                rel.monsterA === mId
                  ? rel.monsterB
                  : rel.monsterB === mId
                    ? rel.monsterA
                    : null;
              if (
                otherId &&
                currentStage.availableMonsters.includes(otherId) &&
                currentSchedule[otherId]?.[d] === currentShift
              ) {
                if (rel.moraleDelta < 0) {
                  activeConflictPartner = getMonsterLocalized(otherId, currentLang).name;
                } else if (rel.moraleDelta > 0 && !activeSynergyPartner) {
                  activeSynergyPartner = getMonsterLocalized(otherId, currentLang).name;
                }
              }
            }
          }

          let noteDesktop = "";
          let noteMobile = "";
          let noteClass = "";
          if (hasViolation) {
            noteDesktop = cellViolations[0];
            noteMobile = "⚠️NoConsecutive";
            noteClass = "is-error";
          } else if (activeConflictPartner) {
            noteDesktop = t("ui.clashW150", { activeConflictPartner });
            noteMobile = "⚡-150";
            noteClass = "is-conflict";
          } else if (activeSynergyPartner) {
            noteDesktop = t("ui.synergyW100", { activeSynergyPartner });
            noteMobile = "🤝+100";
            noteClass = "is-synergy";
          } else if (isFullMoonForbidden) {
            noteDesktop = t("ui.noFullMoonNight");
            noteMobile = "🚫FullMoon";
            noteClass = "is-info";
          }

          const noteHtml = noteDesktop
            ? `<div class="cell-note ${noteClass}">
                <span class="cell-note-desktop">${noteDesktop}</span>
                <span class="cell-note-mobile">${noteMobile}</span>
               </div>`
            : "";

          const fmTitle = t("ui.cannotWorkNightShiftOn", { m_name: m.name });

          const cycleLabel = t(`ui.${currentShift}`);
          const cycleIcon = currentShift === "day" ? "☀️" : currentShift === "night" ? "🌙" : "";
          const nextShiftPreview = getNextCycleShift(currentShift, isFullMoonForbidden);
          const nextShiftLabel = t(`ui.${nextShiftPreview}`);
          const cycleAriaLabel = t("ui.currentTapToChangeTo", { m_name: m.name, getDayLabel_d__currentLang: getDayLabel(d, currentLang), cycleLabel, nextShiftLabel });

          return `
            <td class="shift-cell state-${currentShift} ${hasViolation ? "has-violation" : ""} ${isTargetCell ? "is-tutorial-spotlight" : ""} ${isDimmedCell ? "is-tutorial-dimmed-cell" : ""}">
              ${tutorialCalloutHtml}
              <div class="shift-btn-group" role="group" aria-label="${m.name} ${getDayLabel(d, currentLang)}">
                <button
                  type="button"
                  class="shift-btn ${currentShift === "off" ? "active-off" : ""}"
                  data-monster="${mId}"
                  data-day="${d}"
                  data-shift="off"
                  ${isTutOff ? 'data-tutorial-target="true"' : ""}
                >${offBtnText}</button>
                <button
                  type="button"
                  class="shift-btn ${currentShift === "day" ? "active-day" : ""}"
                  data-monster="${mId}"
                  data-day="${d}"
                  data-shift="day"
                  ${isTutDay ? 'data-tutorial-target="true"' : ""}
                >${dayBtnText}</button>
                <button
                  type="button"
                  class="shift-btn ${currentShift === "night" ? "active-night" : ""}"
                  data-monster="${mId}"
                  data-day="${d}"
                  data-shift="night"
                  ${isFullMoonForbidden ? `disabled title="${fmTitle}"` : ""}
                  ${isTutNight ? 'data-tutorial-target="true"' : ""}
                >${nightBtnText}</button>
              </div>
              <button
                type="button"
                class="shift-cycle-btn state-${currentShift}"
                data-monster="${mId}"
                data-day="${d}"
                data-current-shift="${currentShift}"
                data-full-moon-forbidden="${isFullMoonForbidden ? "true" : "false"}"
                aria-label="${cycleAriaLabel}"
                ${isTargetCell ? 'data-tutorial-target="true"' : ""}
              >
                ${cycleIcon ? `<span class="cycle-shift-icon">${cycleIcon}</span>` : ""}
                <span class="cycle-shift-label">${cycleLabel}</span>
              </button>
              ${noteHtml}
            </td>
          `;
        })
        .join("");

      const workCounterLabel = t("ui.shifts", { assignedCount, m_maxWeeklyShifts: m.maxWeeklyShifts });
      const dayChipLabel = t("ui.day_3", { dayPower });
      const nightChipLabel = t("ui.night_3", { nightPower });
      const infoTooltip = t("ui.clickToViewSDetails", { m_name: m.name, m_usualPost: m.usualPost });

      return `
        <tr class="${isDimmedRow ? "is-tutorial-dimmed-row" : ""}">
          <th scope="row" class="monster-row-th">
            <div
              class="monster-cell-header"
              style="--monster-accent: ${m.accentColor}"
              data-monster-info="${mId}"
              role="button"
              tabindex="0"
              title="${infoTooltip}"
            >
              <img
                src="${m.portrait}"
                alt="${m.name}"
                width="48"
                height="48"
                class="monster-avatar"
                loading="lazy"
              />
              <div class="monster-meta">
                <div class="monster-name-row">
                  <span class="monster-name">${m.name}</span>
                  <span class="monster-work-counter ${isOverMax ? "over-limit" : ""}">
                    ${workCounterLabel}
                  </span>
                </div>
                <div class="monster-power-compare">
                  <span class="power-chip-day">${dayChipLabel}</span>
                  <span class="power-chip-night">${nightChipLabel}</span>
                  <span class="monster-post-chip">📍${m.usualPost}</span>
                </div>
                <span class="monster-rule-mini">${m.traitTitle}</span>
              </div>
            </div>
          </th>
          ${cellsHtml}
        </tr>
      `;
    })
    .join("");

  const dayGuardLabelDesktop = t("ui.dayWatch");
  const dayGuardLabelMobile = t("ui.day_4");
  const nightGuardLabelDesktop = t("ui.nightWatch");
  const nightGuardLabelMobile = t("ui.night_4");

  table.innerHTML = `
    ${theadHtml}
    <tbody>
      ${buildRaidRow("day", dayGuardLabelDesktop, dayGuardLabelMobile, "raid-row-day")}
      ${buildRaidRow("night", nightGuardLabelDesktop, nightGuardLabelMobile, "raid-row-night")}
      ${monsterRowsHtml}
    </tbody>
  `;

  table.querySelectorAll<HTMLButtonElement>("[data-skip-tutorial]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      tutorialSkipped = true;
      soundEngine.playClick("off");
      refreshEvaluationAndBoard(false);
      const lilith = getLilithProfileLocalized(currentLang);
      speakInDock({
        speaker: lilith.name,
        tag: lilith.title,
        portrait: lilith.portrait,
        text: t("ui.understoodFeelFreeToArrange"),
      });
    });
  });

  table.querySelectorAll<HTMLButtonElement>(".shift-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const mId = btn.dataset.monster as MonsterId;
      const day = Number(btn.dataset.day) as DayIndex;
      const shift = btn.dataset.shift as ShiftType;

      currentSchedule[mId][day] = shift;
      soundEngine.playClick(shift);
      refreshEvaluationAndBoard(true, { monsterId: mId, day, shift });
    });
  });

  table.querySelectorAll<HTMLButtonElement>(".shift-cycle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const mId = btn.dataset.monster as MonsterId;
      const day = Number(btn.dataset.day) as DayIndex;
      const isFmForbidden = btn.dataset.fullMoonForbidden === "true";
      const currentShift = currentSchedule[mId][day];
      const nextShift = getNextCycleShift(currentShift, isFmForbidden);

      currentSchedule[mId][day] = nextShift;
      soundEngine.playClick(nextShift);
      refreshEvaluationAndBoard(true, { monsterId: mId, day, shift: nextShift });
    });
  });

  table.querySelectorAll<HTMLElement>("[data-monster-info]").forEach((el) => {
    const showInfo = () => {
      const mId = el.getAttribute("data-monster-info") as MonsterId;
      const m = getMonsterLocalized(mId, currentLang);
      soundEngine.playClick("day");
      speakInDock({
        speaker: m.name,
        tag: t("ui.post", { m_title: m.title, m_race: m.race, m_usualPost: m.usualPost }),
        portrait: m.portrait,
        text: t("ui.text_2", { m_quotes_intro: m.quotes.intro, m_traitSummary: m.traitSummary }),
      });
    };
    el.addEventListener("click", showInfo);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showInfo();
      }
    });
  });
}

function updateDefaultDockMessage(lastMove?: {
  monsterId: MonsterId;
  day: DayIndex;
  shift: ShiftType;
}): void {
  const lilith = getLilithProfileLocalized(currentLang);
  const dispatchBtn = getEl<HTMLButtonElement>("btn-dispatch");
  const dispatchCallout = getEl<HTMLElement>("dispatch-tutorial-callout");
  dispatchBtn.removeAttribute("data-tutorial-target");
  dispatchCallout.hidden = true;
  dispatchCallout.innerHTML = "";

  const activeTutorial = getActiveTutorialStep();
  if (activeTutorial) {
    speakInDock({
      speaker: lilith.name,
      tag: t("ui.schedulingWithLilith", { activeTutorial_stepIndex: activeTutorial.stepIndex, activeTutorial_totalSteps: activeTutorial.totalSteps }),
      portrait: lilith.portrait,
      text: activeTutorial.instruction,
    });
    return;
  }

  if (currentStage.tutorialSteps && !tutorialSkipped && currentEvaluation.isValid) {
    dispatchBtn.setAttribute("data-tutorial-target", "true");
    dispatchCallout.hidden = false;
    const pillDone = t("ui.scheduleComplete");
    const calloutText = t("ui.our3DayShiftSchedule");
    dispatchCallout.innerHTML = `
      <div class="tutorial-callout-header">
        <span class="tutorial-step-pill">${pillDone}</span>
      </div>
      <div class="tutorial-callout-text">${calloutText}</div>
    `;
    speakInDock({
      speaker: lilith.name,
      tag: pillDone,
      portrait: lilith.portrait,
      text: t("ui.thankYouWeHavePut"),
    });
    return;
  }

  // Check if the player's last move caused a specific labor rule violation
  if (lastMove) {
    const moveViolation = currentEvaluation.violations.find(
      (v) =>
        v.monsterId === lastMove.monsterId &&
        v.category !== "raid_power" &&
        v.category !== "min_staff"
    );
    if (moveViolation) {
      const locV = getViolationLocalized(moveViolation, currentStage, currentLang);
      speakInDock({
        speaker: lilith.name,
        tag: t("ui.workRuleCheck"),
        portrait: lilith.portrait,
        text: locV.message,
      });
      return;
    }

    // Check if the player's last move triggered an incompatible pair (-150)
    if (lastMove.shift !== "off") {
      for (const rel of currentStage.activeRelations) {
        const otherId =
          rel.monsterA === lastMove.monsterId
            ? rel.monsterB
            : rel.monsterB === lastMove.monsterId
              ? rel.monsterA
              : null;
        if (
          otherId &&
          rel.moraleDelta < 0 &&
          currentStage.availableMonsters.includes(otherId) &&
          currentSchedule[otherId]?.[lastMove.day] === lastMove.shift
        ) {
          const m = getMonsterLocalized(lastMove.monsterId, currentLang);
          const other = getMonsterLocalized(otherId, currentLang);
          const locRel = getRelationLocalized(rel, currentLang);
          speakInDock({
            speaker: m.name,
            tag: t("ui.shiftClashDefenseWith", { rel_moraleDelta: rel.moraleDelta, other_name: other.name }),
            portrait: m.portrait,
            text: t("ui.assigningBothToTheSame", { locRel_description: locRel.description, moraleDelta: Math.abs(rel.moraleDelta) }),
          });
          return;
        }
      }
    }
  }

  if (currentEvaluation.isValid) {
    speakInDock({
      speaker: lilith.name,
      tag: t("ui.ready"),
      portrait: lilith.portrait,
      text: t("ui.everyTimeSlotIsWell"),
    });
    return;
  }

  const laborViolations = currentEvaluation.violations.filter(
    (v) => v.category !== "raid_power" && v.category !== "min_staff"
  );
  if (laborViolations.length > 0) {
    const locV = getViolationLocalized(laborViolations[0], currentStage, currentLang);
    speakInDock({
      speaker: lilith.name,
      tag: t("ui.workRuleCheck"),
      portrait: lilith.portrait,
      text: locV.message,
    });
    return;
  }

  if (lastMove && lastMove.shift !== "off") {
    const m = getMonsterLocalized(lastMove.monsterId, currentLang);
    const quote = lastMove.shift === "day" ? m.quotes.dayAssign : m.quotes.nightAssign;
    // Also check if a positive synergy was triggered
    for (const rel of currentStage.activeRelations) {
      const otherId =
        rel.monsterA === lastMove.monsterId
          ? rel.monsterB
          : rel.monsterB === lastMove.monsterId
            ? rel.monsterA
            : null;
      if (
        otherId &&
        rel.moraleDelta > 0 &&
        currentStage.availableMonsters.includes(otherId) &&
        currentSchedule[otherId]?.[lastMove.day] === lastMove.shift
      ) {
        const other = getMonsterLocalized(otherId, currentLang);
        const locRel = getRelationLocalized(rel, currentLang);
        speakInDock({
          speaker: m.name,
          tag: t("ui.pairSynergyWith", { rel_moraleDelta: rel.moraleDelta, other_name: other.name }),
          portrait: m.portrait,
          text: t("ui.text_3", { quote, locRel_description: locRel.description }),
        });
        return;
      }
    }

    const dLabel = getDayLabel(lastMove.day, currentLang);
    const sLabel =
      lastMove.shift === "day"
        ? t("ui.dayShift")
        : t("ui.nightShift");
    speakInDock({
      speaker: m.name,
      tag: `${dLabel} · ${sLabel}`,
      portrait: m.portrait,
      text: t("ui.text_4", { quote }),
    });
    return;
  }

  const locStage = getStageLocalized(currentStage, currentLang);
  speakInDock({
    speaker: lilith.name,
    tag: lilith.title,
    portrait: lilith.portrait,
    text: locStage.lilithIntro,
  });
}

function renderStageHeading(): void {
  const headingEl = document.getElementById("stage-heading");
  const mobileHeadingEl = document.getElementById("mobile-stage-heading");
  const locStage = getStageLocalized(currentStage, currentLang);
  const diffLabel = currentStage.difficultyTier
    ? getDifficultyLabelLocalized(currentStage.difficultyTier, currentLang)
    : currentStage.difficultyLabel;
  const fullTitle =
    currentStageIndex >= 0
      ? locStage.title
      : `${locStage.title}${
          diffLabel
            ? t("ui.difficulty_2", { diffLabel })
            : ""
        }`;
  if (headingEl) {
    headingEl.textContent = fullTitle;
  }
  if (mobileHeadingEl) {
    mobileHeadingEl.textContent = locStage.title;
  }
}

function refreshEvaluationAndBoard(
  updateSpeech = true,
  lastMove?: { monsterId: MonsterId; day: DayIndex; shift: ShiftType }
): void {
  currentEvaluation = evaluateSchedule(currentStage, currentSchedule);
  renderStageHeading();
  renderShiftMatrix();
  renderGoalTrackerAndHud();
  renderPairBonusStrip();
  if (updateSpeech) {
    updateDefaultDockMessage(lastMove);
  }
}

function renderGoalTrackerAndHud(): void {
  const totalSlots = currentEvaluation.slotStatuses.length;
  const staffOkSlots = currentEvaluation.slotStatuses.filter((s) => s.staffMet).length;
  const predOkSlots = currentEvaluation.slotStatuses.filter(
    (s) => s.currentPower >= s.expectedPower
  ).length;
  const laborViolations = currentEvaluation.violations.filter(
    (v) => v.category !== "min_staff" && v.category !== "raid_power"
  );

  const stepStaffEl = getEl<HTMLElement>("goal-step-staff");
  const allStaffOk = staffOkSlots === totalSlots;
  stepStaffEl.className = `cond-pill ${allStaffOk ? "is-ok" : "is-ng"}`;
  stepStaffEl.textContent = t("ui.staff_2", { staffOkSlots, totalSlots });

  const stepPowerEl = getEl<HTMLElement>("goal-step-power");
  const allPredOk = predOkSlots === totalSlots;
  stepPowerEl.className = `cond-pill ${allPredOk ? "is-ok" : "is-ng"}`;
  stepPowerEl.textContent = t("ui.estPower", { predOkSlots, totalSlots });

  const stepLawEl = getEl<HTMLElement>("goal-step-law");
  const allLawOk = laborViolations.length === 0;
  stepLawEl.className = `cond-pill ${allLawOk ? "is-ok" : "is-ng"}`;
  stepLawEl.textContent = allLawOk
    ? t("ui.workRulesOk")
    : t("ui.ruleIssues", { laborViolations_length: laborViolations.length });

  const dispatchBtn = getEl<HTMLButtonElement>("btn-dispatch");
  if (currentEvaluation.canDispatch) {
    dispatchBtn.classList.add("is-ready");
  } else {
    dispatchBtn.classList.remove("is-ready");
  }
}

function renderSynergyDialogContent(): void {
  const listEl = document.getElementById("synergy-dialog-list");
  if (!listEl) return;
  const activeRels = currentStage.activeRelations.filter(
    (r) =>
      currentStage.availableMonsters.includes(r.monsterA) &&
      currentStage.availableMonsters.includes(r.monsterB)
  );
  if (activeRels.length === 0) {
    listEl.innerHTML = `<p class="synergy-desc">${t("ui.thereAreNoSpecialPair")}</p>`;
    return;
  }
  listEl.innerHTML = activeRels
    .map((rel) => {
      const mA = getMonsterLocalized(rel.monsterA, currentLang);
      const mB = getMonsterLocalized(rel.monsterB, currentLang);
      const locRel = getRelationLocalized(rel, currentLang);
      const isPos = rel.moraleDelta >= 0;
      const sign = isPos ? `+${rel.moraleDelta}` : `${rel.moraleDelta}`;
      const badgeText = isPos
        ? t("ui.synergy_2", { rel_moraleDelta: rel.moraleDelta })
        : t("ui.clash", { rel_moraleDelta: rel.moraleDelta });
      return `
        <div class="synergy-item-card ${isPos ? "is-positive" : "is-negative"}">
          <div class="synergy-item-header">
            <span>${mA.name} × ${mB.name}</span>
            <span class="synergy-badge ${isPos ? "is-pos" : "is-neg"}">${badgeText}</span>
          </div>
          <p class="synergy-item-desc">${locRel.description}</p>
        </div>
      `;
    })
    .join("");
}

function openSynergyDialog(): void {
  renderSynergyDialogContent();
  const dlg = document.getElementById("synergy-dialog") as HTMLDialogElement | null;
  if (dlg && !dlg.open) {
    dlg.showModal();
  }
}

function renderMobileStageNav(): void {
  const container = document.getElementById("mobile-stage-nav");
  if (!container) return;
  const campaignHtml = CAMPAIGN_STAGES.map((s, idx) => {
    const isUnlocked =
      saveData.unlockAllDemo ||
      idx <= saveData.unlockedStageIndex ||
      idx + 1 <= saveData.highestUnlockedWeek;
    const isCurrent = idx === currentStageIndex;
    const shortMonth = formatCastleCalendarMonthLocalized(s.weekNumber, true, currentLang);
    return `
      <button
        type="button"
        class="stage-pill-btn ${isCurrent ? "is-current is-active" : ""} ${isUnlocked ? "is-unlocked" : "is-locked"}"
        data-stage-index="${idx}"
        ${isUnlocked ? "" : "disabled"}
      >
        <span>${shortMonth}</span>
        <span>${isCurrent ? "▶" : ""}</span>
      </button>
    `;
  }).join("");

  const endlessUnlocked = isEndlessModeUnlocked(saveData);
  const isEndlessActive = currentStageIndex === -1;
  const endlessWeek = isEndlessActive
    ? currentStage.weekNumber
    : Math.max(CAMPAIGN_STAGES.length + 1, saveData.highestUnlockedWeek);
  const endlessMonth = formatCastleCalendarMonthLocalized(endlessWeek, true, currentLang);
  const endlessBtnHtml = `
    <button
      type="button"
      class="stage-pill-btn stage-pill-endless ${isEndlessActive ? "is-current is-active" : ""} ${endlessUnlocked ? "is-unlocked" : "is-locked"}"
      data-stage-random="true"
      ${endlessUnlocked ? "" : "disabled"}
    >
      <span>${endlessMonth}</span>
      <span>${isEndlessActive ? "▶" : !endlessUnlocked ? "🔒" : ""}</span>
    </button>
  `;

  container.innerHTML = campaignHtml + endlessBtnHtml;

  container.querySelectorAll<HTMLButtonElement>("[data-stage-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-stage-index"));
      const dlg = document.getElementById("mobile-menu-dialog") as HTMLDialogElement | null;
      if (dlg) dlg.close();
      soundEngine.playClick("day");
      void loadCampaignStage(idx, true);
    });
  });

  container.querySelector<HTMLButtonElement>("[data-stage-random]")?.addEventListener("click", () => {
    if (!isEndlessModeUnlocked(saveData)) return;
    const dlg = document.getElementById("mobile-menu-dialog") as HTMLDialogElement | null;
    if (dlg) dlg.close();
    soundEngine.playClick("night");
    const targetWeek = Math.max(CAMPAIGN_STAGES.length + 1, saveData.highestUnlockedWeek);
    void loadEndlessStage(targetWeek, true);
  });
}

function openMobileMenuDialog(): void {
  renderMobileStageNav();
  const dlg = document.getElementById("mobile-menu-dialog") as HTMLDialogElement | null;
  if (dlg && !dlg.open) {
    dlg.showModal();
  }
}

function renderPairBonusStrip(): void {
  const strip = getEl<HTMLElement>("pair-bonus-strip");
  const activeRels = currentStage.activeRelations.filter(
    (r) =>
      currentStage.availableMonsters.includes(r.monsterA) &&
      currentStage.availableMonsters.includes(r.monsterB)
  );
  if (activeRels.length === 0) {
    strip.innerHTML = "";
    return;
  }
  strip.innerHTML = activeRels
    .map((rel, idx) => {
      const mA = getMonsterLocalized(rel.monsterA, currentLang);
      const mB = getMonsterLocalized(rel.monsterB, currentLang);
      const locRel = getRelationLocalized(rel, currentLang);
      const isPos = rel.moraleDelta >= 0;
      const sign = isPos ? `+${rel.moraleDelta}` : `${rel.moraleDelta}`;
      const prefixDesktop = isPos
        ? t("ui.synergy_3")
        : t("ui.clash_2");
      const prefixMobile = isPos ? "🤝" : "⚡";
      return `<button type="button" class="pair-chip ${isPos ? "is-positive" : "is-negative"}" data-rel-idx="${idx}" title="${locRel.description}"><span class="pair-chip-desktop">${prefixDesktop}: ${mA.name}×${mB.name} (${sign})</span><span class="pair-chip-mobile">${prefixMobile} ${mA.name}×${mB.name} (${sign})</span></button>`;
    })
    .join("");

  strip.querySelectorAll<HTMLButtonElement>("[data-rel-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-rel-idx"));
      const rel = activeRels[idx];
      if (!rel) return;
      const mA = getMonsterLocalized(rel.monsterA, currentLang);
      const mB = getMonsterLocalized(rel.monsterB, currentLang);
      const locRel = getRelationLocalized(rel, currentLang);
      const lilith = getLilithProfileLocalized(currentLang);
      const isPos = rel.moraleDelta >= 0;
      soundEngine.playClick(isPos ? "day" : "off");
      speakInDock({
        speaker: isPos ? mA.name : lilith.name,
        tag: isPos
          ? t("ui.synergyTogether", { mA_name: mA.name, mB_name: mB.name, rel_moraleDelta: rel.moraleDelta })
          : t("ui.clashTogether", { mA_name: mA.name, mB_name: mB.name, rel_moraleDelta: rel.moraleDelta }),
        portrait: isPos ? mA.portrait : lilith.portrait,
        text: locRel.description,
      });
    });
  });
}

// ============================================================================
// Helpful Actions: 1-Cell Hint, Situation Check & Optimal Schedule Reveal
// ============================================================================

async function giveOneCellHint(): Promise<void> {
  const activeGen = stageLoadGeneration;
  const activeStageId = currentStage.id;
  hintsUsedThisStage++;
  if (!cachedOptimalResult) {
    const solved = await solveOptimalSchedule(currentStage);
    if (activeGen !== stageLoadGeneration || currentStage.id !== activeStageId) return;
    cachedOptimalResult = solved;
  }
  const opt = cachedOptimalResult.optimalSchedule;
  const days = getStageDays(currentStage);
  const lilith = getLilithProfileLocalized(currentLang);
  const locStage = getStageLocalized(currentStage, currentLang);
  const hintTag = t("ui.hint");
  const shiftLabelOf = (s: ShiftType) =>
    s === "day"
      ? t("ui.day_2")
      : s === "night"
        ? t("ui.night_2")
        : t("ui.off_2");

  for (const v of currentEvaluation.violations) {
    if (v.monsterId && v.day !== undefined) {
      const target = opt[v.monsterId][v.day];
      if (currentSchedule[v.monsterId][v.day] !== target) {
        currentSchedule[v.monsterId][v.day] = target;
        soundEngine.playClick(target);
        refreshEvaluationAndBoard(false);
        const mName = getMonsterLocalized(v.monsterId, currentLang).name;
        const dLabel = getDayLabel(v.day, currentLang);
        const sLabel = shiftLabelOf(target);
        speakInDock({
          speaker: lilith.name,
          tag: hintTag,
          portrait: lilith.portrait,
          text: t("ui.toResolveAWorkRule", { mName, dLabel, sLabel }),
        });
        return;
      }
    }
  }

  for (const d of days) {
    for (const mId of currentStage.availableMonsters) {
      const target = opt[mId][d];
      if (currentSchedule[mId][d] !== target && target !== "off") {
        currentSchedule[mId][d] = target;
        soundEngine.playClick(target);
        refreshEvaluationAndBoard(false);
        const mName = getMonsterLocalized(mId, currentLang).name;
        const dLabel = getDayLabel(d, currentLang);
        const sLabel = shiftLabelOf(target);
        speakInDock({
          speaker: lilith.name,
          tag: hintTag,
          portrait: lilith.portrait,
          text: t("ui.assignedOnTo", { mName, dLabel, sLabel, locStage_lilithHint: locStage.lilithHint }),
        });
        return;
      }
    }
  }

  for (const d of days) {
    for (const mId of currentStage.availableMonsters) {
      const target = opt[mId][d];
      if (currentSchedule[mId][d] !== target) {
        currentSchedule[mId][d] = target;
        soundEngine.playClick(target);
        refreshEvaluationAndBoard(false);
        const mName = getMonsterLocalized(mId, currentLang).name;
        const dLabel = getDayLabel(d, currentLang);
        const sLabel = shiftLabelOf(target);
        speakInDock({
          speaker: lilith.name,
          tag: hintTag,
          portrait: lilith.portrait,
          text: t("ui.adjustedOnToForAn", { mName, dLabel, sLabel }),
        });
        return;
      }
    }
  }

  soundEngine.playSolveSuccess();
  speakInDock({
    speaker: lilith.name,
    tag: hintTag,
    portrait: lilith.portrait,
    text: t("ui.yourScheduleAlreadyMatchesThe"),
  });
}

async function runLilithDiagnosis(): Promise<void> {
  const activeGen = stageLoadGeneration;
  const activeStageId = currentStage.id;
  const lilith = getLilithProfileLocalized(currentLang);
  const statusTag = t("ui.statusCheck");
  try {
    const diag = await diagnoseScheduleWithHighs(currentStage, currentSchedule);
    if (activeGen !== stageLoadGeneration || currentStage.id !== activeStageId) return;
    if (diag.status === "Feasible") {
      soundEngine.playSolveSuccess();
      speakInDock({
        speaker: lilith.name,
        tag: statusTag,
        portrait: lilith.portrait,
        text: t("ui.yourCurrentlyPlacedShiftsHave"),
      });
    } else {
      soundEngine.playError();
      const reasonText =
        currentLang === "ja"
          ? (diag.messages[0] ?? t("ui.defaultDiagMessage"))
          : t("ui.someGuardsCurrentAssignmentsAr");
      speakInDock({
        speaker: lilith.name,
        tag: statusTag,
        portrait: lilith.portrait,
        text: t("ui.tryResettingAFewShifts", { reasonText }),
      });
    }
  } catch (err) {
    console.error("Diagnosis failed:", err);
  }
}

function formatShiftChipText(shift: ShiftType): string {
  if (shift === "day") {
    return t("ui.day_5");
  }
  if (shift === "night") {
    return t("ui.night_5");
  }
  return t("ui.off_2");
}

function getLocalizedDayLabels(): readonly string[] {
  return ([0, 1, 2, 3, 4] as DayIndex[]).map((d) => getDayLabel(d, currentLang));
}

function getLocalizedMonster(mId: MonsterId) {
  return getMonsterLocalized(mId, currentLang);
}

function getLocalizedStage(st: StageScenario) {
  return getStageLocalized(st, currentLang);
}

function getLocalizedSlotEnemyInfo(req: StageScenario["requirements"][number]) {
  return getRequirementLocalized(req, currentLang);
}

function localizeViolationMessage(v: ScheduleEvaluation["violations"][number], lang: GameLang): string {
  return getViolationLocalized(v, currentStage, lang).message;
}

function getLocalizedPairDescription(r: (typeof ALL_PAIR_RELATIONS)[number]): string {
  return getRelationLocalized(r, currentLang).description;
}

function getLocalizedPrologueSlides() {
  return getPrologueSlidesLocalized(currentLang);
}

function formatCastleCalendarMonth(weekNumber: number): string {
  return formatCastleCalendarMonthLocalized(weekNumber, true, currentLang);
}

function getDifficultyLabel(tier: ReturnType<typeof computeAdaptiveDifficultyTier>): string {
  return getDifficultyLabelLocalized(tier, currentLang);
}

function renderOptimalComparisonHtml(
  stage: StageScenario,
  playerSchedule: ScheduleGrid,
  playerEval: ScheduleEvaluation,
  optimalResult: OptimalSolveResult,
  outcomes: readonly SlotBattleOutcome[]
): string {
  const days = getStageDays(stage);
  const optSchedule = optimalResult.optimalSchedule;
  const optEval = evaluateSchedule(stage, optSchedule);
  const dayLabels = getLocalizedDayLabels();

  const dayHeaders = days.map((d) => `<th scope="col">${dayLabels[d]}</th>`).join("");

  const monsterRows = stage.availableMonsters
    .map((mId) => {
      const m = getLocalizedMonster(mId);
      const cells = days
        .map((d) => {
          const pShift = playerSchedule[mId]?.[d] ?? "off";
          const oShift = optSchedule[mId]?.[d] ?? "off";
          const isMatch = pShift === oShift;
          if (isMatch) {
            return `<td class="cmp-td is-match">
              <div class="cmp-cell-inner">
                <span class="cmp-shift-pill is-${oShift}">${formatShiftChipText(oShift)}</span>
                <span class="cmp-match-label">${t("ui.match")}</span>
              </div>
            </td>`;
          }
          return `<td class="cmp-td is-diff">
            <div class="cmp-cell-inner">
              <span class="cmp-from-pill">${t("ui.you")}:${formatShiftChipText(pShift)}</span>
              <span class="cmp-diff-arrow">▶</span>
              <span class="cmp-shift-pill is-${oShift}">${t("ui.mod")}:${formatShiftChipText(oShift)}</span>
            </div>
          </td>`;
        })
        .join("");

      return `<tr>
        <th scope="row" class="cmp-monster-th">
          <img src="${m.portrait}" alt="${m.name}" width="26" height="26" class="cmp-mini-avatar" />
          <span>${m.name}</span>
        </th>
        ${cells}
      </tr>`;
    })
    .join("");

  const slotCompareItems = stage.requirements
    .map((req, idx) => {
      const pSlot = playerEval.slotStatuses.find((s) => s.day === req.day && s.shift === req.shift);
      const oSlot = optEval.slotStatuses.find((s) => s.day === req.day && s.shift === req.shift);
      const outcome = outcomes[idx];
      const shiftIcon = req.shift === "day" ? "☀️" : req.isFullMoon ? "🌕" : "🌙";
      const shiftLabel = req.shift === "day"
        ? t("ui.day_2")
        : t("ui.night_2");
      const pPower = pSlot?.currentPower ?? 0;
      const oPower = oSlot?.currentPower ?? 0;
      const expectedEnemy = pSlot?.expectedPower ?? req.requiredPower;
      const sep = t("ui.text_5");
      const noneTxt = t("ui.none");
      const pNames =
        pSlot && pSlot.assignedMonsters.length > 0
          ? pSlot.assignedMonsters.map((id) => getLocalizedMonster(id).name).join(sep)
          : noneTxt;
      const oNames =
        oSlot && oSlot.assignedMonsters.length > 0
          ? oSlot.assignedMonsters.map((id) => getLocalizedMonster(id).name).join(sep)
          : noneTxt;
      const isBreached = outcome && !outcome.isWin;
      const hadRaid = outcome ? outcome.hasRaid !== false : true;
      const actualText = !hadRaid
        ? t("ui.noRaidEst", { expectedEnemy })
        : outcome
          ? t("ui.actualEst", { outcome_actualEnemyPower: outcome.actualEnemyPower, expectedEnemy })
          : t("ui.est", { expectedEnemy });
      return `<div class="cmp-slot-card ${isBreached ? "is-breached" : ""}">
        <div class="cmp-slot-head">
          <span>${shiftIcon} ${dayLabels[req.day]} · ${shiftLabel} (${t("ui.enemy")}${actualText})</span>
          ${isBreached ? `<span class="cmp-breach-tag">💥 ${t("ui.breachedSlot")}</span>` : ""}
        </div>
        <div class="cmp-slot-body">
          <div class="cmp-slot-line is-player">${t("ui.yoursStrongDefStrong", { pPower, pNames })}</div>
          <div class="cmp-slot-line is-optimal">${t("ui.modelStrongDefStrong", { oPower, oNames })}</div>
        </div>
      </div>`;
    })
    .join("");

  return `
    <div class="optimal-compare-box">
      <div class="optimal-compare-header">
        <div>
          <h4 class="optimal-compare-title">${t("ui.yourShiftVsModelShift")}</h4>
          <p class="optimal-compare-sub">${t("ui.goldBorderedCellsDifferFrom")}</p>
        </div>
        <div class="optimal-compare-totals">
          <span class="cmp-total-pill">${t("ui.yourTotalDefenseStrongStrong", { playerEval_totalScore: playerEval.totalScore })}</span>
          <span class="cmp-total-pill is-opt">${t("ui.modelTotalDefenseStrongStrong", { optEval_totalScore: optEval.totalScore })}</span>
        </div>
      </div>

      <div class="cmp-table-wrap">
        <table class="shift-compare-table" aria-label="${t("ui.shiftComparisonTable")}">
          <thead>
            <tr>
              <th scope="col">${t("ui.guard")}</th>
              ${dayHeaders}
            </tr>
          </thead>
          <tbody>
            ${monsterRows}
          </tbody>
        </table>
      </div>

      <div class="cmp-slot-grid">
        ${slotCompareItems}
      </div>
    </div>
  `;
}

// ============================================================================
// Scene 5 & 6: Sequential Probabilistic Defense Animation & Result Dialog
// ============================================================================

export function recordStageBreachFailure(): void {
  const retryKey = `week-${currentStage.weekNumber}`;
  const nextRetryCount = (saveData.stageRetryCounts[retryKey] ?? 0) + 1;
  saveData.stageRetryCounts[retryKey] = nextRetryCount;
  failedAttemptsThisStage = Math.max(failedAttemptsThisStage + 1, nextRetryCount);
  saveData.stageFailedAttempts[retryKey] = failedAttemptsThisStage;
  persistSaveData(saveData);
}

export function recordStageVictory(remainingHp: number, maxHp: number): "S" | "A" | "B" {
  const rank: "S" | "A" | "B" = currentEvaluation.isValid ? "S" : "A";
  const prevRank = saveData.clearedRanks[currentStage.id];
  const rankOrder = { S: 3, A: 2, B: 1 };
  if (!prevRank || rankOrder[rank] > rankOrder[prevRank]) {
    saveData.clearedRanks[currentStage.id] = rank;
  }
  if (currentStageIndex >= 0 && currentStageIndex + 1 > saveData.unlockedStageIndex) {
    saveData.unlockedStageIndex = Math.min(CAMPAIGN_STAGES.length - 1, currentStageIndex + 1);
  }
  const nextWeekNumber = currentStage.weekNumber + 1;
  saveData.highestUnlockedWeek = Math.max(saveData.highestUnlockedWeek, nextWeekNumber);
  const hpRatio = remainingHp / maxHp;
  const retryKey = `week-${currentStage.weekNumber}`;
  saveData.playHistory = [
    ...saveData.playHistory.slice(-19),
    {
      weekNumber: currentStage.weekNumber,
      rank,
      scoreRatio: Number(hpRatio.toFixed(2)),
      hintsUsed: hintsUsedThisStage,
      failedAttempts: failedAttemptsThisStage,
    },
  ];
  saveData.stageFailedAttempts[retryKey] = 0;
  saveData.openingMovieSeen = true;
  persistSaveData(saveData);
  return rank;
}

export function getActiveStageStateForTest() {
  return {
    currentStage,
    currentStageIndex,
    failedAttemptsThisStage,
    saveData,
  };
}

export function resetSaveDataForTest(): void {
  stageLoadGeneration++;
  saveData = {
    unlockedStageIndex: 0,
    highestUnlockedWeek: 1,
    clearedRanks: {},
    playHistory: [],
    stageRetryCounts: {},
    stageFailedAttempts: {},
    unlockAllDemo: false,
  };
  failedAttemptsThisStage = 0;
  hintsUsedThisStage = 0;
}

let battleAnimAbort: (() => void) | null = null;

function renderHpOrbsHtml(remainingHp: number, maxHp: number, justLostIndex = -1): string {
  const orbs: string[] = [];
  for (let i = 0; i < maxHp; i++) {
    const isLost = i >= remainingHp;
    const isJustShattered = i === justLostIndex;
    orbs.push(
      `<span class="hp-orb ${isLost ? "is-lost" : ""} ${isJustShattered ? "is-just-shattered" : ""}"></span>`
    );
  }
  const statusLabelDesktop =
    remainingHp > 0
      ? t("ui.gateIntactAllRaidsMust")
      : t("ui.gateBreachedFallen");
  const statusLabelMobile =
    remainingHp > 0
      ? t("ui.gateIntact")
      : t("ui.breached");
  return `<span class="castle-hp-orbs">${orbs.join("")} <span class="hp-label-desktop">${statusLabelDesktop}</span><span class="hp-label-mobile">${statusLabelMobile}</span></span>`;
}

function renderBattleDefenderAvatarsHtml(outcome: SlotBattleOutcome): string {
  if (outcome.assignedMonsters.length === 0) {
    return `<div class="battle-party-avatars"><img class="battle-unit-avatar is-empty" src="./char-lilith.jpg" alt="${t("ui.unassigned")}" width="52" height="52" /></div>`;
  }
  const imgs = outcome.assignedMonsters
    .map((mId) => {
      const m = getLocalizedMonster(mId);
      return `<img class="battle-unit-avatar ${outcome.hasSynergy ? "has-synergy-glow" : ""}" src="${m.portrait}" alt="${m.name}" title="${m.name}" width="54" height="54" />`;
    })
    .join("");
  const synChip = outcome.hasSynergy
    ? `<span class="battle-synergy-chip">✨ ${t("ui.synergy100")}</span>`
    : "";
  const conflictChip = outcome.hasConflict
    ? `<span class="battle-conflict-chip">⚡ ${t("ui.friction150")}</span>`
    : "";
  return `<div class="battle-party-avatars">${imgs}${synChip}${conflictChip}</div>`;
}

async function openDispatchResultDialog(): Promise<void> {
  if (battleAnimAbort) {
    battleAnimAbort();
    battleAnimAbort = null;
  }

  const dialog = getEl<HTMLDialogElement>("result-dialog");
  const body = getEl<HTMLElement>("result-dialog-body");
  dialog.classList.remove("is-breach-shake", "is-fullscreen-battle");

  const activeGen = stageLoadGeneration;
  const activeStageId = currentStage.id;
  if (!cachedOptimalResult) {
    const solved = await solveOptimalSchedule(currentStage);
    if (activeGen !== stageLoadGeneration || currentStage.id !== activeStageId) return;
    cachedOptimalResult = solved;
  }

  const laborViolations = currentEvaluation.violations.filter(
    (v) => v.category !== "raid_power" && v.category !== "min_staff"
  );

  // Block dispatch only if there are labor violations or zero guards assigned
  if (!currentEvaluation.canDispatch) {
    failedAttemptsThisStage++;
    const retryKey = `week-${currentStage.weekNumber}`;
    saveData.stageFailedAttempts[retryKey] = failedAttemptsThisStage;
    persistSaveData(saveData);
    soundEngine.playError();
    const issues =
      laborViolations.length > 0
        ? laborViolations.map((v) => `<li class="violation-item">${localizeViolationMessage(v, currentLang)}</li>`).join("")
        : `<li class="violation-item">${t("ui.noGuardsAreAssignedYet")}</li>`;

    body.innerHTML = `
      <div class="result-rank-banner" style="border-color: var(--danger-crimson);">
        <div class="result-rank-letter" style="color: var(--danger-crimson);">${t("ui.shiftRulesCheck")}</div>
        <p style="margin: 0.4rem 0 0; font-size: 0.84rem; color: var(--text-muted);">
          ${t("ui.pleaseResolveTheFollowingShift")}
        </p>
      </div>
      <ul class="violation-list" style="margin-bottom:1rem;">${issues}</ul>
      <div style="display:flex;gap:0.6rem;justify-content:flex-end;flex-wrap:wrap;">
        <button id="btn-modal-hint" type="button" class="btn-glass">
          ${t("ui.show1CellHint")}
        </button>
        <button id="btn-modal-retry" type="button" class="btn-dispatch" style="width:auto;padding:0.55rem 1.2rem;">
          ${t("ui.returnToShiftTable")}
        </button>
      </div>
    `;
    dialog.showModal();
    document.getElementById("btn-modal-hint")?.addEventListener("click", () => {
      dialog.close();
      void giveOneCellHint();
    });
    document.getElementById("btn-modal-retry")?.addEventListener("click", () => {
      dialog.close();
    });
    return;
  }

  // Enter full-screen theatrical battle & result mode
  dialog.classList.add("is-fullscreen-battle");

  // Start in calm watch atmosphere; the Dragon Quest–style Battle BGM erupts the moment an enemy squad appears
  soundEngine.setSceneTrack("prologue");
  syncAudioButtonUi();

  // Roll actual enemy combat powers from the truncated log-normal distribution
  const outcomes: SlotBattleOutcome[] = rollStageBattles(currentStage, currentEvaluation);
  const maxHp: number = BALANCE_CONFIG.castleMaxHp;
  let remainingHp: number = maxHp;
  const dayLabels = getLocalizedDayLabels();
  const stageLoc = getLocalizedStage(currentStage);

  const localizeOutcomeText = (o: SlotBattleOutcome) => {
    const req = currentStage.requirements.find((r) => r.day === o.day && r.shift === o.shift);
    const enemyInfo = req ? getLocalizedSlotEnemyInfo(req) : null;
    const enemyName = enemyInfo?.enemyName ?? o.enemyName;
    const enemyQuote = enemyInfo?.enemyQuote ?? o.enemyQuote;

    let defenderName: string;
    let defenderQuote: string;
    if (o.assignedMonsters.length === 0) {
      defenderName = t("ui.unassignedUnguarded");
      defenderQuote = t("ui.noGuardsAreStationedHere");
    } else {
      const leadM = getLocalizedMonster(o.assignedMonsters[0]);
      defenderName =
        o.assignedMonsters.length === 1
          ? leadM.name
          : currentLang === "en"
            ? `${leadM.name} +${o.assignedMonsters.length - 1}`
            : currentLang === "zh"
              ? `${leadM.name} +${o.assignedMonsters.length - 1}`
              : `${leadM.name} +${o.assignedMonsters.length - 1}`;
      defenderQuote =
        currentLang === "ja"
          ? o.defenderQuote
          : o.isWin
            ? leadM.quotes.happy
            : leadM.quotes.angry;
    }
    return { enemyName, enemyQuote, defenderName, defenderQuote };
  };

  const initialSlotsHtml = outcomes
    .map((o, idx) => {
      const locO = localizeOutcomeText(o);
      const shiftIcon = o.shift === "day" ? "☀️" : o.isFullMoon ? "🌕" : "🌙";
      const shiftLabel = o.shift === "day"
        ? t("ui.day_2")
        : t("ui.night_2");
      const miniAvatars = o.assignedMonsters
        .map((mId) => {
          const m = getLocalizedMonster(mId);
          return `<img class="log-mini-avatar" src="${m.portrait}" alt="${m.name}" width="20" height="20" />`;
        })
        .join("");
      return `<div id="battle-slot-row-${idx}" class="battle-slot-item is-pending">
        <div class="battle-slot-left">
          <span class="battle-slot-time">${shiftIcon} ${dayLabels[o.day]} · ${shiftLabel}</span>
          <span class="battle-slot-avatars">${miniAvatars}</span>
          <span class="battle-slot-enemy">${locO.enemyName}</span>
        </div>
        <span id="battle-slot-res-${idx}" class="battle-slot-res">${t("ui.defVsEst", { o_defensePower: o.defensePower, o_expectedEnemyPower: o.expectedEnemyPower })}</span>
      </div>`;
    })
    .join("");

  body.innerHTML = `
    <div class="battle-fs-shell">
      <header id="gate-sanctum-banner" class="salamander-sanctum-banner battle-fs-topbar">
        <div class="salamander-sanctum-left">
          <div class="salamander-emblem" aria-hidden="true">🏰</div>
          <div>
            <div class="salamander-status-title">${stageLoc.title} — ${t("ui.mainCastleGate")}</div>
            <div id="salamander-status-text" class="salamander-status-sub">${t("ui.guardsAreInPositionClick")}</div>
          </div>
        </div>
        <div class="battle-fs-top-controls">
          <div id="salamander-hp-box">${renderHpOrbsHtml(remainingHp, maxHp)}</div>
          <button id="btn-battle-auto" type="button" class="btn-glass btn-sm" aria-pressed="false">
            <span class="battle-btn-desktop">${t("ui.autoOff")}</span>
            <span class="battle-btn-mobile">${t("ui.autoOff")}</span>
          </button>
          <button id="btn-skip-battle-anim" type="button" class="btn-glass btn-sm">
            <span class="battle-btn-desktop">${t("ui.skipToResult")}</span>
            <span class="battle-btn-mobile">${t("ui.skip")}</span>
          </button>
        </div>
      </header>

      <!-- Final Result Summary sits right below the top bar when the battle finishes so the Next Stage button is immediately visible -->
      <div id="battle-final-summary-area"></div>

      <!-- Full-Screen Live Battle Stage (Encounter Cutscene + Clash Arena) -->
      <div id="battle-live-stage" class="battle-live-stage" title="${t("ui.clickToAdvance")}">
        <!-- FULL-SCREEN SCENE 1: Dawn / Nightfall & Enemy Arrival Cutscene -->
        <div id="battle-encounter-scene" class="battle-encounter-scene is-day-encounter" aria-live="polite">
          <div class="encounter-sky-rays" aria-hidden="true"></div>
          <div class="encounter-celestial-orb" id="encounter-celestial-orb" aria-hidden="true">☀️</div>

          <div class="encounter-stage-inner">
            <div class="encounter-sky-header">
              <span id="encounter-slot-progress" class="encounter-slot-progress">SLOT 1 / ${outcomes.length}</span>
              <h3 id="encounter-time-badge" class="encounter-time-headline">🌅</h3>
            </div>

            <div id="encounter-arrival-card" class="encounter-arrival-card">
              <div class="encounter-enemy-showcase">
                <div class="encounter-aura-ring" aria-hidden="true"></div>
                <img id="encounter-enemy-img" class="encounter-enemy-img" src="./enemy-scout.jpg" alt="Enemy" width="156" height="156" />
              </div>
              <div class="encounter-arrival-body">
                <div class="encounter-kicker-row">
                  <span id="encounter-kicker-badge" class="encounter-kicker-badge">⚔️</span>
                  <span id="encounter-expected-badge" class="encounter-expected-badge">-</span>
                </div>
                <div id="encounter-headline" class="encounter-headline"></div>
                <div id="encounter-quote" class="encounter-quote"></div>

                <div class="encounter-defender-callout">
                  <div id="encounter-defender-avatars" class="encounter-defender-avatars"></div>
                  <div id="encounter-defender-lead" class="encounter-defender-lead">🛡️</div>
                </div>
              </div>
            </div>

            <div class="encounter-bottom-hint">
              <button id="btn-encounter-proceed" type="button" class="btn-battle-proceed">
                <span id="encounter-step-indicator">⚔️</span>
              </button>
            </div>
          </div>
        </div>

        <!-- FULL-SCREEN SCENE 2: Clash Arena -->
        <div id="battle-cutin-box" class="battle-cutin-stage is-day-battle">
          <div id="battle-fx-overlay" class="battle-fx-overlay" aria-hidden="true">
            <span id="battle-fx-stamp" class="battle-fx-stamp"></span>
          </div>

          <div class="battle-cutin-header">
            <div class="cutin-header-left">
              <span id="cutin-header"></span>
              <span id="cutin-phase-pill" class="cutin-phase-pill">⚔️</span>
            </div>
            <span id="cutin-winprob-badge" class="cutin-winprob-badge"></span>
          </div>

          <div class="battle-cutin-versus">
            <div id="cutin-left-side" class="cutin-side cutin-side-defenders">
              <div class="cutin-unit-row">
                <div id="cutin-defender-avatars" class="cutin-avatars-slot"></div>
                <div class="cutin-unit-info">
                  <div class="cutin-side-label">🛡️ ${t("ui.demonCastleGuards")}</div>
                  <div class="cutin-side-title">
                    <span id="cutin-defender-name"></span>
                    <span id="cutin-defender-power" class="cutin-power-num is-def"></span>
                  </div>
                  <div id="cutin-defender-quote" class="cutin-quote"></div>
                </div>
              </div>
            </div>

            <div id="cutin-vs-center" class="cutin-vs-badge">⚔️</div>

            <div id="cutin-right-side" class="cutin-side cutin-side-enemies">
              <div class="cutin-unit-row is-enemy-row">
                <div class="cutin-unit-info">
                  <div class="cutin-side-label is-ene-label">⚔️ ${t("ui.advancingExpedition")}</div>
                  <div class="cutin-side-title">
                    <span id="cutin-enemy-name"></span>
                    <span id="cutin-enemy-power" class="cutin-power-num is-ene"></span>
                  </div>
                  <div id="cutin-enemy-quote" class="cutin-quote"></div>
                </div>
                <div id="cutin-enemy-avatar" class="cutin-enemy-avatar-slot">
                  <img class="battle-unit-avatar is-enemy" src="./enemy-scout.jpg" alt="Enemy" width="84" height="84" />
                </div>
              </div>
            </div>
          </div>

          <div id="battle-tug-wrap" class="battle-tug-wrap">
            <div class="battle-tug-labels">
              <span id="tug-label-def">🛡️ ${t("ui.guardDefense")}</span>
              <span id="tug-label-status" class="tug-status-center">⚔️</span>
              <span id="tug-label-ene">${t("ui.enemyPower")} ⚔️</span>
            </div>
            <div class="battle-tug-track">
              <div id="battle-tug-fill-def" class="battle-tug-fill-def" style="width: 50%;"></div>
              <div id="battle-tug-spark" class="battle-tug-spark" style="left: 50%;">⚡</div>
            </div>
          </div>

          <div id="cutin-action-footer" class="cutin-action-footer" hidden>
            <button id="btn-clash-proceed" type="button" class="btn-battle-proceed">
              <span id="clash-step-indicator">▶</span>
            </button>
          </div>
        </div>
      </div>

      <div class="battle-log-section">
        <div class="battle-log-heading">📅 ${t("ui.weeklyDefenseTimeline")}</div>
        <div class="battle-log-list">${initialSlotsHtml}</div>
      </div>
    </div>
  `;

  if (!dialog.open) {
    dialog.showModal();
  }

  let skipped = false;
  let isAutoAdvance = false;
  let wakeCurrentStep: (() => void) | null = null;

  battleAnimAbort = () => {
    skipped = true;
    if (wakeCurrentStep) {
      wakeCurrentStep();
      wakeCurrentStep = null;
    }
  };

  const autoBtn = document.getElementById("btn-battle-auto");
  const syncAutoBtnUi = () => {
    if (!autoBtn) return;
    autoBtn.innerHTML = isAutoAdvance
      ? `<span class="battle-btn-desktop">${t("ui.autoOn")}</span><span class="battle-btn-mobile">${t("ui.autoOn")}</span>`
      : `<span class="battle-btn-desktop">${t("ui.autoOff")}</span><span class="battle-btn-mobile">${t("ui.autoOff")}</span>`;
    autoBtn.setAttribute("aria-pressed", isAutoAdvance ? "true" : "false");
    autoBtn.classList.toggle("is-active-speed", isAutoAdvance);
  };
  syncAutoBtnUi();

  autoBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    isAutoAdvance = !isAutoAdvance;
    syncAutoBtnUi();
    soundEngine.playClick("day");
    // If the player turns ON auto-advance while paused at a step, advance immediately
    if (isAutoAdvance && wakeCurrentStep) {
      const wake = wakeCurrentStep;
      wakeCurrentStep = null;
      wake();
    }
  });

  document.getElementById("btn-skip-battle-anim")?.addEventListener("click", (e) => {
    e.stopPropagation();
    skipped = true;
    if (wakeCurrentStep) {
      wakeCurrentStep();
      wakeCurrentStep = null;
    }
  });

  const liveStageEl = document.getElementById("battle-live-stage");
  liveStageEl?.addEventListener("click", () => {
    if (wakeCurrentStep) {
      soundEngine.playClick("day");
      const wake = wakeCurrentStep;
      wakeCurrentStep = null;
      wake();
    }
  });

  /** Short intra-scene animation sleep (e.g. sky fade-in or sword clash roll frames). */
  const sleepAnim = (ms: number, allowClickSkip = false) =>
    new Promise<void>((resolve) => {
      if (skipped) {
        resolve();
        return;
      }
      const timerId = window.setTimeout(() => {
        if (wakeCurrentStep === finish) {
          wakeCurrentStep = null;
        }
        resolve();
      }, ms);
      const finish = () => {
        window.clearTimeout(timerId);
        resolve();
      };
      if (allowClickSkip) {
        wakeCurrentStep = finish;
      }
    });

  /**
   * Waits at key story/battle milestones:
   * - Default (`isAutoAdvance === false`): Waits until the player clicks to advance.
   * - Auto mode (`isAutoAdvance === true`): Automatically advances after `autoDelayMs` (or earlier on click).
   */
  const waitForStepAdvance = (autoDelayMs = 1450) =>
    new Promise<void>((resolve) => {
      if (skipped) {
        resolve();
        return;
      }
      let timerId: number | null = null;
      const finish = () => {
        if (timerId !== null) {
          window.clearTimeout(timerId);
        }
        if (wakeCurrentStep === finish) {
          wakeCurrentStep = null;
        }
        resolve();
      };
      wakeCurrentStep = finish;
      if (isAutoAdvance) {
        timerId = window.setTimeout(finish, autoDelayMs);
      }
    });

  const cutinBox = document.getElementById("battle-cutin-box");
  const encounterScene = document.getElementById("battle-encounter-scene");
  const encounterSlotProgress = document.getElementById("encounter-slot-progress");
  const encounterCelestialOrb = document.getElementById("encounter-celestial-orb");
  const encounterTimeBadge = document.getElementById("encounter-time-badge");
  const encounterArrivalCard = document.getElementById("encounter-arrival-card");
  const encounterKickerBadge = document.getElementById("encounter-kicker-badge");
  const encounterExpectedBadge = document.getElementById("encounter-expected-badge");
  const encounterEnemyImg = document.getElementById("encounter-enemy-img") as HTMLImageElement | null;
  const encounterHeadline = document.getElementById("encounter-headline");
  const encounterQuote = document.getElementById("encounter-quote");
  const encounterDefAvatars = document.getElementById("encounter-defender-avatars");
  const encounterDefLead = document.getElementById("encounter-defender-lead");
  const encounterProceedBtn = document.getElementById("btn-encounter-proceed");
  const encounterStepIndicator = document.getElementById("encounter-step-indicator");
  const cutinActionFooter = document.getElementById("cutin-action-footer");
  const clashStepIndicator = document.getElementById("clash-step-indicator");
  const cutinPhasePill = document.getElementById("cutin-phase-pill");
  const leftSide = document.getElementById("cutin-left-side");
  const rightSide = document.getElementById("cutin-right-side");
  const vsCenter = document.getElementById("cutin-vs-center");
  const fxOverlay = document.getElementById("battle-fx-overlay");
  const fxStamp = document.getElementById("battle-fx-stamp");
  const tugFillDef = document.getElementById("battle-tug-fill-def");
  const tugSpark = document.getElementById("battle-tug-spark");
  const tugStatus = document.getElementById("tug-label-status");
  const winProbBadge = document.getElementById("cutin-winprob-badge");
  const defAvatarsEl = document.getElementById("cutin-defender-avatars");
  const eneAvatarEl = document.getElementById("cutin-enemy-avatar");
  const salStatusTextEl = document.getElementById("salamander-status-text");

  const updateTugBar = (defPower: number, enePower: number) => {
    const total = Math.max(1, defPower + enePower);
    const pct = Math.max(12, Math.min(88, Math.round((defPower / total) * 100)));
    if (tugFillDef) tugFillDef.style.width = `${pct}%`;
    if (tugSpark) tugSpark.style.left = `${pct}%`;
  };

  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i];
    const locO = localizeOutcomeText(o);
    const isDay = o.shift === "day";
    const shiftIcon = isDay ? "☀️" : o.isFullMoon ? "🌕" : "🌙";
    const shiftLabel = isDay
      ? t("ui.day_2")
      : t("ui.night_2");
    const dayName = dayLabels[o.day];
    const isLastSlot = i === outcomes.length - 1;
    const rowEl = document.getElementById(`battle-slot-row-${i}`);
    const resEl = document.getElementById(`battle-slot-res-${i}`);

    rowEl?.classList.remove("is-pending");
    rowEl?.classList.add("is-active");
    rowEl?.scrollIntoView({ block: "nearest", behavior: "smooth" });

    // =========================================================================
    // CASE A: Peaceful Slot (o.hasRaid === false) — No enemy raid (peaceful)
    // =========================================================================
    if (o.hasRaid === false) {
      if (!skipped && encounterScene) {
        soundEngine.setSceneTrack("prologue");
        const peacefulTimeText = isDay
          ? i === 0
            ? t("ui.morningDawnBreaks", { dayName })
            : t("ui.dawnBreaksOnMorning", { dayName })
          : o.isFullMoon
            ? t("ui.nightFallsAndTheFull", { dayName })
            : t("ui.nightFallsOnEvening", { dayName });

        if (encounterSlotProgress) {
          encounterSlotProgress.textContent = t("ui.text_6", { dayName, shiftLabel, i___1: i + 1, outcomes_length: outcomes.length });
        }
        if (encounterCelestialOrb) {
          encounterCelestialOrb.textContent = shiftIcon;
        }
        if (encounterTimeBadge) {
          encounterTimeBadge.textContent = peacefulTimeText;
        }
        if (encounterKickerBadge) {
          encounterKickerBadge.textContent = t("ui.allQuietNoRaid");
        }
        if (encounterExpectedBadge) {
          encounterExpectedBadge.textContent = t("ui.alertLevel", { o_expectedEnemyPower: o.expectedEnemyPower });
        }
        if (encounterEnemyImg) {
          encounterEnemyImg.src = o.defenderPortrait;
          encounterEnemyImg.alt = locO.defenderName;
          encounterEnemyImg.classList.remove("is-boss-unit");
        }
        if (encounterHeadline) {
          encounterHeadline.textContent = t("ui.noExpeditionRaidOccurredDuring");
        }
        if (encounterQuote) {
          encounterQuote.textContent = `「${locO.defenderQuote}」`;
        }
        if (encounterDefAvatars) {
          encounterDefAvatars.innerHTML = o.assignedMonsters
            .map((mId) => {
              const m = getLocalizedMonster(mId);
              return `<img class="encounter-def-mini" src="${m.portrait}" alt="${m.name}" width="38" height="38" />`;
            })
            .join("");
        }
        if (encounterDefLead) {
          encounterDefLead.textContent = t("ui.onDutyDefCompletedA", { locO_defenderName: locO.defenderName, o_defensePower: o.defensePower });
        }
        encounterProceedBtn?.classList.remove("is-combat-cta");
        if (encounterStepIndicator) {
          encounterStepIndicator.textContent = t("ui.allClearAdvancingToNext");
        }
        if (salStatusTextEl && remainingHp > 0) {
          salStatusTextEl.textContent = t("ui.noEnemyMovementTimePassed", { dayName, shiftLabel });
        }

        encounterScene.classList.remove(
          "is-day-encounter",
          "is-night-encounter",
          "is-boss-encounter",
          "is-enemy-revealed"
        );
        encounterScene.classList.add(isDay ? "is-day-encounter" : "is-night-encounter");
        encounterScene.classList.add("is-peaceful-encounter", "is-visible", "is-enemy-revealed");
        encounterArrivalCard?.classList.add("is-burst-in");

        soundEngine.playTimeTransitionCue(isDay, o.isFullMoon);
        // Peaceful slots advance automatically without requiring a click
        await sleepAnim(750, true);
        encounterScene.classList.remove("is-peaceful-encounter");
      }

      rowEl?.classList.remove("is-active");
      rowEl?.classList.add("is-peaceful");
      if (resEl) {
        resEl.textContent = t("ui.noRaidDef", { o_defensePower: o.defensePower });
      }
      continue;
    }

    // Reset per-slot animation classes for an actual raid battle
    cutinBox?.classList.remove("is-day-battle", "is-night-battle", "is-win-flash", "is-perfect-flash", "is-breach-flash");
    cutinBox?.classList.add(isDay ? "is-day-battle" : "is-night-battle");
    leftSide?.classList.remove("is-lunge-win", "is-hit-shudder");
    rightSide?.classList.remove("is-recoil-lose", "is-lunge-breach");
    fxOverlay?.classList.remove("is-win", "is-perfect", "is-breach");
    if (fxStamp) fxStamp.textContent = "";
    if (cutinActionFooter) cutinActionFooter.hidden = true;
    if (vsCenter) {
      vsCenter.textContent = "⚔️";
      vsCenter.classList.remove("is-clashing");
    }
    if (tugStatus) {
      tugStatus.textContent = t("ui.defVsEst_2", { o_defensePower: o.defensePower, o_expectedEnemyPower: o.expectedEnemyPower });
      tugStatus.className = "tug-status-center";
    }

    const headerEl = document.getElementById("cutin-header");
    const defNameEl = document.getElementById("cutin-defender-name");
    const defPwrEl = document.getElementById("cutin-defender-power");
    const defQuoteEl = document.getElementById("cutin-defender-quote");
    const eneNameEl = document.getElementById("cutin-enemy-name");
    const enePwrEl = document.getElementById("cutin-enemy-power");
    const eneQuoteEl = document.getElementById("cutin-enemy-quote");

    if (headerEl) {
      headerEl.textContent = t("ui.battle", { shiftIcon, dayName, shiftLabel });
    }
    if (winProbBadge) {
      const diff = o.defensePower - o.expectedEnemyPower;
      winProbBadge.textContent =
        diff >= 80
          ? t("ui.wellAboveEstimate")
          : diff >= 0
            ? t("ui.aboveEstimate")
            : t("ui.belowEstimate");
      winProbBadge.className = `cutin-winprob-badge ${diff >= 80 ? "is-safe" : diff >= 0 ? "is-mid" : "is-risky"}`;
    }
    if (defAvatarsEl) {
      defAvatarsEl.innerHTML = renderBattleDefenderAvatarsHtml(o);
    }
    if (eneAvatarEl) {
      eneAvatarEl.innerHTML = `<img class="battle-unit-avatar is-enemy ${o.isBossRaid ? "is-boss-unit" : ""}" src="${o.enemyPortrait}" alt="${locO.enemyName}" width="84" height="84" />`;
    }
    if (defNameEl) defNameEl.textContent = locO.defenderName;
    if (defPwrEl) {
      defPwrEl.textContent = t("ui.def", { o_defensePower: o.defensePower });
    }
    if (defQuoteEl) defQuoteEl.textContent = `「${locO.defenderQuote}」`;
    if (eneNameEl) eneNameEl.textContent = `${o.enemyIcon} ${locO.enemyName}`;
    if (enePwrEl) {
      enePwrEl.textContent = t("ui.est_2", { o_expectedEnemyPower: o.expectedEnemyPower });
    }
    if (eneQuoteEl) eneQuoteEl.textContent = `「${locO.enemyQuote}」`;
    updateTugBar(o.defensePower, o.expectedEnemyPower);

    // =========================================================================
    // BEAT 1: Full-Screen Dawn / Nightfall Time Transition
    // & BEAT 2: Dramatic "Enemy Appeared" Cut-in Animation (Wait for Click)
    // =========================================================================
    if (!skipped && encounterScene) {
      const timeTransitionText = isDay
        ? i === 0
          ? t("ui.morningDawnBreaks", { dayName })
          : t("ui.dawnBreaksOnMorning", { dayName })
        : o.isFullMoon
          ? t("ui.nightFallsAndTheFull", { dayName })
          : t("ui.nightFallsOnEvening", { dayName });

      const arrivalHeadlineText = isDay
        ? t("ui.appearedBeforeTheCastleGate", { locO_enemyName: locO.enemyName })
        : t("ui.emergedFromTheDarkness", { locO_enemyName: locO.enemyName });

      if (encounterSlotProgress) {
        encounterSlotProgress.textContent = t("ui.text_6", { dayName, shiftLabel, i___1: i + 1, outcomes_length: outcomes.length });
      }
      if (encounterCelestialOrb) {
        encounterCelestialOrb.textContent = shiftIcon;
      }
      if (encounterTimeBadge) {
        encounterTimeBadge.textContent = timeTransitionText;
      }
      if (encounterKickerBadge) {
        encounterKickerBadge.textContent = o.isBossRaid
          ? t("ui.mainForceAppears")
          : isDay
            ? t("ui.dayVanguardAppears")
            : t("ui.nightRaidAppears");
      }
      if (encounterExpectedBadge) {
        encounterExpectedBadge.textContent = t("ui.estEnemyPower", { o_expectedEnemyPower: o.expectedEnemyPower });
      }
      if (encounterEnemyImg) {
        encounterEnemyImg.src = o.enemyPortrait;
        encounterEnemyImg.alt = locO.enemyName;
        encounterEnemyImg.classList.toggle("is-boss-unit", o.isBossRaid);
      }
      if (encounterHeadline) {
        encounterHeadline.textContent = arrivalHeadlineText;
      }
      if (encounterQuote) {
        encounterQuote.textContent = `「${locO.enemyQuote}」`;
      }
      if (encounterDefAvatars) {
        encounterDefAvatars.innerHTML = o.assignedMonsters
          .map((mId) => {
            const m = getLocalizedMonster(mId);
            return `<img class="encounter-def-mini" src="${m.portrait}" alt="${m.name}" width="38" height="38" />`;
          })
          .join("");
      }
      if (encounterDefLead) {
        encounterDefLead.textContent = t("ui.onDutyDefStandsFirm", { locO_defenderName: locO.defenderName, o_defensePower: o.defensePower });
      }

      encounterScene.classList.remove(
        "is-day-encounter",
        "is-night-encounter",
        "is-boss-encounter",
        "is-peaceful-encounter",
        "is-enemy-revealed"
      );
      encounterScene.classList.add(isDay ? "is-day-encounter" : "is-night-encounter");
      if (o.isBossRaid) {
        encounterScene.classList.add("is-boss-encounter");
      }
      encounterArrivalCard?.classList.remove("is-burst-in");
      encounterScene.classList.add("is-visible");

      // Beat 1: Brief Dawn / Nightfall sky transition first (~420ms)
      soundEngine.setSceneTrack("prologue");
      encounterProceedBtn?.classList.remove("is-combat-cta");
      if (encounterStepIndicator) {
        encounterStepIndicator.textContent = isDay
          ? t("ui.morningArrives", { dayName })
          : t("ui.nightArrives", { dayName });
      }
      soundEngine.playTimeTransitionCue(isDay, o.isFullMoon);
      await sleepAnim(420, true);

      // Beat 2: Enemy bursts onto the full-screen stage -> Encounter Flourish + Battle BGM
      if (!skipped) {
        encounterScene.classList.add("is-enemy-revealed");
        void encounterArrivalCard?.offsetWidth;
        encounterArrivalCard?.classList.add("is-burst-in");
        encounterProceedBtn?.classList.add("is-combat-cta");
        if (encounterStepIndicator) {
          encounterStepIndicator.textContent = t("ui.engageBattleClickToClash");
        }
        if (resEl) {
          resEl.textContent = t("ui.appeared", { o_enemyIcon: o.enemyIcon, locO_enemyName: locO.enemyName });
        }
        if (salStatusTextEl && remainingHp > 0) {
          salStatusTextEl.textContent = isDay
            ? t("ui.asDawnBrokeOnAppeared", { dayName, locO_enemyName: locO.enemyName })
            : t("ui.asDarknessFellEmergedFrom", { locO_enemyName: locO.enemyName });
        }
        soundEngine.setSceneTrack("battle");
        soundEngine.playEncounterCue(isDay, o.isBossRaid);
        await waitForStepAdvance(1500);
      }

      encounterScene.classList.remove("is-visible", "is-enemy-revealed");
    } else if (encounterScene) {
      encounterScene.classList.remove("is-visible", "is-enemy-revealed");
    }

    // =========================================================================
    // BEAT 3: Standoff & Decelerating Battle Clash Roll (-> Battle)
    // =========================================================================
    if (!skipped) {
      if (resEl) {
        resEl.textContent = t("ui.clashing");
      }
      if (cutinPhasePill) {
        cutinPhasePill.textContent = t("ui.standoff");
        cutinPhasePill.className = "cutin-phase-pill";
      }
      // Brief standoff before blades clash so the player sees the left vs right matchup
      await sleepAnim(260, false);

      if (vsCenter) {
        vsCenter.classList.add("is-clashing");
      }
      if (cutinPhasePill) {
        cutinPhasePill.textContent = t("ui.clashing_2");
      }
      if (tugStatus) {
        tugStatus.textContent = t("ui.bladesLocked");
      }

      // 4-step decelerating clash roll (fast -> medium -> slow -> lock-in) for dramatic tension
      const rollFrames = [
        { val: Math.max(50, o.expectedEnemyPower - 40), waitMs: 140 },
        { val: o.expectedEnemyPower + 45, waitMs: 190 },
        { val: Math.round((o.expectedEnemyPower + o.actualEnemyPower) / 2), waitMs: 250 },
        { val: o.actualEnemyPower, waitMs: 310 },
      ];
      for (let fIdx = 0; fIdx < rollFrames.length; fIdx++) {
        const frame = rollFrames[fIdx];
        if (enePwrEl) {
          enePwrEl.textContent = t("ui.ene", { frame_val: frame.val });
        }
        updateTugBar(o.defensePower, frame.val);
        soundEngine.playBattleClashTick(fIdx);
        await sleepAnim(frame.waitMs, false);
      }
    }

    if (enePwrEl) {
      enePwrEl.textContent = t("ui.ene_2", { o_actualEnemyPower: o.actualEnemyPower });
    }
    updateTugBar(o.defensePower, o.actualEnemyPower);
    vsCenter?.classList.remove("is-clashing");

    // =========================================================================
    // BEAT 4: Decisive Impact & Wait for Click (or Auto-Advance)
    // =========================================================================
    rowEl?.classList.remove("is-active");
    if (o.isWin) {
      rowEl?.classList.add("win");
      if (resEl) {
        resEl.textContent = t("ui.defVsEneRepelled", { o_defensePower: o.defensePower, o_actualEnemyPower: o.actualEnemyPower });
      }
      if (cutinPhasePill) {
        cutinPhasePill.textContent = t("ui.repelled");
        cutinPhasePill.className = "cutin-phase-pill is-win";
      }
      leftSide?.classList.add("is-lunge-win");
      rightSide?.classList.add("is-recoil-lose");
      cutinBox?.classList.add(o.isPerfectDefense ? "is-perfect-flash" : "is-win-flash");
      fxOverlay?.classList.add(o.isPerfectDefense ? "is-perfect" : "is-win");
      if (fxStamp) {
        fxStamp.textContent = t("ui.repelledDefVsEne", { o_defensePower: o.defensePower, o_actualEnemyPower: o.actualEnemyPower });
      }
      if (vsCenter) {
        vsCenter.textContent = "🛡️";
      }
      if (tugStatus) {
        tugStatus.textContent = t("ui.repelledVs", { o_defensePower: o.defensePower, o_actualEnemyPower: o.actualEnemyPower });
        tugStatus.className = "tug-status-center is-win";
      }
      if (salStatusTextEl && remainingHp > 0) {
        salStatusTextEl.textContent = t("ui.repelled_2", { dayName, shiftLabel, locO_defenderName: locO.defenderName, locO_enemyName: locO.enemyName });
      }
      if (!skipped) {
        soundEngine.playBattleWin(o.isPerfectDefense);
      }
    } else {
      const lostIdx = remainingHp - 1;
      remainingHp = Math.max(0, remainingHp - 1);
      rowEl?.classList.add("lose");
      if (resEl) {
        resEl.textContent = t("ui.defVsEneBreached1", { o_defensePower: o.defensePower, o_actualEnemyPower: o.actualEnemyPower });
      }
      if (cutinPhasePill) {
        cutinPhasePill.textContent = t("ui.gateBreached1");
        cutinPhasePill.className = "cutin-phase-pill is-lose";
      }
      rightSide?.classList.add("is-lunge-breach");
      leftSide?.classList.add("is-hit-shudder");
      cutinBox?.classList.add("is-breach-flash");
      fxOverlay?.classList.add("is-breach");
      if (fxStamp) {
        fxStamp.textContent = t("ui.gateBreached1DefVs", { o_defensePower: o.defensePower, o_actualEnemyPower: o.actualEnemyPower });
      }
      if (vsCenter) {
        vsCenter.textContent = "💥";
      }
      if (tugStatus) {
        tugStatus.textContent = t("ui.defenseBreachedVs", { o_defensePower: o.defensePower, o_actualEnemyPower: o.actualEnemyPower });
        tugStatus.className = "tug-status-center is-lose";
      }
      // Trigger screen shake
      dialog.classList.remove("is-breach-shake");
      void dialog.offsetWidth;
      dialog.classList.add("is-breach-shake");

      const hpBox = document.getElementById("salamander-hp-box");
      if (hpBox) hpBox.innerHTML = renderHpOrbsHtml(remainingHp, maxHp, lostIdx);
      if (salStatusTextEl) {
        salStatusTextEl.textContent =
          remainingHp > 0
            ? t("ui.theGateShookViolentlyUnder", { remainingHp, maxHp })
            : t("ui.theCastleGateHasBeen");
      }
      if (!skipped) {
        soundEngine.playBattleBreach();
      }
    }

    if (remainingHp <= 0) {
      // Mark remaining slots as unreached when gate HP hits 0
      for (let rest = i + 1; rest < outcomes.length; rest++) {
        const restRes = document.getElementById(`battle-slot-res-${rest}`);
        if (restRes) {
          restRes.textContent = t("ui.abortedDueToGateBreach");
        }
      }
      if (!skipped) {
        if (cutinActionFooter) cutinActionFooter.hidden = false;
        if (clashStepIndicator) {
          clashStepIndicator.textContent = t("ui.viewDefenseResultClickTo");
        }
        await waitForStepAdvance(1500);
      }
      break;
    }

    // Show the click-to-advance prompt on the Clash Arena and wait for player click (or auto-advance)
    if (!skipped) {
      if (cutinActionFooter) cutinActionFooter.hidden = false;
      if (clashStepIndicator) {
        clashStepIndicator.textContent = isLastSlot
          ? t("ui.viewDefenseResultClickTo_2")
          : t("ui.nextShiftClickToProceed");
      }
      await waitForStepAdvance(1500);
    }
  }

  document.getElementById("btn-battle-auto")?.setAttribute("hidden", "true");
  document.getElementById("btn-skip-battle-anim")?.setAttribute("hidden", "true");
  // Collapse the live battle arena so the Stage Result Banner & "Next Stage" button sit right at the top of the screen
  if (liveStageEl) {
    liveStageEl.hidden = true;
  }

  const finalArea = document.getElementById("battle-final-summary-area");
  if (!finalArea) return;

  // Reset scroll to top of the dialog so results and action buttons are immediately in view
  dialog.scrollTo({ top: 0, behavior: "instant" });

  if (remainingHp <= 0) {
    recordStageBreachFailure();
    soundEngine.setSceneTrack("gameover");
    syncAudioButtonUi();
    soundEngine.playError();

    const compareHtml = renderOptimalComparisonHtml(
      currentStage,
      currentSchedule,
      currentEvaluation,
      cachedOptimalResult,
      outcomes
    );

    finalArea.innerHTML = `
      <div class="result-rank-banner result-hero-banner is-gameover">
        <div class="result-hero-top">
          <div>
            <div class="result-rank-letter" style="color: var(--danger-crimson);">${t("ui.defenseFailedGateBreachedGame")}</div>
            <p class="result-hero-sub">
              ${t("ui.theCastleGateWasBreached")}
            </p>
          </div>
          <div class="result-hero-actions">
            <button id="btn-modal-gameover-title" type="button" class="btn-dispatch result-primary-cta">
              ${t("ui.backToTitleScreen")}
            </button>
          </div>
        </div>
      </div>
      ${compareHtml}
    `;
    document.getElementById("btn-modal-gameover-title")?.addEventListener("click", () => {
      soundEngine.playClick("off");
      dialog.close();
      showTitleScreen();
    });
    return;
  }

  soundEngine.setSceneTrack("victory");
  syncAudioButtonUi();
  soundEngine.playVictoryFanfare();
  recordStageVictory(remainingHp, maxHp);
  const rankTitle = t("ui.defenseComplete", { calMonth: formatCastleCalendarMonth(currentStage.weekNumber) });

  if (salStatusTextEl) {
    salStatusTextEl.textContent = t("ui.theGateWasNeverBreached");
  }

  const nextWeekNumber = currentStage.weekNumber + 1;
  renderStageProgressNav();

  const hasNextCampaignStage =
    currentStageIndex >= 0 && currentStageIndex + 1 < CAMPAIGN_STAGES.length;
  const isFinalCampaignStage = currentStageIndex === CAMPAIGN_STAGES.length - 1;
  const nextAdaptiveTier = computeAdaptiveDifficultyTier(saveData.playHistory, nextWeekNumber);
  const nextAdaptiveLabel = getDifficultyLabel(nextAdaptiveTier);

  // Short 1-line guard comments
  const commentsHtml = currentStage.availableMonsters
    .map((mId) => {
      const m = getLocalizedMonster(mId);
      const quote =
        currentLang === "ja"
          ? (currentStage.clearQuotes?.[mId] ?? m.quotes.happy)
          : m.quotes.happy;
      return `<div class="guard-comment-item">
        <img src="${m.portrait}" alt="${m.name}" width="36" height="36" />
        <div><strong>${m.name}</strong>：「${quote}」</div>
      </div>`;
    })
    .join("");

  const adaptiveNoteHtml = !hasNextCampaignStage
    ? `<div class="lore-unlock-card" style="margin-top:0.65rem;">
        <h4>${t("ui.nextMonthDifficultyAdjustmentD", { calMonth: formatCastleCalendarMonth(nextWeekNumber), nextAdaptiveLabel })}</h4>
        <p>${t("ui.basedOnYourGuardHistory", { calMonth: formatCastleCalendarMonth(nextWeekNumber), nextAdaptiveLabel })}</p>
      </div>`
    : "";

  const victoryCompareHtml = renderOptimalComparisonHtml(
    currentStage,
    currentSchedule,
    currentEvaluation,
    cachedOptimalResult,
    outcomes
  );

  // Put "Proceed to Next Month" right inside the top hero banner so it is NEVER hidden at the bottom
  finalArea.innerHTML = `
    <div class="result-rank-banner result-hero-banner">
      <div class="result-hero-top">
        <div>
          <div class="result-rank-letter">${rankTitle}</div>
          <p class="result-hero-sub">
            ${
              isFinalCampaignStage
                ? t("ui.youDefendedTheDemonCastle")
                : t("ui.youRepelledTheExpeditionWhile")
            }
          </p>
        </div>
        <div class="result-hero-actions">
          ${
            hasNextCampaignStage
              ? (() => {
                  const nextStageScenario = CAMPAIGN_STAGES[currentStageIndex + 1];
                  const nextStageLoc = getLocalizedStage(nextStageScenario);
                  return `<button id="btn-modal-next-stage" type="button" class="btn-dispatch result-primary-cta">
                    <span class="btn-cta-main">${t("ui.proceedToNextStage")}</span>
                    <span class="btn-cta-sub">${nextStageLoc.title}</span>
                  </button>`;
                })()
              : `<button id="btn-modal-random-stage" type="button" class="btn-dispatch result-primary-cta">
                  <span class="btn-cta-main">${t("ui.proceedToNextStage")}</span>
                  <span class="btn-cta-sub">${t("ui.difficulty_3", { calMonth: formatCastleCalendarMonthLocalized(nextWeekNumber, false, currentLang), nextAdaptiveLabel })}</span>
                </button>`
          }
          <button id="btn-modal-back-title" type="button" class="btn-glass">
            ${t("ui.backToTitleScreen")}
          </button>
        </div>
      </div>
    </div>

    <div class="guard-comments-box">${commentsHtml}</div>
    ${adaptiveNoteHtml}

    <details class="optimal-compare-details">
      <summary>${t("ui.compareYourShiftWithThe")}</summary>
      ${victoryCompareHtml}
    </details>
  `;

  document.getElementById("btn-modal-back-title")?.addEventListener("click", () => {
    soundEngine.playClick("off");
    dialog.close();
    showTitleScreen();
  });

  document.getElementById("btn-modal-next-stage")?.addEventListener("click", () => {
    dialog.close();
    soundEngine.playClick("day");
    const nextIdx = currentStageIndex + 1;
    void loadCampaignStage(nextIdx, true);
  });

  document.getElementById("btn-modal-random-stage")?.addEventListener("click", () => {
    dialog.close();
    soundEngine.playClick("night");
    void loadEndlessStage(nextWeekNumber, true);
  });
}

// ============================================================================
// Roster Encyclopedia Dialog (Heavy Ancient Open Tome / Grimoire)
// ============================================================================

function openRosterDialog(): void {
  const dialog = getEl<HTMLDialogElement>("roster-dialog");
  const body = getEl<HTMLElement>("roster-dialog-body");
  const currentSet = new Set(currentStage.availableMonsters);

  const cardsHtml = ALL_MONSTER_IDS.map((mId, idx) => {
    const m = getLocalizedMonster(mId);
    const isOnDuty = currentSet.has(mId);
    const dayPwr = getEffectivePower(mId, "day");
    const nightPwr = getEffectivePower(mId, "night");

    const posRels = ALL_PAIR_RELATIONS.filter(
      (r) => r.moraleDelta > 0 && (r.monsterA === mId || r.monsterB === mId)
    );
    const negRels = ALL_PAIR_RELATIONS.filter(
      (r) => r.moraleDelta < 0 && (r.monsterA === mId || r.monsterB === mId)
    );

    const posChips = posRels
      .map((r) => {
        const otherId = r.monsterA === mId ? r.monsterB : r.monsterA;
        const otherM = getLocalizedMonster(otherId);
        return `<span class="grimoire-rel-chip is-pos" title="${getLocalizedPairDescription(r)}">🤝 ${otherM.name} (+${r.moraleDelta})</span>`;
      })
      .join("");
    const negChips = negRels
      .map((r) => {
        const otherId = r.monsterA === mId ? r.monsterB : r.monsterA;
        const otherM = getLocalizedMonster(otherId);
        return `<span class="grimoire-rel-chip is-neg" title="${getLocalizedPairDescription(r)}">⚡ ${otherM.name} (${r.moraleDelta})</span>`;
      })
      .join("");

    const entryNum = String(idx + 1).padStart(2, "0");

    return `
      <article class="grimoire-entry-card ${isOnDuty ? "is-on-duty" : ""}">
        ${
          isOnDuty
            ? `<span class="grimoire-wax-stamp" title="${t("ui.onDutyMemberThisWeek")}">${t("ui.duty")}</span>`
            : ""
        }
        <div class="grimoire-entry-top">
          <div class="grimoire-portrait-frame">
            <img src="${m.portrait}" alt="${m.name}" width="58" height="58" class="grimoire-avatar" loading="lazy" />
          </div>
          <div class="grimoire-title-col">
            <div class="grimoire-name-line">
              <span class="grimoire-entry-no">No.${entryNum}</span>
              <strong class="grimoire-char-name">${m.name}</strong>
              <span class="grimoire-race-sub">${m.title}（${m.race}）</span>
            </div>
            <div class="grimoire-post-line">${t("ui.post_2")}<strong>${m.usualPost}</strong></div>
            <div class="grimoire-stats-line">
              <span class="grimoire-ink-chip is-day">${t("ui.day_6", { dayPwr })}</span>
              <span class="grimoire-ink-chip is-night">${t("ui.night_6", { nightPwr })}</span>
              <span class="grimoire-rule-text">${t("ui.maxWk", { m_maxWeeklyShifts: m.maxWeeklyShifts, m_traitTitle: m.traitTitle })}</span>
            </div>
          </div>
        </div>
        <p class="grimoire-quote">「${m.quotes.intro}」</p>
        <div class="grimoire-rels-row">
          ${posChips}${negChips}
        </div>
      </article>
    `;
  }).join("");

  body.innerHTML = `
    <div class="grimoire-pages-grid">
      ${cardsHtml}
    </div>
  `;

  if (!dialog.open) {
    dialog.showModal();
  }
}

function applyStaticTranslations(): void {
  document.documentElement.lang = currentLang;
  document.title = t("ui.demonCastle24hGuardShift");

  document.querySelectorAll<HTMLButtonElement>("[data-lang-btn]").forEach((btn) => {
    const isActive = btn.dataset.langBtn === currentLang;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

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

  setText(
    "title-genre-pill",
    t("ui.castleDefenseShiftPuzzle")
  );
  setText(
    "title-back-link",
    t("ui.backToShowcase_2")
  );
  const backLink = document.getElementById("title-back-link") as HTMLAnchorElement | null;
  if (backLink) {
    backLink.href = t("ui.showcase");
  }
  setHtml(
    "title-catchphrase",
    t("ui.deepInTheAncientForest")
  );
  setText(
    "btn-title-start",
    t("ui.startNewGame")
  );
  setText(
    "btn-title-continue",
    t("ui.continue_2")
  );
  setText(
    "btn-title-roster",
    t("ui.guardGrimoire")
  );
  setText(
    "btn-title-help",
    t("ui.howToPlay")
  );

  setText(
    "btn-back-title",
    t("ui.title_2")
  );
  setTitle(
    "btn-back-title",
    t("ui.backToTitleScreen")
  );
  setText(
    "btn-roster",
    t("ui.grimoire")
  );
  setTitle(
    "btn-roster",
    t("ui.grimoireOfAll20Demon")
  );
  setText("btn-help", t("ui.rules"));
  setText("btn-hint-one", t("ui.hint_2"));
  setTitle(
    "btn-hint-one",
    t("ui.fill1CellFromThe")
  );
  setText("btn-reset", t("ui.clearAll"));

  // Mobile quick tools
  const mobileHint = document.getElementById("btn-mobile-hint");
  if (mobileHint) {
    mobileHint.title = t("ui.hintFill1Cell");
    mobileHint.setAttribute("aria-label", t("ui.hint"));
  }
  const mobileSynergy = document.getElementById("btn-mobile-synergy");
  if (mobileSynergy) {
    mobileSynergy.title = t("ui.pairAffinities");
    mobileSynergy.setAttribute("aria-label", t("ui.pairAffinities"));
  }
  const mobileMenu = document.getElementById("btn-mobile-menu");
  if (mobileMenu) {
    mobileMenu.title = t("ui.openMenu");
    mobileMenu.setAttribute("aria-label", t("ui.menu"));
  }
  setText("mobile-menu-title", t("ui.operationsMenu"));
  setText("btn-mobile-menu-roster", t("ui.guardGrimoire"));
  setText("btn-mobile-menu-help", t("ui.shiftRules"));
  setText("btn-mobile-menu-synergy", t("ui.affinities"));
  setText("btn-mobile-menu-title", t("ui.backToTitleScreen_2"));
  setText("synergy-dialog-title", t("ui.guardAffinitiesClashes"));
  setTitle(
    "dialogue-box",
    t("ui.clickToRevealFullMessage_2")
  );
  setText(
    "btn-dispatch",
    t("ui.guardWithThisShift")
  );

  setText("btn-op-skip", t("ui.skip"));
  setTitle(
    "op-stage-viewport",
    t("ui.clickToAdvance")
  );
  setText(
    "op-climax-tagline",
    t("ui.protectOurDemonCastleWith")
  );
  setText(
    "btn-op-finish",
    t("ui.beginStory")
  );
  setText(
    "btn-op-next-cut",
    t("ui.next")
  );

  setText("prologue-title", t("ui.prologue"));
  setText("btn-prologue-skip", t("ui.skip"));
  setText(
    "prologue-lilith-role",
    t("ui.chiefGuardTactician")
  );
  setText(
    "prologue-lilith-name",
    t("ui.lilith")
  );
  setText(
    "prologue-speaker-chip",
    t("ui.lilith")
  );
  setText("btn-prologue-prev", t("ui.prev"));
  setText("btn-prologue-next", t("ui.next_2"));

  setText(
    "briefing-title",
    t("ui.monthlyGuardBriefing")
  );
  setText(
    "result-dialog-title",
    t("ui.guardResult")
  );
  setText(
    "grimoire-folio-sub",
    t("ui.ancientGrimoireOfThe20")
  );
  setText(
    "roster-dialog-title",
    t("ui.demonCastle20GuardGrimoire")
  );
  setText(
    "grimoire-close-btn",
    t("ui.closeTome")
  );
  document.querySelectorAll<HTMLElement>(".grimoire-wax-seal").forEach((el) => {
    el.textContent = t("ui.seal");
  });
  document.querySelectorAll<HTMLElement>("[data-close-dialog]").forEach((el) => {
    el.setAttribute(
      "aria-label",
      t("ui.close")
    );
  });

  const setAttr = (id: string, attr: string, val: string) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute(attr, val);
  };
  setAttr(
    "title-screen",
    "aria-label",
    t("ui.titleScreen")
  );
  setAttr(
    "stage-progress-nav",
    "aria-label",
    t("ui.monthSelection")
  );
  setAttr(
    "shift-grid-table",
    "aria-label",
    t("ui.guardShiftMatrix")
  );
  setAttr(
    "opening-movie-dialog",
    "aria-label",
    t("ui.openingMovie")
  );
  document.querySelectorAll<HTMLElement>(".condition-summary-row").forEach((el) => {
    el.setAttribute(
      "aria-label",
      t("ui.shiftGoalStatus")
    );
  });
  document.querySelectorAll<HTMLElement>(".rpg-dialogue-dock").forEach((el) => {
    el.setAttribute(
      "aria-label",
      t("ui.dialogueWindowAndDispatchComma")
    );
  });
  document
    .querySelectorAll<HTMLImageElement>(".title-logo-img, .op-climax-logo-img")
    .forEach((el) => {
      el.setAttribute(
        "alt",
        t("ui.demonCastle24hGuardShift_2")
      );
    });
  setAttr(
    "dialogue-portrait",
    "alt",
    t("ui.lilith")
  );
  setAttr(
    "op-scene-img",
    "alt",
    t("ui.openingScene")
  );
  setAttr(
    "prologue-portrait",
    "alt",
    t("ui.chiefGuardTacticianLilith")
  );

  setText(
    "help-dialog-title",
    t("ui.howToPlayShiftRules")
  );
  setHtml(
    "help-dialog-body",
    t("ui.divClassHelpGridDiv")
  );

  syncAudioButtonUi();
}

// ============================================================================
// Bootstrap & Event Listeners
// ============================================================================

export function switchCastleLanguage(next: GameLang): void {
  currentLang = next;
  setGameLang(next);
  if (typeof document === "undefined") return;
  applyStaticTranslations();
  renderStageHeading();
  if (
    typeof window !== "undefined" &&
    document.getElementById("stage-progress-nav") &&
    document.getElementById("shift-grid-table")
  ) {
    renderStageProgressNav();
    refreshEvaluationAndBoard(true);
  }

  const titleScreen = document.getElementById("title-screen");
  if (titleScreen && !titleScreen.hidden && document.getElementById("game-app")) {
    showTitleScreen();
  }
  const opDialog = document.getElementById("opening-movie-dialog") as HTMLDialogElement | null;
  if (opDialog?.open) {
    renderOpeningCut(opCutIndex);
  }
  const prologueDialog = document.getElementById("prologue-dialog") as HTMLDialogElement | null;
  if (prologueDialog?.open) {
    renderPrologueSlide();
  }
  const briefingDialog = document.getElementById("briefing-dialog") as HTMLDialogElement | null;
  if (briefingDialog?.open) {
    openBriefingDialog(currentStage);
  }
  const rosterDialog = document.getElementById("roster-dialog") as HTMLDialogElement | null;
  if (rosterDialog?.open) {
    openRosterDialog();
  }
}

export function resumeGameFromSave(): void {
  soundEngine.setSceneTrack("prologue");
  syncAudioButtonUi();
  if (saveData.highestUnlockedWeek > CAMPAIGN_STAGES.length) {
    const titleScreen = getEl<HTMLElement>("title-screen");
    const gameApp = getEl<HTMLElement>("game-app");
    titleScreen.hidden = true;
    gameApp.hidden = false;
    void loadEndlessStage(saveData.highestUnlockedWeek, true);
    return;
  }
  const resumeIdx = Math.min(saveData.unlockedStageIndex, CAMPAIGN_STAGES.length - 1);
  enterGameScreen(resumeIdx, true);
}

function initGame(): void {
  setupDialogLightDismiss();
  applyStaticTranslations();

  document.querySelectorAll<HTMLButtonElement>("[data-lang-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.langBtn as GameLang | undefined;
      if (!next || next === currentLang) return;
      switchCastleLanguage(next);
    });
  });

  getEl<HTMLButtonElement>("btn-title-start").addEventListener("click", () => {
    soundEngine.playClick("day");
    enterGameScreen(0, false);
    if (!saveData.openingMovieSeen) {
      openOpeningMovieDialog(true);
    } else {
      openPrologueDialog();
    }
  });

  getEl<HTMLButtonElement>("btn-title-roster").addEventListener("click", () => {
    soundEngine.playClick("day");
    openRosterDialog();
  });

  getEl<HTMLButtonElement>("btn-op-next-cut").addEventListener("click", (e) => {
    e.stopPropagation();
    advanceOpeningCut(true);
  });

  getEl<HTMLButtonElement>("btn-op-skip").addEventListener("click", () => {
    finishOpeningMovie();
  });

  getEl<HTMLButtonElement>("btn-op-finish").addEventListener("click", (e) => {
    e.stopPropagation();
    finishOpeningMovie();
  });

  const opViewport = getEl<HTMLElement>("op-stage-viewport");
  opViewport.addEventListener("click", () => {
    advanceOpeningCut();
  });
  opViewport.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      advanceOpeningCut();
    }
  });

  getEl<HTMLButtonElement>("btn-title-continue").addEventListener("click", () => {
    soundEngine.playClick("day");
    resumeGameFromSave();
  });

  getEl<HTMLButtonElement>("btn-title-help").addEventListener("click", () => {
    soundEngine.playClick("day");
    soundEngine.setSceneTrack("title");
    syncAudioButtonUi();
    getEl<HTMLDialogElement>("help-dialog").showModal();
  });

  // Prologue click-to-complete typewriter
  getEl<HTMLElement>("prologue-stage-box").addEventListener("click", () => {
    if (prologueTimer !== null) {
      window.clearInterval(prologueTimer);
      prologueTimer = null;
      const slides = getLocalizedPrologueSlides();
      const slide = slides[prologueSlideIndex];
      getEl<HTMLElement>("prologue-slide-heading").textContent = slide.heading;
      getEl<HTMLElement>("prologue-slide-text").textContent = prologueFullText;
    }
  });

  getEl<HTMLButtonElement>("btn-prologue-skip").addEventListener("click", (e) => {
    e.stopPropagation();
    if (prologueTimer !== null) {
      window.clearInterval(prologueTimer);
      prologueTimer = null;
    }
    getEl<HTMLDialogElement>("prologue-dialog").close();
    soundEngine.setSceneTrack("planning");
    syncAudioButtonUi();
    updateDefaultDockMessage();
  });

  getEl<HTMLButtonElement>("btn-prologue-prev").addEventListener("click", (e) => {
    e.stopPropagation();
    const slides = getLocalizedPrologueSlides();
    if (prologueTimer !== null) {
      window.clearInterval(prologueTimer);
      prologueTimer = null;
      const slide = slides[prologueSlideIndex];
      getEl<HTMLElement>("prologue-slide-heading").textContent = slide.heading;
      getEl<HTMLElement>("prologue-slide-text").textContent = prologueFullText;
      return;
    }
    if (prologueSlideIndex > 0) {
      prologueSlideIndex--;
      renderPrologueSlide();
    }
  });

  getEl<HTMLButtonElement>("btn-prologue-next").addEventListener("click", (e) => {
    e.stopPropagation();
    const slides = getLocalizedPrologueSlides();
    if (prologueTimer !== null) {
      window.clearInterval(prologueTimer);
      prologueTimer = null;
      const slide = slides[prologueSlideIndex];
      getEl<HTMLElement>("prologue-slide-heading").textContent = slide.heading;
      getEl<HTMLElement>("prologue-slide-text").textContent = prologueFullText;
      return;
    }
    if (prologueSlideIndex < slides.length - 1) {
      prologueSlideIndex++;
      renderPrologueSlide();
    } else {
      getEl<HTMLDialogElement>("prologue-dialog").close();
      soundEngine.setSceneTrack("planning");
      syncAudioButtonUi();
      updateDefaultDockMessage();
    }
  });

  getEl<HTMLButtonElement>("btn-back-title").addEventListener("click", () => {
    soundEngine.playClick("off");
    showTitleScreen();
  });

  getEl<HTMLButtonElement>("btn-roster").addEventListener("click", () => {
    soundEngine.playClick("day");
    openRosterDialog();
  });

  getEl<HTMLButtonElement>("btn-help").addEventListener("click", () => {
    soundEngine.playClick("day");
    getEl<HTMLDialogElement>("help-dialog").showModal();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-bgm-toggle]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const enabled = soundEngine.toggleBgm();
      syncAudioButtonUi();
      if (enabled) {
        soundEngine.playClick("day");
      }
    });
  });

  // Dialogue dock click-to-complete
  const dialogueBox = getEl<HTMLElement>("dialogue-box");
  dialogueBox.addEventListener("click", () => {
    finishDockTypewriterOrCycleStatus();
  });
  dialogueBox.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      finishDockTypewriterOrCycleStatus();
    }
  });

  getEl<HTMLButtonElement>("btn-hint-one").addEventListener("click", () => {
    void giveOneCellHint();
  });

  document.getElementById("btn-mobile-hint")?.addEventListener("click", () => {
    void giveOneCellHint();
  });

  document.getElementById("btn-mobile-synergy")?.addEventListener("click", () => {
    soundEngine.playClick("day");
    openSynergyDialog();
  });

  document.getElementById("btn-mobile-menu")?.addEventListener("click", () => {
    soundEngine.playClick("day");
    openMobileMenuDialog();
  });

  document.getElementById("btn-mobile-menu-roster")?.addEventListener("click", () => {
    const dlg = document.getElementById("mobile-menu-dialog") as HTMLDialogElement | null;
    if (dlg) dlg.close();
    openRosterDialog();
  });

  document.getElementById("btn-mobile-menu-help")?.addEventListener("click", () => {
    const dlg = document.getElementById("mobile-menu-dialog") as HTMLDialogElement | null;
    if (dlg) dlg.close();
    (document.getElementById("help-dialog") as HTMLDialogElement | null)?.showModal();
  });

  document.getElementById("btn-mobile-menu-synergy")?.addEventListener("click", () => {
    const dlg = document.getElementById("mobile-menu-dialog") as HTMLDialogElement | null;
    if (dlg) dlg.close();
    openSynergyDialog();
  });

  document.getElementById("btn-mobile-menu-title")?.addEventListener("click", () => {
    const dlg = document.getElementById("mobile-menu-dialog") as HTMLDialogElement | null;
    if (dlg) dlg.close();
    soundEngine.playClick("off");
    showTitleScreen();
  });

  getEl<HTMLButtonElement>("btn-reset").addEventListener("click", () => {
    soundEngine.playClick("off");
    const days = getStageDays(currentStage);
    currentSchedule = createEmptySchedule(currentStage.availableMonsters, days.length);
    tutorialSkipped = false;
    refreshEvaluationAndBoard(true);
  });

  getEl<HTMLButtonElement>("btn-dispatch").addEventListener("click", () => {
    void openDispatchResultDialog();
  });

  if (hasSavedProgress(saveData)) {
    resumeGameFromSave();
  } else {
    showTitleScreen();
  }
}

if (typeof document !== "undefined" && document.getElementById("title-screen")) {
  initGame();
}
