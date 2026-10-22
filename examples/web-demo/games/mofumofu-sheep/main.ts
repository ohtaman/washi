/// <reference types="vite/client" />
import { setHighsWasmUrl } from "../../../../src/index.js";
import { getGameLang, pickLang, setGameLang, type GameLang } from "../i18n.js";
import {
  cloneFences,
  createEmptyFences,
  diagnoseAndSuggestFenceHint,
  evaluatePasture,
  resolveTargetScore,
  selectVerifiedOptimal,
  solveOptimalPasture,
} from "./solver.js";
import {
  CAMPAIGN_STAGES,
  generateVerifiedPastureStage,
  getLocalizedStageText,
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

interface ProgressState {
  clearedByStageId: Record<string, boolean>;
}

function loadProgress(): ProgressState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { clearedByStageId: {} };
    const parsed = JSON.parse(raw) as Partial<ProgressState>;
    return {
      clearedByStageId: parsed.clearedByStageId ?? {},
    };
  } catch {
    return { clearedByStageId: {} };
  }
}

function saveProgress(progress: ProgressState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
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
let currentStageIndex = 0; // 0..11 = campaign, 12 = EX random
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

// DOM Elements
const backLinkEl = document.getElementById("back-link") as HTMLAnchorElement;
const appTitleEl = document.getElementById("app-title") as HTMLElement;
const appSubtitleEl = document.getElementById("app-subtitle") as HTMLElement;
const stageStripEl = document.getElementById("stage-strip") as HTMLElement;
const totalStarsBadgeEl = document.getElementById("total-stars-badge") as HTMLElement;
const totalStarsTextEl = document.getElementById("total-stars-text") as HTMLElement;
const stageBadgeEl = document.getElementById("stage-badge") as HTMLElement;
const stageTitleEl = document.getElementById("stage-title") as HTMLElement;
const stageOneLinerEl = document.getElementById("stage-oneliner") as HTMLElement;
const hudFenceLabelEl = document.getElementById("hud-fence-label") as HTMLElement;
const fenceDotsEl = document.getElementById("fence-dots") as HTMLElement;
const fenceCountTextEl = document.getElementById("fence-count-text") as HTMLElement;
const hudScoreLabelEl = document.getElementById("hud-score-label") as HTMLElement;
const scoreTextEl = document.getElementById("score-text") as HTMLElement;
const hudStatusPillEl = document.getElementById("hud-status-pill") as HTMLElement;
const statusIconEl = document.getElementById("status-icon") as HTMLElement;
const statusTextEl = document.getElementById("status-text") as HTMLElement;
const boardGridEl = document.getElementById("board-grid") as HTMLElement;
const clearBannerEl = document.getElementById("clear-banner") as HTMLElement;
const clearStarsEl = document.getElementById("clear-stars") as HTMLElement;
const clearHeadlineEl = document.getElementById("clear-headline") as HTMLElement;
const clearSubtextEl = document.getElementById("clear-subtext") as HTMLElement;
const btnShowOptimal = document.getElementById("btn-show-optimal") as HTMLButtonElement;
const btnNextStage = document.getElementById("btn-next-stage") as HTMLButtonElement;
const btnUndo = document.getElementById("btn-undo") as HTMLButtonElement;
const btnUndoLabel = document.getElementById("btn-undo-label") as HTMLElement;
const btnRestart = document.getElementById("btn-restart") as HTMLButtonElement;
const btnRestartLabel = document.getElementById("btn-restart-label") as HTMLElement;
const btnHint = document.getElementById("btn-hint") as HTMLButtonElement;
const btnHintLabel = document.getElementById("btn-hint-label") as HTMLElement;
const btnNewRandom = document.getElementById("btn-new-random") as HTMLButtonElement;
const btnNewRandomLabel = document.getElementById("btn-new-random-label") as HTMLElement;
const legendSheepEl = document.getElementById("legend-sheep") as HTMLElement;
const legendGrassEl = document.getElementById("legend-grass") as HTMLElement;
const legendStrawberryEl = document.getElementById("legend-strawberry") as HTMLElement;
const legendMushroomEl = document.getElementById("legend-mushroom") as HTMLElement;
const legendBridgeEl = document.getElementById("legend-bridge") as HTMLElement;
const legendWallEl = document.getElementById("legend-wall") as HTMLElement;

function applyStaticTranslations(): void {
  document.documentElement.lang = currentLang;
  document.title = pickLang(currentLang, {
    ja: "もふもふ羊の牧場囲い — まきばの柵パズル",
    en: "Fluffy Sheep Pasture — Fence Enclosure Puzzle",
    zh: "毛茸茸绵羊围牧场 — 牧场栅栏谜题",
  });

  backLinkEl.textContent = pickLang(currentLang, {
    ja: "← 一覧",
    en: "← Portal",
    zh: "← 返回列表",
  });
  backLinkEl.title = pickLang(currentLang, {
    ja: "ゲーム一覧へ戻る",
    en: "Back to Game Portal",
    zh: "返回游戏列表",
  });

  appTitleEl.textContent = pickLang(currentLang, {
    ja: "もふもふ羊の牧場囲い",
    en: "Fluffy Sheep Pasture",
    zh: "毛茸茸绵羊围牧场",
  });
  appSubtitleEl.textContent = pickLang(currentLang, {
    ja: "まきばの柵パズル",
    en: "Pasture Fence Puzzle",
    zh: "牧场栅栏谜题",
  });
  totalStarsBadgeEl.title = pickLang(currentLang, {
    ja: "クリア済みステージ数",
    en: "Cleared stages",
    zh: "已通关关卡数",
  });

  hudFenceLabelEl.textContent = pickLang(currentLang, {
    ja: "柵の残り",
    en: "Fences Left",
    zh: "剩余栅栏",
  });
  hudScoreLabelEl.textContent = pickLang(currentLang, {
    ja: "現在 / クリア目標",
    en: "Current / Target",
    zh: "当前 / 目标得分",
  });

  btnShowOptimal.textContent = pickLang(currentLang, {
    ja: "✨ お手本を見る",
    en: "✨ View Model Solution",
    zh: "✨ 查看示范解答",
  });

  btnUndoLabel.textContent = pickLang(currentLang, {
    ja: "1手戻す",
    en: "Undo",
    zh: "撤销一步",
  });
  btnUndo.title = pickLang(currentLang, {
    ja: "1手戻す (Zキー)",
    en: "Undo 1 move (Z key)",
    zh: "撤销一步 (Z键)",
  });

  btnRestartLabel.textContent = pickLang(currentLang, {
    ja: "リスタート",
    en: "Restart",
    zh: "重新开始",
  });
  btnRestart.title = pickLang(currentLang, {
    ja: "最初からやり直す (Rキー)",
    en: "Restart stage (R key)",
    zh: "从头重新开始 (R键)",
  });

  btnHintLabel.textContent = pickLang(currentLang, {
    ja: "1手ヒント",
    en: "1-Move Hint",
    zh: "一步提示",
  });
  btnHint.title = pickLang(currentLang, {
    ja: "次の1手を盤面上で光らせて教えます (Hキー)",
    en: "Highlight the next recommended move on the board (H key)",
    zh: "在棋盘上高亮提示下一步操作 (H键)",
  });

  btnNewRandomLabel.textContent = pickLang(currentLang, {
    ja: "ちがう牧場へ",
    en: "Another Pasture",
    zh: "换一个牧场",
  });
  btnNewRandom.title = pickLang(currentLang, {
    ja: "ちがう牧場へ移動する",
    en: "Move to another pasture",
    zh: "前往另一个牧场",
  });

  legendSheepEl.title = pickLang(currentLang, {
    ja: "ヒツジ（+2点・守る対象）",
    en: "Sheep (+2 pts, protect from wolves)",
    zh: "绵羊（+2分・保护对象）",
  });
  legendGrassEl.title = pickLang(currentLang, {
    ja: "草地（+1点）",
    en: "Meadow (+1 pt)",
    zh: "草地（+1分）",
  });
  legendStrawberryEl.title = pickLang(currentLang, {
    ja: "野いちご（+5点）",
    en: "Wild Strawberry (+5 pts)",
    zh: "野草莓（+5分）",
  });
  legendMushroomEl.title = pickLang(currentLang, {
    ja: "どくキノコ（-5点・柵で潰せる）",
    en: "Poison Mushroom (-5 pts, can be covered with a fence)",
    zh: "毒蘑菇（-5分・可用栅栏盖住）",
  });
  legendBridgeEl.innerHTML = pickLang(currentLang, {
    ja: "🌉 +1 <small>(柵×)</small>",
    en: "🌉 +1 <small>(no fence)</small>",
    zh: "🌉 +1 <small>(禁放栅栏)</small>",
  });
  legendBridgeEl.title = pickLang(currentLang, {
    ja: "石橋（+1点・通り抜け可・柵は置けない）",
    en: "Stone Bridge (+1 pt, passable, cannot place fence)",
    zh: "石桥（+1分・可通行・不可放栅栏）",
  });
  legendWallEl.textContent = pickLang(currentLang, {
    ja: "💧🪨 壁",
    en: "💧🪨 Wall",
    zh: "💧🪨 障碍墙",
  });
  legendWallEl.title = pickLang(currentLang, {
    ja: "水辺・岩（通り抜け不可の壁）",
    en: "Water & Rock (impassable natural wall)",
    zh: "水池与岩石（不可通行的天然墙壁）",
  });

  document.querySelectorAll<HTMLButtonElement>("[data-lang-btn]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.langBtn === currentLang);
  });
}

function getTargetScore(): number {
  return resolveTargetScore(currentStage, cachedOptimal);
}

function isStageCleared(): boolean {
  return currentEval.isSafe && currentEval.pastureScore >= getTargetScore();
}

function computeCellSize(rows: number, cols: number): number {
  const maxDim = Math.max(rows, cols);
  if (maxDim <= 4) return 88;
  if (maxDim === 5) return 76;
  if (maxDim === 6) return 68;
  return 60;
}

function renderStageStrip(): void {
  stageStripEl.innerHTML = "";

  let clearedCount = 0;
  for (const st of CAMPAIGN_STAGES) {
    if (progress.clearedByStageId[st.id]) clearedCount++;
  }
  totalStarsTextEl.textContent = `${clearedCount} / ${CAMPAIGN_STAGES.length} CLEAR`;

  CAMPAIGN_STAGES.forEach((st, idx) => {
    const isCleared = Boolean(progress.clearedByStageId[st.id]);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "stage-pill";
    if (idx === currentStageIndex) btn.classList.add("active");
    if (isCleared) btn.classList.add("cleared");

    const numSpan = document.createElement("span");
    numSpan.className = "stage-pill-num";
    numSpan.textContent = `${st.stageNumber}`;

    const starSpan = document.createElement("span");
    starSpan.className = "stage-pill-stars";
    starSpan.textContent = isCleared
      ? "★ CLEAR"
      : pickLang(currentLang, {
          ja: `目標 ${st.targetScore}`,
          en: `Goal ${st.targetScore}`,
          zh: `目标 ${st.targetScore}`,
        });

    btn.append(numSpan, starSpan);
    btn.addEventListener("click", () => {
      void loadStageByIndex(idx);
    });
    stageStripEl.appendChild(btn);
  });

  // Extra Stage button
  const exBtn = document.createElement("button");
  exBtn.type = "button";
  exBtn.className = "stage-pill";
  if (currentStageIndex === CAMPAIGN_STAGES.length) exBtn.classList.add("active");
  const exNum = document.createElement("span");
  exNum.className = "stage-pill-num";
  exNum.textContent = pickLang(currentLang, {
    ja: "🌿 番外",
    en: "🌿 Extra",
    zh: "🌿 番外",
  });
  const exSub = document.createElement("span");
  exSub.className = "stage-pill-stars";
  exSub.textContent = pickLang(currentLang, {
    ja: "おかわり",
    en: "Bonus",
    zh: "加餐牧场",
  });
  exBtn.append(exNum, exSub);
  exBtn.addEventListener("click", () => {
    void loadRandomStage();
  });
  stageStripEl.appendChild(exBtn);
}

function renderHud(): void {
  const isEx = currentStageIndex >= CAMPAIGN_STAGES.length;
  stageBadgeEl.textContent = isEx ? "EXTRA" : `STAGE ${currentStage.stageNumber}`;
  const localizedStage = getLocalizedStageText(currentStage, currentLang);
  stageTitleEl.textContent = localizedStage.title;
  stageOneLinerEl.textContent = localizedStage.oneLiner;

  // Fence dots & remaining count
  const remaining = Math.max(0, currentStage.maxFences - currentEval.fencesUsed);
  fenceDotsEl.innerHTML = "";
  for (let i = 0; i < currentStage.maxFences; i++) {
    const dot = document.createElement("span");
    dot.className = "fence-dot";
    if (i >= remaining) dot.classList.add("used");
    dot.textContent = "🪵";
    fenceDotsEl.appendChild(dot);
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

  const optMushrooms = cachedOptimal?.optimalEvaluation.breakdown.mushroomCount ?? 0;
  const hasAvoidableMushroom = currentEval.breakdown.mushroomCount > optMushrooms;

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
    statusIconEl.textContent = hasAvoidableMushroom ? "🍄" : "🍓";
    statusTextEl.textContent = hasAvoidableMushroom
      ? pickLang(currentLang, {
          ja: `毒キノコ混入中（あと +${diff} pt）`,
          en: `Poison mushroom inside (+${diff} pt needed)`,
          zh: `混入毒蘑菇（还差 +${diff} pt）`,
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
  btnNewRandom.hidden = !isEx;

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
    btnNextStage.hidden = false;

    if (isEx) {
      btnNextStage.textContent = pickLang(currentLang, {
        ja: "🌿 次の牧場へ進む ▶",
        en: "🌿 Next Pasture ▶",
        zh: "🌿 前往下一个牧场 ▶",
      });
    } else if (currentStageIndex < CAMPAIGN_STAGES.length - 1) {
      btnNextStage.textContent = pickLang(currentLang, {
        ja: `Stage ${currentStage.stageNumber + 1} へ進む ▶`,
        en: `Proceed to Stage ${currentStage.stageNumber + 1} ▶`,
        zh: `前往 Stage ${currentStage.stageNumber + 1} ▶`,
      });
    } else {
      btnNextStage.textContent = pickLang(currentLang, {
        ja: "🌿 番外・おかわり牧場へ ▶",
        en: "🌿 Extra Bonus Pasture ▶",
        zh: "🌿 前往番外加餐牧场 ▶",
      });
    }
  } else if (currentEval.isSafe) {
    const diff = targetScore - currentEval.pastureScore;
    clearBannerEl.hidden = false;
    clearBannerEl.className = "clear-banner banner-shortfall";
    clearStarsEl.textContent = hasAvoidableMushroom ? "🍄" : "🍓";
    clearHeadlineEl.textContent = pickLang(currentLang, {
      ja: `オオカミは防げたけれど、目標スコアまであと +${diff} pt 必要です`,
      en: `The sheep are safe from wolves, but you need +${diff} more pt to reach the goal`,
      zh: `虽然挡住了恶狼，但距离目标得分还需要 +${diff} pt`,
    });
    clearSubtextEl.textContent = hasAvoidableMushroom
      ? pickLang(currentLang, {
          ja: `現在 ${currentEval.pastureScore} pt / クリア目標 ${targetScore} pt — まきばに🍄どくキノコ（-5点）が入っています。柵で毒を消すか仕切りましょう`,
          en: `Current ${currentEval.pastureScore} pt / Goal ${targetScore} pt — A poison mushroom 🍄 (-5 pts) is inside the pasture. Cover it with a fence or wall it off`,
          zh: `当前 ${currentEval.pastureScore} pt / 目标 ${targetScore} pt — 牧场内混入了🍄毒蘑菇（-5分），请用栅栏盖住或隔开它`,
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
  const rows = currentStage.grid.length;
  const cols = currentStage.grid[0]?.length ?? 0;
  const cellSize = computeCellSize(rows, cols);
  const cleared = isStageCleared();

  boardGridEl.style.setProperty("--cell-size", `${cellSize}px`);
  boardGridEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
  boardGridEl.innerHTML = "";

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

      // Wordless Stage 1 invitation pulse when 0 fences are placed
      if (
        currentStage.id === "stage-1" &&
        currentEval.fencesUsed === 0 &&
        r === 1 &&
        c === 1
      ) {
        cellBtn.classList.add("invite-pulse");
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

      // Show what tile is underneath a placed fence (if it's a strawberry or mushroom)
      if (hasFence && (tile === "strawberry" || tile === "mushroom")) {
        const under = document.createElement("span");
        under.className = "cell-under-badge";
        under.textContent = meta.emoji;
        cellBtn.appendChild(under);
      } else if (!hasFence && tile === "strawberry") {
        const tag = document.createElement("span");
        tag.className = "cell-score-tag score-plus";
        tag.textContent = "+5";
        cellBtn.appendChild(tag);
      } else if (!hasFence && tile === "mushroom") {
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
  if (!progress.clearedByStageId[currentStage.id]) {
    progress.clearedByStageId[currentStage.id] = true;
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
  renderStageStrip();
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

async function loadStage(stage: StagePuzzle, index: number): Promise<void> {
  const myToken = ++solveToken;
  currentStageIndex = index;
  currentStage = stage;
  currentFences = createEmptyFences(stage.grid.length, stage.grid[0].length);
  undoStack = [];
  cachedOptimal = null;
  solverFailed = false;
  activeHint = null;
  wasClearedBeforeMove = false;
  showingModelAnswer = false;

  updateEvaluationAndRender(false);

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

async function loadStageByIndex(index: number): Promise<void> {
  const clamped = Math.max(0, Math.min(CAMPAIGN_STAGES.length - 1, index));
  await loadStage(CAMPAIGN_STAGES[clamped], clamped);
}

async function loadRandomStage(): Promise<void> {
  const myToken = ++solveToken;
  btnNewRandom.disabled = true;
  try {
    const randomStage = await generateVerifiedPastureStage(Date.now());
    if (myToken !== solveToken) return;
    await loadStage(randomStage, CAMPAIGN_STAGES.length);
  } finally {
    btnNewRandom.disabled = false;
  }
}

// Event Listeners
document.querySelectorAll<HTMLButtonElement>("[data-lang-btn]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const lang = btn.dataset.langBtn as GameLang;
    if (lang === "ja" || lang === "en" || lang === "zh") {
      currentLang = lang;
      setGameLang(lang);
      applyStaticTranslations();
      renderStageStrip();
      renderHud();
    }
  });
});

btnUndo.addEventListener("click", handleUndo);
btnRestart.addEventListener("click", handleRestart);
btnHint.addEventListener("click", () => {
  void handleHint();
});
btnShowOptimal.addEventListener("click", handleShowOptimal);
btnNewRandom.addEventListener("click", () => {
  void loadRandomStage();
});
btnNextStage.addEventListener("click", () => {
  if (currentStageIndex < CAMPAIGN_STAGES.length - 1) {
    void loadStageByIndex(currentStageIndex + 1);
  } else {
    void loadRandomStage();
  }
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

// Initialize language & start directly in Stage 1
applyStaticTranslations();
void loadStageByIndex(0);
