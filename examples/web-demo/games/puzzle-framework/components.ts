import type { GameLang } from "../i18n.js";
import { t } from "./i18n.js";
import {
  resolveLocalizedText,
  type HudPillConfig,
  type StageEvaluation,
} from "./types.js";

export interface DomElements {
  root: HTMLElement;
  shell: HTMLElement;
  btnPrev: HTMLButtonElement;
  btnNext: HTMLButtonElement;
  stageSelect: HTMLSelectElement;
  stageBadge: HTMLElement;
  totalStarsText: HTMLElement;
  btnMenu: HTMLButtonElement;
  guideBanner: HTMLElement;
  tutorialTag: HTMLElement;
  missionPrompt: HTMLElement;
  hudBar: HTMLElement;
  boardStage: HTMLElement;
  boardContainer: HTMLElement;
  inlineBanner: HTMLElement;
  bannerTitle: HTMLElement;
  bannerDesc: HTMLElement;
  btnNextStage: HTMLButtonElement;
  btnUndo: HTMLButtonElement;
  btnRestart: HTMLButtonElement;
  btnHint: HTMLButtonElement;
  btnOptimal: HTMLButtonElement;
  rulesDialog: HTMLDialogElement;
  dialogTitle: HTMLElement;
  dialogContent: HTMLElement;
  btnCloseDialog: HTMLButtonElement;
  btnResetProgress: HTMLButtonElement;
}

export function buildDomShell(container: HTMLElement): DomElements {
  container.innerHTML = `
    <div class="pf-app-shell" role="region" aria-label="Puzzle Game">
      <!-- Top Bar -->
      <header class="pf-topbar">
        <nav class="pf-stage-nav" aria-label="Stage Navigation">
          <button type="button" class="pf-nav-btn" data-pf="btn-prev" aria-label="Previous Stage" title="Previous Stage">◀</button>
          <div class="pf-stage-selector-wrap">
            <span class="pf-stage-badge" data-pf="stage-badge">STAGE 1</span>
            <select class="pf-stage-select-native" data-pf="stage-select" aria-label="Select Stage"></select>
          </div>
          <button type="button" class="pf-nav-btn" data-pf="btn-next" aria-label="Next Stage" title="Next Stage">▶</button>
        </nav>

        <div class="pf-topbar-actions">
          <div class="pf-star-counter" data-pf="star-counter" title="Total Stars">
            <span>★</span>
            <span data-pf="total-stars-text">0</span>
          </div>
          <button type="button" class="pf-menu-btn" data-pf="btn-menu" aria-label="Game Rules & Settings" title="Settings">⚙️</button>
        </div>
      </header>

      <!-- Mission / Tutorial Banner -->
      <section class="pf-guide-banner" data-pf="guide-banner" aria-label="Mission Goal">
        <span class="pf-tutorial-tag" data-pf="tutorial-tag">TUTORIAL</span>
        <p class="pf-mission-prompt" data-pf="mission-prompt"></p>
      </section>

      <!-- 3-Pill Compact HUD -->
      <section class="pf-hud-bar" data-pf="hud-bar" aria-label="Game Status Indicators">
        <!-- Injected dynamically -->
      </section>

      <!-- Board Area -->
      <main class="pf-board-stage" data-pf="board-stage">
        <div class="pf-board-container" data-pf="board-container"></div>
      </main>

      <!-- Inline Result / Shortfall Banner -->
      <section class="pf-inline-banner" data-pf="inline-banner" hidden aria-live="polite">
        <div class="pf-banner-copy">
          <span class="pf-banner-title" data-pf="banner-title">Stage Cleared!</span>
          <span class="pf-banner-desc" data-pf="banner-desc"></span>
        </div>
        <button type="button" class="pf-btn-next-stage" data-pf="btn-next-stage">
          Next ▶
        </button>
      </section>

      <!-- Controls Toolbar -->
      <footer class="pf-controls-bar">
        <button type="button" class="pf-tool-btn" data-pf="btn-undo" title="Undo (Z)" disabled>
          <span class="pf-tool-icon">↩</span>
          <span data-pf="label-undo">Undo</span>
        </button>
        <button type="button" class="pf-tool-btn" data-pf="btn-restart" title="Restart (R)" disabled>
          <span class="pf-tool-icon">🔄</span>
          <span data-pf="label-restart">Restart</span>
        </button>
        <button type="button" class="pf-tool-btn btn-hint" data-pf="btn-hint" title="Hint (H)">
          <span class="pf-tool-icon">💡</span>
          <span data-pf="label-hint">Hint</span>
        </button>
        <button type="button" class="pf-tool-btn btn-optimal" data-pf="btn-optimal" title="Show Optimal Solution" hidden>
          <span class="pf-tool-icon">✨</span>
          <span data-pf="label-optimal">Optimal</span>
        </button>
      </footer>

      <!-- Rules & Settings Dialog -->
      <dialog class="pf-dialog" data-pf="rules-dialog">
        <div class="pf-dialog-header">
          <h2 class="pf-dialog-title" data-pf="dialog-title">Rules & Info</h2>
          <button type="button" class="pf-dialog-close" data-pf="btn-close-dialog" aria-label="Close">✕</button>
        </div>
        <div class="pf-dialog-body" data-pf="dialog-content"></div>
        <div class="pf-dialog-actions" style="padding: 0 16px 16px;">
          <button type="button" class="pf-btn-danger" data-pf="btn-reset-progress">Reset Progress</button>
          <button type="button" class="pf-btn-primary" data-pf="btn-dialog-ok">Close</button>
        </div>
      </dialog>
    </div>
  `;

  const query = <T extends HTMLElement>(selector: string): T => {
    const el = container.querySelector(`[data-pf="${selector}"]`);
    if (!el) throw new Error(`Missing expected element [data-pf="${selector}"]`);
    return el as T;
  };

  return {
    root: container,
    shell: container.querySelector(".pf-app-shell") as HTMLElement,
    btnPrev: query<HTMLButtonElement>("btn-prev"),
    btnNext: query<HTMLButtonElement>("btn-next"),
    stageSelect: query<HTMLSelectElement>("stage-select"),
    stageBadge: query<HTMLElement>("stage-badge"),
    totalStarsText: query<HTMLElement>("total-stars-text"),
    btnMenu: query<HTMLButtonElement>("btn-menu"),
    guideBanner: query<HTMLElement>("guide-banner"),
    tutorialTag: query<HTMLElement>("tutorial-tag"),
    missionPrompt: query<HTMLElement>("mission-prompt"),
    hudBar: query<HTMLElement>("hud-bar"),
    boardStage: query<HTMLElement>("board-stage"),
    boardContainer: query<HTMLElement>("board-container"),
    inlineBanner: query<HTMLElement>("inline-banner"),
    bannerTitle: query<HTMLElement>("banner-title"),
    bannerDesc: query<HTMLElement>("banner-desc"),
    btnNextStage: query<HTMLButtonElement>("btn-next-stage"),
    btnUndo: query<HTMLButtonElement>("btn-undo"),
    btnRestart: query<HTMLButtonElement>("btn-restart"),
    btnHint: query<HTMLButtonElement>("btn-hint"),
    btnOptimal: query<HTMLButtonElement>("btn-optimal"),
    rulesDialog: query<HTMLDialogElement>("rules-dialog"),
    dialogTitle: query<HTMLElement>("dialog-title"),
    dialogContent: query<HTMLElement>("dialog-content"),
    btnCloseDialog: query<HTMLButtonElement>("btn-close-dialog"),
    btnResetProgress: query<HTMLButtonElement>("btn-reset-progress"),
  };
}

export function updateHudPills(hudBar: HTMLElement, pills: HudPillConfig[], lang: GameLang): void {
  hudBar.innerHTML = pills
    .map((pill) => {
      const label = resolveLocalizedText(pill.label, lang);
      const statusClass = pill.status ? `status-${pill.status}` : "";
      const icon = pill.icon ? `<span class="pf-hud-icon">${pill.icon}</span> ` : "";
      return `
        <div class="pf-hud-pill ${statusClass}" data-pill-id="${pill.id}">
          <span class="pf-hud-label">${label}</span>
          <span class="pf-hud-value">${icon}${pill.value}</span>
        </div>
      `;
    })
    .join("");
}

export function updateInlineBanner(
  dom: DomElements,
  evaluation: StageEvaluation,
  lang: GameLang,
  isEndlessMode: boolean
): void {
  if (evaluation.isCleared) {
    dom.inlineBanner.hidden = false;
    dom.inlineBanner.className = "pf-inline-banner";
    dom.bannerTitle.textContent = isEndlessMode
      ? t("endlessStageCleared", lang)
      : t("stageCleared", lang);
    dom.bannerDesc.textContent = t("goalAchieved", lang);
    dom.btnNextStage.hidden = false;
    dom.btnNextStage.textContent = t("nextStage", lang);
  } else if (evaluation.shortfallReason) {
    dom.inlineBanner.hidden = false;
    dom.inlineBanner.className = "pf-inline-banner banner-shortfall";
    dom.bannerTitle.textContent = t("almostThere", lang);
    dom.bannerDesc.textContent = resolveLocalizedText(evaluation.shortfallReason, lang);
    dom.btnNextStage.hidden = true;
  } else {
    dom.inlineBanner.hidden = true;
  }
}
