import {
  COLOR_PALETTE,
  checkBoardCoverage,
  computeTitanCellSize,
  generateStagePuzzle,
  getStageSpec,
  hasFaultLines,
  removeCollidingBlocks,
  type InventoryPart,
  type PlacedBlock,
  type PuzzleResult,
  type StageSpec,
} from "./generator.ts";
import enCatalog from "./locales/en.json";
import jaCatalog from "./locales/ja.json";
import zhCatalog from "./locales/zh.json";

export type TitanLang = "en" | "ja" | "zh";

const CATALOGS: Record<TitanLang, Record<string, any>> = {
  en: enCatalog,
  ja: jaCatalog,
  zh: zhCatalog,
};

let currentLang: TitanLang = "en";

export function getLang(): TitanLang {
  if (typeof window !== "undefined") {
    try {
      const q = new URLSearchParams(window.location.search).get("lang");
      if (q === "en" || q === "ja" || q === "zh") return q;
    } catch {
      // Ignore URL parsing errors
    }
    try {
      const saved =
        window.localStorage.getItem("washi_locale") ||
        window.localStorage.getItem("washi_games_lang");
      if (saved === "en" || saved === "ja" || saved === "zh") return saved;
    } catch {
      // Ignore storage errors
    }
    try {
      const nav = (window.navigator?.language || "").toLowerCase();
      if (nav.startsWith("ja")) return "ja";
      if (nav.startsWith("zh")) return "zh";
    } catch {
      // Ignore navigator errors
    }
  }
  return "en";
}

export function t(key: string, params?: Record<string, string | number>): string {
  const catalog = CATALOGS[currentLang] || CATALOGS.en;
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
  return val.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

// Sound Synthesizer (Web Audio) & Haptics
let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function vibrate(pattern: number | number[]) {
  try {
    if (typeof window !== "undefined" && window.navigator?.vibrate) {
      window.navigator.vibrate(pattern);
    }
  } catch {
    // Ignore vibration failure
  }
}

function playTone(freq: number, type: OscillatorType, duration: number, gainVal = 0.08) {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio playback not allowed or failed
  }
}

function sndSelect() {
  vibrate(10);
  playTone(600, "sine", 0.04, 0.06);
}
function sndRotate() {
  vibrate(15);
  playTone(720, "triangle", 0.05, 0.08);
}
function sndSnap() {
  vibrate(25);
  playTone(320, "square", 0.06, 0.1);
}
function sndRemove() {
  vibrate(15);
  playTone(400, "sine", 0.04, 0.06);
}
function sndError() {
  vibrate([30, 40, 30]);
  playTone(150, "sawtooth", 0.12, 0.15);
}
function sndWin() {
  vibrate([40, 60, 40, 60, 80]);
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    setTimeout(() => playTone(f, "triangle", 0.22, 0.1), i * 90);
  });
}

// Game State
let currentStageNum = 1;
let currentPuzzle: PuzzleResult;
let placedParts: Array<{ partId: string; col: number; row: number; w: number; h: number }> = [];
let activePartId: string | null = null;
let isRotated = false;
let isCutting = false;

function setDroneMsg(msg: string, isClear = false) {
  const el = document.getElementById("drone-msg");
  if (!el) return;
  el.textContent = msg;
  const eye = document.getElementById("drone-eye");
  if (!eye) return;
  if (isClear) {
    eye.setAttribute("fill", "#059669");
    eye.setAttribute("rx", "8");
    eye.setAttribute("ry", "4");
  } else {
    eye.setAttribute("fill", "#38bdf8");
    eye.setAttribute("rx", "7");
    eye.setAttribute("ry", "7");
  }
}

function updateCellSize() {
  const viewport = document.getElementById("board-viewport");
  if (!viewport || !currentPuzzle) return;
  const availW = Math.max(120, viewport.clientWidth);
  const availH = Math.max(120, window.innerHeight * 0.38);
  const size = computeTitanCellSize(currentPuzzle.cols, currentPuzzle.rows, availW, availH, 24);
  document.documentElement.style.setProperty("--cell-size", `${size}px`);
}

function getPartDef(id: string): InventoryPart | undefined {
  return currentPuzzle.parts.find((p) => p.id === id);
}

function isPartPlaced(id: string): boolean {
  return placedParts.some((p) => p.partId === id);
}

function canPlace(col: number, row: number, w: number, h: number): boolean {
  if (col < 0 || row < 0 || col + w > currentPuzzle.cols || row + h > currentPuzzle.rows) {
    return false;
  }
  for (const placed of placedParts) {
    const overlapX = Math.max(0, Math.min(col + w, placed.col + placed.w) - Math.max(col, placed.col));
    const overlapY = Math.max(0, Math.min(row + h, placed.row + placed.h) - Math.max(row, placed.row));
    if (overlapX > 0 && overlapY > 0) return false;
  }
  return true;
}

function triggerCutClear(isAuto = false) {
  if (isCutting) return;
  isCutting = true;

  const coverage = checkBoardCoverage(currentPuzzle.cols, currentPuzzle.rows, placedParts);

  if (placedParts.length < currentPuzzle.parts.length) {
    sndError();
    setDroneMsg(t("droneUnplaced"));
    isCutting = false;
    return;
  }

  if (coverage.hasOverlap || coverage.coveredCount !== coverage.totalArea) {
    sndError();
    const remaining = coverage.totalArea - coverage.coveredCount;
    setDroneMsg(t("droneVoidRemaining", { n: remaining > 0 ? remaining : 1 }));
    isCutting = false;
    return;
  }

  // Check if placement happens to be fault-free (bonus distinction)
  const isFaultFree = !hasFaultLines(currentPuzzle.cols, currentPuzzle.rows, placedParts);

  const scan = document.getElementById("laser-scan");
  if (scan) {
    scan.classList.remove("active");
    void scan.offsetWidth;
    scan.classList.add("active");
  }

  sndWin();

  if (isFaultFree) {
    setDroneMsg(t("droneClearPerfect"), true);
  } else {
    setDroneMsg(t("droneClear"), true);
  }

  const winTitle = document.getElementById("win-modal-title");
  const winBody2 = document.getElementById("win-modal-body2");
  const winDrone = document.getElementById("win-drone-comment");

  if (isFaultFree) {
    if (winTitle) winTitle.textContent = t("winTitlePerfect");
    if (winBody2) winBody2.textContent = t("winBody2Perfect");
    if (winDrone) winDrone.textContent = t("winDronePerfect");
  } else {
    if (winTitle) winTitle.textContent = t("winTitle");
    if (winBody2) winBody2.textContent = t("winBody2");
    if (winDrone) winDrone.textContent = t("winDrone");
  }

  setTimeout(() => {
    document.getElementById("modal-win")?.classList.add("open");
    isCutting = false;
  }, 650);
}

function placeActivePart(col: number, row: number) {
  if (!activePartId) return;
  const part = getPartDef(activePartId);
  if (!part) return;
  const curW = isRotated ? part.h : part.w;
  const curH = isRotated ? part.w : part.h;

  if (canPlace(col, row, curW, curH)) {
    placedParts.push({ partId: activePartId, col, row, w: curW, h: curH });
    sndSnap();
    activePartId = null;
    isRotated = false;

    render();

    const coverage = checkBoardCoverage(currentPuzzle.cols, currentPuzzle.rows, placedParts);
    // Instant Win: Trigger automatic laser cut & clear as soon as board is 100% packed!
    if (placedParts.length === currentPuzzle.parts.length && coverage.isComplete) {
      triggerCutClear(true);
    } else {
      setDroneMsg(t("droneKeepGoing", { n: coverage.totalArea - coverage.coveredCount }));
    }
  } else {
    sndError();
    setDroneMsg(t("droneOverlap"));
  }
}

function removePlacedPart(partId: string) {
  placedParts = placedParts.filter((p) => p.partId !== partId);
  activePartId = partId;
  isRotated = false;
  sndRemove();
  setDroneMsg(t("droneRecalled"));
  render();
}

function undoLastPlacement() {
  if (placedParts.length === 0) return;
  const last = placedParts.pop()!;
  activePartId = last.partId;
  isRotated = false;
  sndRemove();
  setDroneMsg(t("droneUndo"));
  render();
}

function toggleRotate() {
  if (!activePartId) {
    const unplaced = currentPuzzle.parts.find((p) => !isPartPlaced(p.id));
    if (unplaced) activePartId = unplaced.id;
  }
  if (activePartId) {
    isRotated = !isRotated;
    sndRotate();
    render();
  }
}

function loadStage(stageNum: number) {
  currentStageNum = Math.max(1, stageNum);
  currentPuzzle = generateStagePuzzle(currentStageNum);
  placedParts = [];
  activePartId = null;
  isRotated = false;
  isCutting = false;

  updateCellSize();

  const stageDisplay = document.getElementById("stage-display");
  if (stageDisplay) {
    stageDisplay.textContent = `STAGE ${String(currentStageNum).padStart(2, "0")}`;
  }

  const badge = document.getElementById("stage-diff-badge");
  if (badge) {
    const diffKey = currentPuzzle.spec.diff;
    badge.textContent = t(`diff.${diffKey}`);
    badge.className = `stage-diff-badge ${currentPuzzle.spec.badgeClass}`;
  }

  setDroneMsg(t("droneStageStart", { n: currentStageNum }));
  render();
}

function render() {
  // 1. Inventory Tray
  const tray = document.getElementById("inventory-tray");
  if (tray) {
    tray.innerHTML = "";
    let placedCount = 0;

    currentPuzzle.parts.forEach((part) => {
      const placed = isPartPlaced(part.id);
      if (placed) placedCount++;
      const isActive = activePartId === part.id;

      const card = document.createElement("div");
      card.className = `item-card part-card ${isActive ? "active selected" : ""} ${placed ? "placed" : ""}`;
      card.onclick = () => {
        sndSelect();
        if (placed) {
          removePlacedPart(part.id);
        } else if (activePartId === part.id) {
          toggleRotate();
        } else {
          activePartId = part.id;
          isRotated = false;
          render();
        }
      };

      const curW = isActive && isRotated ? part.h : part.w;
      const curH = isActive && isRotated ? part.w : part.h;

      const preview = document.createElement("div");
      preview.className = "item-mini-grid part-preview-grid";
      preview.style.gridTemplateColumns = `repeat(${curW}, 1fr)`;
      preview.style.gridTemplateRows = `repeat(${curH}, 1fr)`;
      for (let r = 0; r < curH; r++) {
        for (let c = 0; c < curW; c++) {
          const mini = document.createElement("div");
          mini.className = "mini-cell part-mini-cell";
          mini.style.background = part.color;
          preview.appendChild(mini);
        }
      }

      const meta = document.createElement("div");
      meta.className = "item-details part-meta";
      meta.innerHTML = `
        <span class="item-code part-name">${part.name}${isActive && isRotated ? t("rotatedSuffix") : ""}</span>
        <span class="item-name part-dim">${curW} × ${curH} (${curW * curH} sq)</span>
      `;

      card.appendChild(preview);
      card.appendChild(meta);
      tray.appendChild(card);
    });

    const queueCount = document.getElementById("parts-queue-count");
    if (queueCount) {
      queueCount.textContent = `${placedCount} / ${currentPuzzle.parts.length}`;
    }
  }

  // Active Part Banner
  const banner = document.getElementById("active-banner");
  if (banner) {
    if (activePartId) {
      const activePart = getPartDef(activePartId);
      if (activePart) {
        banner.style.display = "flex";
        const badgeEl = document.getElementById("active-banner-badge");
        if (badgeEl) {
          badgeEl.textContent = activePart.name;
          badgeEl.style.background = activePart.color;
        }
        const dimEl = document.getElementById("active-banner-dim");
        if (dimEl) {
          const curW = isRotated ? activePart.h : activePart.w;
          const curH = isRotated ? activePart.w : activePart.h;
          dimEl.textContent = `${curW} × ${curH}${isRotated ? t("rotatedSuffix") : ""}`;
        }
      }
    } else {
      banner.style.display = "none";
    }
  }

  // 2. Titanium Plate Grid
  const plate = document.getElementById("board-plate");
  if (plate) {
    plate.innerHTML = "";
    plate.style.gridTemplateColumns = `repeat(${currentPuzzle.cols}, var(--cell-size))`;
    plate.style.gridTemplateRows = `repeat(${currentPuzzle.rows}, var(--cell-size))`;

    const metaIndicator = document.getElementById("board-meta");
    if (metaIndicator) {
      metaIndicator.textContent = `PLATE: ${currentPuzzle.cols} × ${currentPuzzle.rows}`;
    }

    const highlightTargetCells = (c: number, r: number, clear = false) => {
      document.querySelectorAll(".grid-cell, .sheet-cell").forEach((el) => {
        el.classList.remove("hover-valid", "hover-invalid", "preview-valid", "preview-invalid");
      });
      if (clear || !activePartId) return;

      const part = getPartDef(activePartId);
      if (!part) return;
      const curW = isRotated ? part.h : part.w;
      const curH = isRotated ? part.w : part.h;
      const ok = canPlace(c, r, curW, curH);

      for (let dr = 0; dr < curH; dr++) {
        for (let dc = 0; dc < curW; dc++) {
          const tc = c + dc;
          const tr = r + dr;
          if (tc < currentPuzzle.cols && tr < currentPuzzle.rows) {
            const target = document.querySelector(`.grid-cell[data-col="${tc}"][data-row="${tr}"]`);
            if (target) {
              target.classList.add(ok ? "hover-valid" : "hover-invalid");
            }
          }
        }
      }
    };

    for (let r = 0; r < currentPuzzle.rows; r++) {
      for (let c = 0; c < currentPuzzle.cols; c++) {
        const cell = document.createElement("div");
        cell.className = "sheet-cell grid-cell";
        cell.dataset.col = String(c);
        cell.dataset.row = String(r);

        cell.onmouseenter = () => highlightTargetCells(c, r);
        cell.onclick = () => {
          if (activePartId) {
            placeActivePart(c, r);
          }
        };

        plate.appendChild(cell);
      }
    }

    plate.onmouseleave = () => highlightTargetCells(0, 0, true);

    placedParts.forEach((placed) => {
      const part = getPartDef(placed.partId);
      if (!part) return;
      const block = document.createElement("div");
      block.className = "placed-block";
      block.style.background = part.color;
      block.style.left = `calc(${placed.col} * var(--cell-size))`;
      block.style.top = `calc(${placed.row} * var(--cell-size))`;
      block.style.width = `calc(${placed.w} * var(--cell-size))`;
      block.style.height = `calc(${placed.h} * var(--cell-size))`;

      const isThin = placed.w === 1 || placed.h === 1;
      block.innerHTML = isThin
        ? `<span class="block-label" style="font-size:0.7rem;">${part.id} (${placed.w}×${placed.h})</span>`
        : `
          <span class="block-label">${part.name}</span>
          <span class="block-dim">${placed.w} × ${placed.h}</span>
        `;
      block.title = `${part.name} (${placed.w}x${placed.h})${t("clickToRecall")}`;
      block.onclick = (e) => {
        e.stopPropagation();
        removePlacedPart(placed.partId);
      };
      plate.appendChild(block);
    });
  }

  // 3. Stats Calculation
  const coverage = checkBoardCoverage(currentPuzzle.cols, currentPuzzle.rows, placedParts);
  const totalArea = coverage.totalArea;
  const usedArea = coverage.coveredCount;
  const wasteArea = totalArea - usedArea;
  const coveragePct = Math.round((usedArea / totalArea) * 100);

  const coverageEl = document.getElementById("stat-coverage");
  if (coverageEl) coverageEl.textContent = `${coveragePct}%`;
  const partsEl = document.getElementById("stat-parts");
  if (partsEl) partsEl.textContent = `${placedParts.length} / ${currentPuzzle.parts.length}`;
  const wasteEl = document.getElementById("stat-waste");
  if (wasteEl) {
    wasteEl.textContent = `${wasteArea} BLOCKS`;
    const executeBtn = document.getElementById("btn-execute");
    if (!coverage.hasOverlap && wasteArea === 0 && placedParts.length === currentPuzzle.parts.length) {
      wasteEl.style.color = "var(--accent-success)";
      executeBtn?.classList.add("ready-cut");
    } else {
      wasteEl.style.color = "var(--accent-danger)";
      executeBtn?.classList.remove("ready-cut");
    }
  }
}

function updateStaticI18n() {
  document.documentElement.lang = currentLang === "zh" ? "zh-CN" : currentLang;

  const titleEl = document.querySelector("title");
  if (titleEl) titleEl.textContent = t("title");
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", t("metaDesc"));

  const setHtml = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = text;
  };
  const setText = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  const setTitle = (id: string, text: string) => {
    const el = document.getElementById(id);
    if (el) el.title = text;
  };

  setText("brand-subtitle", t("subtitle"));
  setText("drone-name", t("droneName"));
  setTitle("btn-prev-stage", t("prevStage"));
  setTitle("btn-next-stage", t("nextStage"));
  setText("matrix-title", t("matrixTitle"));
  setText("queue-title", t("queueTitle"));
  setText("btn-rotate-active", t("btnRotate"));
  setText("btn-undo", t("btnUndo"));
  setText("btn-reset", t("btnReset"));
  setText("btn-active-rotate", t("btnActiveRotate"));
  setText("btn-active-cancel", t("btnActiveCancel"));
  setText("btn-solve", t("btnSolve"));
  setTitle("btn-solve", t("btnSolveTitle"));
  setText("btn-theory", t("btnTheory"));
  setText("btn-execute", t("btnExecute"));
  setText("stat-label-coverage", t("statCoverage"));
  setText("stat-label-placed", t("statPlaced"));
  setText("stat-label-scrap", t("statScrap"));
  setHtml("tip-text", t("tip"));
  setText("win-modal-title", t("winTitle"));
  setText("win-modal-body1", t("winBody1"));
  setText("win-modal-body2", t("winBody2"));
  setText("win-drone-comment", t("winDrone"));
  setText("btn-modal-next", t("winNext"));
  setText("theory-modal-title", t("theoryTitle"));
  setText("theory-modal-body1", t("theoryBody1"));
  setText("theory-modal-body2", t("theoryBody2"));
  setText("btn-theory-close", t("theoryClose"));

  // Language buttons
  document.querySelectorAll<HTMLButtonElement>("[data-lang-btn]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.langBtn === currentLang);
  });

  if (currentPuzzle) {
    const badge = document.getElementById("stage-diff-badge");
    if (badge) {
      badge.textContent = t(`diff.${currentPuzzle.spec.diff}`);
    }
  }
}

export function setLanguage(lang: TitanLang) {
  currentLang = lang;
  try {
    window.localStorage.setItem("washi_locale", lang);
    window.localStorage.setItem("washi_games_lang", lang);
  } catch {
    // Ignore storage errors
  }
  updateStaticI18n();
  render();
}

// Attach event listeners when DOM is loaded
function init() {
  currentLang = getLang();

  // Language switch buttons
  document.querySelectorAll<HTMLButtonElement>("[data-lang-btn]").forEach((btn) => {
    btn.onclick = () => {
      const target = btn.dataset.langBtn as TitanLang;
      if (target && target !== currentLang) {
        setLanguage(target);
      }
    };
  });

  // Keyboard Controls
  window.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R") {
      toggleRotate();
    } else if (e.key === "z" || e.key === "Z") {
      undoLastPlacement();
    } else if (e.key === "Escape") {
      activePartId = null;
      isRotated = false;
      render();
    } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
      if (currentStageNum > 1) {
        sndSelect();
        loadStage(currentStageNum - 1);
      }
    } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
      sndSelect();
      loadStage(currentStageNum + 1);
    }
  });

  window.addEventListener("resize", updateCellSize);
  window.addEventListener("orientationchange", updateCellSize);

  const btnActiveRotate = document.getElementById("btn-active-rotate");
  if (btnActiveRotate) btnActiveRotate.onclick = toggleRotate;

  const btnActiveCancel = document.getElementById("btn-active-cancel");
  if (btnActiveCancel) {
    btnActiveCancel.onclick = () => {
      activePartId = null;
      isRotated = false;
      render();
    };
  }

  const btnRotateActive = document.getElementById("btn-rotate-active");
  if (btnRotateActive) btnRotateActive.onclick = toggleRotate;

  const btnUndo = document.getElementById("btn-undo");
  if (btnUndo) btnUndo.onclick = undoLastPlacement;

  const btnReset = document.getElementById("btn-reset");
  if (btnReset) {
    btnReset.onclick = () => {
      placedParts = [];
      activePartId = null;
      isRotated = false;
      setDroneMsg(t("droneReset"));
      render();
    };
  }

  const btnPrevStage = document.getElementById("btn-prev-stage");
  if (btnPrevStage) {
    btnPrevStage.onclick = () => {
      if (currentStageNum > 1) {
        sndSelect();
        loadStage(currentStageNum - 1);
      }
    };
  }

  const btnNextStage = document.getElementById("btn-next-stage");
  if (btnNextStage) {
    btnNextStage.onclick = () => {
      sndSelect();
      loadStage(currentStageNum + 1);
    };
  }

  // Solver / Hint button (Step-by-step hint or full solve)
  const btnSolve = document.getElementById("btn-solve");
  if (btnSolve) {
    btnSolve.onclick = () => {
      // Find parts from solution that are not yet placed
      const unplacedSolBlocks = currentPuzzle.solution.filter((sb) => !isPartPlaced(sb.partId));

      if (unplacedSolBlocks.length > 0) {
        // Place one step hint
        const nextHint = unplacedSolBlocks[0];
        // Remove any conflicting placed blocks at target cells before inserting hint
        placedParts = removeCollidingBlocks(placedParts, nextHint);
        placedParts.push({
          partId: nextHint.partId,
          col: nextHint.col,
          row: nextHint.row,
          w: nextHint.w,
          h: nextHint.h,
        });
        activePartId = null;
        isRotated = false;
        sndSnap();
        setDroneMsg(t("droneHint"));
        render();

        const coverage = checkBoardCoverage(currentPuzzle.cols, currentPuzzle.rows, placedParts);
        if (placedParts.length === currentPuzzle.parts.length && coverage.isComplete) {
          triggerCutClear(true);
        }
      } else {
        // All placed already, re-apply full solution
        placedParts = currentPuzzle.solution.slice();
        activePartId = null;
        isRotated = false;
        render();
        triggerCutClear(true);
      }
    };
  }

  // Cut Execute button
  const btnExecute = document.getElementById("btn-execute");
  if (btnExecute) {
    btnExecute.onclick = () => triggerCutClear(false);
  }

  // Modal next button
  const btnModalNext = document.getElementById("btn-modal-next");
  if (btnModalNext) {
    btnModalNext.onclick = () => {
      document.getElementById("modal-win")?.classList.remove("open");
      loadStage(currentStageNum + 1);
    };
  }

  // Theory Modal
  const btnTheory = document.getElementById("btn-theory");
  if (btnTheory) {
    btnTheory.onclick = () => {
      document.getElementById("modal-theory")?.classList.add("open");
    };
  }
  const btnTheoryClose = document.getElementById("btn-theory-close");
  if (btnTheoryClose) {
    btnTheoryClose.onclick = () => {
      document.getElementById("modal-theory")?.classList.remove("open");
    };
  }

  updateStaticI18n();
  loadStage(1);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
