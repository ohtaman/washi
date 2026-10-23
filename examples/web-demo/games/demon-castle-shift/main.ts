/// <reference types="vite/client" />
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

interface SaveData {
  unlockedStageIndex: number;
  highestUnlockedWeek: number;
  clearedRanks: Record<string, "S" | "A" | "B">;
  playHistory: StagePlayRecord[];
  stageRetryCounts: Record<string, number>;
  stageFailedAttempts: Record<string, number>;
  unlockAllDemo: boolean;
}

const SAVE_STORAGE_KEY = "demon_castle_guard_shift_save_v2";

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
      ? pickLang(currentLang, { ja: "物語を始める", en: "Start Story", zh: "开始故事" })
      : pickLang(currentLang, { ja: "タイトル画面へ戻る", en: "Return to Title", zh: "返回标题画面" });
    nextCutBtn.textContent = opProceedToPrologueAfter
      ? pickLang(currentLang, { ja: "物語を始める ▶", en: "Start Story ▶", zh: "开始故事 ▶" })
      : pickLang(currentLang, { ja: "終了 ▶", en: "Finish ▶", zh: "结束 ▶" });
  } else {
    climaxOverlay.hidden = true;
    nextCutBtn.textContent = pickLang(currentLang, { ja: "次へ ▶", en: "Next ▶", zh: "下一步 ▶" });
    opAutoAdvanceTimer = window.setTimeout(() => {
      if (opCutIndex < cuts.length - 1) {
        renderOpeningCut(opCutIndex + 1);
      }
    }, cut.durationMs);
  }
}

function syncAudioButtonUi(): void {
  const playing = soundEngine.playing;
  document.querySelectorAll<HTMLButtonElement>("[data-bgm-toggle]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(playing));
    btn.textContent = playing
      ? "🔊 BGM: ON"
      : pickLang(currentLang, {
          ja: "🔇 BGM: OFF（クリックで音楽ON）",
          en: "🔇 BGM: OFF (Click for Music)",
          zh: "🔇 BGM: OFF（点击开启音乐）",
        });
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
      continueBtn.textContent = pickLang(currentLang, {
        ja: `つづきから遊ぶ（${mLabel}・難易度：${dLabel}）`,
        en: `Continue (${mLabel} · Difficulty: ${dLabel})`,
        zh: `继续游戏（${mLabel}・难度：${dLabel}）`,
      });
    } else {
      const resumeIdx = Math.min(saveData.unlockedStageIndex, CAMPAIGN_STAGES.length - 1);
      const mLabel = formatCastleCalendarMonthLocalized(resumeIdx + 1, false, currentLang);
      continueBtn.textContent = pickLang(currentLang, {
        ja: `つづきから遊ぶ（${mLabel}）`,
        en: `Continue (${mLabel})`,
        zh: `继续游戏（${mLabel}）`,
      });
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
      ? pickLang(currentLang, {
          ja: `${firstMonth}の編成へ進む`,
          en: `Proceed to ${firstMonth} Shift`,
          zh: `前往${firstMonth}排班`,
        })
      : pickLang(currentLang, { ja: "次へ", en: "Next", zh: "下一步" });
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
  const clearedTitle = pickLang(currentLang, {
    ja: "防衛成功",
    en: "Cleared",
    zh: "防卫成功",
  });
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
  const endlessLabel = pickLang(currentLang, {
    ja: `${endlessMonth}（難易度：${endlessDiff}）`,
    en: `${endlessMonth} (Difficulty: ${endlessDiff})`,
    zh: `${endlessMonth}（难度：${endlessDiff}）`,
  });
  const endlessTooltip = pickLang(currentLang, {
    ja: "ユーザーの警備履歴に応じて難易度が自動調整される翌月以降の編成",
    en: "Subsequent months with difficulty automatically adjusted to your defense history",
    zh: "根据您的警备记录自动调整难度的次月及后续排班",
  });
  const randomBtnHtml = `<button type="button" class="stage-pill-btn ${isEndlessActive ? "is-active" : ""}" data-stage-random="true" ${!endlessUnlocked ? "disabled" : ""} title="${endlessTooltip}">
    <span>${endlessLabel}</span>
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
  const stepSummary = pickLang(currentLang, {
    ja: `${days.length}日間 ・ 今週の当番 ${stage.availableMonsters.length}名`,
    en: `${days.length} Days · ${stage.availableMonsters.length} Guards on Duty`,
    zh: `${days.length}天 ・ 本周值班 ${stage.availableMonsters.length}名`,
  });
  const startLabel = pickLang(currentLang, {
    ja: "シフト編成を始める",
    en: "Start Scheduling",
    zh: "开始编排班表",
  });
  const clickHint = pickLang(currentLang, {
    ja: "クリックでメッセージを全文表示",
    en: "Click to reveal full message",
    zh: "点击显示完整信息",
  });

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
          ? pickLang(currentLang, { ja: "昼", en: "Day", zh: "昼" })
          : s.targetShift === "night"
            ? pickLang(currentLang, { ja: "夜", en: "Night", zh: "夜" })
            : pickLang(currentLang, { ja: "休", en: "Off", zh: "休" });
      const baseStep = {
        stepIndex: i + 1,
        totalSteps: steps.length,
        day: s.day,
        monsterId: s.monsterId,
        targetShift: s.targetShift,
        shortCallout:
          s.shortCallout ??
          pickLang(currentLang, {
            ja: `${mName}の${dLabel}を「${shiftLabel}」にしましょう`,
            en: `Set ${mName} on ${dLabel} to '${shiftLabel}'`,
            zh: `将${mName}的${dLabel}设为「${shiftLabel}」吧`,
          }),
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

  const fullMoonTagText = pickLang(currentLang, {
    ja: "満月",
    en: "Full Moon",
    zh: "满月",
  });
  const dayHeadersHtml = days
    .map((d) => {
      const nightReq = currentStage.requirements.find((r) => r.day === d && r.shift === "night");
      const moonBadge = nightReq?.isFullMoon ? `<span class="moon-tag">${fullMoonTagText}</span>` : "";
      const isDimmedCol = activeTutorial && activeTutorial.day !== d;
      return `<th scope="col" class="${isDimmedCol ? "is-tutorial-dimmed-cell" : ""}">${getDayLabel(d, currentLang)}${moonBadge}</th>`;
    })
    .join("");

  const memberColLabel = pickLang(currentLang, {
    ja: "警備メンバー（クリックで詳細）",
    en: "Guard Member (Click for info)",
    zh: "警备成员（点击查看详情）",
  });
  const theadHtml = `
    <thead>
      <tr>
        <th scope="col" class="col-monster">${memberColLabel}</th>
        ${dayHeadersHtml}
      </tr>
    </thead>
  `;

  const buildRaidRow = (shift: ActiveShiftType, label: string, rowClass: string): string => {
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
        const staffText = pickLang(currentLang, {
          ja: `人数 ${assignedMonsters.length}/${req.minStaff}`,
          en: `Staff ${assignedMonsters.length}/${req.minStaff}`,
          zh: `人数 ${assignedMonsters.length}/${req.minStaff}`,
        });
        const staffPillHtml =
          req.minStaff > 1 || !staffMet
            ? `<span class="meter-pill ${staffMet ? "ok" : "ng"}">${staffText}</span>`
            : "";
        const locReq = getRequirementLocalized(req, currentLang);
        const pwrText = pickLang(currentLang, {
          ja: `防衛 ${currentPower} / 予測 ${expectedPower}`,
          en: `Def ${currentPower} / Est ${expectedPower}`,
          zh: `防卫 ${currentPower} / 预测 ${expectedPower}`,
        });

        return `
          <td class="raid-cell ${cellStateClass} ${isRelatedRaid ? "is-tutorial-related-raid" : ""} ${isDimmedRaid ? "is-tutorial-dimmed-cell" : ""}">
            <div class="raid-enemy-title">${locReq.enemyName}</div>
            <div class="raid-meters">
              ${staffPillHtml}
              <span class="meter-pill ${powerPillClass}">
                ${pwrText}
              </span>
            </div>
          </td>
        `;
      })
      .join("");

    return `
      <tr class="raid-row ${rowClass}">
        <th scope="row">${label}</th>
        ${cellsHtml}
      </tr>
    `;
  };

  const offBtnText = pickLang(currentLang, { ja: "休", en: "Off", zh: "休" });
  const dayBtnText = pickLang(currentLang, { ja: "昼", en: "Day", zh: "昼" });
  const nightBtnText = pickLang(currentLang, { ja: "夜", en: "Night", zh: "夜" });

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
            const offLabel = pickLang(currentLang, {
              ja: `指定休（${locReason}）`,
              en: `Off (${locReason})`,
              zh: `指定休（${locReason}）`,
            });
            return `
              <td class="shift-cell state-off cell-locked-pto ${isDimmedCell ? "is-tutorial-dimmed-cell" : ""}">
                <span class="locked-off-label" title="${locReason}">${offLabel}</span>
              </td>
            `;
          }

          const isTutOff = isTargetCell && activeTutorial?.targetShift === "off";
          const isTutDay = isTargetCell && activeTutorial?.targetShift === "day";
          const isTutNight = isTargetCell && activeTutorial?.targetShift === "night";

          const tutStepPillText = activeTutorial
            ? pickLang(currentLang, {
                ja: `リリスと一緒に編成 ${activeTutorial.stepIndex}/${activeTutorial.totalSteps}`,
                en: `With Lilith ${activeTutorial.stepIndex}/${activeTutorial.totalSteps}`,
                zh: `与莉莉丝一起排班 ${activeTutorial.stepIndex}/${activeTutorial.totalSteps}`,
              })
            : "";
          const tutSkipBtnText = pickLang(currentLang, {
            ja: "ここからは自分で組む",
            en: "Build on my own",
            zh: "接下来自己排班",
          });

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

          let noteHtml = "";
          if (hasViolation) {
            noteHtml = `<div class="cell-note is-error">${cellViolations[0]}</div>`;
          } else if (activeConflictPartner) {
            const cText = pickLang(currentLang, {
              ja: `⚡${activeConflictPartner}と同番NG (-150)`,
              en: `⚡Clash w/ ${activeConflictPartner} (-150)`,
              zh: `⚡与${activeConflictPartner}排斥 (-150)`,
            });
            noteHtml = `<div class="cell-note is-conflict">${cText}</div>`;
          } else if (activeSynergyPartner) {
            const sText = pickLang(currentLang, {
              ja: `🤝${activeSynergyPartner}と連携 (+100)`,
              en: `🤝Synergy w/ ${activeSynergyPartner} (+100)`,
              zh: `🤝与${activeSynergyPartner}连携 (+100)`,
            });
            noteHtml = `<div class="cell-note is-synergy">${sText}</div>`;
          } else if (isFullMoonForbidden) {
            const fmText = pickLang(currentLang, {
              ja: "満月夜は不可",
              en: "No Full Moon Night",
              zh: "满月夜不可",
            });
            noteHtml = `<div class="cell-note">${fmText}</div>`;
          }

          const fmTitle = pickLang(currentLang, {
            ja: `満月の夜は${m.name}を夜番に配置できません`,
            en: `${m.name} cannot work Night shift on a Full Moon night`,
            zh: `满月之夜无法将${m.name}安排在夜班`,
          });

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
              ${noteHtml}
            </td>
          `;
        })
        .join("");

      const workCounterLabel = pickLang(currentLang, {
        ja: `出勤 ${assignedCount}/${m.maxWeeklyShifts}`,
        en: `Shifts ${assignedCount}/${m.maxWeeklyShifts}`,
        zh: `出勤 ${assignedCount}/${m.maxWeeklyShifts}`,
      });
      const dayChipLabel = pickLang(currentLang, {
        ja: `昼 ${dayPower}`,
        en: `Day ${dayPower}`,
        zh: `昼 ${dayPower}`,
      });
      const nightChipLabel = pickLang(currentLang, {
        ja: `夜 ${nightPower}`,
        en: `Night ${nightPower}`,
        zh: `夜 ${nightPower}`,
      });
      const infoTooltip = pickLang(currentLang, {
        ja: `クリックで${m.name}の詳細（普段の持ち場：${m.usualPost}）を下部の会話枠に表示`,
        en: `Click to view ${m.name}'s details (${m.usualPost}) in the dialogue box below`,
        zh: `点击在下方的对话栏显示${m.name}的详情（平时岗位：${m.usualPost}）`,
      });

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

  const dayGuardLabel = pickLang(currentLang, {
    ja: "昼の警備",
    en: "Day Watch",
    zh: "白昼警备",
  });
  const nightGuardLabel = pickLang(currentLang, {
    ja: "夜の警備",
    en: "Night Watch",
    zh: "夜间警备",
  });

  table.innerHTML = `
    ${theadHtml}
    <tbody>
      ${buildRaidRow("day", dayGuardLabel, "raid-row-day")}
      ${buildRaidRow("night", nightGuardLabel, "raid-row-night")}
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
        text: pickLang(currentLang, {
          ja: "わかりました。ここからはあなたのペースで自由にシフトを組んでみてくださいね。",
          en: "Understood. Feel free to arrange the rest of the shift at your own pace.",
          zh: "明白了，接下来请按照您的节奏自由编排班表吧。",
        }),
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

  table.querySelectorAll<HTMLElement>("[data-monster-info]").forEach((el) => {
    const showInfo = () => {
      const mId = el.getAttribute("data-monster-info") as MonsterId;
      const m = getMonsterLocalized(mId, currentLang);
      soundEngine.playClick("day");
      speakInDock({
        speaker: m.name,
        tag: pickLang(currentLang, {
          ja: `${m.title}（${m.race}・持ち場：${m.usualPost}）`,
          en: `${m.title} (${m.race} · Post: ${m.usualPost})`,
          zh: `${m.title}（${m.race}・平时岗位：${m.usualPost}）`,
        }),
        portrait: m.portrait,
        text: pickLang(currentLang, {
          ja: `「${m.quotes.intro}」 ── ${m.traitSummary}`,
          en: `"${m.quotes.intro}" — ${m.traitSummary}`,
          zh: `「${m.quotes.intro}」 ── ${m.traitSummary}`,
        }),
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
      tag: pickLang(currentLang, {
        ja: `リリスと一緒に編成（${activeTutorial.stepIndex}/${activeTutorial.totalSteps}）`,
        en: `Scheduling with Lilith (${activeTutorial.stepIndex}/${activeTutorial.totalSteps})`,
        zh: `与莉莉丝一起排班（${activeTutorial.stepIndex}/${activeTutorial.totalSteps}）`,
      }),
      portrait: lilith.portrait,
      text: activeTutorial.instruction,
    });
    return;
  }

  if (currentStage.tutorialSteps && !tutorialSkipped && currentEvaluation.isValid) {
    dispatchBtn.setAttribute("data-tutorial-target", "true");
    dispatchCallout.hidden = false;
    const pillDone = pickLang(currentLang, {
      ja: "シフト完成",
      en: "Schedule Complete",
      zh: "排班完成",
    });
    const calloutText = pickLang(currentLang, {
      ja: "一緒に組んだ3日間のシフトが完成しました。下の「このシフトで警備する」を押しましょう。",
      en: "Our 3-day shift schedule is complete. Press 'Guard with This Shift' below.",
      zh: "我们一起编排的3天班表已经完成了，请点击下方的「按此班表出击警备」吧。",
    });
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
      text: pickLang(currentLang, {
        ja: "ありがとうございます、一緒に3日間のシフトが綺麗に組めましたね。右下の「このシフトで警備する」を押して、城門の警備へ向かいましょう。",
        en: "Thank you, we have put together a clean 3-day shift schedule. Press 'Guard with This Shift' at the bottom right to begin guarding the gate.",
        zh: "非常感谢，我们一起顺利完成了3天的班表。请点击右下方的「按此班表出击警备」，出发守卫城门吧。",
      }),
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
        tag: pickLang(currentLang, {
          ja: "勤務条件の確認",
          en: "Work Rule Check",
          zh: "勤务条件确认",
        }),
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
            tag: pickLang(currentLang, {
              ja: `⚡ 同シフト拒否（${other.name}と同番で防衛力 ${rel.moraleDelta}）`,
              en: `⚡ Shift Clash (${rel.moraleDelta} defense with ${other.name})`,
              zh: `⚡ 同班排斥（与${other.name}同班防卫力 ${rel.moraleDelta}）`,
            }),
            portrait: m.portrait,
            text: pickLang(currentLang, {
              ja: `${locRel.description}（同じ枠に配置すると防衛力が ${Math.abs(rel.moraleDelta)} 下がります）`,
              en: `${locRel.description} (Assigning both to the same slot reduces defense by ${Math.abs(rel.moraleDelta)}.)`,
              zh: `${locRel.description}（排在同一时段会使防卫力降低 ${Math.abs(rel.moraleDelta)}）`,
            }),
          });
          return;
        }
      }
    }
  }

  if (currentEvaluation.isValid) {
    speakInDock({
      speaker: lilith.name,
      tag: pickLang(currentLang, { ja: "準備完了", en: "Ready", zh: "准备就绪" }),
      portrait: lilith.portrait,
      text: pickLang(currentLang, {
        ja: "すべての時間帯に頼もしい戦力を配置できました。「このシフトで警備する」で進みましょう。",
        en: "Every time slot is well-defended and all work rules are met. Press 'Guard with This Shift' to proceed.",
        zh: "所有时段都已安排了可靠的战力，请点击「按此班表出击警备」继续前进吧。",
      }),
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
      tag: pickLang(currentLang, {
        ja: "勤務条件の確認",
        en: "Work Rule Check",
        zh: "勤务条件确认",
      }),
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
          tag: pickLang(currentLang, {
            ja: `🤝 ペア連携発動（${other.name}と同番で +${rel.moraleDelta}）`,
            en: `🤝 Pair Synergy (+${rel.moraleDelta} with ${other.name})`,
            zh: `🤝 搭档连携发动（与${other.name}同班 +${rel.moraleDelta}）`,
          }),
          portrait: m.portrait,
          text: pickLang(currentLang, {
            ja: `「${quote}」 ── ${locRel.description}`,
            en: `"${quote}" — ${locRel.description}`,
            zh: `「${quote}」 ── ${locRel.description}`,
          }),
        });
        return;
      }
    }

    const dLabel = getDayLabel(lastMove.day, currentLang);
    const sLabel =
      lastMove.shift === "day"
        ? pickLang(currentLang, { ja: "昼番", en: "Day Shift", zh: "白班" })
        : pickLang(currentLang, { ja: "夜番", en: "Night Shift", zh: "夜班" });
    speakInDock({
      speaker: m.name,
      tag: `${dLabel} · ${sLabel}`,
      portrait: m.portrait,
      text: pickLang(currentLang, {
        ja: `「${quote}」`,
        en: `"${quote}"`,
        zh: `「${quote}」`,
      }),
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
  if (!headingEl) return;
  const locStage = getStageLocalized(currentStage, currentLang);
  const diffLabel = currentStage.difficultyTier
    ? getDifficultyLabelLocalized(currentStage.difficultyTier, currentLang)
    : currentStage.difficultyLabel;
  headingEl.textContent =
    currentStageIndex >= 0
      ? locStage.title
      : `${locStage.title}${
          diffLabel
            ? pickLang(currentLang, {
                ja: `（難易度：${diffLabel}）`,
                en: ` (Difficulty: ${diffLabel})`,
                zh: `（难度：${diffLabel}）`,
              })
            : ""
        }`;
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
  stepStaffEl.textContent = pickLang(currentLang, {
    ja: `人数 ${staffOkSlots}/${totalSlots}`,
    en: `Staff ${staffOkSlots}/${totalSlots}`,
    zh: `人数 ${staffOkSlots}/${totalSlots}`,
  });

  const stepPowerEl = getEl<HTMLElement>("goal-step-power");
  const allPredOk = predOkSlots === totalSlots;
  stepPowerEl.className = `cond-pill ${allPredOk ? "is-ok" : "is-ng"}`;
  stepPowerEl.textContent = pickLang(currentLang, {
    ja: `予測到達 ${predOkSlots}/${totalSlots}`,
    en: `Est. Power ${predOkSlots}/${totalSlots}`,
    zh: `达到预测 ${predOkSlots}/${totalSlots}`,
  });

  const stepLawEl = getEl<HTMLElement>("goal-step-law");
  const allLawOk = laborViolations.length === 0;
  stepLawEl.className = `cond-pill ${allLawOk ? "is-ok" : "is-ng"}`;
  stepLawEl.textContent = allLawOk
    ? pickLang(currentLang, {
        ja: "勤務条件 OK",
        en: "Work Rules OK",
        zh: "勤务条件 OK",
      })
    : pickLang(currentLang, {
        ja: `勤務違反 ${laborViolations.length}件`,
        en: `Rule Issues: ${laborViolations.length}`,
        zh: `勤务违规 ${laborViolations.length}项`,
      });

  const dispatchBtn = getEl<HTMLButtonElement>("btn-dispatch");
  if (currentEvaluation.canDispatch) {
    dispatchBtn.classList.add("is-ready");
  } else {
    dispatchBtn.classList.remove("is-ready");
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
      const prefix = isPos
        ? pickLang(currentLang, { ja: "🤝 相性◎", en: "🤝 Synergy", zh: "🤝 默契" })
        : pickLang(currentLang, { ja: "⚡ 同番NG", en: "⚡ Clash", zh: "⚡ 排斥" });
      return `<button type="button" class="pair-chip ${isPos ? "is-positive" : "is-negative"}" data-rel-idx="${idx}" title="${locRel.description}">${prefix}: ${mA.name}×${mB.name} (${sign})</button>`;
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
          ? pickLang(currentLang, {
              ja: `🤝 相性◎：${mA.name}×${mB.name}（同シフトで +${rel.moraleDelta}）`,
              en: `🤝 Synergy: ${mA.name} × ${mB.name} (+${rel.moraleDelta} together)`,
              zh: `🤝 默契：${mA.name}×${mB.name}（同班 +${rel.moraleDelta}）`,
            })
          : pickLang(currentLang, {
              ja: `⚡ 同番NG：${mA.name}×${mB.name}（同シフトで ${rel.moraleDelta}）`,
              en: `⚡ Clash: ${mA.name} × ${mB.name} (${rel.moraleDelta} together)`,
              zh: `⚡ 同班排斥：${mA.name}×${mB.name}（同班 ${rel.moraleDelta}）`,
            }),
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
  const hintTag = pickLang(currentLang, { ja: "ヒント", en: "Hint", zh: "提示" });
  const shiftLabelOf = (s: ShiftType) =>
    s === "day"
      ? pickLang(currentLang, { ja: "昼", en: "Day", zh: "昼" })
      : s === "night"
        ? pickLang(currentLang, { ja: "夜", en: "Night", zh: "夜" })
        : pickLang(currentLang, { ja: "休", en: "Off", zh: "休" });

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
          text: pickLang(currentLang, {
            ja: `勤務条件の無理を解消するため、${mName}の${dLabel}を「${sLabel}」に調整しました。`,
            en: `To resolve a work-rule issue, I adjusted ${mName} on ${dLabel} to '${sLabel}'.`,
            zh: `为了消除勤务条件冲突，已将${mName}在${dLabel}的班表调整为「${sLabel}」。`,
          }),
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
          text: pickLang(currentLang, {
            ja: `${mName}の${dLabel}を「${sLabel}」に配置しました。${locStage.lilithHint}`,
            en: `Assigned ${mName} on ${dLabel} to '${sLabel}'. ${locStage.lilithHint}`,
            zh: `已将${mName}的${dLabel}配置为「${sLabel}」。${locStage.lilithHint}`,
          }),
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
          text: pickLang(currentLang, {
            ja: `${mName}の${dLabel}を「${sLabel}」に調整しました。これで評価がさらに上がります。`,
            en: `Adjusted ${mName} on ${dLabel} to '${sLabel}' for an even stronger formation.`,
            zh: `已将${mName}的${dLabel}调整为「${sLabel}」，整体防卫评价进一步提升。`,
          }),
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
    text: pickLang(currentLang, {
      ja: "すでにお手本シフトと同じ配置になっています。このまま「このシフトで警備する」へ進めます。",
      en: "Your schedule already matches the model solution. You can proceed with 'Guard with This Shift'.",
      zh: "当前排班已经与示范解答完全一致，可以直接点击「按此班表出击警备」。",
    }),
  });
}

async function runLilithDiagnosis(): Promise<void> {
  const activeGen = stageLoadGeneration;
  const activeStageId = currentStage.id;
  const lilith = getLilithProfileLocalized(currentLang);
  const statusTag = pickLang(currentLang, { ja: "状況確認", en: "Status Check", zh: "状况确认" });
  try {
    const diag = await diagnoseScheduleWithHighs(currentStage, currentSchedule);
    if (activeGen !== stageLoadGeneration || currentStage.id !== activeStageId) return;
    if (diag.status === "Feasible") {
      soundEngine.playSolveSuccess();
      speakInDock({
        speaker: lilith.name,
        tag: statusTag,
        portrait: lilith.portrait,
        text: pickLang(currentLang, {
          ja: "いま配置されているマスに手詰まりや違反はありません。このまま残りの空欄を埋めていけば防衛できます。",
          en: "Your currently placed shifts have no dead-ends or rule violations. Fill in the remaining slots to complete the defense.",
          zh: "目前已安排的班表没有任何死胡同或违规，继续填满剩余时段即可完成防卫。",
        }),
      });
    } else {
      soundEngine.playError();
      const reasonText =
        currentLang === "ja"
          ? (diag.messages[0] ?? "現在の配置に偏りがあり、後半の枠で人手が足りなくなっています。")
          : pickLang(currentLang, {
              ja: "",
              en: "Some guards' current assignments are concentrated in a way that leaves later raid slots short-handed.",
              zh: "当前的出勤配置有所偏重，导致后续袭来时段人手不足。",
            });
      speakInDock({
        speaker: lilith.name,
        tag: statusTag,
        portrait: lilith.portrait,
        text: pickLang(currentLang, {
          ja: `${reasonText} 該当するメンバーの出勤日を一度「休」に戻して調整してみてください。`,
          en: `${reasonText} Try resetting a few shifts back to 'Off' and rebalancing.`,
          zh: `${reasonText} 请尝试将相关成员的出勤日先调回「休」再重新调配。`,
        }),
      });
    }
  } catch (err) {
    console.error("Diagnosis failed:", err);
  }
}

function formatShiftChipText(shift: ShiftType): string {
  if (shift === "day") {
    return pickLang(currentLang, { ja: "☀️昼", en: "☀️Day", zh: "☀️昼" });
  }
  if (shift === "night") {
    return pickLang(currentLang, { ja: "🌙夜", en: "🌙Night", zh: "🌙夜" });
  }
  return pickLang(currentLang, { ja: "休", en: "Off", zh: "休" });
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
                <span class="cmp-match-label">${pickLang(currentLang, { ja: "✓ 一致", en: "✓ Match", zh: "✓ 一致" })}</span>
              </div>
            </td>`;
          }
          return `<td class="cmp-td is-diff">
            <div class="cmp-cell-inner">
              <span class="cmp-from-pill">${pickLang(currentLang, { ja: "自", en: "You", zh: "自" })}:${formatShiftChipText(pShift)}</span>
              <span class="cmp-diff-arrow">▶</span>
              <span class="cmp-shift-pill is-${oShift}">${pickLang(currentLang, { ja: "最", en: "Mod", zh: "范" })}:${formatShiftChipText(oShift)}</span>
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
        ? pickLang(currentLang, { ja: "昼", en: "Day", zh: "昼" })
        : pickLang(currentLang, { ja: "夜", en: "Night", zh: "夜" });
      const pPower = pSlot?.currentPower ?? 0;
      const oPower = oSlot?.currentPower ?? 0;
      const expectedEnemy = pSlot?.expectedPower ?? req.requiredPower;
      const sep = pickLang(currentLang, { ja: "・", en: ", ", zh: "、" });
      const noneTxt = pickLang(currentLang, { ja: "なし", en: "None", zh: "无" });
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
        ? pickLang(currentLang, {
            ja: `🍃 襲来なし／予測 ${expectedEnemy}`,
            en: `🍃 No Raid / Est. ${expectedEnemy}`,
            zh: `🍃 无袭来／预测 ${expectedEnemy}`,
          })
        : outcome
          ? pickLang(currentLang, {
              ja: `実際 ${outcome.actualEnemyPower}／予測 ${expectedEnemy}`,
              en: `Actual ${outcome.actualEnemyPower} / Est. ${expectedEnemy}`,
              zh: `实际 ${outcome.actualEnemyPower}／预测 ${expectedEnemy}`,
            })
          : pickLang(currentLang, {
              ja: `予測 ${expectedEnemy}`,
              en: `Est. ${expectedEnemy}`,
              zh: `预测 ${expectedEnemy}`,
            });
      return `<div class="cmp-slot-card ${isBreached ? "is-breached" : ""}">
        <div class="cmp-slot-head">
          <span>${shiftIcon} ${dayLabels[req.day]}・${shiftLabel}（${pickLang(currentLang, { ja: "敵：", en: "Enemy: ", zh: "敌：" })}${actualText}）</span>
          ${isBreached ? `<span class="cmp-breach-tag">💥 ${pickLang(currentLang, { ja: "突破された枠", en: "Breached Slot", zh: "被突破的时段" })}</span>` : ""}
        </div>
        <div class="cmp-slot-body">
          <div class="cmp-slot-line is-player">${pickLang(currentLang, {
            ja: `あなた：<strong>防衛 ${pPower}</strong>（${pNames}）`,
            en: `Yours: <strong>Def ${pPower}</strong> (${pNames})`,
            zh: `你的排班：<strong>防卫 ${pPower}</strong>（${pNames}）`,
          })}</div>
          <div class="cmp-slot-line is-optimal">${pickLang(currentLang, {
            ja: `お手本：<strong>防衛 ${oPower}</strong>（${oNames}）`,
            en: `Model: <strong>Def ${oPower}</strong> (${oNames})`,
            zh: `范例：<strong>防卫 ${oPower}</strong>（${oNames}）`,
          })}</div>
        </div>
      </div>`;
    })
    .join("");

  return `
    <div class="optimal-compare-box">
      <div class="optimal-compare-header">
        <div>
          <h4 class="optimal-compare-title">${pickLang(currentLang, {
            ja: "📊 あなたのシフト vs お手本シフトの比較",
            en: "📊 Your Shift vs. Model Shift Comparison",
            zh: "📊 你的排班 vs 范例排班对比",
          })}</h4>
          <p class="optimal-compare-sub">${pickLang(currentLang, {
            ja: "金枠のマスがお手本と異なっていた配置です（次回挑戦時は敵の進軍と当番メンバーが新しく組み直されます）。",
            en: "Gold-bordered cells differ from the model shift (on your next attempt, enemy raids and on-duty guards will be newly arranged).",
            zh: "金框格子为与范例不同的配置（下次挑战时敌军进军与当班成员将重新编排）。",
          })}</p>
        </div>
        <div class="optimal-compare-totals">
          <span class="cmp-total-pill">${pickLang(currentLang, {
            ja: `あなたの総防衛力：<strong>${playerEval.totalScore}</strong>`,
            en: `Your Total Defense: <strong>${playerEval.totalScore}</strong>`,
            zh: `你的总防卫力：<strong>${playerEval.totalScore}</strong>`,
          })}</span>
          <span class="cmp-total-pill is-opt">${pickLang(currentLang, {
            ja: `お手本の総防衛力：<strong>${optEval.totalScore}</strong>`,
            en: `Model Total Defense: <strong>${optEval.totalScore}</strong>`,
            zh: `范例总防卫力：<strong>${optEval.totalScore}</strong>`,
          })}</span>
        </div>
      </div>

      <div class="cmp-table-wrap">
        <table class="shift-compare-table" aria-label="${pickLang(currentLang, {
          ja: "あなたのシフトとお手本シフトの比較表",
          en: "Shift comparison table",
          zh: "排班对比表",
        })}">
          <thead>
            <tr>
              <th scope="col">${pickLang(currentLang, { ja: "メンバー", en: "Guard", zh: "成员" })}</th>
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
  const statusLabel =
    remainingHp > 0
      ? pickLang(currentLang, {
          ja: "城門無傷（全戦防衛必須）",
          en: "Gate Intact (All Raids Must Be Repelled)",
          zh: "城门无伤（必须全战防卫）",
        })
      : pickLang(currentLang, {
          ja: "城門突破（陥落）",
          en: "Gate Breached (Fallen)",
          zh: "城门被破（陷落）",
        });
  return `<span class="castle-hp-orbs">${orbs.join("")} <span>${statusLabel}</span></span>`;
}

function renderBattleDefenderAvatarsHtml(outcome: SlotBattleOutcome): string {
  if (outcome.assignedMonsters.length === 0) {
    return `<div class="battle-party-avatars"><img class="battle-unit-avatar is-empty" src="./char-lilith.jpg" alt="${pickLang(currentLang, { ja: "配置なし", en: "Unassigned", zh: "未配置" })}" width="52" height="52" /></div>`;
  }
  const imgs = outcome.assignedMonsters
    .map((mId) => {
      const m = getLocalizedMonster(mId);
      return `<img class="battle-unit-avatar ${outcome.hasSynergy ? "has-synergy-glow" : ""}" src="${m.portrait}" alt="${m.name}" title="${m.name}" width="54" height="54" />`;
    })
    .join("");
  const synChip = outcome.hasSynergy
    ? `<span class="battle-synergy-chip">✨ ${pickLang(currentLang, { ja: "連携 +100", en: "Synergy +100", zh: "配合 +100" })}</span>`
    : "";
  const conflictChip = outcome.hasConflict
    ? `<span class="battle-conflict-chip">⚡ ${pickLang(currentLang, { ja: "不仲 -150", en: "Friction -150", zh: "不和 -150" })}</span>`
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
        : `<li class="violation-item">${pickLang(currentLang, {
            ja: "警備メンバーがまだ誰も配置されていません。各マスの「昼」または「夜」を選んで配置してください。",
            en: "No guards are assigned yet. Select Day or Night in the grid cells to assign guards.",
            zh: "尚未安排任何警备成员。请在格子中选择「昼」或「夜」进行安排。",
          })}</li>`;

    body.innerHTML = `
      <div class="result-rank-banner" style="border-color: var(--danger-crimson);">
        <div class="result-rank-letter" style="color: var(--danger-crimson);">${pickLang(currentLang, {
          ja: "勤務条件の確認",
          en: "Shift Rules Check",
          zh: "出勤条件确认",
        })}</div>
        <p style="margin: 0.4rem 0 0; font-size: 0.84rem; color: var(--text-muted);">
          ${pickLang(currentLang, {
            ja: "警備を開始する前に、以下の勤務条件の無理を解消してください。",
            en: "Please resolve the following shift rule violations before starting guard duty.",
            zh: "在开始警备之前，请先解除以下不合理的出勤条件。",
          })}
        </p>
      </div>
      <ul class="violation-list" style="margin-bottom:1rem;">${issues}</ul>
      <div style="display:flex;gap:0.6rem;justify-content:flex-end;flex-wrap:wrap;">
        <button id="btn-modal-hint" type="button" class="btn-glass">
          ${pickLang(currentLang, { ja: "1マスだけヒントを見る", en: "Show 1-Cell Hint", zh: "查看1格提示" })}
        </button>
        <button id="btn-modal-retry" type="button" class="btn-dispatch" style="width:auto;padding:0.55rem 1.2rem;">
          ${pickLang(currentLang, { ja: "シフト表に戻って調整する", en: "Return to Shift Table", zh: "返回排班表调整" })}
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
      defenderName = pickLang(currentLang, {
        ja: "配置なし（無防備）",
        en: "Unassigned (Unguarded)",
        zh: "无人配置（无防备）",
      });
      defenderQuote = pickLang(currentLang, {
        ja: "誰も配置されておらず、城門が無防備になっています…",
        en: "No guards are stationed here, leaving the castle gate unguarded...",
        zh: "没有任何人驻守，城门处于无防备状态……",
      });
    } else {
      const leadM = getLocalizedMonster(o.assignedMonsters[0]);
      defenderName =
        o.assignedMonsters.length === 1
          ? leadM.name
          : currentLang === "en"
            ? `${leadM.name} +${o.assignedMonsters.length - 1}`
            : currentLang === "zh"
              ? `${leadM.name} 等${o.assignedMonsters.length}名`
              : `${leadM.name} ほか${o.assignedMonsters.length - 1}名`;
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
        ? pickLang(currentLang, { ja: "昼", en: "Day", zh: "昼" })
        : pickLang(currentLang, { ja: "夜", en: "Night", zh: "夜" });
      const miniAvatars = o.assignedMonsters
        .map((mId) => {
          const m = getLocalizedMonster(mId);
          return `<img class="log-mini-avatar" src="${m.portrait}" alt="${m.name}" width="20" height="20" />`;
        })
        .join("");
      return `<div id="battle-slot-row-${idx}" class="battle-slot-item is-pending">
        <div class="battle-slot-left">
          <span class="battle-slot-time">${shiftIcon} ${dayLabels[o.day]}・${shiftLabel}</span>
          <span class="battle-slot-avatars">${miniAvatars}</span>
          <span class="battle-slot-enemy">${locO.enemyName}</span>
        </div>
        <span id="battle-slot-res-${idx}" class="battle-slot-res">${pickLang(currentLang, {
          ja: `防衛 ${o.defensePower} vs 予測 ${o.expectedEnemyPower}`,
          en: `Def ${o.defensePower} vs Est. ${o.expectedEnemyPower}`,
          zh: `防卫 ${o.defensePower} vs 预测 ${o.expectedEnemyPower}`,
        })}</span>
      </div>`;
    })
    .join("");

  body.innerHTML = `
    <div class="battle-fs-shell">
      <header id="gate-sanctum-banner" class="salamander-sanctum-banner battle-fs-topbar">
        <div class="salamander-sanctum-left">
          <div class="salamander-emblem" aria-hidden="true">🏰</div>
          <div>
            <div class="salamander-status-title">${stageLoc.title} — ${pickLang(currentLang, {
              ja: "第一防衛城門",
              en: "Main Castle Gate",
              zh: "第一防卫城门",
            })}</div>
            <div id="salamander-status-text" class="salamander-status-sub">${pickLang(currentLang, {
              ja: "警備隊が配置についた。画面クリックで次の場面へ進みます。",
              en: "Guards are in position. Click anywhere to advance to the next scene.",
              zh: "警备队已就位。点击画面推进至下一场景。",
            })}</div>
          </div>
        </div>
        <div class="battle-fs-top-controls">
          <div id="salamander-hp-box">${renderHpOrbsHtml(remainingHp, maxHp)}</div>
          <button id="btn-battle-auto" type="button" class="btn-glass btn-sm" aria-pressed="false">${pickLang(currentLang, {
            ja: "▶ 自動進行: OFF",
            en: "▶ Auto: OFF",
            zh: "▶ 自动推进: OFF",
          })}</button>
          <button id="btn-skip-battle-anim" type="button" class="btn-glass btn-sm">${pickLang(currentLang, {
            ja: "結果までスキップ ⏭",
            en: "Skip to Result ⏭",
            zh: "跳至结果 ⏭",
          })}</button>
        </div>
      </header>

      <!-- Final Result Summary sits right below the top bar when the battle finishes so the Next Stage button is immediately visible -->
      <div id="battle-final-summary-area"></div>

      <!-- Full-Screen Live Battle Stage (Encounter Cutscene + Clash Arena) -->
      <div id="battle-live-stage" class="battle-live-stage" title="${pickLang(currentLang, {
        ja: "クリックで次の場面へ進む",
        en: "Click to advance",
        zh: "点击推进至下一场景",
      })}">
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
                  <div class="cutin-side-label">🛡️ ${pickLang(currentLang, {
                    ja: "魔王城・警備当番",
                    en: "Demon Castle Guards",
                    zh: "魔王城・值班警备",
                  })}</div>
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
                  <div class="cutin-side-label is-ene-label">⚔️ ${pickLang(currentLang, {
                    ja: "押し寄せる勇者軍",
                    en: "Advancing Expedition",
                    zh: "涌来的勇者军",
                  })}</div>
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
              <span id="tug-label-def">🛡️ ${pickLang(currentLang, {
                ja: "味方防衛力",
                en: "Guard Defense",
                zh: "我方防卫力",
              })}</span>
              <span id="tug-label-status" class="tug-status-center">⚔️</span>
              <span id="tug-label-ene">${pickLang(currentLang, {
                ja: "敵戦力",
                en: "Enemy Power",
                zh: "敌方战力",
              })} ⚔️</span>
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
        <div class="battle-log-heading">📅 ${pickLang(currentLang, {
          ja: "今週の防衛タイムライン",
          en: "Weekly Defense Timeline",
          zh: "本周防卫时间线",
        })}</div>
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
    autoBtn.textContent = isAutoAdvance
      ? pickLang(currentLang, { ja: "🔄 自動進行: ON", en: "🔄 Auto: ON", zh: "🔄 自动推进: ON" })
      : pickLang(currentLang, { ja: "▶ 自動進行: OFF", en: "▶ Auto: OFF", zh: "▶ 自动推进: OFF" });
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
      ? pickLang(currentLang, { ja: "昼", en: "Day", zh: "昼" })
      : pickLang(currentLang, { ja: "夜", en: "Night", zh: "夜" });
    const dayName = dayLabels[o.day];
    const isLastSlot = i === outcomes.length - 1;
    const rowEl = document.getElementById(`battle-slot-row-${i}`);
    const resEl = document.getElementById(`battle-slot-res-${i}`);

    rowEl?.classList.remove("is-pending");
    rowEl?.classList.add("is-active");
    rowEl?.scrollIntoView({ block: "nearest", behavior: "smooth" });

    // =========================================================================
    // CASE A: Peaceful Slot (o.hasRaid === false) — 勇者軍の襲来なし（平穏に経過）
    // =========================================================================
    if (o.hasRaid === false) {
      if (!skipped && encounterScene) {
        soundEngine.setSceneTrack("prologue");
        const peacefulTimeText = isDay
          ? i === 0
            ? pickLang(currentLang, {
                ja: `🌅 ${dayName}曜日の朝 ── 夜が明けた`,
                en: `🌅 ${dayName} Morning — Dawn breaks`,
                zh: `🌅 ${dayName}清晨 ── 天亮了`,
              })
            : pickLang(currentLang, {
                ja: `🌅 夜が明け、${dayName}曜日の朝が訪れた`,
                en: `🌅 Dawn breaks on ${dayName} morning`,
                zh: `🌅 黎明破晓，${dayName}清晨来临`,
              })
          : o.isFullMoon
            ? pickLang(currentLang, {
                ja: `🌕 日が暮れて暗くなり、${dayName}曜日の満月が昇った`,
                en: `🌕 Night falls and the full moon rises on ${dayName}`,
                zh: `🌕 夜幕降临，${dayName}的满月升起`,
              })
            : pickLang(currentLang, {
                ja: `🌙 日が暮れて暗くなり、${dayName}曜日の夜が訪れた`,
                en: `🌙 Night falls on ${dayName} evening`,
                zh: `🌙 夜幕降临，${dayName}的夜晚来临`,
              });

        if (encounterSlotProgress) {
          encounterSlotProgress.textContent = pickLang(currentLang, {
            ja: `${dayName}曜日・${shiftLabel}（${i + 1} / ${outcomes.length}）`,
            en: `${dayName} ${shiftLabel} (${i + 1} / ${outcomes.length})`,
            zh: `${dayName}・${shiftLabel}（${i + 1} / ${outcomes.length}）`,
          });
        }
        if (encounterCelestialOrb) {
          encounterCelestialOrb.textContent = shiftIcon;
        }
        if (encounterTimeBadge) {
          encounterTimeBadge.textContent = peacefulTimeText;
        }
        if (encounterKickerBadge) {
          encounterKickerBadge.textContent = pickLang(currentLang, {
            ja: "🍃 敵影なし・平穏",
            en: "🍃 All Quiet / No Raid",
            zh: "🍃 无敌影・平稳",
          });
        }
        if (encounterExpectedBadge) {
          encounterExpectedBadge.textContent = pickLang(currentLang, {
            ja: `警戒レベル ${o.expectedEnemyPower}`,
            en: `Alert Level ${o.expectedEnemyPower}`,
            zh: `警戒等级 ${o.expectedEnemyPower}`,
          });
        }
        if (encounterEnemyImg) {
          encounterEnemyImg.src = o.defenderPortrait;
          encounterEnemyImg.alt = locO.defenderName;
          encounterEnemyImg.classList.remove("is-boss-unit");
        }
        if (encounterHeadline) {
          encounterHeadline.textContent = pickLang(currentLang, {
            ja: "この時間帯に勇者軍の襲来はなかった",
            en: "No expedition raid occurred during this shift",
            zh: "该时段没有勇者军袭来",
          });
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
          encounterDefLead.textContent = pickLang(currentLang, {
            ja: `🛡️ 当番：${locO.defenderName}（防衛力 ${o.defensePower}）が平穏に見回りを終えた`,
            en: `🛡️ On Duty: ${locO.defenderName} (Def ${o.defensePower}) completed a peaceful patrol`,
            zh: `🛡️ 值班：${locO.defenderName}（防卫力 ${o.defensePower}）平稳完成巡逻`,
          });
        }
        encounterProceedBtn?.classList.remove("is-combat-cta");
        if (encounterStepIndicator) {
          encounterStepIndicator.textContent = pickLang(currentLang, {
            ja: "🍃 異常なし ── 次の時間帯へ進みます…",
            en: "🍃 All clear — advancing to next shift...",
            zh: "🍃 一切正常 ── 推进至下一时段……",
          });
        }
        if (salStatusTextEl && remainingHp > 0) {
          salStatusTextEl.textContent = pickLang(currentLang, {
            ja: `${dayName}曜日・${shiftLabel}：勇者軍の動きはなく、静かに時間が過ぎた。`,
            en: `${dayName} ${shiftLabel}: No enemy movement; time passed quietly.`,
            zh: `${dayName}・${shiftLabel}：勇者军没有动静，时间平静流逝。`,
          });
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
        resEl.textContent = pickLang(currentLang, {
          ja: `🍃 襲来なし（防衛 ${o.defensePower}）`,
          en: `🍃 No Raid (Def ${o.defensePower})`,
          zh: `🍃 无袭来（防卫 ${o.defensePower}）`,
        });
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
      tugStatus.textContent = pickLang(currentLang, {
        ja: `⚔️ 防衛 ${o.defensePower} vs 敵予測 ${o.expectedEnemyPower}`,
        en: `⚔️ Def ${o.defensePower} vs Est. ${o.expectedEnemyPower}`,
        zh: `⚔️ 防卫 ${o.defensePower} vs 敌预测 ${o.expectedEnemyPower}`,
      });
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
      headerEl.textContent = pickLang(currentLang, {
        ja: `${shiftIcon} ${dayName}曜日・${shiftLabel}の戦い`,
        en: `${shiftIcon} ${dayName} ${shiftLabel} Battle`,
        zh: `${shiftIcon} ${dayName}・${shiftLabel}之战`,
      });
    }
    if (winProbBadge) {
      const diff = o.defensePower - o.expectedEnemyPower;
      winProbBadge.textContent =
        diff >= 80
          ? pickLang(currentLang, { ja: "🛡️ 予測を大きく上回る", en: "🛡️ Well Above Estimate", zh: "🛡️ 远超预测战力" })
          : diff >= 0
            ? pickLang(currentLang, { ja: "⚔️ 予測戦力以上", en: "⚔️ Above Estimate", zh: "⚔️ 达到预测战力" })
            : pickLang(currentLang, { ja: "⚠️ 予測戦力未満", en: "⚠️ Below Estimate", zh: "⚠️ 低于预测战力" });
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
      defPwrEl.textContent = pickLang(currentLang, {
        ja: `防衛 ${o.defensePower}`,
        en: `Def ${o.defensePower}`,
        zh: `防卫 ${o.defensePower}`,
      });
    }
    if (defQuoteEl) defQuoteEl.textContent = `「${locO.defenderQuote}」`;
    if (eneNameEl) eneNameEl.textContent = `${o.enemyIcon} ${locO.enemyName}`;
    if (enePwrEl) {
      enePwrEl.textContent = pickLang(currentLang, {
        ja: `予測 ${o.expectedEnemyPower}`,
        en: `Est. ${o.expectedEnemyPower}`,
        zh: `预测 ${o.expectedEnemyPower}`,
      });
    }
    if (eneQuoteEl) eneQuoteEl.textContent = `「${locO.enemyQuote}」`;
    updateTugBar(o.defensePower, o.expectedEnemyPower);

    // =========================================================================
    // BEAT 1 (静): Full-Screen Dawn / Nightfall Time Transition
    // & BEAT 2 (動): Dramatic "Enemy Appeared" Cut-in Animation (Wait for Click)
    // =========================================================================
    if (!skipped && encounterScene) {
      const timeTransitionText = isDay
        ? i === 0
          ? pickLang(currentLang, {
              ja: `🌅 ${dayName}曜日の朝 ── 夜が明けた`,
              en: `🌅 ${dayName} Morning — Dawn breaks`,
              zh: `🌅 ${dayName}清晨 ── 天亮了`,
            })
          : pickLang(currentLang, {
              ja: `🌅 夜が明け、${dayName}曜日の朝が訪れた`,
              en: `🌅 Dawn breaks on ${dayName} morning`,
              zh: `🌅 黎明破晓，${dayName}清晨来临`,
            })
        : o.isFullMoon
          ? pickLang(currentLang, {
              ja: `🌕 日が暮れて暗くなり、${dayName}曜日の満月が昇った`,
              en: `🌕 Night falls and the full moon rises on ${dayName}`,
              zh: `🌕 夜幕降临，${dayName}的满月升起`,
            })
          : pickLang(currentLang, {
              ja: `🌙 日が暮れて暗くなり、${dayName}曜日の夜が訪れた`,
              en: `🌙 Night falls on ${dayName} evening`,
              zh: `🌙 夜幕降临，${dayName}的夜晚来临`,
            });

      const arrivalHeadlineText = isDay
        ? pickLang(currentLang, {
            ja: `城門の前に「${locO.enemyName}」が現れた`,
            en: `${locO.enemyName} appeared before the castle gate`,
            zh: `「${locO.enemyName}」出现在了城门前`,
          })
        : pickLang(currentLang, {
            ja: `闇の中から「${locO.enemyName}」が現れた`,
            en: `${locO.enemyName} emerged from the darkness`,
            zh: `「${locO.enemyName}」从黑暗中现身`,
          });

      if (encounterSlotProgress) {
        encounterSlotProgress.textContent = pickLang(currentLang, {
          ja: `${dayName}曜日・${shiftLabel}（${i + 1} / ${outcomes.length}）`,
          en: `${dayName} ${shiftLabel} (${i + 1} / ${outcomes.length})`,
          zh: `${dayName}・${shiftLabel}（${i + 1} / ${outcomes.length}）`,
        });
      }
      if (encounterCelestialOrb) {
        encounterCelestialOrb.textContent = shiftIcon;
      }
      if (encounterTimeBadge) {
        encounterTimeBadge.textContent = timeTransitionText;
      }
      if (encounterKickerBadge) {
        encounterKickerBadge.textContent = o.isBossRaid
          ? pickLang(currentLang, { ja: "👑 勇者軍主力・出現", en: "👑 Main Force Appears", zh: "👑 勇者军主力・出现" })
          : isDay
            ? pickLang(currentLang, { ja: "☀️ 昼の進軍部隊・出現", en: "☀️ Day Vanguard Appears", zh: "☀️ 白昼进军部队・出现" })
            : pickLang(currentLang, { ja: "🌙 夜の奇襲部隊・出現", en: "🌙 Night Raid Appears", zh: "🌙 夜间奇袭部队・出现" });
      }
      if (encounterExpectedBadge) {
        encounterExpectedBadge.textContent = pickLang(currentLang, {
          ja: `⚔️ 敵予測戦力 ${o.expectedEnemyPower}`,
          en: `⚔️ Est. Enemy Power ${o.expectedEnemyPower}`,
          zh: `⚔️ 敌预测战力 ${o.expectedEnemyPower}`,
        });
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
        encounterDefLead.textContent = pickLang(currentLang, {
          ja: `🛡️ 警備当番：${locO.defenderName}（防衛力 ${o.defensePower}）が立ち向かう`,
          en: `🛡️ On Duty: ${locO.defenderName} (Def ${o.defensePower}) stands firm`,
          zh: `🛡️ 值班警备：${locO.defenderName}（防卫力 ${o.defensePower}）迎战`,
        });
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

      // Beat 1 (静): Brief Dawn / Nightfall sky transition first (~420ms)
      soundEngine.setSceneTrack("prologue");
      encounterProceedBtn?.classList.remove("is-combat-cta");
      if (encounterStepIndicator) {
        encounterStepIndicator.textContent = isDay
          ? pickLang(currentLang, {
              ja: `🌅 ${dayName}曜日の朝が訪れました…`,
              en: `🌅 ${dayName} morning arrives...`,
              zh: `🌅 ${dayName}清晨来临……`,
            })
          : pickLang(currentLang, {
              ja: `🌙 ${dayName}曜日の夜が訪れました…`,
              en: `🌙 ${dayName} night arrives...`,
              zh: `🌙 ${dayName}夜晚来临……`,
            });
      }
      soundEngine.playTimeTransitionCue(isDay, o.isFullMoon);
      await sleepAnim(420, true);

      // Beat 2 (動): Enemy bursts onto the full-screen stage -> Dragon Quest Encounter Flourish + Battle BGM
      if (!skipped) {
        encounterScene.classList.add("is-enemy-revealed");
        void encounterArrivalCard?.offsetWidth;
        encounterArrivalCard?.classList.add("is-burst-in");
        encounterProceedBtn?.classList.add("is-combat-cta");
        if (encounterStepIndicator) {
          encounterStepIndicator.textContent = pickLang(currentLang, {
            ja: "⚔️ 戦いを始める ▶（クリックで交戦開始）",
            en: "⚔️ Engage Battle ▶ (Click to Clash)",
            zh: "⚔️ 开始迎战 ▶（点击开始交战）",
          });
        }
        if (resEl) {
          resEl.textContent = pickLang(currentLang, {
            ja: `${o.enemyIcon} ${locO.enemyName}が現れた`,
            en: `${o.enemyIcon} ${locO.enemyName} appeared`,
            zh: `${o.enemyIcon} ${locO.enemyName}出现`,
          });
        }
        if (salStatusTextEl && remainingHp > 0) {
          salStatusTextEl.textContent = isDay
            ? pickLang(currentLang, {
                ja: `${dayName}曜日の夜が明けると、城門の前に「${locO.enemyName}」が現れた。`,
                en: `As dawn broke on ${dayName}, ${locO.enemyName} appeared at the gate.`,
                zh: `${dayName}黎明破晓，「${locO.enemyName}」出现在了城门前。`,
              })
            : pickLang(currentLang, {
                ja: `日が暮れて暗くなると、闇の中から「${locO.enemyName}」が現れた。`,
                en: `As darkness fell, ${locO.enemyName} emerged from the shadows.`,
                zh: `夜幕降临，「${locO.enemyName}」从黑暗中现身。`,
              });
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
    // BEAT 3 (急): Standoff & Decelerating Battle Clash Roll (→ 戦い)
    // =========================================================================
    if (!skipped) {
      if (resEl) {
        resEl.textContent = pickLang(currentLang, {
          ja: "⚔️ 交戦中…",
          en: "⚔️ Clashing...",
          zh: "⚔️ 交战中……",
        });
      }
      if (cutinPhasePill) {
        cutinPhasePill.textContent = pickLang(currentLang, {
          ja: "⚔️ 両軍対峙",
          en: "⚔️ Standoff",
          zh: "⚔️ 两军对峙",
        });
        cutinPhasePill.className = "cutin-phase-pill";
      }
      // Brief standoff before blades clash so the player sees the left vs right matchup
      await sleepAnim(260, false);

      if (vsCenter) {
        vsCenter.classList.add("is-clashing");
      }
      if (cutinPhasePill) {
        cutinPhasePill.textContent = pickLang(currentLang, {
          ja: "⚡ 戦力激突中…",
          en: "⚡ Clashing...",
          zh: "⚡ 战力激突中……",
        });
      }
      if (tugStatus) {
        tugStatus.textContent = pickLang(currentLang, {
          ja: "⚡ つば迫り合い中…",
          en: "⚡ Blades locked...",
          zh: "⚡ 激烈交锋中……",
        });
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
          enePwrEl.textContent = pickLang(currentLang, {
            ja: `敵 ${frame.val}`,
            en: `Ene ${frame.val}`,
            zh: `敌 ${frame.val}`,
          });
        }
        updateTugBar(o.defensePower, frame.val);
        soundEngine.playBattleClashTick(fIdx);
        await sleepAnim(frame.waitMs, false);
      }
    }

    if (enePwrEl) {
      enePwrEl.textContent = pickLang(currentLang, {
        ja: `敵 ${o.actualEnemyPower}`,
        en: `Ene ${o.actualEnemyPower}`,
        zh: `敌 ${o.actualEnemyPower}`,
      });
    }
    updateTugBar(o.defensePower, o.actualEnemyPower);
    vsCenter?.classList.remove("is-clashing");

    // =========================================================================
    // BEAT 4 (決): Decisive Impact & Wait for Click (or Auto-Advance)
    // =========================================================================
    rowEl?.classList.remove("is-active");
    if (o.isWin) {
      rowEl?.classList.add("win");
      if (resEl) {
        resEl.textContent = pickLang(currentLang, {
          ja: `🛡️ 防衛 ${o.defensePower} vs 敵 ${o.actualEnemyPower}（防衛成功）`,
          en: `🛡️ Def ${o.defensePower} vs Ene ${o.actualEnemyPower} (Repelled)`,
          zh: `🛡️ 防卫 ${o.defensePower} vs 敌 ${o.actualEnemyPower}（防卫成功）`,
        });
      }
      if (cutinPhasePill) {
        cutinPhasePill.textContent = pickLang(currentLang, {
          ja: "🛡️ 防衛成功",
          en: "🛡️ Repelled",
          zh: "🛡️ 防卫成功",
        });
        cutinPhasePill.className = "cutin-phase-pill is-win";
      }
      leftSide?.classList.add("is-lunge-win");
      rightSide?.classList.add("is-recoil-lose");
      cutinBox?.classList.add(o.isPerfectDefense ? "is-perfect-flash" : "is-win-flash");
      fxOverlay?.classList.add(o.isPerfectDefense ? "is-perfect" : "is-win");
      if (fxStamp) {
        fxStamp.textContent = pickLang(currentLang, {
          ja: `🛡️ 防衛成功（防衛 ${o.defensePower} vs 敵 ${o.actualEnemyPower}）`,
          en: `🛡️ Repelled (Def ${o.defensePower} vs Ene ${o.actualEnemyPower})`,
          zh: `🛡️ 防卫成功（防卫 ${o.defensePower} vs 敌 ${o.actualEnemyPower}）`,
        });
      }
      if (vsCenter) {
        vsCenter.textContent = "🛡️";
      }
      if (tugStatus) {
        tugStatus.textContent = pickLang(currentLang, {
          ja: `🛡️ 防衛成功（${o.defensePower} vs ${o.actualEnemyPower}）`,
          en: `🛡️ Repelled (${o.defensePower} vs ${o.actualEnemyPower})`,
          zh: `🛡️ 防卫成功（${o.defensePower} vs ${o.actualEnemyPower}）`,
        });
        tugStatus.className = "tug-status-center is-win";
      }
      if (salStatusTextEl && remainingHp > 0) {
        salStatusTextEl.textContent = pickLang(currentLang, {
          ja: `${dayName}曜日・${shiftLabel}：${locO.defenderName}が「${locO.enemyName}」を退けた。`,
          en: `${dayName} ${shiftLabel}: ${locO.defenderName} repelled ${locO.enemyName}.`,
          zh: `${dayName}・${shiftLabel}：${locO.defenderName}击退了「${locO.enemyName}」。`,
        });
      }
      if (!skipped) {
        soundEngine.playBattleWin(o.isPerfectDefense);
      }
    } else {
      const lostIdx = remainingHp - 1;
      remainingHp = Math.max(0, remainingHp - 1);
      rowEl?.classList.add("lose");
      if (resEl) {
        resEl.textContent = pickLang(currentLang, {
          ja: `💥 防衛 ${o.defensePower} vs 敵 ${o.actualEnemyPower}（突破 -1）`,
          en: `💥 Def ${o.defensePower} vs Ene ${o.actualEnemyPower} (Breached -1)`,
          zh: `💥 防卫 ${o.defensePower} vs 敌 ${o.actualEnemyPower}（突破 -1）`,
        });
      }
      if (cutinPhasePill) {
        cutinPhasePill.textContent = pickLang(currentLang, {
          ja: "💥 城門突破 -1",
          en: "💥 Gate Breached -1",
          zh: "💥 城门被破 -1",
        });
        cutinPhasePill.className = "cutin-phase-pill is-lose";
      }
      rightSide?.classList.add("is-lunge-breach");
      leftSide?.classList.add("is-hit-shudder");
      cutinBox?.classList.add("is-breach-flash");
      fxOverlay?.classList.add("is-breach");
      if (fxStamp) {
        fxStamp.textContent = pickLang(currentLang, {
          ja: `💥 城門突破 -1（防衛 ${o.defensePower} vs 敵 ${o.actualEnemyPower}）`,
          en: `💥 Gate Breached -1 (Def ${o.defensePower} vs Ene ${o.actualEnemyPower})`,
          zh: `💥 城门被破 -1（防卫 ${o.defensePower} vs 敌 ${o.actualEnemyPower}）`,
        });
      }
      if (vsCenter) {
        vsCenter.textContent = "💥";
      }
      if (tugStatus) {
        tugStatus.textContent = pickLang(currentLang, {
          ja: `💥 防衛突破（${o.defensePower} vs ${o.actualEnemyPower}）`,
          en: `💥 Defense Breached (${o.defensePower} vs ${o.actualEnemyPower})`,
          zh: `💥 防卫被破（${o.defensePower} vs ${o.actualEnemyPower}）`,
        });
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
            ? pickLang(currentLang, {
                ja: `敵の猛攻で城門が大きく揺れた（残り城門ライフ ${remainingHp}/${maxHp}）。`,
                en: `The gate shook violently under the assault (Gate HP ${remainingHp}/${maxHp}).`,
                zh: `敌军猛攻令城门剧烈摇晃（剩余城门耐久 ${remainingHp}/${maxHp}）。`,
              })
            : pickLang(currentLang, {
                ja: "城門が突破され、これ以上は守りを維持できない。",
                en: "The castle gate has been breached; defense can no longer hold.",
                zh: "城门已被突破，防线无法继续维持。",
              });
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
          restRes.textContent = pickLang(currentLang, {
            ja: "（城門陥落により中断）",
            en: "(Aborted due to gate breach)",
            zh: "（因城门陷落而中断）",
          });
        }
      }
      if (!skipped) {
        if (cutinActionFooter) cutinActionFooter.hidden = false;
        if (clashStepIndicator) {
          clashStepIndicator.textContent = pickLang(currentLang, {
            ja: "💥 警備結果を確認する ▶（クリックで進行）",
            en: "💥 View Defense Result ▶ (Click to Proceed)",
            zh: "💥 确认警备结果 ▶（点击继续）",
          });
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
          ? pickLang(currentLang, {
              ja: "🏆 警備結果を確認する ▶（クリックで進行）",
              en: "🏆 View Defense Result ▶ (Click to Proceed)",
              zh: "🏆 确认警备结果 ▶（点击继续）",
            })
          : pickLang(currentLang, {
              ja: "▶ 次の時間帯へ進む（クリックで進行）",
              en: "▶ Next Shift (Click to Proceed)",
              zh: "▶ 进入下一时段（点击继续）",
            });
      }
      await waitForStepAdvance(1500);
    }
  }

  document.getElementById("btn-battle-auto")?.setAttribute("hidden", "true");
  document.getElementById("btn-skip-battle-anim")?.setAttribute("hidden", "true");
  // Collapse the live battle arena so the Stage Result Banner & "次のステージへ進む" button sit right at the top of the screen
  if (liveStageEl) {
    liveStageEl.hidden = true;
  }

  const finalArea = document.getElementById("battle-final-summary-area");
  if (!finalArea) return;

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
            <div class="result-rank-letter" style="color: var(--danger-crimson);">${pickLang(currentLang, {
              ja: "警備失敗 — 城門突破（GAME OVER）",
              en: "Defense Failed — Gate Breached (GAME OVER)",
              zh: "警备失败 — 城门被破（GAME OVER）",
            })}</div>
            <p class="result-hero-sub">
              ${pickLang(currentLang, {
                ja: "勇者軍の襲来を防ぎきれず、城門が突破されました（全戦防衛成功がクリア条件です）。今回のシフトとお手本シフトの比較を確認し、タイトル画面から再出発してください。",
                en: "The castle gate was breached by the expedition raid (all raids must be repelled to clear). Review your shift vs. the model shift below and restart from the title screen.",
                zh: "未能抵挡勇者军的袭击，城门被突破（通关条件为全战防卫成功）。请确认本次排班与范例排班的对比，并从标题画面重新出发。",
              })}
            </p>
          </div>
          <div class="result-hero-actions">
            <button id="btn-modal-gameover-title" type="button" class="btn-dispatch result-primary-cta">
              ${pickLang(currentLang, { ja: "タイトル画面へ戻る", en: "Back to Title Screen", zh: "返回标题画面" })}
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
  const rankTitle = pickLang(currentLang, {
    ja: `防衛成功 — ${formatCastleCalendarMonth(currentStage.weekNumber)}の警備完了`,
    en: `Defense Complete — ${formatCastleCalendarMonth(currentStage.weekNumber)}`,
    zh: `防卫成功 — ${formatCastleCalendarMonth(currentStage.weekNumber)}警备完成`,
  });

  if (salStatusTextEl) {
    salStatusTextEl.textContent = pickLang(currentLang, {
      ja: "城門は一度も抜かれることなく、魔王城の静かな日常が守られた。",
      en: "The gate was never breached, preserving the peaceful days of the Demon Castle.",
      zh: "城门一次也未被突破，守护了魔王城平静的生活。",
    });
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
        <h4>${pickLang(currentLang, {
          ja: `翌月の警備難度調整（${formatCastleCalendarMonth(nextWeekNumber)}・難易度：${nextAdaptiveLabel}）`,
          en: `Next Month Difficulty Adjustment (${formatCastleCalendarMonth(nextWeekNumber)} / Difficulty: ${nextAdaptiveLabel})`,
          zh: `下月警备难度调整（${formatCastleCalendarMonth(nextWeekNumber)}・难度：${nextAdaptiveLabel}）`,
        })}</h4>
        <p>${pickLang(currentLang, {
          ja: `これまでの警備履歴（ヒント使用状況や再挑戦回数）に応じて、${formatCastleCalendarMonth(nextWeekNumber)}の進軍状況が「難易度：${nextAdaptiveLabel}」に自動調整されました。`,
          en: `Based on your guard history (hint usage and retries), the raid intensity for ${formatCastleCalendarMonth(nextWeekNumber)} has been tuned to Difficulty: ${nextAdaptiveLabel}.`,
          zh: `根据至今的警备记录（提示使用情况与重试次数），${formatCastleCalendarMonth(nextWeekNumber)}的进军情况已自动调整为「难度：${nextAdaptiveLabel}」。`,
        })}</p>
      </div>`
    : "";

  const victoryCompareHtml = renderOptimalComparisonHtml(
    currentStage,
    currentSchedule,
    currentEvaluation,
    cachedOptimalResult,
    outcomes
  );

  // Put "翌月の編成へ進む" right inside the top hero banner so it is NEVER hidden at the bottom
  finalArea.innerHTML = `
    <div class="result-rank-banner result-hero-banner">
      <div class="result-hero-top">
        <div>
          <div class="result-rank-letter">${rankTitle}</div>
          <p class="result-hero-sub">
            ${
              isFinalCampaignStage
                ? pickLang(currentLang, {
                    ja: "5日間にわたる勇者本隊の進軍から魔王城を守り抜きました。",
                    en: "You defended the Demon Castle through the 5-day main expedition offensive.",
                    zh: "在持续5天的勇者主力部队进军中成功守住了魔王城。",
                  })
                : pickLang(currentLang, {
                    ja: "勇者隊の進軍を退け、誰ひとり無理をさせずに魔王城を守り抜きました。",
                    en: "You repelled the expedition while keeping every guard on a healthy schedule.",
                    zh: "击退了勇者队的进军，在不让任何伙伴勉强的情况下守住了魔王城。",
                  })
            }
          </p>
        </div>
        <div class="result-hero-actions">
          ${
            hasNextCampaignStage
              ? `<button id="btn-modal-next-stage" type="button" class="btn-dispatch result-primary-cta">
                  ${pickLang(currentLang, {
                    ja: `翌月（${formatCastleCalendarMonth(currentStageIndex + 2)}）の編成へ進む ▶`,
                    en: `Next Month (${formatCastleCalendarMonth(currentStageIndex + 2)}) ▶`,
                    zh: `前往下月（${formatCastleCalendarMonth(currentStageIndex + 2)}）排班 ▶`,
                  })}
                </button>`
              : `<button id="btn-modal-random-stage" type="button" class="btn-dispatch result-primary-cta">
                  ${pickLang(currentLang, {
                    ja: `翌月（${formatCastleCalendarMonth(nextWeekNumber)}・難易度：${nextAdaptiveLabel}）へ進む ▶`,
                    en: `Next Month (${formatCastleCalendarMonth(nextWeekNumber)} / ${nextAdaptiveLabel}) ▶`,
                    zh: `前往下月（${formatCastleCalendarMonth(nextWeekNumber)}・难度：${nextAdaptiveLabel}） ▶`,
                  })}
                </button>`
          }
          <button id="btn-modal-back-title" type="button" class="btn-glass">
            ${pickLang(currentLang, { ja: "タイトル画面へ戻る", en: "Back to Title Screen", zh: "返回标题画面" })}
          </button>
        </div>
      </div>
    </div>

    <div class="guard-comments-box">${commentsHtml}</div>
    ${adaptiveNoteHtml}

    <details class="optimal-compare-details">
      <summary>${pickLang(currentLang, {
        ja: "📊 あなたのシフトとお手本シフトを比較する",
        en: "📊 Compare Your Shift with the Model Shift",
        zh: "📊 对比你的排班与范例排班",
      })}</summary>
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
            ? `<span class="grimoire-wax-stamp" title="${pickLang(currentLang, {
                ja: "今週のシフト当番メンバー",
                en: "On-Duty Member This Week",
                zh: "本周值班警备成员",
              })}">${pickLang(currentLang, { ja: "当番", en: "Duty", zh: "当班" })}</span>`
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
            <div class="grimoire-post-line">${pickLang(currentLang, {
              ja: "持ち場：",
              en: "Post: ",
              zh: "驻守岗位：",
            })}<strong>${m.usualPost}</strong></div>
            <div class="grimoire-stats-line">
              <span class="grimoire-ink-chip is-day">${pickLang(currentLang, { ja: `昼 ${dayPwr}`, en: `Day ${dayPwr}`, zh: `昼 ${dayPwr}` })}</span>
              <span class="grimoire-ink-chip is-night">${pickLang(currentLang, { ja: `夜 ${nightPwr}`, en: `Night ${nightPwr}`, zh: `夜 ${nightPwr}` })}</span>
              <span class="grimoire-rule-text">${pickLang(currentLang, {
                ja: `週${m.maxWeeklyShifts}回まで・${m.traitTitle}`,
                en: `Max ${m.maxWeeklyShifts}/wk · ${m.traitTitle}`,
                zh: `每周最多${m.maxWeeklyShifts}次・${m.traitTitle}`,
              })}</span>
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
  document.title = pickLang(currentLang, {
    ja: "魔王城の24時間警備シフト | 拠点防衛シフトパズル",
    en: "Demon Castle 24h Guard Shift | Castle Defense Shift Puzzle",
    zh: "魔王城的24小时警备排班 | 据点防卫排班解谜",
  });

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
    pickLang(currentLang, {
      ja: "拠点防衛シフトパズル",
      en: "Castle Defense Shift Puzzle",
      zh: "据点防卫排班解谜",
    })
  );
  setText(
    "title-back-link",
    pickLang(currentLang, {
      ja: "← ゲーム一覧へ",
      en: "← Back to Games",
      zh: "← 返回游戏列表",
    })
  );
  setHtml(
    "title-catchphrase",
    pickLang(currentLang, {
      ja: `深い森の奥、魔物たちが静かに暮らす最後の砦――「魔王城」。<br />昼夜を問わず押し寄せる討伐軍から、<strong>24時間の交代シフトで仲間と城を守り抜こう。</strong>`,
      en: `Deep in the ancient forest stands the Demon Castle, the quiet refuge of monsters.<br /><strong>Organize 24-hour guard shifts to protect your companions and the castle from relentless raids.</strong>`,
      zh: `深邃森林深处，魔物们平静生活的最后堡垒——「魔王城」。<br /><strong>编排24小时轮班表，与伙伴们一同守护城堡免受昼夜袭来的讨伐军侵害。</strong>`,
    })
  );
  setText(
    "btn-title-start",
    pickLang(currentLang, {
      ja: "はじめから遊ぶ",
      en: "Start New Game",
      zh: "从头开始游玩",
    })
  );
  setText(
    "btn-title-continue",
    pickLang(currentLang, {
      ja: "つづきから遊ぶ",
      en: "Continue",
      zh: "继续游戏",
    })
  );
  setText(
    "btn-title-roster",
    pickLang(currentLang, { ja: "📖 警備隊名鑑", en: "📖 Guard Grimoire", zh: "📖 警备队名鉴" })
  );
  setText(
    "btn-title-help",
    pickLang(currentLang, { ja: "遊び方", en: "How to Play", zh: "玩法说明" })
  );

  setText(
    "btn-back-title",
    pickLang(currentLang, { ja: "← タイトル", en: "← Title", zh: "← 标题" })
  );
  setTitle(
    "btn-back-title",
    pickLang(currentLang, {
      ja: "タイトル画面へ戻る",
      en: "Back to Title Screen",
      zh: "返回标题画面",
    })
  );
  setText(
    "btn-roster",
    pickLang(currentLang, { ja: "📖 名鑑", en: "📖 Grimoire", zh: "📖 名鉴" })
  );
  setTitle(
    "btn-roster",
    pickLang(currentLang, {
      ja: "魔王城で働く全20名のメンバー名鑑と相性一覧",
      en: "Grimoire of all 20 Demon Castle guards and pair affinities",
      zh: "魔王城全20名成员名鉴与搭档相性一览",
    })
  );
  setText("btn-help", pickLang(currentLang, { ja: "ルール", en: "Rules", zh: "规则" }));
  setText("btn-hint-one", pickLang(currentLang, { ja: "💡 ヒント", en: "💡 Hint", zh: "💡 提示" }));
  setTitle(
    "btn-hint-one",
    pickLang(currentLang, {
      ja: "1マスだけお手本を配置します",
      en: "Fill 1 cell from the model shift",
      zh: "填入1格示范排班",
    })
  );
  setText("btn-reset", pickLang(currentLang, { ja: "白紙に戻す", en: "Clear All", zh: "清空重排" }));
  setTitle(
    "dialogue-box",
    pickLang(currentLang, {
      ja: "クリックでメッセージを全文表示・次へ進める",
      en: "Click to reveal full message or advance",
      zh: "点击显示完整信息或继续",
    })
  );
  setText(
    "btn-dispatch",
    pickLang(currentLang, {
      ja: "⚔️ このシフトで警備する",
      en: "⚔️ Guard with This Shift",
      zh: "⚔️ 按此班表出击警备",
    })
  );

  setText("btn-op-skip", pickLang(currentLang, { ja: "スキップ ⏭", en: "Skip ⏭", zh: "跳过 ⏭" }));
  setTitle(
    "op-stage-viewport",
    pickLang(currentLang, {
      ja: "クリックで次へ進む",
      en: "Click to advance",
      zh: "点击继续",
    })
  );
  setText(
    "op-climax-tagline",
    pickLang(currentLang, {
      ja: "誰ひとり無理をさせないシフトで、私たちの魔王城を守り抜く。",
      en: "Protect our Demon Castle with a shift schedule that leaves no companion overworked.",
      zh: "用不让任何伙伴勉强的排班表，守护我们的魔王城。",
    })
  );
  setText(
    "btn-op-finish",
    pickLang(currentLang, { ja: "物語を始める", en: "Begin Story", zh: "开始物语" })
  );
  setText(
    "btn-op-next-cut",
    pickLang(currentLang, { ja: "次へ ▶", en: "Next ▶", zh: "下一步 ▶" })
  );

  setText("prologue-title", pickLang(currentLang, { ja: "プロローグ", en: "Prologue", zh: "序章" }));
  setText("btn-prologue-skip", pickLang(currentLang, { ja: "スキップ ⏭", en: "Skip ⏭", zh: "跳过 ⏭" }));
  setText(
    "prologue-lilith-role",
    pickLang(currentLang, {
      ja: "魔王城 警備参謀",
      en: "Chief Guard Tactician",
      zh: "魔王城 警备参谋",
    })
  );
  setText(
    "prologue-lilith-name",
    pickLang(currentLang, { ja: "リリス", en: "Lilith", zh: "莉莉丝" })
  );
  setText(
    "prologue-speaker-chip",
    pickLang(currentLang, { ja: "リリス", en: "Lilith", zh: "莉莉丝" })
  );
  setText("btn-prologue-prev", pickLang(currentLang, { ja: "前へ", en: "Prev", zh: "上一页" }));
  setText("btn-prologue-next", pickLang(currentLang, { ja: "次へ", en: "Next", zh: "下一步" }));

  setText(
    "briefing-title",
    pickLang(currentLang, { ja: "今月の警備概要", en: "Monthly Guard Briefing", zh: "本月警备概要" })
  );
  setText(
    "result-dialog-title",
    pickLang(currentLang, { ja: "警備結果", en: "Guard Result", zh: "警备结果" })
  );
  setText(
    "grimoire-folio-sub",
    pickLang(currentLang, {
      ja: "── 魔王城 警備隊古録・全二十名 ──",
      en: "── Ancient Grimoire of the 20 Castle Guards ──",
      zh: "── 魔王城 警备队古录・全二十名 ──",
    })
  );
  setText(
    "roster-dialog-title",
    pickLang(currentLang, {
      ja: "魔王城・全20名メンバー名鑑",
      en: "Demon Castle 20-Guard Grimoire",
      zh: "魔王城・全20名成员名鉴",
    })
  );
  setText(
    "grimoire-close-btn",
    pickLang(currentLang, { ja: "✕ 書を閉じる", en: "✕ Close Tome", zh: "✕ 合上书卷" })
  );
  document.querySelectorAll<HTMLElement>(".grimoire-wax-seal").forEach((el) => {
    el.textContent = pickLang(currentLang, { ja: "印", en: "Seal", zh: "印" });
  });
  document.querySelectorAll<HTMLElement>("[data-close-dialog]").forEach((el) => {
    el.setAttribute(
      "aria-label",
      pickLang(currentLang, { ja: "閉じる", en: "Close", zh: "关闭" })
    );
  });

  const setAttr = (id: string, attr: string, val: string) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute(attr, val);
  };
  setAttr(
    "title-screen",
    "aria-label",
    pickLang(currentLang, { ja: "タイトル画面", en: "Title Screen", zh: "标题画面" })
  );
  setAttr(
    "stage-progress-nav",
    "aria-label",
    pickLang(currentLang, { ja: "年月選択", en: "Month Selection", zh: "年月选择" })
  );
  setAttr(
    "shift-grid-table",
    "aria-label",
    pickLang(currentLang, { ja: "警備シフト編成表", en: "Guard Shift Matrix", zh: "警备排班表" })
  );
  setAttr(
    "opening-movie-dialog",
    "aria-label",
    pickLang(currentLang, { ja: "オープニングムービー", en: "Opening Movie", zh: "开场动画" })
  );
  document.querySelectorAll<HTMLElement>(".condition-summary-row").forEach((el) => {
    el.setAttribute(
      "aria-label",
      pickLang(currentLang, { ja: "シフト達成状況", en: "Shift Goal Status", zh: "排班达成状况" })
    );
  });
  document.querySelectorAll<HTMLElement>(".rpg-dialogue-dock").forEach((el) => {
    el.setAttribute(
      "aria-label",
      pickLang(currentLang, {
        ja: "会話ウィンドウと出撃コマンド",
        en: "Dialogue Window and Dispatch Command",
        zh: "对话窗口与出击指令",
      })
    );
  });
  document
    .querySelectorAll<HTMLImageElement>(".title-logo-img, .op-climax-logo-img")
    .forEach((el) => {
      el.setAttribute(
        "alt",
        pickLang(currentLang, {
          ja: "魔王城の24時間警備シフト",
          en: "Demon Castle 24h Guard Shift",
          zh: "魔王城的24小时警备排班",
        })
      );
    });
  setAttr(
    "dialogue-portrait",
    "alt",
    pickLang(currentLang, { ja: "リリス", en: "Lilith", zh: "莉莉丝" })
  );
  setAttr(
    "op-scene-img",
    "alt",
    pickLang(currentLang, { ja: "オープニング情景", en: "Opening Scene", zh: "开场情景" })
  );
  setAttr(
    "prologue-portrait",
    "alt",
    pickLang(currentLang, {
      ja: "警備参謀 リリス",
      en: "Chief Guard Tactician Lilith",
      zh: "警备参谋 莉莉丝",
    })
  );

  setText(
    "help-dialog-title",
    pickLang(currentLang, { ja: "遊び方と勤務ルール", en: "How to Play & Shift Rules", zh: "玩法与出勤规则" })
  );
  setHtml(
    "help-dialog-body",
    pickLang(currentLang, {
      ja: `<div class="help-grid">
        <div class="help-step-card">
          <span class="step-num">手順 1</span>
          <h3>敵の戦闘力と味方防衛力の力比べ</h3>
          <p>
            各時間帯で、押し寄せる勇者軍部隊の実際の戦闘力が<strong>「予測戦力」の前後で変動</strong>します。<br />
            <strong>味方の防衛力が敵の戦闘力以上なら防衛成功</strong>です。得意な時間帯や相性ペアを活かして、厚みのある守りを築きましょう。
          </p>
        </div>
        <div class="help-step-card">
          <span class="step-num">手順 2</span>
          <h3>無理のない勤務ルールを守る</h3>
          <p>
            城の仲間に無理をさせないため、以下の勤務条件を守る必要があります（勤務条件さえ守れば、戦力が足りない枠があっても確率勝負で警備を開始できます）。
          </p>
          <ul class="help-list">
            <li><strong>大物枠（ドラゴ・ゴーレム等）は連勤不可</strong>：1日働いたら翌日は「休」にします（週3回まで）。</li>
            <li><strong>夜番の翌朝は昼番不可</strong>：夜番に入った翌日にすぐ昼番へ入ることはできません（夜→夜は可能）。</li>
            <li><strong>新米枠（プルル・マンドラ等）は夜の単独配置不可</strong>：夜番にする時は、他の仲間も一緒に夜番へ配置します。</li>
            <li><strong>指定休・満月の夜</strong>：指定休の日や、満月の夜の昼型獣人（フェンリル等）は最初からロックされています。</li>
          </ul>
        </div>
        <div class="help-step-card">
          <span class="step-num">手順 3</span>
          <h3>相性◎（+100）と同番NG（-150）・全戦防衛必須</h3>
          <p>
            気の合うペアを同じ時間帯に並べると<strong>防衛力が +100</strong> 上がりますが、<strong>「この人とは一緒に働きたくない」という不仲ペアを同じ枠に置くと防衛力が -150 下がってしまいます</strong>。<br />
            勇者軍は毎日決まった時間ではなく<strong>不規則な時間帯に現れ（手薄な枠は特に狙われます）</strong>、<strong>1回でも城門を突破されたら防衛失敗</strong>となります。どの時間帯に来ても守り抜けるシフトを組みましょう。
          </p>
        </div>
      </div>`,
      en: `<div class="help-grid">
        <div class="help-step-card">
          <span class="step-num">Step 1</span>
          <h3>Guard Defense vs. Enemy Raid Power</h3>
          <p>
            In each shift slot, the actual combat power of the invading force fluctuates around the <strong>estimated power</strong>.<br />
            <strong>Your defense succeeds if your total Defense is at least the enemy's actual power.</strong> Leverage preferred shifts and pair synergies to build a solid defense.
          </p>
        </div>
        <div class="help-step-card">
          <span class="step-num">Step 2</span>
          <h3>Follow Healthy Shift Rules</h3>
          <p>
            To keep every companion healthy, your schedule must obey these shift rules (as long as labor rules are met, you can dispatch even if some slots are below estimated power):
          </p>
          <ul class="help-list">
            <li><strong>Heavyweights (Drago, Golem, etc.) Cannot Work Consecutive Days</strong>: After working 1 day, the next day must be Off (max 3 shifts/week).</li>
            <li><strong>No Day Shift Immediately After Night Shift</strong>: A guard on Night duty cannot work Day duty the next morning (Night → Night is allowed).</li>
            <li><strong>Rookies (Pururu, Mandra, etc.) Cannot Guard Night Alone</strong>: On Night duty, they must be paired with at least one other guard.</li>
            <li><strong>Requested Days Off & Full Moon Nights</strong>: Requested days off and Full Moon nights for daytime beastkin (Fenrir, etc.) are locked to Off.</li>
          </ul>
        </div>
        <div class="help-step-card">
          <span class="step-num">Step 3</span>
          <h3>Synergy (+100), Friction (-150) & Zero-Breach Victory</h3>
          <p>
            Assigning compatible partners to the same slot grants <strong>+100 Defense</strong>, while placing incompatible rivals together imposes <strong>-150 Defense</strong>.<br />
            Enemy raids strike unpredictably (weakly guarded slots are targeted more often), and <strong>even a single gate breach results in defeat</strong>.
          </p>
        </div>
      </div>`,
      zh: `<div class="help-grid">
        <div class="help-step-card">
          <span class="step-num">步骤 1</span>
          <h3>敌军战力与我方防卫力的较量</h3>
          <p>
            在每个时段中，涌来的勇者军实际战力会在<strong>「预测战力」上下波动</strong>。<br />
            <strong>只要我方防卫力不低于敌军实际战力即可防卫成功</strong>。善用擅长时段与搭档加成来构筑厚实的防线吧。
          </p>
        </div>
        <div class="help-step-card">
          <span class="step-num">步骤 2</span>
          <h3>遵守合理的出勤规则</h3>
          <p>
            为了不让城里的伙伴勉强，排班必须遵守以下出勤规则（只要遵守出勤规则，即使部分时段战力不足也可凭概率出击）：
          </p>
          <ul class="help-list">
            <li><strong>主力重将（德拉戈、魔像等）不可连勤</strong>：出勤1天后次日必须排「休」（每周最多3次）。</li>
            <li><strong>夜班次日清晨不可排白班</strong>：前一天上夜班后，第二天不可立即上白班（夜→夜可以）。</li>
            <li><strong>新人（普露露、曼德拉等）不可单独值夜班</strong>：排夜班时必须与其他伙伴一同配置在夜班。</li>
            <li><strong>指定休假・满月之夜</strong>：指定休假日以及满月之夜的昼型兽人（芬里尔等）固定为休假。</li>
          </ul>
        </div>
        <div class="help-step-card">
          <span class="step-num">步骤 3</span>
          <h3>默契搭档（+100）与不和组合（-150）・全战防卫必须</h3>
          <p>
            将合得来的搭档排在同一时段可使<strong>防卫力 +100</strong>，但将不和的两人排在同一时段会使<strong>防卫力 -150</strong>。<br />
            勇者军会在不固定的时段突袭（防卫薄弱的时段更容易被盯上），<strong>只要城门被突破1次即告防卫失败</strong>。请编排出无论何时遇袭都能守住的排班表吧。
          </p>
        </div>
      </div>`,
    })
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
    openOpeningMovieDialog(true);
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

  showTitleScreen();
}

if (typeof document !== "undefined" && document.getElementById("title-screen")) {
  initGame();
}
