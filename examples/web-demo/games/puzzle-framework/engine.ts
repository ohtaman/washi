import { getGameLang, type GameLang } from "../i18n.js";
import { createAudioManager, type AudioManager } from "./audio.js";
import {
  buildDomShell,
  updateHudPills,
  updateInlineBanner,
  type DomElements,
} from "./components.js";
import { t } from "./i18n.js";
import { createStorageManager, type StorageManager } from "./storage.js";
import {
  resolveLocalizedText,
  type HudPillConfig,
  type OptimalSolution,
  type PuzzleAppInstance,
  type PuzzleDefinition,
  type RenderContext,
  type StageEvaluation,
} from "./types.js";

/**
 * Derives a deterministic 32-bit pseudo-random seed from a stage number.
 */
export function getDeterministicSeed(stageNumber: number): number {
  return (Math.imul(stageNumber >>> 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
}

export function createPuzzleApp<TState, TMove, TStageSpec>(
  definition: PuzzleDefinition<TState, TMove, TStageSpec>
): PuzzleAppInstance {
  const storage: StorageManager = createStorageManager(definition.id);
  const audio: AudioManager = createAudioManager();

  let dom: DomElements | null = null;
  let currentLang: GameLang = getGameLang();
  let currentStageNumber = 1;
  let currentStage: TStageSpec | null = null;
  let currentState: TState | null = null;
  let undoStack: TState[] = [];
  let isSolving = false;
  let cachedOptimal: OptimalSolution<TMove> | null = null;
  let highlightedMove: TMove | null = null;
  let showingModelSolution = false;
  let isRestoredBoard = false;

  const generatedStageCache = new Map<number, TStageSpec>();

  const getStageSpec = async (stageNum: number): Promise<TStageSpec> => {
    const campaignTotal = definition.campaignStages.length;
    if (stageNum <= campaignTotal && stageNum >= 1) {
      return definition.campaignStages[stageNum - 1];
    }

    const cached = generatedStageCache.get(stageNum);
    if (cached) return cached;

    if (definition.generateStage) {
      const seed = getDeterministicSeed(stageNum);
      const generated = await definition.generateStage(stageNum, seed);
      generatedStageCache.set(stageNum, generated);
      return generated;
    }

    // Fallback to last campaign stage if endless generator not supplied
    return definition.campaignStages[campaignTotal - 1];
  };

  const getEvaluation = (state: TState, stage: TStageSpec): StageEvaluation => {
    return definition.evaluate(state, stage);
  };

  const getDefaultHudPills = (
    _state: TState,
    _stage: TStageSpec,
    evalResult: StageEvaluation
  ): HudPillConfig[] => {
    const target = evalResult.targetScore !== undefined ? ` / ${evalResult.targetScore}` : "";
    return [
      {
        id: "score",
        label: t("score", currentLang),
        value: `${evalResult.score}${target}`,
      },
      {
        id: "status",
        label: t("status", currentLang),
        value: evalResult.isCleared ? "CLEAR" : evalResult.isSafe === false ? "WARN" : "OK",
        status: evalResult.isCleared
          ? "success"
          : evalResult.isSafe === false
            ? "danger"
            : "normal",
      },
    ];
  };

  const updateView = (): void => {
    if (!dom || !currentStage || currentState === null) return;

    const evalResult = getEvaluation(currentState, currentStage);
    const campaignTotal = definition.campaignStages.length;
    const isEndless = currentStageNumber > campaignTotal;
    const progress = storage.loadProgress();

    // Stage Navigation UI
    dom.stageBadge.textContent = isEndless
      ? `EX ${currentStageNumber}`
      : `STAGE ${currentStageNumber}`;
    dom.btnPrev.disabled = currentStageNumber <= 1;
    dom.btnNext.disabled = currentStageNumber >= progress.highestUnlockedStage + 1;

    // Total stars / progress counter
    const clearedCount = Object.values(progress.clearedStageIds).filter(Boolean).length;
    dom.totalStarsText.textContent = `${clearedCount}`;

    // Populate stage select dropdown
    const maxSelectable = Math.max(progress.highestUnlockedStage, currentStageNumber);
    dom.stageSelect.innerHTML = Array.from({ length: maxSelectable }, (_, i) => i + 1)
      .map((num) => {
        const isCle = Boolean(progress.clearedStageIds[`stage-${num}`]);
        const star = isCle ? "★ " : "";
        const tag = num > campaignTotal ? `EX ${num}` : `Stage ${num}`;
        return `<option value="${num}" ${num === currentStageNumber ? "selected" : ""}>${star}${tag}</option>`;
      })
      .join("");

    // Mission One-Liner / Tutorial Tag
    const isTutorial = currentStageNumber <= Math.min(4, campaignTotal);
    dom.tutorialTag.hidden = !isTutorial;
    if (isTutorial) {
      dom.tutorialTag.textContent = t("tutorial", currentLang, {
        current: currentStageNumber,
        total: Math.min(4, campaignTotal),
      });
    }

    const oneLiner = definition.getStageOneLiner
      ? resolveLocalizedText(definition.getStageOneLiner(currentStage), currentLang)
      : definition.getStageTitle
        ? resolveLocalizedText(definition.getStageTitle(currentStage), currentLang)
        : "";
    dom.missionPrompt.textContent = oneLiner;

    // HUD Pills
    const hudPills = definition.getHudPills
      ? definition.getHudPills(currentState, currentStage, evalResult)
      : getDefaultHudPills(currentState, currentStage, evalResult);
    updateHudPills(dom.hudBar, hudPills, currentLang);

    // Inline Result / Shortfall Banner
    updateInlineBanner(dom, evalResult, currentLang, isEndless);

    // Tool buttons state
    const canRestart = undoStack.length > 0 || isRestoredBoard || showingModelSolution;
    dom.btnUndo.disabled = undoStack.length === 0 || showingModelSolution;
    dom.btnRestart.disabled = !canRestart;
    dom.btnHint.hidden = !definition.solveOptimal;
    dom.btnHint.disabled = isSolving || evalResult.isCleared;
    dom.btnOptimal.hidden = !definition.solveOptimal || (!evalResult.isCleared && !cachedOptimal);

    // Localized Button Labels
    const query = <T extends HTMLElement>(sel: string): T | null =>
      dom ? dom.root.querySelector(`[data-pf="${sel}"]`) : null;

    const undoLabel = query("label-undo");
    if (undoLabel) undoLabel.textContent = t("undo", currentLang);
    const restartLabel = query("label-restart");
    if (restartLabel) restartLabel.textContent = t("restart", currentLang);
    const hintLabel = query("label-hint");
    if (hintLabel) hintLabel.textContent = t("hint", currentLang);
    const optLabel = query("label-optimal");
    if (optLabel) optLabel.textContent = t("optimal", currentLang);

    // Render puzzle board
    const renderContext: RenderContext<TMove> = {
      isCleared: evalResult.isCleared,
      showingModelSolution,
      highlightedMove,
      lang: currentLang,
      playSound: (st) => audio.playSound(st),
    };

    definition.renderBoard(
      dom.boardContainer,
      currentState,
      currentStage,
      handleMove,
      renderContext
    );
  };

  const handleMove = (move: TMove): void => {
    if (!currentStage || currentState === null) return;
    showingModelSolution = false;
    highlightedMove = null;
    isRestoredBoard = false;

    // Push previous state onto undo stack
    undoStack.push(currentState);

    // Apply move
    const nextState = definition.applyMove(currentState, move, currentStage);
    currentState = nextState;

    // Play feedback sound
    audio.playSound("tap");

    // Evaluate
    const evalResult = getEvaluation(currentState, currentStage);
    if (evalResult.isCleared) {
      audio.playSound("clear");
      handleStageCleared(evalResult);
    } else {
      // Save in-progress board state for interruption recovery
      if (definition.serializeState) {
        storage.saveBoardState(currentStageNumber, definition.serializeState(currentState));
      }
    }

    updateView();
  };

  const handleStageCleared = (evalResult: StageEvaluation): void => {
    const progress = storage.loadProgress();
    const stageKey = `stage-${currentStageNumber}`;
    progress.clearedStageIds[stageKey] = true;

    if (evalResult.stars) {
      progress.stageStars[stageKey] = Math.max(
        progress.stageStars[stageKey] || 0,
        evalResult.stars
      );
    }
    progress.stageBestScores[stageKey] = Math.max(
      progress.stageBestScores[stageKey] || 0,
      evalResult.score
    );

    // Unlock next stage if this was the latest reached stage
    if (currentStageNumber >= progress.highestUnlockedStage) {
      progress.highestUnlockedStage = currentStageNumber + 1;
    }

    progress.currentStageNumber = currentStageNumber;
    storage.saveProgress(progress);
    storage.clearBoardState();
  };

  const handleUndo = (): void => {
    if (undoStack.length === 0) return;
    currentState = undoStack.pop()!;
    showingModelSolution = false;
    highlightedMove = null;
    audio.playSound("undo");

    if (definition.serializeState && currentState !== null) {
      storage.saveBoardState(currentStageNumber, definition.serializeState(currentState));
    }
    updateView();
  };

  const handleRestart = (): void => {
    if (!currentStage) return;
    undoStack = [];
    isRestoredBoard = false;
    currentState = definition.createInitialState(currentStage);
    showingModelSolution = false;
    highlightedMove = null;
    audio.playSound("restart");
    storage.clearBoardState();
    updateView();
  };

  const handleHint = async (): Promise<void> => {
    if (!definition.solveOptimal || !currentStage || currentState === null || isSolving) return;

    try {
      isSolving = true;
      updateView();

      const solution = await definition.solveOptimal(currentStage, currentState);
      if (solution) {
        cachedOptimal = solution;
        if (solution.nextBestMove) {
          highlightedMove = solution.nextBestMove;
          audio.playSound("hint");
        }
      }
    } finally {
      isSolving = false;
      updateView();
    }
  };

  const handleShowOptimal = (): void => {
    if (!cachedOptimal || !currentStage) return;
    showingModelSolution = true;
    highlightedMove = null;

    // Apply optimal moves sequentially from initial state
    let state = definition.createInitialState(currentStage);
    for (const move of cachedOptimal.optimalMoves) {
      state = definition.applyMove(state, move, currentStage);
    }
    currentState = state;
    audio.playSound("hint");
    updateView();
  };

  const jumpToStage = async (stageNum: number): Promise<void> => {
    currentStageNumber = stageNum;
    undoStack = [];
    cachedOptimal = null;
    highlightedMove = null;
    showingModelSolution = false;

    const stage = await getStageSpec(stageNum);
    currentStage = stage;

    // Check for saved interrupted board state
    const progress = storage.loadProgress();
    if (
      definition.deserializeState &&
      progress.savedBoardState &&
      progress.savedBoardState.stageNumber === stageNum
    ) {
      const restored = definition.deserializeState(progress.savedBoardState.serialized, stage);
      if (restored !== null) {
        currentState = restored;
        isRestoredBoard = true;
      } else {
        currentState = definition.createInitialState(stage);
        isRestoredBoard = false;
      }
    } else {
      currentState = definition.createInitialState(stage);
      isRestoredBoard = false;
    }

    progress.currentStageNumber = stageNum;
    storage.saveProgress(progress);

    updateView();
  };

  const renderRulesModal = (): void => {
    if (!dom) return;
    const title = resolveLocalizedText(definition.title, currentLang);
    dom.dialogTitle.textContent = `${title} — ${t("howToPlay", currentLang)}`;

    let html = "";
    if (definition.rulesSummary) {
      html += `<p style="margin-top:0;">${resolveLocalizedText(definition.rulesSummary, currentLang)}</p>`;
    }
    if (definition.rulesList && definition.rulesList.length > 0) {
      html += `<ul>${definition.rulesList
        .map((r) => `<li>${resolveLocalizedText(r, currentLang)}</li>`)
        .join("")}</ul>`;
    }
    if (definition.legendItems && definition.legendItems.length > 0) {
      html += `<h3 style="font-size:14px; margin:16px 0 8px;">${t("tileLegend", currentLang)}</h3><div style="display:flex; flex-wrap:wrap; gap:8px;">`;
      html += definition.legendItems
        .map(
          (leg) =>
            `<span style="padding:4px 8px; background:rgba(255,255,255,0.06); border-radius:6px; font-size:12px;">${leg.icon} ${resolveLocalizedText(leg.label, currentLang)} ${leg.scoreModifier ? `<strong style="color:#38bdf8;">${leg.scoreModifier}</strong>` : ""}</span>`
        )
        .join("");
      html += `</div>`;
    }
    dom.dialogContent.innerHTML = html;
  };

  const onKeyDown = (ev: KeyboardEvent): void => {
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
  };

  const mount = (containerOrSelector: HTMLElement | string): void => {
    const el =
      typeof containerOrSelector === "string"
        ? document.querySelector<HTMLElement>(containerOrSelector)
        : containerOrSelector;
    if (!el) {
      throw new Error(`Target container not found: ${containerOrSelector}`);
    }

    dom = buildDomShell(el);

    // Event listeners
    dom.btnPrev.addEventListener("click", () => {
      if (currentStageNumber > 1) void jumpToStage(currentStageNumber - 1);
    });
    dom.btnNext.addEventListener("click", () => {
      void jumpToStage(currentStageNumber + 1);
    });
    dom.btnNextStage.addEventListener("click", () => {
      void jumpToStage(currentStageNumber + 1);
    });
    dom.stageSelect.addEventListener("change", (e) => {
      const val = parseInt((e.target as HTMLSelectElement).value, 10);
      if (!isNaN(val)) void jumpToStage(val);
    });
    dom.btnUndo.addEventListener("click", handleUndo);
    dom.btnRestart.addEventListener("click", handleRestart);
    dom.btnHint.addEventListener("click", () => void handleHint());
    dom.btnOptimal.addEventListener("click", handleShowOptimal);

    // Rules dialog
    dom.btnMenu.addEventListener("click", () => {
      if (!dom) return;
      renderRulesModal();
      dom.rulesDialog.showModal();
    });
    dom.btnCloseDialog.addEventListener("click", () => dom?.rulesDialog.close());
    dom.root.querySelector("[data-pf='btn-dialog-ok']")?.addEventListener("click", () => {
      dom?.rulesDialog.close();
    });
    dom.btnResetProgress.addEventListener("click", () => {
      if (!confirm(t("confirmReset", currentLang))) {
        return;
      }
      resetProgress();
      dom?.rulesDialog.close();
    });

    window.addEventListener("keydown", onKeyDown);

    // Initial stage loading
    const initialProgress = storage.loadProgress();
    const resumeStage = initialProgress.currentStageNumber || 1;
    void jumpToStage(resumeStage);
  };

  const destroy = (): void => {
    window.removeEventListener("keydown", onKeyDown);
    if (dom) {
      dom.root.innerHTML = "";
      dom = null;
    }
  };

  const resetProgress = (): void => {
    storage.resetAll();
    void jumpToStage(1);
  };

  return {
    mount,
    destroy,
    resetProgress,
    jumpToStage,
  };
}
