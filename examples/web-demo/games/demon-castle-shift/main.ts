import { setHighsWasmUrl } from "../../../../src/index.js";
import { soundEngine } from "./audio.js";
import { ALL_PAIR_RELATIONS, LILITH_PROFILE, MONSTERS, getEffectivePower } from "./characters.js";
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
  formatCastleCalendarMonth,
  generateAdaptiveStage,
  generateRetryCampaignStage,
  getDifficultyLabel,
} from "./stages.js";
import {
  ALL_MONSTER_IDS,
  BALANCE_CONFIG,
  DAY_LABELS,
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

// ============================================================================
// Scene 0.5: Cinematic Opening Movie Cuts
// ============================================================================

interface OpeningMovieCut {
  image: string;
  cameraClass: string;
  particleColor: string;
  lead: string;
  sub: string;
  durationMs: number;
  isClimax?: boolean;
}

const OPENING_MOVIE_CUTS: readonly OpeningMovieCut[] = [
  {
    image: "./op-scene-1-castle.jpg",
    cameraClass: "op-cam-zoom-in",
    particleColor: "#fde047",
    lead: "深い森の奥、清らかな渓流の上に立つ最後の砦――「魔王城」。",
    sub: "行き場を失った魔物たちは、この静かな城で肩を寄せ合い暮らしていた。",
    durationMs: 5400,
  },
  {
    image: "./op-scene-2-heroes.jpg",
    cameraClass: "op-cam-pan-left",
    particleColor: "#fb923c",
    lead: "ある日、森の外縁で起きた魔物と人間の衝突が平穏に影を落とす。",
    sub: "街の人々を守るため、人間の勇者隊が昼夜を問わず砦へと進軍を開始した。",
    durationMs: 5400,
  },
  {
    image: "./bg-castle-hall.jpg",
    cameraClass: "op-cam-zoom-out",
    particleColor: "#38bdf8",
    lead: "城の奥深くで静かに眠りにつく『魔王』と、この城に暮らす仲間たち。",
    sub: "もし城門が破られれば、魔物たちの最後の居場所は失われてしまう。",
    durationMs: 5400,
  },
  {
    image: "./op-scene-4-guards.jpg",
    cameraClass: "op-cam-pan-up",
    particleColor: "#c084fc",
    lead: "昼の陽射しに強い者、夜の月影に冴える者、そして仲間の背中を支える者。",
    sub: "誰ひとり無理をさせず、24時間の交代シフトで城門を守り抜く――",
    durationMs: 5400,
  },
  {
    image: "./op-scene-4-guards.jpg",
    cameraClass: "op-cam-climax",
    particleColor: "#fde68a",
    lead: "『魔王城の24時間警備シフト』",
    sub: "新しく着任した警備隊長であるあなたに、この城のシフト編成が託された。",
    durationMs: 6200,
    isClimax: true,
  },
];

// ============================================================================
// Prologue Story Slides (Scene 1 - Lilith Speaking 1-on-1 to the Player)
// ============================================================================

interface PrologueSlide {
  heading: string;
  text: string;
  visualHtml: string;
}

const PROLOGUE_SLIDES: PrologueSlide[] = [
  {
    heading: "「ようこそ魔王城へ。あなたが新しく着任された警備隊長ですね」",
    text: "「遠いところをよく来てくださいました。私はこの魔王城で警備参謀を務めているリリスと申します。今日からあなたの副官として、城門の守りを一緒に担当させていただきますね。どうぞよろしくお願いいたします。」",
    visualHtml: "",
  },
  {
    heading: "「この城は、魔物たちが静かに暮らす最後の砦なのです」",
    text: "「深い森と渓流に守られたこの魔王城には、行き場を失った魔物たちが集まって暮らしています。城の奥深くでは私たちの主である魔王様も静かに眠っておられ、正門はみんなの暮らしを守る大切な要となっています。」",
    visualHtml: `
      <div class="prologue-scene-banner">
        <img class="prologue-banner-img" src="./op-scene-1-castle.jpg" alt="森の奥の魔王城" />
        <div class="prologue-banner-caption">深い森と渓流に守られた最後の砦「魔王城」</div>
      </div>
    `,
  },
  {
    heading: "「あなたにお願いしたいのは、24時間のシフト編成です」",
    text: "「先日、森の外縁で起きた衝突をきっかけに、人間の勇者隊が昼も夜も休まずこの砦へ進軍してきています。日差しが苦手な者や連勤ができない者など事情もさまざまですので、どうかみんなが無理なく力を発揮できる昼夜のシフトを組んでください。」",
    visualHtml: `
      <div class="prologue-scene-banner">
        <img class="prologue-banner-img" src="./op-scene-4-guards.jpg" alt="魔王城の門番たち" />
        <div class="prologue-banner-caption">昼と夜で得意分野が異なる魔王城の門番たち</div>
      </div>
    `,
  },
];

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
  const portraitEl = getEl<HTMLImageElement>("dialogue-portrait");
  const speakerEl = getEl<HTMLElement>("dialogue-speaker");
  const tagEl = getEl<HTMLElement>("dialogue-tag");
  const textEl = getEl<HTMLElement>("dialogue-text");
  const cursorEl = getEl<HTMLElement>("dialogue-cursor");

  portraitEl.src = options.portrait ?? LILITH_PROFILE.portrait;
  portraitEl.alt = options.speaker ?? LILITH_PROFILE.name;
  speakerEl.textContent = options.speaker ?? LILITH_PROFILE.name;
  tagEl.textContent = options.tag ?? LILITH_PROFILE.title;

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
  opCutIndex = Math.max(0, Math.min(OPENING_MOVIE_CUTS.length - 1, index));
  const cut = OPENING_MOVIE_CUTS[opCutIndex];

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
  progressFill.style.width = `${Math.round(((opCutIndex + 1) / OPENING_MOVIE_CUTS.length) * 100)}%`;

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
    finishBtn.textContent = opProceedToPrologueAfter ? "物語を始める" : "タイトル画面へ戻る";
    nextCutBtn.textContent = opProceedToPrologueAfter ? "物語を始める ▶" : "終了 ▶";
  } else {
    climaxOverlay.hidden = true;
    nextCutBtn.textContent = "次へ ▶";
    opAutoAdvanceTimer = window.setTimeout(() => {
      if (opCutIndex < OPENING_MOVIE_CUTS.length - 1) {
        renderOpeningCut(opCutIndex + 1);
      }
    }, cut.durationMs);
  }
}

function syncAudioButtonUi(): void {
  const playing = soundEngine.playing;
  document.querySelectorAll<HTMLButtonElement>("[data-bgm-toggle]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(playing));
    btn.textContent = playing ? "🔊 BGM: ON" : "🔇 BGM: OFF（クリックで音楽ON）";
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
  if (opCutIndex < OPENING_MOVIE_CUTS.length - 1) {
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
      continueBtn.textContent = `つづきから遊ぶ（${formatCastleCalendarMonth(saveData.highestUnlockedWeek)}・難易度：${getDifficultyLabel(nextTier)}）`;
    } else {
      const resumeIdx = Math.min(saveData.unlockedStageIndex, CAMPAIGN_STAGES.length - 1);
      continueBtn.textContent = `つづきから遊ぶ（${formatCastleCalendarMonth(resumeIdx + 1)}）`;
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
  const slide = PROLOGUE_SLIDES[prologueSlideIndex];
  const visualSceneEl = getEl<HTMLElement>("prologue-visual-scene");
  const vnCenterEl = getEl<HTMLElement>("prologue-vn-center");
  const hasVisual = slide.visualHtml.trim().length > 0;
  visualSceneEl.innerHTML = slide.visualHtml;
  visualSceneEl.hidden = !hasVisual;
  vnCenterEl.classList.toggle("is-greeting-solo", !hasVisual);

  getEl<HTMLElement>("prologue-step-indicator").textContent =
    `${prologueSlideIndex + 1} / ${PROLOGUE_SLIDES.length}`;

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
  dotsEl.innerHTML = PROLOGUE_SLIDES.map(
    (_, idx) => `<span class="prologue-dot ${idx === prologueSlideIndex ? "is-active" : ""}"></span>`
  ).join("");

  const prevBtn = getEl<HTMLButtonElement>("btn-prologue-prev");
  const nextBtn = getEl<HTMLButtonElement>("btn-prologue-next");
  prevBtn.disabled = prologueSlideIndex === 0;
  nextBtn.textContent =
    prologueSlideIndex === PROLOGUE_SLIDES.length - 1
      ? `${formatCastleCalendarMonth(1)}の編成へ進む`
      : "次へ";
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

  const hasDom = typeof document !== "undefined" && Boolean(document.getElementById("stage-progress-nav"));
  if (hasDom) {
    renderStageProgressNav();

    getEl<HTMLElement>("stage-heading").textContent =
      stageIndex >= 0
        ? stage.title
        : `${stage.title}${stage.difficultyLabel ? `（難易度：${stage.difficultyLabel}）` : ""}`;

    refreshEvaluationAndBoard(true);

    if (openBriefing) {
      openBriefingDialog(stage);
    }
  } else {
    currentEvaluation = evaluateSchedule(currentStage, currentSchedule);
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
  const buttonsHtml = CAMPAIGN_STAGES.map((st, idx) => {
    const isUnlocked =
      saveData.unlockAllDemo ||
      idx <= saveData.unlockedStageIndex ||
      idx + 1 <= saveData.highestUnlockedWeek;
    const isActive = currentStage.id === st.id;
    const isCleared = Boolean(saveData.clearedRanks[st.id]);
    const rankBadge = isCleared
      ? `<span class="stage-rank-mini" title="防衛成功">✓</span>`
      : !isUnlocked
        ? `<span>🔒</span>`
        : "";
    const label = formatCastleCalendarMonth(idx + 1, false);
    const fullEraTitle = formatCastleCalendarMonth(idx + 1, true);
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
  const endlessLabel = `${formatCastleCalendarMonth(endlessWeek, false)}（難易度：${getDifficultyLabel(endlessTier)}）`;
  const randomBtnHtml = `<button type="button" class="stage-pill-btn ${isEndlessActive ? "is-active" : ""}" data-stage-random="true" ${!endlessUnlocked ? "disabled" : ""} title="ユーザーの警備履歴に応じて難易度が自動調整される翌月以降の編成">
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

  body.innerHTML = `
    <div id="briefing-stage-box" class="prologue-stage" style="margin-bottom:0.85rem;cursor:pointer;" title="クリックでメッセージを全文表示">
      <img src="./char-lilith.jpg" alt="リリス" width="80" height="80" class="prologue-portrait" style="width:80px;height:80px;" />
      <div>
        <span class="prologue-step-indicator">${days.length}日間 ・ 今週の当番 ${stage.availableMonsters.length}名</span>
        <h3 style="margin:0.15rem 0 0.35rem;font-size:1.05rem;">${stage.title}</h3>
        <p id="briefing-lilith-text" style="margin:0;font-size:0.86rem;line-height:1.65;color:var(--text-main);min-height:3.2em;"></p>
      </div>
    </div>

    <div class="briefing-new-rule-box">
      <h3>${stage.newRuleTitle}</h3>
      <p>${stage.newRuleSummary}</p>
    </div>

    <div style="display:flex;justify-content:flex-end;align-items:center;gap:0.6rem;flex-wrap:wrap;">
      <button id="btn-briefing-start" type="button" class="btn-dispatch" style="max-width:260px;">
        シフト編成を始める
      </button>
    </div>
  `;

  if (!dialog.open) {
    dialog.showModal();
  }
  soundEngine.setSceneTrack("prologue");
  syncAudioButtonUi();

  const introTextEl = document.getElementById("briefing-lilith-text");
  const fullIntro = stage.lilithIntro;
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
      const shiftLabel = s.targetShift === "day" ? "昼" : s.targetShift === "night" ? "夜" : "休";
      return {
        stepIndex: i + 1,
        totalSteps: steps.length,
        day: s.day,
        monsterId: s.monsterId,
        targetShift: s.targetShift,
        shortCallout:
          s.shortCallout ??
          `${MONSTERS[s.monsterId].name}の${DAY_LABELS[s.day]}を「${shiftLabel}」にしましょう`,
        instruction: s.instruction,
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
      if (!list.includes(v.shortBadge)) {
        list.push(v.shortBadge);
      }
      cellViolationMap.set(key, list);
    }
  }

  const dayHeadersHtml = days
    .map((d) => {
      const nightReq = currentStage.requirements.find((r) => r.day === d && r.shift === "night");
      const moonBadge = nightReq?.isFullMoon ? `<span class="moon-tag">満月</span>` : "";
      const isDimmedCol = activeTutorial && activeTutorial.day !== d;
      return `<th scope="col" class="${isDimmedCol ? "is-tutorial-dimmed-cell" : ""}">${DAY_LABELS[d]}${moonBadge}</th>`;
    })
    .join("");

  const theadHtml = `
    <thead>
      <tr>
        <th scope="col" class="col-monster">警備メンバー（クリックで詳細）</th>
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
        const staffPillHtml =
          req.minStaff > 1 || !staffMet
            ? `<span class="meter-pill ${staffMet ? "ok" : "ng"}">人数 ${assignedMonsters.length}/${req.minStaff}</span>`
            : "";

        return `
          <td class="raid-cell ${cellStateClass} ${isRelatedRaid ? "is-tutorial-related-raid" : ""} ${isDimmedRaid ? "is-tutorial-dimmed-cell" : ""}">
            <div class="raid-enemy-title">${req.enemyName}</div>
            <div class="raid-meters">
              ${staffPillHtml}
              <span class="meter-pill ${powerPillClass}">
                防衛 ${currentPower} / 予測 ${expectedPower}
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

  const monsterRowsHtml = currentStage.availableMonsters
    .map((mId) => {
      const m = MONSTERS[mId];
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
            return `
              <td class="shift-cell state-off cell-locked-pto ${isDimmedCell ? "is-tutorial-dimmed-cell" : ""}">
                <span class="locked-off-label" title="${reqOff.reason}">指定休（${reqOff.reason}）</span>
              </td>
            `;
          }

          const isTutOff = isTargetCell && activeTutorial?.targetShift === "off";
          const isTutDay = isTargetCell && activeTutorial?.targetShift === "day";
          const isTutNight = isTargetCell && activeTutorial?.targetShift === "night";

          const tutorialCalloutHtml =
            isTargetCell && activeTutorial
              ? `<div class="tutorial-callout-bubble" role="status">
                  <div class="tutorial-callout-header">
                    <span class="tutorial-step-pill">リリスと一緒に編成 ${activeTutorial.stepIndex}/${activeTutorial.totalSteps}</span>
                    <button type="button" class="tutorial-skip-btn" data-skip-tutorial="true">ここからは自分で組む</button>
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
                  activeConflictPartner = MONSTERS[otherId].name;
                } else if (rel.moraleDelta > 0 && !activeSynergyPartner) {
                  activeSynergyPartner = MONSTERS[otherId].name;
                }
              }
            }
          }

          let noteHtml = "";
          if (hasViolation) {
            noteHtml = `<div class="cell-note is-error">${cellViolations[0]}</div>`;
          } else if (activeConflictPartner) {
            noteHtml = `<div class="cell-note is-conflict">⚡${activeConflictPartner}と同番NG (-150)</div>`;
          } else if (activeSynergyPartner) {
            noteHtml = `<div class="cell-note is-synergy">🤝${activeSynergyPartner}と連携 (+100)</div>`;
          } else if (isFullMoonForbidden) {
            noteHtml = `<div class="cell-note">満月夜は不可</div>`;
          }

          return `
            <td class="shift-cell state-${currentShift} ${hasViolation ? "has-violation" : ""} ${isTargetCell ? "is-tutorial-spotlight" : ""} ${isDimmedCell ? "is-tutorial-dimmed-cell" : ""}">
              ${tutorialCalloutHtml}
              <div class="shift-btn-group" role="group" aria-label="${m.name}の${DAY_LABELS[d]}シフト">
                <button
                  type="button"
                  class="shift-btn ${currentShift === "off" ? "active-off" : ""}"
                  data-monster="${mId}"
                  data-day="${d}"
                  data-shift="off"
                  ${isTutOff ? 'data-tutorial-target="true"' : ""}
                >休</button>
                <button
                  type="button"
                  class="shift-btn ${currentShift === "day" ? "active-day" : ""}"
                  data-monster="${mId}"
                  data-day="${d}"
                  data-shift="day"
                  ${isTutDay ? 'data-tutorial-target="true"' : ""}
                >昼</button>
                <button
                  type="button"
                  class="shift-btn ${currentShift === "night" ? "active-night" : ""}"
                  data-monster="${mId}"
                  data-day="${d}"
                  data-shift="night"
                  ${isFullMoonForbidden ? `disabled title="満月の夜は${m.name}を夜番に配置できません"` : ""}
                  ${isTutNight ? 'data-tutorial-target="true"' : ""}
                >夜</button>
              </div>
              ${noteHtml}
            </td>
          `;
        })
        .join("");

      return `
        <tr class="${isDimmedRow ? "is-tutorial-dimmed-row" : ""}">
          <th scope="row" class="monster-row-th">
            <div
              class="monster-cell-header"
              style="--monster-accent: ${m.accentColor}"
              data-monster-info="${mId}"
              role="button"
              tabindex="0"
              title="クリックで${m.name}の詳細（普段の持ち場：${m.usualPost}）を下部の会話枠に表示"
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
                    出勤 ${assignedCount}/${m.maxWeeklyShifts}
                  </span>
                </div>
                <div class="monster-power-compare">
                  <span class="power-chip-day">昼 ${dayPower}</span>
                  <span class="power-chip-night">夜 ${nightPower}</span>
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

  table.innerHTML = `
    ${theadHtml}
    <tbody>
      ${buildRaidRow("day", "昼の警備", "raid-row-day")}
      ${buildRaidRow("night", "夜の警備", "raid-row-night")}
      ${monsterRowsHtml}
    </tbody>
  `;

  table.querySelectorAll<HTMLButtonElement>("[data-skip-tutorial]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      tutorialSkipped = true;
      soundEngine.playClick("off");
      refreshEvaluationAndBoard(false);
      speakInDock({
        speaker: LILITH_PROFILE.name,
        tag: LILITH_PROFILE.title,
        portrait: LILITH_PROFILE.portrait,
        text: "わかりました。ここからはあなたのペースで自由にシフトを組んでみてくださいね。",
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
      const m = MONSTERS[mId];
      soundEngine.playClick("day");
      speakInDock({
        speaker: m.name,
        tag: `${m.title}（${m.race}・持ち場：${m.usualPost}）`,
        portrait: m.portrait,
        text: `「${m.quotes.intro}」 ── ${m.traitSummary}`,
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
  const dispatchBtn = getEl<HTMLButtonElement>("btn-dispatch");
  const dispatchCallout = getEl<HTMLElement>("dispatch-tutorial-callout");
  dispatchBtn.removeAttribute("data-tutorial-target");
  dispatchCallout.hidden = true;
  dispatchCallout.innerHTML = "";

  const activeTutorial = getActiveTutorialStep();
  if (activeTutorial) {
    speakInDock({
      speaker: LILITH_PROFILE.name,
      tag: `リリスと一緒に編成（${activeTutorial.stepIndex}/${activeTutorial.totalSteps}）`,
      portrait: LILITH_PROFILE.portrait,
      text: activeTutorial.instruction,
    });
    return;
  }

  if (currentStage.tutorialSteps && !tutorialSkipped && currentEvaluation.isValid) {
    dispatchBtn.setAttribute("data-tutorial-target", "true");
    dispatchCallout.hidden = false;
    dispatchCallout.innerHTML = `
      <div class="tutorial-callout-header">
        <span class="tutorial-step-pill">シフト完成</span>
      </div>
      <div class="tutorial-callout-text">一緒に組んだ3日間のシフトが完成しました。下の「このシフトで警備する」を押しましょう。</div>
    `;
    speakInDock({
      speaker: LILITH_PROFILE.name,
      tag: "シフト完成",
      portrait: LILITH_PROFILE.portrait,
      text: "ありがとうございます、一緒に3日間のシフトが綺麗に組めましたね。右下の「このシフトで警備する」を押して、城門の警備へ向かいましょう。",
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
      speakInDock({
        speaker: LILITH_PROFILE.name,
        tag: "勤務条件の確認",
        portrait: LILITH_PROFILE.portrait,
        text: moveViolation.message,
      });
      return;
    }

    // Check if the player's last move triggered an incompatible pair ("この人とは一緒に働きたくない" -150)
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
          const m = MONSTERS[lastMove.monsterId];
          const other = MONSTERS[otherId];
          speakInDock({
            speaker: m.name,
            tag: `⚡ 同シフト拒否（${other.name}と同番で防衛力 ${rel.moraleDelta}）`,
            portrait: m.portrait,
            text: `${rel.description}（同じ枠に配置すると防衛力が ${Math.abs(rel.moraleDelta)} 下がります）`,
          });
          return;
        }
      }
    }
  }

  if (currentEvaluation.isValid) {
    speakInDock({
      speaker: LILITH_PROFILE.name,
      tag: "準備完了",
      portrait: LILITH_PROFILE.portrait,
      text: "すべての時間帯に頼もしい戦力を配置できました。「このシフトで警備する」で進みましょう。",
    });
    return;
  }

  const laborViolations = currentEvaluation.violations.filter(
    (v) => v.category !== "raid_power" && v.category !== "min_staff"
  );
  if (laborViolations.length > 0) {
    speakInDock({
      speaker: LILITH_PROFILE.name,
      tag: "勤務条件の確認",
      portrait: LILITH_PROFILE.portrait,
      text: laborViolations[0].message,
    });
    return;
  }

  if (lastMove && lastMove.shift !== "off") {
    const m = MONSTERS[lastMove.monsterId];
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
        const other = MONSTERS[otherId];
        speakInDock({
          speaker: m.name,
          tag: `🤝 ペア連携発動（${other.name}と同番で +${rel.moraleDelta}）`,
          portrait: m.portrait,
          text: `「${quote}」 ── ${rel.description}`,
        });
        return;
      }
    }

    speakInDock({
      speaker: m.name,
      tag: `${DAY_LABELS[lastMove.day]}・${lastMove.shift === "day" ? "昼番" : "夜番"}`,
      portrait: m.portrait,
      text: `「${quote}」`,
    });
    return;
  }

  speakInDock({
    speaker: LILITH_PROFILE.name,
    tag: LILITH_PROFILE.title,
    portrait: LILITH_PROFILE.portrait,
    text: currentStage.lilithIntro,
  });
}

function refreshEvaluationAndBoard(
  updateSpeech = true,
  lastMove?: { monsterId: MonsterId; day: DayIndex; shift: ShiftType }
): void {
  currentEvaluation = evaluateSchedule(currentStage, currentSchedule);
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
  stepStaffEl.textContent = `人数 ${staffOkSlots}/${totalSlots}`;

  const stepPowerEl = getEl<HTMLElement>("goal-step-power");
  const allPredOk = predOkSlots === totalSlots;
  stepPowerEl.className = `cond-pill ${allPredOk ? "is-ok" : "is-ng"}`;
  stepPowerEl.textContent = `予測到達 ${predOkSlots}/${totalSlots}`;

  const stepLawEl = getEl<HTMLElement>("goal-step-law");
  const allLawOk = laborViolations.length === 0;
  stepLawEl.className = `cond-pill ${allLawOk ? "is-ok" : "is-ng"}`;
  stepLawEl.textContent = allLawOk ? "勤務条件 OK" : `勤務違反 ${laborViolations.length}件`;

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
      const mA = MONSTERS[rel.monsterA];
      const mB = MONSTERS[rel.monsterB];
      const isPos = rel.moraleDelta >= 0;
      const sign = isPos ? `+${rel.moraleDelta}` : `${rel.moraleDelta}`;
      const prefix = isPos ? "🤝 相性◎" : "⚡ 同番NG";
      return `<button type="button" class="pair-chip ${isPos ? "is-positive" : "is-negative"}" data-rel-idx="${idx}" title="${rel.description}">${prefix}: ${mA.name}×${mB.name} (${sign})</button>`;
    })
    .join("");

  strip.querySelectorAll<HTMLButtonElement>("[data-rel-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-rel-idx"));
      const rel = activeRels[idx];
      if (!rel) return;
      const mA = MONSTERS[rel.monsterA];
      const mB = MONSTERS[rel.monsterB];
      const isPos = rel.moraleDelta >= 0;
      soundEngine.playClick(isPos ? "day" : "off");
      speakInDock({
        speaker: isPos ? mA.name : LILITH_PROFILE.name,
        tag: isPos
          ? `🤝 相性◎：${mA.name}×${mB.name}（同シフトで +${rel.moraleDelta}）`
          : `⚡ 同番NG：${mA.name}×${mB.name}（同シフトで ${rel.moraleDelta}）`,
        portrait: isPos ? mA.portrait : LILITH_PROFILE.portrait,
        text: rel.description,
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

  for (const v of currentEvaluation.violations) {
    if (v.monsterId && v.day !== undefined) {
      const target = opt[v.monsterId][v.day];
      if (currentSchedule[v.monsterId][v.day] !== target) {
        currentSchedule[v.monsterId][v.day] = target;
        soundEngine.playClick(target);
        refreshEvaluationAndBoard(false);
        const mName = MONSTERS[v.monsterId].name;
        const sLabel = target === "day" ? "昼" : target === "night" ? "夜" : "休";
        speakInDock({
          speaker: LILITH_PROFILE.name,
          tag: "ヒント",
          portrait: LILITH_PROFILE.portrait,
          text: `勤務条件の無理を解消するため、${mName}の${DAY_LABELS[v.day]}を「${sLabel}」に調整しました。`,
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
        const mName = MONSTERS[mId].name;
        const sLabel = target === "day" ? "昼" : "夜";
        speakInDock({
          speaker: LILITH_PROFILE.name,
          tag: "ヒント",
          portrait: LILITH_PROFILE.portrait,
          text: `${mName}の${DAY_LABELS[d]}を「${sLabel}」に配置しました。${currentStage.lilithHint}`,
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
        const mName = MONSTERS[mId].name;
        const sLabel = target === "day" ? "昼" : target === "night" ? "夜" : "休";
        speakInDock({
          speaker: LILITH_PROFILE.name,
          tag: "ヒント",
          portrait: LILITH_PROFILE.portrait,
          text: `${mName}の${DAY_LABELS[d]}を「${sLabel}」に調整しました。これで評価がさらに上がります。`,
        });
        return;
      }
    }
  }

  soundEngine.playSolveSuccess();
  speakInDock({
    speaker: LILITH_PROFILE.name,
    tag: "ヒント",
    portrait: LILITH_PROFILE.portrait,
    text: "すでにお手本シフトと同じ配置になっています。このまま「このシフトで警備する」へ進めます。",
  });
}

async function runLilithDiagnosis(): Promise<void> {
  const activeGen = stageLoadGeneration;
  const activeStageId = currentStage.id;
  try {
    const diag = await diagnoseScheduleWithHighs(currentStage, currentSchedule);
    if (activeGen !== stageLoadGeneration || currentStage.id !== activeStageId) return;
    if (diag.status === "Feasible") {
      soundEngine.playSolveSuccess();
      speakInDock({
        speaker: LILITH_PROFILE.name,
        tag: "状況確認",
        portrait: LILITH_PROFILE.portrait,
        text: "いま配置されているマスに手詰まりや違反はありません。このまま残りの空欄を埋めていけば防衛できます。",
      });
    } else {
      soundEngine.playError();
      const reasonText = diag.messages[0] ?? "現在の配置に偏りがあり、後半の枠で人手が足りなくなっています。";
      speakInDock({
        speaker: LILITH_PROFILE.name,
        tag: "状況確認",
        portrait: LILITH_PROFILE.portrait,
        text: `${reasonText} 該当するメンバーの出勤日を一度「休」に戻して調整してみてください。`,
      });
    }
  } catch (err) {
    console.error("Diagnosis failed:", err);
  }
}

function formatShiftChipText(shift: ShiftType): string {
  if (shift === "day") return "☀️昼";
  if (shift === "night") return "🌙夜";
  return "休";
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

  const dayHeaders = days.map((d) => `<th scope="col">${DAY_LABELS[d]}</th>`).join("");

  const monsterRows = stage.availableMonsters
    .map((mId) => {
      const m = MONSTERS[mId];
      const cells = days
        .map((d) => {
          const pShift = playerSchedule[mId]?.[d] ?? "off";
          const oShift = optSchedule[mId]?.[d] ?? "off";
          const isMatch = pShift === oShift;
          if (isMatch) {
            return `<td class="cmp-td is-match">
              <div class="cmp-cell-inner">
                <span class="cmp-shift-pill is-${oShift}">${formatShiftChipText(oShift)}</span>
                <span class="cmp-match-label">✓ 一致</span>
              </div>
            </td>`;
          }
          return `<td class="cmp-td is-diff">
            <div class="cmp-cell-inner">
              <span class="cmp-from-pill">自:${formatShiftChipText(pShift)}</span>
              <span class="cmp-diff-arrow">▶</span>
              <span class="cmp-shift-pill is-${oShift}">最:${formatShiftChipText(oShift)}</span>
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
      const shiftLabel = req.shift === "day" ? "昼" : "夜";
      const pPower = pSlot?.currentPower ?? 0;
      const oPower = oSlot?.currentPower ?? 0;
      const expectedEnemy = pSlot?.expectedPower ?? req.requiredPower;
      const pNames =
        pSlot && pSlot.assignedMonsters.length > 0
          ? pSlot.assignedMonsters.map((id) => MONSTERS[id].name).join("・")
          : "なし";
      const oNames =
        oSlot && oSlot.assignedMonsters.length > 0
          ? oSlot.assignedMonsters.map((id) => MONSTERS[id].name).join("・")
          : "なし";
      const isBreached = outcome && !outcome.isWin;
      const hadRaid = outcome ? outcome.hasRaid !== false : true;
      const actualText = !hadRaid
        ? `🍃 襲来なし／予測 ${expectedEnemy}`
        : outcome
          ? `実際 ${outcome.actualEnemyPower}／予測 ${expectedEnemy}`
          : `予測 ${expectedEnemy}`;
      return `<div class="cmp-slot-card ${isBreached ? "is-breached" : ""}">
        <div class="cmp-slot-head">
          <span>${shiftIcon} ${DAY_LABELS[req.day]}・${shiftLabel}（敵：${actualText}）</span>
          ${isBreached ? `<span class="cmp-breach-tag">💥 突破された枠</span>` : ""}
        </div>
        <div class="cmp-slot-body">
          <div class="cmp-slot-line is-player">あなた：<strong>防衛 ${pPower}</strong>（${pNames}）</div>
          <div class="cmp-slot-line is-optimal">最適解：<strong>防衛 ${oPower}</strong>（${oNames}）</div>
        </div>
      </div>`;
    })
    .join("");

  return `
    <div class="optimal-compare-box">
      <div class="optimal-compare-header">
        <div>
          <h4 class="optimal-compare-title">📊 あなたのシフト vs 最適解（お手本シフト）の比較</h4>
          <p class="optimal-compare-sub">金枠のマスが最適解と異なっていた配置です（次回挑戦時は敵編成・当番が新しくランダム生成されます）。</p>
        </div>
        <div class="optimal-compare-totals">
          <span class="cmp-total-pill">あなたの総防衛力：<strong>${playerEval.totalScore}</strong></span>
          <span class="cmp-total-pill is-opt">最適解の総防衛力：<strong>${optEval.totalScore}</strong></span>
        </div>
      </div>

      <div class="cmp-table-wrap">
        <table class="shift-compare-table" aria-label="あなたのシフトと最適解の比較表">
          <thead>
            <tr>
              <th scope="col">メンバー</th>
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
    remainingHp > 0 ? "城門無傷（全戦防衛必須）" : "城門突破（陥落）";
  return `<span class="castle-hp-orbs">${orbs.join("")} <span>${statusLabel}</span></span>`;
}

function renderBattleDefenderAvatarsHtml(outcome: SlotBattleOutcome): string {
  if (outcome.assignedMonsters.length === 0) {
    return `<div class="battle-party-avatars"><img class="battle-unit-avatar is-empty" src="./char-lilith.jpg" alt="配置なし" width="52" height="52" /></div>`;
  }
  const imgs = outcome.assignedMonsters
    .map((mId) => {
      const m = MONSTERS[mId];
      return `<img class="battle-unit-avatar ${outcome.hasSynergy ? "has-synergy-glow" : ""}" src="${m.portrait}" alt="${m.name}" title="${m.name}" width="54" height="54" />`;
    })
    .join("");
  const synChip = outcome.hasSynergy
    ? `<span class="battle-synergy-chip">✨ 連携 +100</span>`
    : "";
  const conflictChip = outcome.hasConflict
    ? `<span class="battle-conflict-chip">⚡ 不仲 -150</span>`
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
        ? laborViolations.map((v) => `<li class="violation-item">${v.message}</li>`).join("")
        : `<li class="violation-item">警備メンバーがまだ誰も配置されていません。各マスの「昼」または「夜」を選んで配置してください。</li>`;

    body.innerHTML = `
      <div class="result-rank-banner" style="border-color: var(--danger-crimson);">
        <div class="result-rank-letter" style="color: var(--danger-crimson);">勤務条件の確認</div>
        <p style="margin: 0.4rem 0 0; font-size: 0.84rem; color: var(--text-muted);">
          警備を開始する前に、以下の勤務条件の無理を解消してください。
        </p>
      </div>
      <ul class="violation-list" style="margin-bottom:1rem;">${issues}</ul>
      <div style="display:flex;gap:0.6rem;justify-content:flex-end;flex-wrap:wrap;">
        <button id="btn-modal-hint" type="button" class="btn-glass">
          1マスだけヒントを見る
        </button>
        <button id="btn-modal-retry" type="button" class="btn-dispatch" style="width:auto;padding:0.55rem 1.2rem;">
          シフト表に戻って調整する
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

  // Start in calm watch atmosphere; the Dragon Quest–style Battle BGM erupts the moment an enemy squad appears!
  soundEngine.setSceneTrack("prologue");
  syncAudioButtonUi();

  // Roll actual enemy combat powers from the truncated log-normal distribution
  const outcomes: SlotBattleOutcome[] = rollStageBattles(currentStage, currentEvaluation);
  const maxHp = BALANCE_CONFIG.castleMaxHp;
  let remainingHp = maxHp;

  const initialSlotsHtml = outcomes
    .map((o, idx) => {
      const shiftIcon = o.shift === "day" ? "☀️" : o.isFullMoon ? "🌕" : "🌙";
      const shiftLabel = o.shift === "day" ? "昼" : "夜";
      const miniAvatars = o.assignedMonsters
        .map((mId) => `<img class="log-mini-avatar" src="${MONSTERS[mId].portrait}" alt="${MONSTERS[mId].name}" width="20" height="20" />`)
        .join("");
      return `<div id="battle-slot-row-${idx}" class="battle-slot-item is-pending">
        <div class="battle-slot-left">
          <span class="battle-slot-time">${shiftIcon} ${DAY_LABELS[o.day]}・${shiftLabel}</span>
          <span class="battle-slot-avatars">${miniAvatars}</span>
          <span class="battle-slot-enemy">${o.enemyName}</span>
        </div>
        <span id="battle-slot-res-${idx}" class="battle-slot-res">防衛 ${o.defensePower} vs 予測 ${o.expectedEnemyPower}</span>
      </div>`;
    })
    .join("");

  body.innerHTML = `
    <div class="battle-fs-shell">
      <header id="gate-sanctum-banner" class="salamander-sanctum-banner battle-fs-topbar">
        <div class="salamander-sanctum-left">
          <div class="salamander-emblem" aria-hidden="true">🏰</div>
          <div>
            <div class="salamander-status-title">${currentStage.title} — 第一防衛城門</div>
            <div id="salamander-status-text" class="salamander-status-sub">警備隊が配置についた。画面クリックで次の場面へ進みます。</div>
          </div>
        </div>
        <div class="battle-fs-top-controls">
          <div id="salamander-hp-box">${renderHpOrbsHtml(remainingHp, maxHp)}</div>
          <button id="btn-battle-auto" type="button" class="btn-glass btn-sm" aria-pressed="false">▶ 自動進行: OFF</button>
          <button id="btn-skip-battle-anim" type="button" class="btn-glass btn-sm">結果までスキップ ⏭</button>
        </div>
      </header>

      <!-- Final Result Summary sits right below the top bar when the battle finishes so the Next Stage button is immediately visible -->
      <div id="battle-final-summary-area"></div>

      <!-- Full-Screen Live Battle Stage (Encounter Cutscene + Clash Arena) -->
      <div id="battle-live-stage" class="battle-live-stage" title="クリックで次の場面へ進む">
        <!-- FULL-SCREEN SCENE 1: Dawn / Nightfall & Enemy Arrival Cutscene -->
        <div id="battle-encounter-scene" class="battle-encounter-scene is-day-encounter" aria-live="polite">
          <div class="encounter-sky-rays" aria-hidden="true"></div>
          <div class="encounter-celestial-orb" id="encounter-celestial-orb" aria-hidden="true">☀️</div>

          <div class="encounter-stage-inner">
            <div class="encounter-sky-header">
              <span id="encounter-slot-progress" class="encounter-slot-progress">SLOT 1 / ${outcomes.length}</span>
              <h3 id="encounter-time-badge" class="encounter-time-headline">🌅 月曜日の朝 ── 夜が明けた</h3>
            </div>

            <div id="encounter-arrival-card" class="encounter-arrival-card">
              <div class="encounter-enemy-showcase">
                <div class="encounter-aura-ring" aria-hidden="true"></div>
                <img id="encounter-enemy-img" class="encounter-enemy-img" src="./enemy-scout.jpg" alt="出現した敵部隊" width="156" height="156" />
              </div>
              <div class="encounter-arrival-body">
                <div class="encounter-kicker-row">
                  <span id="encounter-kicker-badge" class="encounter-kicker-badge">⚔️ 勇者軍・出現</span>
                  <span id="encounter-expected-badge" class="encounter-expected-badge">予測戦力 -</span>
                </div>
                <div id="encounter-headline" class="encounter-headline">城門の前に「勇者斥候隊」が現れた</div>
                <div id="encounter-quote" class="encounter-quote">「城門の守りを確かめに来たぞ」</div>

                <div class="encounter-defender-callout">
                  <div id="encounter-defender-avatars" class="encounter-defender-avatars"></div>
                  <div id="encounter-defender-lead" class="encounter-defender-lead">🛡️ 当番が城門の前に立ち塞がる</div>
                </div>
              </div>
            </div>

            <div class="encounter-bottom-hint">
              <button id="btn-encounter-proceed" type="button" class="btn-battle-proceed">
                <span id="encounter-step-indicator">⚔️ 戦いを始める ▶（クリックで進行）</span>
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
              <span id="cutin-header">警備を開始します…</span>
              <span id="cutin-phase-pill" class="cutin-phase-pill">⚔️ 交戦開始</span>
            </div>
            <span id="cutin-winprob-badge" class="cutin-winprob-badge">戦況確認中</span>
          </div>

          <div class="battle-cutin-versus">
            <div id="cutin-left-side" class="cutin-side cutin-side-defenders">
              <div class="cutin-unit-row">
                <div id="cutin-defender-avatars" class="cutin-avatars-slot"></div>
                <div class="cutin-unit-info">
                  <div class="cutin-side-label">🛡️ 魔王城・警備当番</div>
                  <div class="cutin-side-title">
                    <span id="cutin-defender-name">警備隊</span>
                    <span id="cutin-defender-power" class="cutin-power-num is-def">防衛 -</span>
                  </div>
                  <div id="cutin-defender-quote" class="cutin-quote"></div>
                </div>
              </div>
            </div>

            <div id="cutin-vs-center" class="cutin-vs-badge">⚔️</div>

            <div id="cutin-right-side" class="cutin-side cutin-side-enemies">
              <div class="cutin-unit-row is-enemy-row">
                <div class="cutin-unit-info">
                  <div class="cutin-side-label is-ene-label">⚔️ 押し寄せる勇者軍</div>
                  <div class="cutin-side-title">
                    <span id="cutin-enemy-name">討伐隊</span>
                    <span id="cutin-enemy-power" class="cutin-power-num is-ene">敵 -</span>
                  </div>
                  <div id="cutin-enemy-quote" class="cutin-quote"></div>
                </div>
                <div id="cutin-enemy-avatar" class="cutin-enemy-avatar-slot">
                  <img class="battle-unit-avatar is-enemy" src="./enemy-scout.jpg" alt="敵部隊" width="84" height="84" />
                </div>
              </div>
            </div>
          </div>

          <div id="battle-tug-wrap" class="battle-tug-wrap">
            <div class="battle-tug-labels">
              <span id="tug-label-def">🛡️ 味方防衛力</span>
              <span id="tug-label-status" class="tug-status-center">⚔️ 激突中</span>
              <span id="tug-label-ene">敵戦力 ⚔️</span>
            </div>
            <div class="battle-tug-track">
              <div id="battle-tug-fill-def" class="battle-tug-fill-def" style="width: 50%;"></div>
              <div id="battle-tug-spark" class="battle-tug-spark" style="left: 50%;">⚡</div>
            </div>
          </div>

          <div id="cutin-action-footer" class="cutin-action-footer" hidden>
            <button id="btn-clash-proceed" type="button" class="btn-battle-proceed">
              <span id="clash-step-indicator">▶ 次の時間帯へ進む（クリックで進行）</span>
            </button>
          </div>
        </div>
      </div>

      <div class="battle-log-section">
        <div class="battle-log-heading">📅 今週の防衛タイムライン</div>
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
    autoBtn.textContent = isAutoAdvance ? "🔄 自動進行: ON" : "▶ 自動進行: OFF";
    autoBtn.setAttribute("aria-pressed", isAutoAdvance ? "true" : "false");
    autoBtn.classList.toggle("is-active-speed", isAutoAdvance);
  };
  syncAutoBtnUi();

  autoBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    isAutoAdvance = !isAutoAdvance;
    syncAutoBtnUi();
    soundEngine.playClick();
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
      soundEngine.playClick();
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
    const isDay = o.shift === "day";
    const shiftIcon = isDay ? "☀️" : o.isFullMoon ? "🌕" : "🌙";
    const shiftLabel = isDay ? "昼" : "夜";
    const dayName = DAY_LABELS[o.day];
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
            ? `🌅 ${dayName}曜日の朝 ── 夜が明けた`
            : `🌅 夜が明け、${dayName}曜日の朝が訪れた`
          : o.isFullMoon
            ? `🌕 日が暮れて暗くなり、${dayName}曜日の満月が昇った`
            : `🌙 日が暮れて暗くなり、${dayName}曜日の夜が訪れた`;

        if (encounterSlotProgress) {
          encounterSlotProgress.textContent = `${dayName}曜日・${shiftLabel}（${i + 1} / ${outcomes.length}）`;
        }
        if (encounterCelestialOrb) {
          encounterCelestialOrb.textContent = shiftIcon;
        }
        if (encounterTimeBadge) {
          encounterTimeBadge.textContent = peacefulTimeText;
        }
        if (encounterKickerBadge) {
          encounterKickerBadge.textContent = "🍃 敵影なし・平穏";
        }
        if (encounterExpectedBadge) {
          encounterExpectedBadge.textContent = `警戒レベル ${o.expectedEnemyPower}`;
        }
        if (encounterEnemyImg) {
          encounterEnemyImg.src = o.defenderPortrait;
          encounterEnemyImg.alt = o.defenderName;
          encounterEnemyImg.classList.remove("is-boss-unit");
        }
        if (encounterHeadline) {
          encounterHeadline.textContent = "この時間帯に勇者軍の襲来はなかった";
        }
        if (encounterQuote) {
          encounterQuote.textContent = `「${o.defenderQuote}」`;
        }
        if (encounterDefAvatars) {
          encounterDefAvatars.innerHTML = o.assignedMonsters
            .map((mId) => `<img class="encounter-def-mini" src="${MONSTERS[mId].portrait}" alt="${MONSTERS[mId].name}" width="38" height="38" />`)
            .join("");
        }
        if (encounterDefLead) {
          encounterDefLead.textContent = `🛡️ 当番：${o.defenderName}（防衛力 ${o.defensePower}）が平穏に見回りを終えた`;
        }
        encounterProceedBtn?.classList.remove("is-combat-cta");
        if (encounterStepIndicator) {
          encounterStepIndicator.textContent = "🍃 異常なし ── 次の時間帯へ進みます…";
        }
        if (salStatusTextEl && remainingHp > 0) {
          salStatusTextEl.textContent = `${dayName}曜日・${shiftLabel}：勇者軍の動きはなく、静かに時間が過ぎた。`;
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
        // Peaceful slots advance automatically without requiring a click!
        await sleepAnim(750, true);
        encounterScene.classList.remove("is-peaceful-encounter");
      }

      rowEl?.classList.remove("is-active");
      rowEl?.classList.add("is-peaceful");
      if (resEl) {
        resEl.textContent = `🍃 襲来なし（防衛 ${o.defensePower}）`;
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
      tugStatus.textContent = `⚔️ 防衛 ${o.defensePower} vs 敵予測 ${o.expectedEnemyPower}`;
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
      headerEl.textContent = `${shiftIcon} ${dayName}曜日・${shiftLabel}の戦い`;
    }
    if (winProbBadge) {
      const diff = o.defensePower - o.expectedEnemyPower;
      winProbBadge.textContent =
        diff >= 80
          ? "🛡️ 予測を大きく上回る"
          : diff >= 0
            ? "⚔️ 予測戦力以上"
            : "⚠️ 予測戦力未満";
      winProbBadge.className = `cutin-winprob-badge ${diff >= 80 ? "is-safe" : diff >= 0 ? "is-mid" : "is-risky"}`;
    }
    if (defAvatarsEl) {
      defAvatarsEl.innerHTML = renderBattleDefenderAvatarsHtml(o);
    }
    if (eneAvatarEl) {
      eneAvatarEl.innerHTML = `<img class="battle-unit-avatar is-enemy ${o.isBossRaid ? "is-boss-unit" : ""}" src="${o.enemyPortrait}" alt="${o.enemyName}" width="84" height="84" />`;
    }
    if (defNameEl) defNameEl.textContent = o.defenderName;
    if (defPwrEl) defPwrEl.textContent = `防衛 ${o.defensePower}`;
    if (defQuoteEl) defQuoteEl.textContent = `「${o.defenderQuote}」`;
    if (eneNameEl) eneNameEl.textContent = `${o.enemyIcon} ${o.enemyName}`;
    if (enePwrEl) enePwrEl.textContent = `予測 ${o.expectedEnemyPower}`;
    if (eneQuoteEl) eneQuoteEl.textContent = `「${o.enemyQuote}」`;
    updateTugBar(o.defensePower, o.expectedEnemyPower);

    // =========================================================================
    // BEAT 1 (静): Full-Screen Dawn / Nightfall Time Transition
    // & BEAT 2 (動): Dramatic "Enemy Appeared" Cut-in Animation (Wait for Click!)
    // =========================================================================
    if (!skipped && encounterScene) {
      const timeTransitionText = isDay
        ? i === 0
          ? `🌅 ${dayName}曜日の朝 ── 夜が明けた`
          : `🌅 夜が明け、${dayName}曜日の朝が訪れた`
        : o.isFullMoon
          ? `🌕 日が暮れて暗くなり、${dayName}曜日の満月が昇った`
          : `🌙 日が暮れて暗くなり、${dayName}曜日の夜が訪れた`;

      const arrivalHeadlineText = isDay
        ? `城門の前に「${o.enemyName}」が現れた`
        : `闇の中から「${o.enemyName}」が現れた`;

      if (encounterSlotProgress) {
        encounterSlotProgress.textContent = `${dayName}曜日・${shiftLabel}（${i + 1} / ${outcomes.length}）`;
      }
      if (encounterCelestialOrb) {
        encounterCelestialOrb.textContent = shiftIcon;
      }
      if (encounterTimeBadge) {
        encounterTimeBadge.textContent = timeTransitionText;
      }
      if (encounterKickerBadge) {
        encounterKickerBadge.textContent = o.isBossRaid
          ? "👑 勇者軍主力・出現"
          : isDay
            ? "☀️ 昼の進軍部隊・出現"
            : "🌙 夜の奇襲部隊・出現";
      }
      if (encounterExpectedBadge) {
        encounterExpectedBadge.textContent = `⚔️ 敵予測戦力 ${o.expectedEnemyPower}`;
      }
      if (encounterEnemyImg) {
        encounterEnemyImg.src = o.enemyPortrait;
        encounterEnemyImg.alt = o.enemyName;
        encounterEnemyImg.classList.toggle("is-boss-unit", o.isBossRaid);
      }
      if (encounterHeadline) {
        encounterHeadline.textContent = arrivalHeadlineText;
      }
      if (encounterQuote) {
        encounterQuote.textContent = `「${o.enemyQuote}」`;
      }
      if (encounterDefAvatars) {
        encounterDefAvatars.innerHTML = o.assignedMonsters
          .map((mId) => `<img class="encounter-def-mini" src="${MONSTERS[mId].portrait}" alt="${MONSTERS[mId].name}" width="38" height="38" />`)
          .join("");
      }
      if (encounterDefLead) {
        encounterDefLead.textContent = `🛡️ 警備当番：${o.defenderName}（防衛力 ${o.defensePower}）が立ち向かう`;
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
          ? `🌅 ${dayName}曜日の朝が訪れました…`
          : `🌙 ${dayName}曜日の夜が訪れました…`;
      }
      soundEngine.playTimeTransitionCue(isDay, o.isFullMoon);
      await sleepAnim(420, true);

      // Beat 2 (動): Enemy bursts onto the full-screen stage -> Dragon Quest Encounter Flourish + Battle BGM!
      if (!skipped) {
        encounterScene.classList.add("is-enemy-revealed");
        void encounterArrivalCard?.offsetWidth;
        encounterArrivalCard?.classList.add("is-burst-in");
        encounterProceedBtn?.classList.add("is-combat-cta");
        if (encounterStepIndicator) {
          encounterStepIndicator.textContent = "⚔️ 戦いを始める ▶（クリックで交戦開始）";
        }
        if (resEl) {
          resEl.textContent = `${o.enemyIcon} ${o.enemyName}が現れた`;
        }
        if (salStatusTextEl && remainingHp > 0) {
          salStatusTextEl.textContent = isDay
            ? `${dayName}曜日の夜が明けると、城門の前に「${o.enemyName}」が現れた。`
            : `日が暮れて暗くなると、闇の中から「${o.enemyName}」が現れた。`;
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
        resEl.textContent = "⚔️ 交戦中…";
      }
      if (cutinPhasePill) {
        cutinPhasePill.textContent = "⚔️ 両軍対峙";
        cutinPhasePill.className = "cutin-phase-pill";
      }
      // Brief standoff before blades clash so the player sees the left vs right matchup
      await sleepAnim(260, false);

      if (vsCenter) {
        vsCenter.classList.add("is-clashing");
      }
      if (cutinPhasePill) {
        cutinPhasePill.textContent = "⚡ 戦力激突中…";
      }
      if (tugStatus) {
        tugStatus.textContent = "⚡ つば迫り合い中…";
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
        if (enePwrEl) enePwrEl.textContent = `敵 ${frame.val}`;
        updateTugBar(o.defensePower, frame.val);
        soundEngine.playBattleClashTick(fIdx);
        await sleepAnim(frame.waitMs, false);
      }
    }

    if (enePwrEl) {
      enePwrEl.textContent = `敵 ${o.actualEnemyPower}`;
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
        resEl.textContent = `🛡️ 防衛 ${o.defensePower} vs 敵 ${o.actualEnemyPower}（防衛成功）`;
      }
      if (cutinPhasePill) {
        cutinPhasePill.textContent = "🛡️ 防衛成功";
        cutinPhasePill.className = "cutin-phase-pill is-win";
      }
      leftSide?.classList.add("is-lunge-win");
      rightSide?.classList.add("is-recoil-lose");
      cutinBox?.classList.add(o.isPerfectDefense ? "is-perfect-flash" : "is-win-flash");
      fxOverlay?.classList.add(o.isPerfectDefense ? "is-perfect" : "is-win");
      if (fxStamp) {
        fxStamp.textContent = `🛡️ 防衛成功（防衛 ${o.defensePower} vs 敵 ${o.actualEnemyPower}）`;
      }
      if (vsCenter) {
        vsCenter.textContent = "🛡️";
      }
      if (tugStatus) {
        tugStatus.textContent = `🛡️ 防衛成功（${o.defensePower} vs ${o.actualEnemyPower}）`;
        tugStatus.className = "tug-status-center is-win";
      }
      if (salStatusTextEl && remainingHp > 0) {
        salStatusTextEl.textContent = `${dayName}曜日・${shiftLabel}：${o.defenderName}が「${o.enemyName}」を退けた。`;
      }
      if (!skipped) {
        soundEngine.playBattleWin(o.isPerfectDefense);
      }
    } else {
      const lostIdx = remainingHp - 1;
      remainingHp = Math.max(0, remainingHp - 1);
      rowEl?.classList.add("lose");
      if (resEl) {
        resEl.textContent = `💥 防衛 ${o.defensePower} vs 敵 ${o.actualEnemyPower}（突破 -1）`;
      }
      if (cutinPhasePill) {
        cutinPhasePill.textContent = "💥 城門突破 -1";
        cutinPhasePill.className = "cutin-phase-pill is-lose";
      }
      rightSide?.classList.add("is-lunge-breach");
      leftSide?.classList.add("is-hit-shudder");
      cutinBox?.classList.add("is-breach-flash");
      fxOverlay?.classList.add("is-breach");
      if (fxStamp) {
        fxStamp.textContent = `💥 城門突破 -1（防衛 ${o.defensePower} vs 敵 ${o.actualEnemyPower}）`;
      }
      if (vsCenter) {
        vsCenter.textContent = "💥";
      }
      if (tugStatus) {
        tugStatus.textContent = `💥 防衛突破（${o.defensePower} vs ${o.actualEnemyPower}）`;
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
            ? `敵の猛攻で城門が大きく揺れた（残り城門ライフ ${remainingHp}/${maxHp}）。`
            : "城門が突破され、これ以上は守りを維持できない。";
      }
      if (!skipped) {
        soundEngine.playBattleBreach();
      }
    }

    if (remainingHp <= 0) {
      // Mark remaining slots as unreached when gate HP hits 0
      for (let rest = i + 1; rest < outcomes.length; rest++) {
        const restRes = document.getElementById(`battle-slot-res-${rest}`);
        if (restRes) restRes.textContent = "（城門陥落により中断）";
      }
      if (!skipped) {
        if (cutinActionFooter) cutinActionFooter.hidden = false;
        if (clashStepIndicator) {
          clashStepIndicator.textContent = "💥 警備結果を確認する ▶（クリックで進行）";
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
          ? "🏆 警備結果を確認する ▶（クリックで進行）"
          : "▶ 次の時間帯へ進む（クリックで進行）";
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
            <div class="result-rank-letter" style="color: var(--danger-crimson);">警備失敗 — 城門突破（GAME OVER）</div>
            <p class="result-hero-sub">
              勇者軍の襲来を防ぎきれず、城門が突破されました（全戦防衛成功がクリア条件です）。今回のシフトと最適解（お手本シフト）の比較を確認し、タイトル画面から再出発してください。
            </p>
          </div>
          <div class="result-hero-actions">
            <button id="btn-modal-gameover-title" type="button" class="btn-dispatch result-primary-cta">
              タイトル画面へ戻る
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
  const rankTitle = `防衛成功 — ${formatCastleCalendarMonth(currentStage.weekNumber)}の警備完了`;

  if (salStatusTextEl) {
    salStatusTextEl.textContent =
      "城門は一度も抜かれることなく、魔王城の静かな日常が守られた。";
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
      const m = MONSTERS[mId];
      const quote = currentStage.clearQuotes?.[mId] ?? m.quotes.happy;
      return `<div class="guard-comment-item">
        <img src="${m.portrait}" alt="${m.name}" width="36" height="36" />
        <div><strong>${m.name}</strong>：「${quote}」</div>
      </div>`;
    })
    .join("");

  const adaptiveNoteHtml = !hasNextCampaignStage
    ? `<div class="lore-unlock-card" style="margin-top:0.65rem;">
        <h4>翌月の警備難度調整（${formatCastleCalendarMonth(nextWeekNumber)}・難易度：${nextAdaptiveLabel}）</h4>
        <p>これまでの警備履歴（ヒント使用状況や再挑戦回数）に応じて、${formatCastleCalendarMonth(nextWeekNumber)}の進軍状況が「難易度：${nextAdaptiveLabel}」に自動調整されました。</p>
      </div>`
    : "";

  const victoryCompareHtml = renderOptimalComparisonHtml(
    currentStage,
    currentSchedule,
    currentEvaluation,
    cachedOptimalResult,
    outcomes
  );

  // Put "翌月の編成へ進む" right inside the top hero banner so it is NEVER hidden at the bottom!
  finalArea.innerHTML = `
    <div class="result-rank-banner result-hero-banner">
      <div class="result-hero-top">
        <div>
          <div class="result-rank-letter">${rankTitle}</div>
          <p class="result-hero-sub">
            ${
              isFinalCampaignStage
                ? "5日間にわたる勇者本隊の進軍から魔王城を守り抜きました。"
                : "勇者隊の進軍を退け、誰ひとり無理をさせずに魔王城を守り抜きました。"
            }
          </p>
        </div>
        <div class="result-hero-actions">
          ${
            hasNextCampaignStage
              ? `<button id="btn-modal-next-stage" type="button" class="btn-dispatch result-primary-cta">
                  翌月（${formatCastleCalendarMonth(currentStageIndex + 2)}）の編成へ進む ▶
                </button>`
              : `<button id="btn-modal-random-stage" type="button" class="btn-dispatch result-primary-cta">
                  翌月（${formatCastleCalendarMonth(nextWeekNumber)}・難易度：${nextAdaptiveLabel}）へ進む ▶
                </button>`
          }
          <button id="btn-modal-back-title" type="button" class="btn-glass">
            タイトル画面へ戻る
          </button>
        </div>
      </div>
    </div>

    <div class="guard-comments-box">${commentsHtml}</div>
    ${adaptiveNoteHtml}

    <details class="optimal-compare-details">
      <summary>📊 あなたのシフトと最適解（お手本シフト）を比較する</summary>
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
    const m = MONSTERS[mId];
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
        return `<span class="grimoire-rel-chip is-pos" title="${r.description}">🤝 ${MONSTERS[otherId].name} (+${r.moraleDelta})</span>`;
      })
      .join("");
    const negChips = negRels
      .map((r) => {
        const otherId = r.monsterA === mId ? r.monsterB : r.monsterA;
        return `<span class="grimoire-rel-chip is-neg" title="${r.description}">⚡ ${MONSTERS[otherId].name} (${r.moraleDelta})</span>`;
      })
      .join("");

    const entryNum = String(idx + 1).padStart(2, "0");

    return `
      <article class="grimoire-entry-card ${isOnDuty ? "is-on-duty" : ""}">
        ${isOnDuty ? `<span class="grimoire-wax-stamp" title="今週のシフト当番メンバー">当番</span>` : ""}
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
            <div class="grimoire-post-line">持ち場：<strong>${m.usualPost}</strong></div>
            <div class="grimoire-stats-line">
              <span class="grimoire-ink-chip is-day">昼 ${dayPwr}</span>
              <span class="grimoire-ink-chip is-night">夜 ${nightPwr}</span>
              <span class="grimoire-rule-text">週${m.maxWeeklyShifts}回まで・${m.traitTitle}</span>
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

// ============================================================================
// Bootstrap & Event Listeners
// ============================================================================

function initGame(): void {
  setupDialogLightDismiss();

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
      const slide = PROLOGUE_SLIDES[prologueSlideIndex];
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
    if (prologueTimer !== null) {
      window.clearInterval(prologueTimer);
      prologueTimer = null;
      const slide = PROLOGUE_SLIDES[prologueSlideIndex];
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
    if (prologueTimer !== null) {
      window.clearInterval(prologueTimer);
      prologueTimer = null;
      const slide = PROLOGUE_SLIDES[prologueSlideIndex];
      getEl<HTMLElement>("prologue-slide-heading").textContent = slide.heading;
      getEl<HTMLElement>("prologue-slide-text").textContent = prologueFullText;
      return;
    }
    if (prologueSlideIndex < PROLOGUE_SLIDES.length - 1) {
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
