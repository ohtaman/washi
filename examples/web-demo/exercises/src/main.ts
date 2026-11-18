import "katex/dist/katex.min.css";
import "./style.css";

import { UI_STRINGS } from "./i18n/ui-strings.js";
import { CHAPTERS, PROBLEMS, getProblemById } from "./problems/registry.js";
import { runHighspyExerciseCode, type PyodideRunPhase } from "./runner/pyodide-runner.js";
import { runWashiExerciseCode } from "./runner/washi-runner.js";
import {
  clearDraft,
  createEmptyProgress,
  dismissTutorial,
  exportProgressJson,
  importProgressJson,
  loadProgress,
  recordSolvedProblem,
  saveDraft,
  saveProgress,
  type ProgressState,
} from "./store/progress.js";
import type { JudgeResult, Locale, ProblemDefinition, RuntimeId, VerdictStatus } from "./types.js";
import {
  escapeHtml,
  renderBackupDialogHtml,
  renderHeaderHtml,
  renderQuestMapHtml,
  renderResultsHtml,
  renderWorkspaceHtml,
  type RenderedRunReport,
} from "./ui/components.js";

const LOCALE_STORAGE_KEY = "washi_exercises_locale";
const VALID_LOCALES: ReadonlyArray<Locale> = ["en", "ja", "zh"];

function normalizeLocale(raw: string | null | undefined): Locale | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("zh")) return "zh";
  if (lower.startsWith("en")) return "en";
  return null;
}

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const urlLang = new URLSearchParams(window.location.search).get("lang");
  const fromQuery = normalizeLocale(urlLang);
  if (fromQuery) return fromQuery;

  try {
    const saved = normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
    if (saved) return saved;
  } catch {
    // Ignore storage access errors
  }

  try {
    if (document.referrer) {
      const refPath = new URL(document.referrer).pathname;
      if (refPath.startsWith("/ja/") || refPath === "/ja") return "ja";
      if (refPath.startsWith("/zh/") || refPath === "/zh") return "zh";
    }
  } catch {
    // Ignore malformed referrer
  }

  if (typeof navigator !== "undefined") {
    const navLocale = normalizeLocale(navigator.language);
    if (navLocale) return navLocale;
  }

  return "en";
}

function parseRouteProblemId(): string | null {
  if (typeof window === "undefined") return null;
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) return null;
  return getProblemById(id) ? id : null;
}

function getEffectiveTheme(): "light" | "dark" {
  const meta = document.querySelector('meta[name="color-scheme"]');
  const content = meta?.getAttribute("content");
  if (content === "dark" || content === "light") return content;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function syncThemeMetaFromStorage(): void {
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (!meta) return;
  try {
    const stored = window.localStorage.getItem("theme");
    meta.setAttribute("content", stored === "light" || stored === "dark" ? stored : "light dark");
  } catch {
    meta.setAttribute("content", "light dark");
  }
}

class ExercisesApp {
  private root: HTMLElement;
  private locale: Locale;
  private progress: ProgressState;
  private problemId: string | null;
  private activeRuntime: RuntimeId = "washi";
  private viewGeneration = 0;
  private runningGeneration: number | null = null;
  private armedSolutionRuntime: RuntimeId | null = null;
  private armedSolutionTimer: ReturnType<typeof setTimeout> | null = null;
  private armedResetAll = false;
  private armedResetAllTimer: ReturnType<typeof setTimeout> | null = null;
  private lastReport: RenderedRunReport | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.locale = detectInitialLocale();
    this.progress = loadProgress();
    this.problemId = parseRouteProblemId();

    this.attachGlobalEvents();
    this.render();
  }

  private get strings() {
    return UI_STRINGS[this.locale];
  }

  private pushUrl(id: string | null, replace: boolean = false): void {
    const url = new URL(window.location.href);
    url.searchParams.set("lang", this.locale);
    if (id) {
      url.searchParams.set("id", id);
    } else {
      url.searchParams.delete("id");
    }
    if (replace) {
      window.history.replaceState({}, "", url.toString());
    } else {
      window.history.pushState({}, "", url.toString());
    }
  }

  private attachGlobalEvents(): void {
    window.addEventListener("popstate", () => {
      this.viewGeneration++;
      this.locale = detectInitialLocale();
      this.problemId = parseRouteProblemId();
      this.clearArmingState();
      this.lastReport = null;
      this.render();
    });

    window.addEventListener("storage", (e: StorageEvent) => {
      if (e.key === "theme") {
        syncThemeMetaFromStorage();
        this.updateThemeToggleUi();
      } else if (e.key === "washi_exercises_progress_v1") {
        this.progress = loadProgress();
        this.render();
      }
    });

    this.root.addEventListener("click", (e) => void this.handleClick(e));
    this.root.addEventListener("change", (e) => this.handleChange(e));
    this.root.addEventListener("input", (e) => this.handleInput(e));
    this.root.addEventListener("keydown", (e) => this.handleKeyDown(e));
  }

  private clearArmingState(): void {
    this.armedSolutionRuntime = null;
    if (this.armedSolutionTimer !== null) {
      clearTimeout(this.armedSolutionTimer);
      this.armedSolutionTimer = null;
    }
    this.armedResetAll = false;
    if (this.armedResetAllTimer !== null) {
      clearTimeout(this.armedResetAllTimer);
      this.armedResetAllTimer = null;
    }
  }

  private updateThemeToggleUi(): void {
    const btn = this.root.querySelector<HTMLButtonElement>("#theme-toggle-btn");
    if (!btn) return;
    const effective = getEffectiveTheme();
    const label =
      effective === "dark" ? this.strings.theme.switchToLight : this.strings.theme.switchToDark;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
    btn.textContent = effective === "dark" ? "☀️" : "🌙";
  }

  private toggleTheme(): void {
    const currentEffective = getEffectiveTheme();
    const next: "light" | "dark" = currentEffective === "dark" ? "light" : "dark";
    const osPrefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    const osTheme: "light" | "dark" = osPrefersDark ? "dark" : "light";
    const meta = document.querySelector('meta[name="color-scheme"]');

    try {
      if (next === osTheme) {
        window.localStorage.removeItem("theme");
        meta?.setAttribute("content", "light dark");
      } else {
        window.localStorage.setItem("theme", next);
        meta?.setAttribute("content", next);
      }
    } catch {
      meta?.setAttribute("content", next);
    }

    this.updateThemeToggleUi();
  }

  private navigateToProblem(id: string | null): void {
    this.viewGeneration++;
    this.problemId = id && getProblemById(id) ? id : null;
    this.clearArmingState();
    this.lastReport = null;
    this.pushUrl(this.problemId);
    this.render();
    window.scrollTo({ top: 0 });
  }

  private setLocale(next: Locale): void {
    if (!VALID_LOCALES.includes(next)) return;
    this.locale = next;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Ignore storage failures
    }
    this.pushUrl(this.problemId, true);
    this.render();
  }

  private getDraftCode(prob: ProblemDefinition, runtime: RuntimeId): string {
    const draft = this.progress.drafts[prob.meta.id]?.[runtime];
    if (draft !== undefined) return draft;
    return runtime === "washi" ? prob.washiStarter : prob.highspyStarter;
  }

  private switchRuntimeTab(next: RuntimeId, focusTab: boolean = false): void {
    if (this.activeRuntime === next) return;
    this.activeRuntime = next;
    this.armedSolutionRuntime = null;

    const washiTab = this.root.querySelector<HTMLButtonElement>("#tab-washi");
    const highspyTab = this.root.querySelector<HTMLButtonElement>("#tab-highspy");
    const washiPanel = this.root.querySelector<HTMLElement>("#panel-washi");
    const highspyPanel = this.root.querySelector<HTMLElement>("#panel-highspy");

    if (washiTab && highspyTab && washiPanel && highspyPanel) {
      washiTab.setAttribute("aria-selected", next === "washi" ? "true" : "false");
      washiTab.tabIndex = next === "washi" ? 0 : -1;
      highspyTab.setAttribute("aria-selected", next === "highspy" ? "true" : "false");
      highspyTab.tabIndex = next === "highspy" ? 0 : -1;

      if (next === "washi") {
        washiPanel.removeAttribute("hidden");
        highspyPanel.setAttribute("hidden", "");
        if (focusTab) washiTab.focus();
      } else {
        highspyPanel.removeAttribute("hidden");
        washiPanel.setAttribute("hidden", "");
        if (focusTab) highspyTab.focus();
      }
    }

    // Restore unmodified Solution button label on tab change
    const solBtns = this.root.querySelectorAll<HTMLButtonElement>('button[data-action="solution"]');
    solBtns.forEach((b) => {
      b.textContent = this.strings.editor.solutionBtn;
      b.classList.remove("ex-btn-warning");
    });
  }

  private async handleClick(e: MouseEvent): Promise<void> {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const dialog = this.root.querySelector<HTMLDialogElement>("#backup-dialog");
    if (dialog && target === dialog && !("closedBy" in HTMLDialogElement.prototype)) {
      const rect = dialog.getBoundingClientRect();
      const inside =
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width;
      if (!inside) {
        dialog.close();
        return;
      }
    }

    const navEl = target.closest<HTMLElement>("[data-nav-id]");
    if (navEl && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      const id = navEl.dataset.navId;
      if (id) {
        e.preventDefault();
        this.navigateToProblem(id);
        return;
      }
    }

    const homeLink = target.closest<HTMLElement>('[data-action="home"]');
    if (homeLink && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      this.navigateToProblem(null);
      return;
    }

    if (target.closest("#theme-toggle-btn")) {
      this.toggleTheme();
      return;
    }

    if (target.closest("#dismiss-tutorial-btn")) {
      this.progress = dismissTutorial(this.progress, true);
      saveProgress(this.progress);
      this.render();
      return;
    }

    if (target.closest("#restore-tutorial-btn")) {
      this.progress = dismissTutorial(this.progress, false);
      saveProgress(this.progress);
      this.render();
      return;
    }

    const tabBtn = target.closest<HTMLButtonElement>('[role="tab"][data-runtime]');
    if (tabBtn) {
      const rt = tabBtn.dataset.runtime as RuntimeId;
      this.switchRuntimeTab(rt);
      return;
    }

    if (target.closest("#backup-open-btn")) {
      this.openBackupDialog();
      return;
    }

    if (target.closest("#backup-close-btn")) {
      this.root.querySelector<HTMLDialogElement>("#backup-dialog")?.close();
      return;
    }

    if (target.closest("#backup-copy-btn")) {
      const box = this.root.querySelector<HTMLTextAreaElement>("#backup-export-text");
      const btn = this.root.querySelector<HTMLButtonElement>("#backup-copy-btn");
      if (box && btn) {
        try {
          await navigator.clipboard.writeText(box.value);
          btn.textContent = this.strings.backup.copied;
          setTimeout(() => {
            btn.textContent = this.strings.backup.copyBtn;
          }, 2000);
        } catch {
          box.select();
        }
      }
      return;
    }

    if (target.closest("#backup-download-btn")) {
      const json = exportProgressJson(this.progress);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "washi-exercises-progress.json";
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    if (target.closest("#backup-import-btn")) {
      const importBox = this.root.querySelector<HTMLTextAreaElement>("#backup-import-text");
      const statusEl = this.root.querySelector<HTMLElement>("#backup-status");
      if (!importBox || !statusEl) return;
      try {
        const parsed = importProgressJson(importBox.value);
        this.progress = parsed;
        saveProgress(this.progress);
        this.render();
        this.openBackupDialog();
        const freshStatusEl = this.root.querySelector<HTMLElement>("#backup-status");
        if (freshStatusEl) {
          freshStatusEl.textContent = this.strings.backup.importSuccess;
          freshStatusEl.style.color = "var(--success)";
        }
      } catch (err) {
        const msgText = err instanceof Error ? err.message : String(err);
        statusEl.textContent = this.strings.backup.importError(msgText);
        statusEl.style.color = "var(--danger)";
      }
      return;
    }

    if (target.closest("#backup-reset-all-btn")) {
      const btn = this.root.querySelector<HTMLButtonElement>("#backup-reset-all-btn");
      if (!btn) return;
      if (!this.armedResetAll) {
        this.armedResetAll = true;
        btn.textContent = this.strings.backup.resetAllConfirm;
        btn.classList.add("ex-btn-warning");
        this.armedResetAllTimer = setTimeout(() => {
          this.armedResetAll = false;
          btn.textContent = this.strings.backup.resetAllBtn;
          btn.classList.remove("ex-btn-warning");
        }, 5000);
        return;
      }
      this.progress = createEmptyProgress();
      saveProgress(this.progress);
      this.clearArmingState();
      this.root.querySelector<HTMLDialogElement>("#backup-dialog")?.close();
      this.render();
      return;
    }

    const actionBtn = target.closest<HTMLButtonElement>("button[data-action][data-runtime]");
    if (!actionBtn || !this.problemId) return;
    const prob = getProblemById(this.problemId);
    if (!prob) return;

    const action = actionBtn.dataset.action;
    const runtime = actionBtn.dataset.runtime as RuntimeId;

    if (action === "run") {
      await this.runProblem(prob, runtime);
    } else if (action === "reset") {
      this.progress = clearDraft(this.progress, prob.meta.id, runtime);
      saveProgress(this.progress);
      const editor = this.root.querySelector<HTMLTextAreaElement>(`#editor-${runtime}`);
      if (editor) {
        editor.value = runtime === "washi" ? prob.washiStarter : prob.highspyStarter;
      }
    } else if (action === "solution") {
      if (this.armedSolutionRuntime !== runtime) {
        this.armedSolutionRuntime = runtime;
        actionBtn.textContent = this.strings.editor.confirmSolution;
        actionBtn.classList.add("ex-btn-warning");
        if (this.armedSolutionTimer !== null) clearTimeout(this.armedSolutionTimer);
        this.armedSolutionTimer = setTimeout(() => {
          this.armedSolutionRuntime = null;
          actionBtn.textContent = this.strings.editor.solutionBtn;
          actionBtn.classList.remove("ex-btn-warning");
        }, 5000);
        return;
      }
      const solCode = runtime === "washi" ? prob.washiSolution : prob.highspySolution;
      this.progress = saveDraft(this.progress, prob.meta.id, runtime, solCode);
      saveProgress(this.progress);
      const editor = this.root.querySelector<HTMLTextAreaElement>(`#editor-${runtime}`);
      if (editor) {
        editor.value = solCode;
      }
      this.clearArmingState();
      actionBtn.textContent = this.strings.editor.solutionBtn;
      actionBtn.classList.remove("ex-btn-warning");
    }
  }

  private handleChange(e: Event): void {
    const target = e.target as HTMLElement | null;
    if (target?.id === "locale-select") {
      const sel = target as HTMLSelectElement;
      this.setLocale(sel.value as Locale);
    }
  }

  private handleInput(e: Event): void {
    const target = e.target as HTMLElement | null;
    if (!(target instanceof HTMLTextAreaElement) || !target.classList.contains("code-editor")) {
      return;
    }
    if (!this.problemId) return;
    const runtime = target.dataset.runtime as RuntimeId;
    this.progress = saveDraft(this.progress, this.problemId, runtime, target.value);
    saveProgress(this.progress);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Roving / keyboard tablist fallback alongside focusgroup
    const tabBtn = target.closest<HTMLButtonElement>('[role="tab"]');
    if (tabBtn) {
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "Home" ||
        e.key === "End"
      ) {
        e.preventDefault();
        const next: RuntimeId =
          e.key === "Home"
            ? "washi"
            : e.key === "End"
              ? "highspy"
              : this.activeRuntime === "washi"
                ? "highspy"
                : "washi";
        this.switchRuntimeTab(next, true);
      }
      return;
    }

    if (target instanceof HTMLTextAreaElement && target.classList.contains("code-editor")) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        const runtime = target.dataset.runtime as RuntimeId;
        const prob = this.problemId ? getProblemById(this.problemId) : undefined;
        if (prob) {
          void this.runProblem(prob, runtime);
        }
        return;
      }

      if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const val = target.value;
        target.value = val.slice(0, start) + "  " + val.slice(end);
        target.selectionStart = target.selectionEnd = start + 2;
        if (this.problemId) {
          const runtime = target.dataset.runtime as RuntimeId;
          this.progress = saveDraft(this.progress, this.problemId, runtime, target.value);
          saveProgress(this.progress);
        }
      }
    }
  }

  private openBackupDialog(): void {
    const dialog = this.root.querySelector<HTMLDialogElement>("#backup-dialog");
    const exportBox = this.root.querySelector<HTMLTextAreaElement>("#backup-export-text");
    const importBox = this.root.querySelector<HTMLTextAreaElement>("#backup-import-text");
    const statusEl = this.root.querySelector<HTMLElement>("#backup-status");
    if (!dialog || !exportBox) return;

    exportBox.value = exportProgressJson(this.progress);
    if (importBox) importBox.value = "";
    if (statusEl) statusEl.textContent = "";
    dialog.showModal();
  }

  private async runProblem(prob: ProblemDefinition, runtime: RuntimeId): Promise<void> {
    const originGeneration = this.viewGeneration;
    if (this.runningGeneration === originGeneration) return;
    this.runningGeneration = originGeneration;

    const editor = this.root.querySelector<HTMLTextAreaElement>(`#editor-${runtime}`);
    const initialRunBtn = this.root.querySelector<HTMLButtonElement>(
      `button[data-action="run"][data-runtime="${runtime}"]`
    );
    const code = editor ? editor.value : this.getDraftCode(prob, runtime);

    if (initialRunBtn) {
      initialRunBtn.disabled = true;
      initialRunBtn.textContent = this.strings.editor.runningBtn;
    }

    const isCurrentWorkspace = () =>
      this.viewGeneration === originGeneration && this.problemId === prob.meta.id;

    const setStatusLabel = (label: string) => {
      if (!isCurrentWorkspace()) return;
      const liveBtn = this.root.querySelector<HTMLButtonElement>(
        `button[data-action="run"][data-runtime="${runtime}"]`
      );
      if (liveBtn) liveBtn.textContent = label;
      const liveResults = this.root.querySelector<HTMLElement>("#judge-results");
      if (liveResults) {
        liveResults.innerHTML = `<div class="results-head"><h2 class="results-title">${escapeHtml(
          this.strings.results.title
        )}</h2></div><p class="results-placeholder">${escapeHtml(label)}</p>`;
      }
    };

    try {
      const inputs = prob.cases.map((c) => structuredClone(c.input));

      if (runtime === "washi") {
        const runRes = await runWashiExerciseCode(code, inputs);
        this.applyRunResult(
          prob,
          runtime,
          runRes.ok,
          runRes.outputs,
          runRes.logs,
          runRes.runTimeMs,
          originGeneration,
          {
            error: runRes.error,
            lpPreview: runRes.lpPreview,
            metrics: runRes.metrics,
          }
        );
      } else {
        const phaseToLabel = (phase: PyodideRunPhase): string => {
          if (phase === "loading-pyodide") return this.strings.editor.loadingPyodide;
          if (phase === "loading-highspy") return this.strings.editor.loadingHighspy;
          return this.strings.editor.runningPython;
        };
        setStatusLabel(this.strings.editor.loadingPyodide);
        const runRes = await runHighspyExerciseCode(code, inputs, {
          onPhase: (phase) => setStatusLabel(phaseToLabel(phase)),
        });
        this.applyRunResult(
          prob,
          runtime,
          runRes.ok,
          runRes.outputs,
          runRes.logs,
          runRes.runTimeMs,
          originGeneration,
          {
            error: runRes.error,
          }
        );
      }
    } finally {
      if (this.runningGeneration === originGeneration) {
        this.runningGeneration = null;
      }
      if (isCurrentWorkspace()) {
        const freshBtn = this.root.querySelector<HTMLButtonElement>(
          `button[data-action="run"][data-runtime="${runtime}"]`
        );
        if (freshBtn) {
          freshBtn.disabled = false;
          freshBtn.textContent = this.strings.editor.runBtn;
        }
      }
    }
  }

  private applyRunResult(
    prob: ProblemDefinition,
    runtime: RuntimeId,
    ok: boolean,
    outputs: unknown[],
    logs: string[],
    runTimeMs: number,
    originGeneration: number,
    extra: {
      error?: string;
      lpPreview?: string | null;
      metrics?: Array<{ varCount: number; constraintCount: number; solveTimeMs: number | null }>;
    }
  ): void {
    const idx = PROBLEMS.findIndex((p) => p.meta.id === prob.meta.id);
    const nextProb = idx >= 0 && idx + 1 < PROBLEMS.length ? PROBLEMS[idx + 1] : null;
    const isStillCurrent =
      this.viewGeneration === originGeneration && this.problemId === prob.meta.id;

    let report: RenderedRunReport;

    if (!ok) {
      const errText = extra.error || "Unknown execution error";
      const looksInfeasible = /\b(?:Infeasible|INFEASIBLE|Unsat|UNSAT)\b/i.test(errText);
      report = {
        overallStatus: looksInfeasible ? "INFEASIBLE" : "RUNTIME_ERROR",
        cases: [],
        error: errText,
        logs,
        lpPreview: extra.lpPreview ?? null,
        runTimeMs,
        nextProblemId: nextProb?.meta.id ?? null,
      };
    } else {
      const caseReports: RenderedRunReport["cases"] = [];
      let allAc = true;
      let firstFailureStatus: VerdictStatus = "VIOLATION";
      let hasViolation = false;
      let hasSuboptimal = false;

      for (let i = 0; i < prob.cases.length; i++) {
        const c = prob.cases[i];
        const verdict: JudgeResult = prob.judge(c.input, outputs[i], c.expectedOptimal, this.locale);
        if (!verdict.ok) {
          allAc = false;
          if (verdict.status === "VIOLATION" || verdict.status === "INFEASIBLE") {
            hasViolation = true;
          } else if (verdict.status === "SUBOPTIMAL") {
            hasSuboptimal = true;
          }
        }
        const mInfo = extra.metrics?.[i];
        caseReports.push({
          name: c.name[this.locale],
          verdict,
          ...(mInfo
            ? {
                varCount: mInfo.varCount,
                constraintCount: mInfo.constraintCount,
                solveTimeMs: mInfo.solveTimeMs,
              }
            : {}),
        });
      }

      if (hasViolation) {
        firstFailureStatus = "VIOLATION";
      } else if (hasSuboptimal) {
        firstFailureStatus = "SUBOPTIMAL";
      }

      const overallStatus: VerdictStatus = allAc ? "AC" : firstFailureStatus;

      if (allAc) {
        this.progress = recordSolvedProblem(this.progress, prob.meta.id, runtime, runTimeMs);
        saveProgress(this.progress);
        if (isStillCurrent) {
          this.refreshWorkspaceStars(prob.meta.id);
        }
      }

      report = {
        overallStatus,
        cases: caseReports,
        logs,
        lpPreview: extra.lpPreview ?? null,
        runTimeMs,
        nextProblemId: nextProb?.meta.id ?? null,
      };
    }

    if (!isStillCurrent) {
      return;
    }

    this.lastReport = report;
    const resultsEl = this.root.querySelector<HTMLElement>("#judge-results");
    if (resultsEl) {
      resultsEl.innerHTML = renderResultsHtml(this.locale, this.strings, report);
    }
  }

  private refreshWorkspaceStars(problemId: string): void {
    const solvedRuntimes = this.progress.solved[problemId]?.runtimes ?? [];
    const washiSolved = solvedRuntimes.includes("washi");
    const highspySolved = solvedRuntimes.includes("highspy");

    const starSummary = this.root.querySelector("#ws-star-summary .star-display");
    if (starSummary) {
      starSummary.textContent = `WaSHI ${washiSolved ? "★" : "☆"} · highspy ${highspySolved ? "★" : "☆"}`;
    }
    const washiStar = this.root.querySelector("#tab-washi .runtime-tab-star");
    if (washiStar) washiStar.textContent = washiSolved ? "★" : "";
    const highspyStar = this.root.querySelector("#tab-highspy .runtime-tab-star");
    if (highspyStar) highspyStar.textContent = highspySolved ? "★" : "";
  }

  private render(): void {
    const effective = getEffectiveTheme();
    const themeLabel =
      effective === "dark" ? this.strings.theme.switchToLight : this.strings.theme.switchToDark;
    const themeIcon = effective === "dark" ? "☀️" : "🌙";

    document.documentElement.lang = this.locale;

    const headerHtml = renderHeaderHtml(this.locale, this.strings, themeLabel, themeIcon);
    let bodyHtml = "";

    if (this.problemId) {
      const idx = PROBLEMS.findIndex((p) => p.meta.id === this.problemId);
      const prob = idx >= 0 ? PROBLEMS[idx] : PROBLEMS[0];
      const prevProb = idx > 0 ? PROBLEMS[idx - 1] : null;
      const nextProb = idx >= 0 && idx + 1 < PROBLEMS.length ? PROBLEMS[idx + 1] : null;

      document.title = `${prob.meta.title[this.locale]} — ${this.strings.brandTitle}`;
      bodyHtml = renderWorkspaceHtml({
        locale: this.locale,
        strings: this.strings,
        problem: prob,
        prevProblem: prevProb,
        nextProblem: nextProb,
        progress: this.progress,
        activeRuntime: this.activeRuntime,
        washiCode: this.getDraftCode(prob, "washi"),
        highspyCode: this.getDraftCode(prob, "highspy"),
      });
    } else {
      document.title = `${this.strings.brandTitle} | WaSHI`;
      bodyHtml = renderQuestMapHtml({
        locale: this.locale,
        strings: this.strings,
        chapters: CHAPTERS,
        problems: PROBLEMS,
        progress: this.progress,
      });
    }

    this.root.innerHTML = `${headerHtml}${bodyHtml}${renderBackupDialogHtml(this.strings)}`;

    if (this.problemId && this.lastReport) {
      const resultsEl = this.root.querySelector<HTMLElement>("#judge-results");
      if (resultsEl) {
        resultsEl.innerHTML = renderResultsHtml(this.locale, this.strings, this.lastReport);
      }
    }
  }
}

const mount = document.getElementById("app");
if (mount) {
  new ExercisesApp(mount);
}
