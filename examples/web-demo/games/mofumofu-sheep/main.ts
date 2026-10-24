/// <reference types="vite/client" />
import { setHighsWasmUrl } from "../../../../src/index.js";
import { getGameLang, pickLang, setGameLang, type GameLang } from "../i18n.js";
import {
  cloneFences,
  computeCellSize,
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

export function parseProgressState(raw: string | null): ProgressState {
  const defaultMax = TUTORIAL_STAGE_COUNT;
  if (!raw) {
    return {
      clearedByStageId: {},
      highestUnlockedStage: defaultMax,
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
    return {
      clearedByStageId,
      highestUnlockedStage: Math.max(defaultMax, savedUnlocked, maxFromCleared),
    };
  } catch {
    return {
      clearedByStageId: {},
      highestUnlockedStage: defaultMax,
    };
  }
}

function loadProgress(): ProgressState {
  try {
    return parseProgressState(localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseProgressState(null);
  }
}

function saveProgress(progressState: ProgressState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progressState));
  } catch {
    // Ignore storage errors in private browsing
  }
}

// Lightweight synthesized sound effects (Juice)
let audioCtx: AudioContext | null = null;
function getAudio(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function playTone(
  freq: number,
  durationMs: number,
  type: OscillatorType = "triangle",
  gainVal = 0.08
): void {
  const ctx = getAudio();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // Ignore audio errors
  }
}

function playFencePlaceSound(): void {
  playTone(320, 75, "triangle", 0.1);
  setTimeout(() => playTone(480, 90, "triangle", 0.08), 35);
}

function playFenceRemoveSound(): void {
  playTone(360, 70, "sine", 0.07);
}

function playRejectSound(): void {
  playTone(150, 110, "sawtooth", 0.05);
}

function playShortfallSound(): void {
  playTone(392, 110, "sine", 0.08);
  setTimeout(() => playTone(349.23, 140, "sine", 0.08), 90);
}

function playClearChime(): void {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((n, idx) => {
    setTimeout(() => playTone(n, 180, "triangle", 0.09), idx * 75);
  });
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
let solveToken = 0;
let isStageLoading = false;
let inFlightLoadTarget: number | null = null;
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
  document.title = pickLang(currentLang, {
    ja: "もふもふ羊の牧場囲い — まきばの柵パズル",
    en: "Fluffy Sheep Pasture — Fence Enclosure Puzzle",
    zh: "毛茸茸绵羊围牧场 — 牧场栅栏谜题",
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
  const setAttr = (id: string, attr: string, val: string) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute(attr, val);
  };

  setText(
    "back-link",
    pickLang(currentLang, {
      ja: "← 一覧",
      en: "← Portal",
      zh: "← 返回列表",
    })
  );
  setTitle(
    "back-link",
    pickLang(currentLang, {
      ja: "ゲーム一覧へ戻る",
      en: "Back to Game Portal",
      zh: "返回游戏列表",
    })
  );

  setText(
    "app-title",
    pickLang(currentLang, {
      ja: "もふもふ羊の牧場囲い",
      en: "Fluffy Sheep Pasture",
      zh: "毛茸茸绵羊围牧场",
    })
  );
  setText(
    "app-subtitle",
    pickLang(currentLang, {
      ja: "まきばの柵パズル",
      en: "Pasture Fence Puzzle",
      zh: "牧场栅栏谜题",
    })
  );
  setText(
    "btn-open-rules-label",
    pickLang(currentLang, {
      ja: "遊び方",
      en: "How to Play",
      zh: "玩法说明",
    })
  );
  setTitle(
    "btn-open-rules",
    pickLang(currentLang, {
      ja: "遊び方とチュートリアルを見る",
      en: "View rules and tutorials",
      zh: "查看玩法说明与新手教程",
    })
  );
  setTitle(
    "total-stars-badge",
    pickLang(currentLang, {
      ja: "クリア済みステージ数",
      en: "Cleared stages",
      zh: "已通关关卡数",
    })
  );

  setAttr(
    "stage-strip",
    "aria-label",
    pickLang(currentLang, {
      ja: "ステージ選択",
      en: "Stage Selection",
      zh: "关卡选择",
    })
  );
  const prevLabel = pickLang(currentLang, {
    ja: "前のステージへ",
    en: "Previous Stage",
    zh: "上一关",
  });
  setTitle("btn-stage-prev", prevLabel);
  setAttr("btn-stage-prev", "aria-label", prevLabel);

  const nextLabel = pickLang(currentLang, {
    ja: "次のステージへ",
    en: "Next Stage",
    zh: "下一关",
  });
  setTitle("btn-stage-next", nextLabel);
  setAttr("btn-stage-next", "aria-label", nextLabel);

  setAttr(
    "stage-select",
    "aria-label",
    pickLang(currentLang, {
      ja: "ステージ番号を選択",
      en: "Select stage number",
      zh: "选择关卡编号",
    })
  );
  setTitle(
    "stage-select",
    pickLang(currentLang, {
      ja: "到達済みステージへ移動",
      en: "Jump to reached stage",
      zh: "跳转到已到达关卡",
    })
  );

  setText(
    "hud-fence-label",
    pickLang(currentLang, {
      ja: "柵の残り",
      en: "Fences Left",
      zh: "剩余栅栏",
    })
  );
  setText(
    "hud-score-label",
    pickLang(currentLang, {
      ja: "現在 / クリア目標",
      en: "Current / Target",
      zh: "当前 / 目标得分",
    })
  );

  setText(
    "btn-show-optimal",
    pickLang(currentLang, {
      ja: "✨ お手本を見る",
      en: "✨ View Model Solution",
      zh: "✨ 查看示范解答",
    })
  );
  setText(
    "btn-next-stage",
    pickLang(currentLang, {
      ja: "次のステージへ ▶",
      en: "Next Stage ▶",
      zh: "下一关 ▶",
    })
  );
  setAttr(
    "board-grid",
    "aria-label",
    pickLang(currentLang, {
      ja: "牧場パズル盤面",
      en: "Pasture Puzzle Board",
      zh: "牧场解谜棋盘",
    })
  );
  setAttr(
    "legend-strip",
    "aria-label",
    pickLang(currentLang, {
      ja: "タイル得点一覧",
      en: "Tile Score Legend",
      zh: "地块得分一览",
    })
  );
  document.querySelectorAll<HTMLImageElement>(".brand-avatar").forEach((el) => {
    el.setAttribute("alt", pickLang(currentLang, { ja: "モコ", en: "Moko", zh: "莫可" }));
  });

  setText(
    "btn-undo-label",
    pickLang(currentLang, {
      ja: "1手戻す",
      en: "Undo",
      zh: "撤销一步",
    })
  );
  setTitle(
    "btn-undo",
    pickLang(currentLang, {
      ja: "1手戻す (Zキー)",
      en: "Undo 1 move (Z key)",
      zh: "撤销一步 (Z键)",
    })
  );

  setText(
    "btn-restart-label",
    pickLang(currentLang, {
      ja: "リスタート",
      en: "Restart",
      zh: "重新开始",
    })
  );
  setTitle(
    "btn-restart",
    pickLang(currentLang, {
      ja: "最初からやり直す (Rキー)",
      en: "Restart stage (R key)",
      zh: "从头重新开始 (R键)",
    })
  );

  setText(
    "btn-hint-label",
    pickLang(currentLang, {
      ja: "1手ヒント",
      en: "1-Move Hint",
      zh: "一步提示",
    })
  );
  setTitle(
    "btn-hint",
    pickLang(currentLang, {
      ja: "次の1手を盤面上で光らせて教えます (Hキー)",
      en: "Highlight the next recommended move on the board (H key)",
      zh: "在棋盘上高亮提示下一步操作 (H键)",
    })
  );

  setTitle(
    "legend-sheep",
    pickLang(currentLang, {
      ja: "ヒツジ（+2点・守る対象）",
      en: "Sheep (+2 pts, protect from wolves)",
      zh: "绵羊（+2分・保护对象）",
    })
  );
  setTitle(
    "legend-grass",
    pickLang(currentLang, {
      ja: "草地（+1点）",
      en: "Meadow (+1 pt)",
      zh: "草地（+1分）",
    })
  );
  setTitle(
    "legend-strawberry",
    pickLang(currentLang, {
      ja: "野いちご（+5点）",
      en: "Wild Strawberry (+5 pts)",
      zh: "野草莓（+5分）",
    })
  );
  setTitle(
    "legend-pit",
    pickLang(currentLang, {
      ja: "穴ぼこ（-5点・丸太の柵で塞げる）",
      en: "Pitfall (-5 pts, can be plugged with a fence)",
      zh: "坑洞（-5分・可用木桩栅栏填平）",
    })
  );
  setHtml(
    "legend-bridge",
    pickLang(currentLang, {
      ja: "🌉 +1 <small>(柵×)</small>",
      en: "🌉 +1 <small>(no fence)</small>",
      zh: "🌉 +1 <small>(禁放栅栏)</small>",
    })
  );
  setTitle(
    "legend-bridge",
    pickLang(currentLang, {
      ja: "石橋（+1点・通り抜け可・柵は置けない）",
      en: "Stone Bridge (+1 pt, passable, cannot place fence)",
      zh: "石桥（+1分・可通行・不可放栅栏）",
    })
  );
  setText(
    "legend-wall",
    pickLang(currentLang, {
      ja: "💧🪨 壁",
      en: "💧🪨 Wall",
      zh: "💧🪨 障碍墙",
    })
  );
  setTitle(
    "legend-wall",
    pickLang(currentLang, {
      ja: "水辺・岩（通り抜け不可の壁）",
      en: "Water & Rock (impassable natural wall)",
      zh: "水池与岩石（不可通行的天然墙壁）",
    })
  );

  // Rules Modal Translations
  setText(
    "rules-dialog-title",
    pickLang(currentLang, {
      ja: "🐑 遊び方ガイド",
      en: "🐑 How to Play",
      zh: "🐑 玩法说明",
    })
  );
  setAttr(
    "btn-close-rules",
    "aria-label",
    pickLang(currentLang, {
      ja: "閉じる",
      en: "Close",
      zh: "关闭",
    })
  );
  setText(
    "rule-step1-title",
    pickLang(currentLang, {
      ja: "1. マスをタップして柵🪵を置く",
      en: "1. Tap Cells to Place Fences 🪵",
      zh: "1. 点击格子放置木栅栏🪵",
    })
  );
  setText(
    "rule-step1-desc",
    pickLang(currentLang, {
      ja: "オオカミ🐺がヒツジ🐑へたどり着けないように、通り道に木の柵🪵を置いて遮断します。もう一度タップすると柵を外せます。",
      en: "Block all paths from wolves 🐺 to sheep 🐑 by placing wooden fences 🪵. Tap a fenced cell again to remove the fence.",
      zh: "在通道上放置木栅栏🪵，阻断野狼🐺通往绵羊🐑的所有路线。再次点击即可移除栅栏。",
    })
  );
  setText(
    "rule-step2-title",
    pickLang(currentLang, {
      ja: "2. 広いまきばを作って目標スコア達成",
      en: "2. Enclose a Rich Pasture to Reach the Goal",
      zh: "2. 围出广阔牧场以达成目标得分",
    })
  );
  setText(
    "rule-step2-desc",
    pickLang(currentLang, {
      ja: "オオカミを防いだ状態で、ヒツジ🐑が歩いて行ける範囲（安全なまきば）の合計得点が「クリア目標」に届けばステージクリアです。",
      en: "Once the sheep are safe, the total score of all tiles reachable by 🐑 (🌱+1, 🍓+5) must meet or exceed the Target Score to clear the stage.",
      zh: "在确保安全的前提下，让绵羊🐑可步行的安全牧场总分（🌱+1、🍓+5）达到目标得分即可过关。",
    })
  );
  setText(
    "rule-step3-title",
    pickLang(currentLang, {
      ja: "3. 石橋🌉と穴ぼこ🕳️の仕掛け",
      en: "3. Stone Bridges 🌉 and Pitfalls 🕳️",
      zh: "3. 石桥🌉与坑洞🕳️机关",
    })
  );
  setText(
    "rule-step3-desc",
    pickLang(currentLang, {
      ja: "🌉石橋は通れますが柵は置けません。🕳️穴ぼこ（-5点）はまきばに入ると減点ですが、真上に丸太の柵🪵を打ち込めば穴が埋まって壁になります。",
      en: "🌉 Stone bridges are passable but cannot hold fences. 🕳️ Pitfalls (-5 pts) lower your score if enclosed, but driving a fence 🪵 directly into a pit plugs it and blocks wolves.",
      zh: "🌉石桥可通行但不能放栅栏。🕳️坑洞（-5分）留在牧场内会扣分，但直接在正上方打入木栅栏🪵即可填平坑洞并充当围墙。",
    })
  );
  setText(
    "rules-tutorials-heading",
    pickLang(currentLang, {
      ja: "🔰 基本ルールを学ぶチュートリアル（Stage 1〜4）",
      en: "🔰 Interactive Tutorials (Stages 1–4)",
      zh: "🔰 学习基础规则的新手教程（Stage 1〜4）",
    })
  );
  setText(
    "btn-rules-start",
    pickLang(currentLang, {
      ja: "わかった・パズルに戻る",
      en: "Got It · Back to Puzzle",
      zh: "明白了・返回解谜",
    })
  );

  renderTutorialButtonsInDialog();

  document.querySelectorAll<HTMLButtonElement>("[data-lang-btn]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.langBtn === currentLang);
  });
}

function renderTutorialButtonsInDialog(): void {
  const gridEl = document.getElementById("rules-tutorial-grid");
  if (!gridEl || typeof document.createElement !== "function") return;
  gridEl.innerHTML = "";
  for (let num = 1; num <= TUTORIAL_STAGE_COUNT; num++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tutorial-jump-btn";
    const title = getStageTitleByNumber(num, currentLang);
    btn.textContent = `Stage ${num}: ${title}`;
    btn.addEventListener("click", () => {
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
      ? Math.max(200, window.innerWidth - 76)
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

function getMaxUnlockedStage(): number {
  return Math.max(TUTORIAL_STAGE_COUNT, progress.highestUnlockedStage);
}

function renderStageNav(): void {
  const totalStarsTextEl = getEl<HTMLElement>("total-stars-text");
  const clearedCount = countCanonicalClearedStages(progress.clearedByStageId);
  totalStarsTextEl.textContent = `${clearedCount} CLEAR`;

  const maxUnlockedStage = getMaxUnlockedStage();
  const maxStageNum = Math.max(maxUnlockedStage, currentStage.stageNumber);

  const prevBtn = getEl<HTMLButtonElement>("btn-stage-prev");
  prevBtn.disabled = isStageLoading || currentStage.stageNumber <= 1;

  const nextBtn = getEl<HTMLButtonElement>("btn-stage-next");
  nextBtn.disabled = isStageLoading || currentStage.stageNumber >= maxUnlockedStage;

  const selectEl = getEl<HTMLSelectElement>("stage-select");
  selectEl.disabled = isStageLoading;
  selectEl.innerHTML = "";
  if (typeof document.createElement !== "function") return;
  for (let num = 1; num <= maxStageNum; num++) {
    const stageId = `stage-${num}`;
    const isCleared = Boolean(progress.clearedByStageId[stageId]);
    const title = getStageTitleByNumber(num, currentLang);
    const opt = document.createElement("option");
    opt.value = String(num);
    const starMark = isCleared ? " ★" : "";
    const tutPrefix =
      num <= TUTORIAL_STAGE_COUNT
        ? pickLang(currentLang, {
            ja: ` [チュートリアル ${num}/${TUTORIAL_STAGE_COUNT}]`,
            en: ` [Tutorial ${num}/${TUTORIAL_STAGE_COUNT}]`,
            zh: ` [教程 ${num}/${TUTORIAL_STAGE_COUNT}]`,
          })
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
      tutorialChipEl.textContent = pickLang(currentLang, {
        ja: `🔰 チュートリアル ${currentStage.stageNumber}/${TUTORIAL_STAGE_COUNT}`,
        en: `🔰 Tutorial ${currentStage.stageNumber}/${TUTORIAL_STAGE_COUNT}`,
        zh: `🔰 新手教程 ${currentStage.stageNumber}/${TUTORIAL_STAGE_COUNT}`,
      });
    }
  }

  const guideBannerEl = document.getElementById("guide-banner");
  const guideIconEl = document.getElementById("guide-banner-icon");
  if (guideBannerEl) {
    guideBannerEl.classList.toggle("is-tutorial", isTutorial);
  }
  if (guideIconEl) {
    guideIconEl.textContent = isTutorial ? "🔰" : "🐑";
  }

  const localizedStage = getLocalizedStageText(currentStage, currentLang);
  stageTitleEl.textContent = localizedStage.title;
  stageOneLinerEl.textContent = localizedStage.oneLiner;

  // Fence dots & remaining count
  const remaining = Math.max(0, currentStage.maxFences - currentEval.fencesUsed);
  fenceDotsEl.innerHTML = "";
  if (typeof document.createElement === "function") {
    for (let i = 0; i < currentStage.maxFences; i++) {
      const dot = document.createElement("span");
      dot.className = "fence-dot";
      if (i >= remaining) dot.classList.add("used");
      dot.textContent = "🪵";
      fenceDotsEl.appendChild(dot);
    }
  }
  fenceCountTextEl.textContent = pickLang(currentLang, {
    ja: `残り ${remaining} / ${currentStage.maxFences}`,
    en: `${remaining} / ${currentStage.maxFences} left`,
    zh: `剩余 ${remaining} / ${currentStage.maxFences}`,
  });

  const targetScore = getTargetScore();
  const cleared = isStageCleared();
  const displayCurrent = currentEval.isSafe ? `${currentEval.pastureScore}` : "—";
  scoreTextEl.textContent = pickLang(currentLang, {
    ja: `${displayCurrent} / 目標 ${targetScore} pt`,
    en: `${displayCurrent} / Goal ${targetScore} pt`,
    zh: `${displayCurrent} / 目标 ${targetScore} pt`,
  });

  const optPits = cachedOptimal?.optimalEvaluation.breakdown.pitCount ?? 0;
  const hasAvoidablePit = currentEval.breakdown.pitCount > optPits;

  // Safety & Target status pill
  if (cleared) {
    hudStatusPillEl.className = "hud-pill status-safe";
    statusIconEl.textContent = "🎉";
    statusTextEl.textContent = pickLang(currentLang, {
      ja: "目標達成・STAGE CLEAR",
      en: "Goal Reached · STAGE CLEAR",
      zh: "达成目标・STAGE CLEAR",
    });
  } else if (currentEval.isSafe) {
    const diff = targetScore - currentEval.pastureScore;
    hudStatusPillEl.className = "hud-pill status-shortfall";
    statusIconEl.textContent = hasAvoidablePit ? "🕳️" : "🍓";
    statusTextEl.textContent = hasAvoidablePit
      ? pickLang(currentLang, {
          ja: `穴ぼこ混入中（あと +${diff} pt）`,
          en: `Pitfall inside (+${diff} pt needed)`,
          zh: `包含坑洞（还差 +${diff} pt）`,
        })
      : pickLang(currentLang, {
          ja: `目標まであと +${diff} pt`,
          en: `+${diff} pt to goal`,
          zh: `距目标还差 +${diff} pt`,
        });
  } else {
    hudStatusPillEl.className = "hud-pill status-danger";
    statusIconEl.textContent = "🐺";
    statusTextEl.textContent = pickLang(currentLang, {
      ja: "オオカミ侵入中",
      en: "Wolves can reach sheep",
      zh: "恶狼正在侵入",
    });
  }

  // Controls state
  btnUndo.disabled = undoStack.length === 0;
  btnRestart.disabled = currentEval.fencesUsed === 0 && undoStack.length === 0;
  btnHint.disabled = solverFailed;

  // Inline Clear / Shortfall Banner
  if (cleared) {
    clearBannerEl.hidden = false;
    clearBannerEl.className = "clear-banner";
    clearStarsEl.textContent = "★";
    clearHeadlineEl.textContent = showingModelAnswer
      ? pickLang(currentLang, {
          ja: "✨ お手本の配置（目標スコア達成）",
          en: "✨ Model Solution (Target Score Reached)",
          zh: "✨ 示范布局（已达目标得分）",
        })
      : pickLang(currentLang, {
          ja: "🎉 STAGE CLEAR・黄金のまきば完成",
          en: "🎉 STAGE CLEAR · Golden Pasture Complete",
          zh: "🎉 STAGE CLEAR・黄金牧场完成",
        });
    clearSubtextEl.textContent = pickLang(currentLang, {
      ja: `まきば得点 ${currentEval.pastureScore} / 目標 ${targetScore} pt 達成`,
      en: `Pasture Score ${currentEval.pastureScore} / Goal ${targetScore} pt achieved`,
      zh: `牧场得分 ${currentEval.pastureScore} / 目标 ${targetScore} pt 达成`,
    });
    btnShowOptimal.hidden = true;
    const canAdvanceNext =
      !showingModelAnswer || currentStage.stageNumber < getMaxUnlockedStage();
    btnNextStage.hidden = !canAdvanceNext;
    btnNextStage.disabled = isStageLoading;
    btnNextStage.textContent = pickLang(currentLang, {
      ja: `Stage ${currentStage.stageNumber + 1} へ進む ▶`,
      en: `Proceed to Stage ${currentStage.stageNumber + 1} ▶`,
      zh: `前往 Stage ${currentStage.stageNumber + 1} ▶`,
    });
  } else if (currentEval.isSafe) {
    const diff = targetScore - currentEval.pastureScore;
    clearBannerEl.hidden = false;
    clearBannerEl.className = "clear-banner banner-shortfall";
    clearStarsEl.textContent = hasAvoidablePit ? "🕳️" : "🍓";
    clearHeadlineEl.textContent = pickLang(currentLang, {
      ja: `オオカミは防げたけれど、目標スコアまであと +${diff} pt 必要です`,
      en: `The sheep are safe from wolves, but you need +${diff} more pt to reach the goal`,
      zh: `虽然挡住了恶狼，但距离目标得分还需要 +${diff} pt`,
    });
    clearSubtextEl.textContent = hasAvoidablePit
      ? pickLang(currentLang, {
          ja: `現在 ${currentEval.pastureScore} pt / クリア目標 ${targetScore} pt — まきばに🕳️穴ぼこ（-5点）が入っています。真上に柵を打ち込んで埋めるか外へ仕切りましょう`,
          en: `Current ${currentEval.pastureScore} pt / Goal ${targetScore} pt — A pitfall 🕳️ (-5 pts) is inside the pasture. Plug it with a fence post or wall it off`,
          zh: `当前 ${currentEval.pastureScore} pt / 目标 ${targetScore} pt — 牧场内包含了🕳️坑洞（-5分），请在正上方打入栅栏填平或将其隔在外面`,
        })
      : pickLang(currentLang, {
          ja: `現在 ${currentEval.pastureScore} pt / クリア目標 ${targetScore} pt — 柵の位置を工夫して、もっと🍓や🌱を取り込みましょう`,
          en: `Current ${currentEval.pastureScore} pt / Goal ${targetScore} pt — Adjust your fences to enclose more 🍓 strawberries and 🌱 grass tiles`,
          zh: `当前 ${currentEval.pastureScore} pt / 目标 ${targetScore} pt — 请调整栅栏位置，将更多🍓野草莓和🌱草地圈入牧场`,
        });
    btnShowOptimal.hidden = !cachedOptimal?.verified;
    btnNextStage.hidden = true;
  } else if (solverFailed) {
    clearBannerEl.hidden = false;
    clearBannerEl.className = "clear-banner banner-shortfall";
    clearStarsEl.textContent = "⚠️";
    clearHeadlineEl.textContent = pickLang(currentLang, {
      ja: "お手本・ヒントの計算に失敗しました（目標スコアでプレイ可能です）",
      en: "Could not compute model solution or hints (stage remains playable with target score)",
      zh: "未能计算示范解答与提示（仍可按目标得分正常游玩）",
    });
    clearSubtextEl.textContent = pickLang(currentLang, {
      ja: `クリア目標 ${targetScore} pt はそのまま有効です`,
      en: `Goal ${targetScore} pt remains active`,
      zh: `通关目标 ${targetScore} pt 保持有效`,
    });
    btnShowOptimal.hidden = true;
    btnNextStage.hidden = true;
  } else {
    clearBannerEl.hidden = true;
  }
}

function renderBoard(): void {
  const boardGridEl = getEl<HTMLElement>("board-grid");
  const rows = currentStage.grid.length;
  const cols = currentStage.grid[0]?.length ?? 0;
  const cellSize = computeCellSize(rows, cols, getAvailableBoardWidth());
  const cleared = isStageCleared();

  boardGridEl.innerHTML = "";
  if (typeof document.createElement !== "function") return;
  boardGridEl.style.setProperty("--cell-size", `${cellSize}px`);
  boardGridEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = currentStage.grid[r][c];
      const meta = TILE_META[tile];
      const hasFence = Boolean(currentFences[r]?.[c]);

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
        inviteTag.textContent = pickLang(currentLang, {
          ja: "👆 タップ",
          en: "👆 Tap",
          zh: "👆 点击",
        });
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
      emojiSpan.textContent = hasFence ? "🪵" : meta.emoji;
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
    }
  } else if (playCelebrationIfNewlyCleared && currentEval.isSafe) {
    playShortfallSound();
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
  activeHint = null;
  playFenceRemoveSound();
  updateEvaluationAndRender(false);
}

function handleRestart(): void {
  if (currentEval.fencesUsed === 0 && undoStack.length === 0) return;
  undoStack.push(cloneFences(currentFences));
  currentFences = createEmptyFences(currentStage.grid.length, currentStage.grid[0].length);
  showingModelAnswer = false;
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
    playTone(587.33, 110, "sine", 0.08);
  } catch {
    if (myToken !== solveToken) return;
    solverFailed = true;
    renderHud();
  } finally {
    btnHint.disabled = solverFailed;
  }
}

function handleShowOptimal(): void {
  if (!cachedOptimal?.verified) return;
  undoStack.push(cloneFences(currentFences));
  currentFences = cloneFences(cachedOptimal.optimalFences);
  showingModelAnswer = true;
  activeHint = null;
  updateEvaluationAndRender(true);
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
  const targetNum = Math.max(1, Math.floor(stageNumber));
  if (isStageLoading && inFlightLoadTarget === targetNum && inFlightLoadPromise) {
    return inFlightLoadPromise;
  }
  const myToken = ++solveToken;
  isStageLoading = true;
  inFlightLoadTarget = targetNum;
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
        inFlightLoadTarget = null;
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
  const maxUnlockedStage = getMaxUnlockedStage();
  const targetNum = currentStage.stageNumber + delta;
  if (targetNum < 1 || targetNum > maxUnlockedStage) {
    return false;
  }
  await loadStageByNumber(targetNum);
  return true;
}

export function resetSheepProgressForTest(raw: string | null = null): void {
  const next = parseProgressState(raw);
  progress.clearedByStageId = next.clearedByStageId;
  progress.highestUnlockedStage = next.highestUnlockedStage;
  saveProgress(progress);
}

export function getSheepProgressState(): ProgressState {
  return {
    clearedByStageId: { ...progress.clearedByStageId },
    highestUnlockedStage: progress.highestUnlockedStage,
  };
}

export function getCurrentStageNumber(): number {
  return currentStage.stageNumber;
}

export function applyFencesForTest(fences: FenceGrid): void {
  currentFences = cloneFences(fences);
  showingModelAnswer = false;
  updateEvaluationAndRender(false);
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
  getEl<HTMLButtonElement>("btn-open-rules").addEventListener("click", () => {
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

  window.addEventListener("resize", () => {
    renderBoard();
  });

  // Initialize language & start directly in Stage 1
  applyStaticTranslations();
  void loadStageByNumber(1);
}
