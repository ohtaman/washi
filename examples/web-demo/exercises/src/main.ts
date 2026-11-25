import "katex/dist/katex.min.css";
import "./style.css";

import { toAnalyticsRuntime, trackExerciseEvent } from "./analytics.js";
import { loadGuideMarkdown } from "./guide/index.js";
import { UI_STRINGS } from "./i18n/ui-strings.js";
import { applySolverStatusToVerdict } from "./problems/judge-helpers.js";
import { CHAPTERS, PROBLEMS, getProblemById } from "./problems/registry.js";
import { runHighspyExerciseCode, type PyodideRunPhase } from "./runner/pyodide-runner.js";
import { runWashiExerciseCode } from "./runner/washi-runner.js";
import {
  clearAllSolved,
  clearDraft,
  clearSolvedProblem,
  countMainSolved,
  isProblemSolved,
  loadProgress,
  recordSolvedProblem,
  saveDraft,
  saveProgress,
  type ProgressState,
} from "./store/progress.js";
import type { JudgeResult, Locale, ProblemDefinition, RuntimeId, VerdictStatus } from "./types.js";
import { highlightCode, renderLineNumbers } from "./ui/code-editor.js";
import {
  escapeHtml,
  renderExerciseIndexHtml,
  renderGuidePageHtml,
  renderHeaderHtml,
  renderResultsHtml,
  renderWorkspaceHtml,
  renderWorkspaceSolvedControlHtml,
  type RenderedRunReport,
} from "./ui/components.js";
import { renderSafeMarkdown } from "./ui/markdown.js";

const LOCALE_STORAGE_KEY = "washi_exercises_locale";
const SHARED_LOCALE_STORAGE_KEY = "washi_locale";
const THEME_STORAGE_KEY = "vitepress-theme-appearance";
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
    const saved =
      normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY)) ??
      normalizeLocale(window.localStorage.getItem(SHARED_LOCALE_STORAGE_KEY));
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

interface RouteState {
  viewMode: "index" | "guide" | "workspace";
  problemId: string | null;
  problemTab: "problem" | "editorial";
}

function parseRouteState(): RouteState {
  if (typeof window === "undefined") {
    return { viewMode: "index", problemId: null, problemTab: "problem" };
  }
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (id && getProblemById(id)) {
    return {
      viewMode: "workspace",
      problemId: id,
      problemTab: params.get("tab") === "editorial" ? "editorial" : "problem",
    };
  }
  if (params.get("view") === "guide") {
    return { viewMode: "guide", problemId: null, problemTab: "problem" };
  }
  return { viewMode: "index", problemId: null, problemTab: "problem" };
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
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    meta.setAttribute("content", stored === "light" || stored === "dark" ? stored : "light dark");
  } catch {
    meta.setAttribute("content", "light dark");
  }
}

export interface ExercisesAppDeps {
  runWashi?: typeof runWashiExerciseCode;
  runPulp?: typeof runHighspyExerciseCode;
}

export class ExercisesApp {
  private root: HTMLElement;
  private runWashi: typeof runWashiExerciseCode;
  private runPulp: typeof runHighspyExerciseCode;
  private locale: Locale;
  private progress: ProgressState;
  private viewMode: "index" | "guide" | "workspace";
  private problemId: string | null;
  private problemTab: "problem" | "editorial" = "problem";
  private renderedProblemId: string | null = null;
  private trackedViewProblemId: string | null = null;
  private viewedRuntimesInVisit = new Set<RuntimeId>();
  private editedRuntimesInVisit = new Set<RuntimeId>();
  private activeRuntime: RuntimeId = "washi";
  private viewGeneration = 0;
  private renderSeq = 0;
  private activeRenderPromise: Promise<void> = Promise.resolve();
  private activeActionPromise: Promise<void> = Promise.resolve();
  private markdownCache = new Map<string, string>();
  private editorialCache = new Map<string, string>();
  private guideCache = new Map<Locale, string>();
  private pendingHash: string | null = null;
  private runningGeneration: number | null = null;
  private armedSolutionRuntime: RuntimeId | null = null;
  private armedSolutionTimer: ReturnType<typeof setTimeout> | null = null;
  private armedClearAllSolved = false;
  private armedClearAllTimer: ReturnType<typeof setTimeout> | null = null;
  private lastReport: RenderedRunReport | null = null;

  constructor(root: HTMLElement, deps: ExercisesAppDeps = {}) {
    this.root = root;
    this.runWashi = deps.runWashi ?? runWashiExerciseCode;
    this.runPulp = deps.runPulp ?? runHighspyExerciseCode;
    this.locale = detectInitialLocale();
    this.progress = loadProgress();
    const route = parseRouteState();
    this.viewMode = route.viewMode;
    this.problemId = route.problemId;
    this.problemTab = route.problemTab;
    if (typeof window !== "undefined" && window.location.hash) {
      this.pendingHash = window.location.hash;
    }

    this.attachGlobalEvents();
    void this.render();
  }

  public async whenIdle(): Promise<void> {
    let prevRender: Promise<void>;
    let prevAction: Promise<void>;
    do {
      prevRender = this.activeRenderPromise;
      prevAction = this.activeActionPromise;
      await Promise.all([prevRender, prevAction]);
    } while (prevRender !== this.activeRenderPromise || prevAction !== this.activeActionPromise);
  }

  private get strings() {
    return UI_STRINGS[this.locale];
  }

  private pushUrl(replace: boolean = false, hash: string = ""): void {
    const url = new URL(window.location.href);
    url.searchParams.set("lang", this.locale);
    if (this.viewMode === "workspace" && this.problemId) {
      url.searchParams.set("id", this.problemId);
      url.searchParams.delete("view");
      if (this.problemTab === "editorial") {
        url.searchParams.set("tab", "editorial");
      } else {
        url.searchParams.delete("tab");
      }
    } else if (this.viewMode === "guide") {
      url.searchParams.set("view", "guide");
      url.searchParams.delete("id");
      url.searchParams.delete("tab");
    } else {
      url.searchParams.delete("id");
      url.searchParams.delete("view");
      url.searchParams.delete("tab");
    }
    url.hash = hash;
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
      const route = parseRouteState();
      this.viewMode = route.viewMode;
      this.problemId = route.problemId;
      this.problemTab = route.problemTab;
      this.pendingHash = window.location.hash || null;
      this.clearArmingState();
      this.lastReport = null;
      void this.render();
    });

    window.addEventListener("storage", (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) {
        syncThemeMetaFromStorage();
        this.updateThemeToggleUi();
      } else if (e.key === LOCALE_STORAGE_KEY || e.key === SHARED_LOCALE_STORAGE_KEY) {
        const synced = normalizeLocale(e.newValue);
        if (synced && synced !== this.locale) {
          this.locale = synced;
          this.pushUrl(true, window.location.hash);
          void this.render();
        }
      } else if (e.key === "washi_exercises_progress_v1") {
        this.progress = loadProgress();
        void this.render();
      }
    });

    if (typeof window.matchMedia === "function") {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        this.updateThemeToggleUi();
      });
    }

    this.root.addEventListener("click", (e) => {
      this.activeActionPromise = this.handleClick(e);
    });
    this.root.addEventListener("input", (e) => this.handleInput(e));
    this.root.addEventListener("keydown", (e) => this.handleKeyDown(e));
    // Scroll events do not bubble, so capture scroll events from any textarea.code-editor
    this.root.addEventListener(
      "scroll",
      (e) => {
        const target = e.target;
        if (target instanceof HTMLTextAreaElement && target.classList.contains("code-editor")) {
          const runtime = target.dataset.runtime as RuntimeId | undefined;
          if (runtime) {
            this.syncEditorScroll(runtime);
          }
        }
      },
      true
    );
  }

  private clearArmingState(): void {
    this.armedSolutionRuntime = null;
    if (this.armedSolutionTimer !== null) {
      clearTimeout(this.armedSolutionTimer);
      this.armedSolutionTimer = null;
    }
    this.armedClearAllSolved = false;
    if (this.armedClearAllTimer !== null) {
      clearTimeout(this.armedClearAllTimer);
      this.armedClearAllTimer = null;
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
        window.localStorage.removeItem(THEME_STORAGE_KEY);
        meta?.setAttribute("content", "light dark");
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
        meta?.setAttribute("content", next);
      }
    } catch {
      meta?.setAttribute("content", next);
    }

    this.updateThemeToggleUi();
  }

  private navigateToProblem(id: string | null): void {
    this.viewGeneration++;
    const resolved = id && getProblemById(id) ? id : null;
    this.problemId = resolved;
    this.viewMode = resolved ? "workspace" : "index";
    this.problemTab = "problem";
    this.trackedViewProblemId = null;
    this.pendingHash = null;
    this.clearArmingState();
    this.lastReport = null;
    this.pushUrl();
    void this.render();
    window.scrollTo({ top: 0 });
  }

  private navigateToGuide(hash: string = ""): void {
    this.viewGeneration++;
    this.viewMode = "guide";
    this.problemId = null;
    this.problemTab = "problem";
    this.pendingHash = hash || null;
    this.clearArmingState();
    this.lastReport = null;
    this.pushUrl(false, hash);
    void this.render();
    if (!hash) {
      window.scrollTo({ top: 0 });
    }
  }

  private setLocale(next: Locale): void {
    if (!VALID_LOCALES.includes(next)) return;
    this.locale = next;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      window.localStorage.setItem(SHARED_LOCALE_STORAGE_KEY, next);
    } catch {
      // Ignore storage failures
    }
    this.pendingHash = window.location.hash || null;
    this.pushUrl(true, window.location.hash);
    void this.render();
  }

  private getDraftCode(prob: ProblemDefinition, runtime: RuntimeId): string {
    const draft = this.progress.drafts[prob.meta.id]?.[runtime];
    if (draft !== undefined) return draft;
    return runtime === "washi" ? prob.washiStarter : prob.pulpStarter;
  }

  private syncEditorOverlay(runtime: RuntimeId): void {
    const editor = this.root.querySelector<HTMLTextAreaElement>(`#editor-${runtime}`);
    const highlightPre = this.root.querySelector<HTMLPreElement>(`#highlight-${runtime}`);
    const gutterPre = this.root.querySelector<HTMLPreElement>(`#gutter-${runtime}`);
    if (!editor || !highlightPre || !gutterPre) return;

    const code = editor.value;
    const lang = runtime === "washi" ? "ts" : "py";
    const codeEl = highlightPre.querySelector("code");
    if (codeEl) {
      codeEl.innerHTML = highlightCode(code, lang);
    }
    gutterPre.textContent = renderLineNumbers(code);
    this.syncEditorScroll(runtime);
  }

  private syncEditorScroll(runtime: RuntimeId): void {
    const editor = this.root.querySelector<HTMLTextAreaElement>(`#editor-${runtime}`);
    const highlightPre = this.root.querySelector<HTMLPreElement>(`#highlight-${runtime}`);
    const gutterPre = this.root.querySelector<HTMLPreElement>(`#gutter-${runtime}`);
    if (!editor) return;
    if (highlightPre) {
      highlightPre.scrollTop = editor.scrollTop;
      highlightPre.scrollLeft = editor.scrollLeft;
    }
    if (gutterPre) {
      gutterPre.scrollTop = editor.scrollTop;
    }
  }

  private recordRuntimeView(problemId: string, runtime: RuntimeId, locale: Locale): void {
    if (this.viewedRuntimesInVisit.has(runtime)) return;
    this.viewedRuntimesInVisit.add(runtime);
    trackExerciseEvent("exercise_runtime_view", {
      problem_id: problemId,
      exercise_runtime: toAnalyticsRuntime(runtime),
      locale,
    });
  }

  private recordCodeEdit(problemId: string, runtime: RuntimeId, locale: Locale): void {
    if (this.editedRuntimesInVisit.has(runtime)) return;
    this.editedRuntimesInVisit.add(runtime);
    trackExerciseEvent("exercise_code_edit", {
      problem_id: problemId,
      exercise_runtime: toAnalyticsRuntime(runtime),
      locale,
    });
  }

  private switchRuntimeTab(next: RuntimeId, focusTab: boolean = false): void {
    const prob = this.getInteractiveProblem();
    if (!prob || !prob.meta.runtimes.includes(next)) return;
    if (this.activeRuntime === next) return;
    this.activeRuntime = next;
    this.armedSolutionRuntime = null;

    const washiTab = this.root.querySelector<HTMLButtonElement>("#tab-washi");
    const pulpTab = this.root.querySelector<HTMLButtonElement>("#tab-pulp");
    const washiPanel = this.root.querySelector<HTMLElement>("#panel-washi");
    const pulpPanel = this.root.querySelector<HTMLElement>("#panel-pulp");

    if (washiTab && pulpTab && washiPanel && pulpPanel) {
      washiTab.setAttribute("aria-selected", next === "washi" ? "true" : "false");
      washiTab.tabIndex = next === "washi" ? 0 : -1;
      pulpTab.setAttribute("aria-selected", next === "pulp" ? "true" : "false");
      pulpTab.tabIndex = next === "pulp" ? 0 : -1;

      if (next === "washi") {
        washiPanel.removeAttribute("hidden");
        pulpPanel.setAttribute("hidden", "");
        if (focusTab) washiTab.focus();
      } else {
        pulpPanel.removeAttribute("hidden");
        washiPanel.setAttribute("hidden", "");
        if (focusTab) pulpTab.focus();
      }
      this.syncEditorScroll(next);
    }

    const solBtns = this.root.querySelectorAll<HTMLButtonElement>('button[data-action="solution"]');
    solBtns.forEach((b) => {
      b.textContent = this.strings.editor.solutionBtn;
      b.classList.remove("ex-btn-warning");
    });

    trackExerciseEvent("exercise_tab_switch", {
      problem_id: prob.meta.id,
      tab: toAnalyticsRuntime(next),
      locale: this.locale,
    });
    this.recordRuntimeView(prob.meta.id, next, this.locale);
  }

  private async switchStatementTab(
    next: "problem" | "editorial",
    focusTab: boolean = false
  ): Promise<void> {
    const activeProb = this.getInteractiveProblem();
    if (!activeProb) return;
    const changed = this.problemTab !== next;
    if (!changed && !focusTab) return;
    this.problemTab = next;

    const probTabBtn = this.root.querySelector<HTMLButtonElement>("#stmt-tab-problem");
    const editTabBtn = this.root.querySelector<HTMLButtonElement>("#stmt-tab-editorial");
    const probPanel = this.root.querySelector<HTMLElement>("#stmt-panel-problem");
    const editPanel = this.root.querySelector<HTMLElement>("#stmt-panel-editorial");

    if (probTabBtn && editTabBtn && probPanel && editPanel) {
      probTabBtn.setAttribute("aria-selected", next === "problem" ? "true" : "false");
      probTabBtn.tabIndex = next === "problem" ? 0 : -1;
      editTabBtn.setAttribute("aria-selected", next === "editorial" ? "true" : "false");
      editTabBtn.tabIndex = next === "editorial" ? 0 : -1;

      if (next === "problem") {
        probPanel.removeAttribute("hidden");
        editPanel.setAttribute("hidden", "");
        if (focusTab) probTabBtn.focus();
      } else {
        editPanel.removeAttribute("hidden");
        probPanel.setAttribute("hidden", "");
        if (focusTab) editTabBtn.focus();
      }
    }

    this.pushUrl(true);

    if (changed) {
      trackExerciseEvent("exercise_tab_switch", {
        problem_id: activeProb.meta.id,
        tab: next,
        locale: this.locale,
      });
    }

    if (next === "editorial") {
      const prob = this.getInteractiveProblem();
      if (prob?.loadEditorial) {
        const locale = this.locale;
        const originGen = this.viewGeneration;
        const edKey = `${prob.meta.id}:${locale}`;
        let md = this.editorialCache.get(edKey);
        if (md === undefined) {
          try {
            md = await prob.loadEditorial(locale);
            if (originGen !== this.viewGeneration || this.locale !== locale) return;
            this.editorialCache.set(edKey, md);
          } catch (err) {
            if (originGen !== this.viewGeneration || this.locale !== locale) return;
            const msg = err instanceof Error ? err.message : String(err);
            md = `Failed to load editorial (${msg}).`;
          }
        }
        const edContainer = this.root.querySelector<HTMLElement>("#editorial-content");
        if (edContainer && this.renderedProblemId === prob.meta.id) {
          edContainer.innerHTML = renderSafeMarkdown(md);
        }
      }
    }
  }

  private getInteractiveProblem(): ProblemDefinition | null {
    if (!this.renderedProblemId || this.renderedProblemId !== this.problemId) {
      return null;
    }
    if (this.root.querySelector(".ws-split[inert]")) {
      return null;
    }
    return getProblemById(this.renderedProblemId) ?? null;
  }

  private async handleClick(e: MouseEvent): Promise<void> {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const langBtn = target.closest<HTMLButtonElement>("[data-lang-btn]");
    if (langBtn) {
      const nextLocale = langBtn.dataset.langBtn as Locale | undefined;
      if (nextLocale) {
        this.setLocale(nextLocale);
      }
      return;
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

    const guideAnchor = target.closest<HTMLAnchorElement>(
      '[data-action="guide"], a[href^="?view=guide"]'
    );
    if (guideAnchor && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const href = guideAnchor.getAttribute("href") ?? "?view=guide";
      const parsed = new URL(href, window.location.href);
      this.navigateToGuide(parsed.hash);
      return;
    }

    if (target.closest("#toc-drawer-toggle")) {
      const shell = this.root.querySelector<HTMLElement>(".book-shell.is-workspace");
      this.setTocDrawerOpen(!shell?.classList.contains("is-toc-open"));
      return;
    }

    if (target.closest('[data-action="close-toc"]')) {
      this.setTocDrawerOpen(false);
      return;
    }

    if (target.closest("#theme-toggle-btn")) {
      this.toggleTheme();
      return;
    }

    if (target.closest("#jump-to-editor-btn")) {
      const workbench = this.root.querySelector<HTMLElement>("#answer-workbench");
      const editor = this.root.querySelector<HTMLTextAreaElement>(`#editor-${this.activeRuntime}`);
      workbench?.scrollIntoView({ behavior: "smooth", block: "start" });
      editor?.focus({ preventScroll: true });
      return;
    }

    const stmtTabBtn = target.closest<HTMLButtonElement>('[role="tab"][data-stmt-tab]');
    if (stmtTabBtn) {
      const nextTab = stmtTabBtn.dataset.stmtTab as "problem" | "editorial";
      await this.switchStatementTab(nextTab);
      return;
    }

    const tabBtn = target.closest<HTMLButtonElement>('[role="tab"][data-runtime]');
    if (tabBtn) {
      const rt = tabBtn.dataset.runtime as RuntimeId;
      this.switchRuntimeTab(rt);
      return;
    }

    const clearAllBtn = target.closest<HTMLButtonElement>('[data-action="clear-all-solved"]');
    if (clearAllBtn) {
      const clearBtns = this.root.querySelectorAll<HTMLButtonElement>(
        '[data-action="clear-all-solved"]'
      );
      if (!this.armedClearAllSolved) {
        this.armedClearAllSolved = true;
        clearBtns.forEach((b) => {
          b.textContent = this.strings.confirmClearSolved;
          b.classList.add("ex-btn-warning");
        });
        if (this.armedClearAllTimer !== null) clearTimeout(this.armedClearAllTimer);
        this.armedClearAllTimer = setTimeout(() => {
          this.armedClearAllSolved = false;
          this.root
            .querySelectorAll<HTMLButtonElement>('[data-action="clear-all-solved"]')
            .forEach((b) => {
              b.textContent = this.strings.clearSolvedBtn;
              b.classList.remove("ex-btn-warning");
            });
        }, 5000);
        return;
      }
      this.progress = clearAllSolved(this.progress);
      saveProgress(this.progress);
      this.clearArmingState();
      void this.render();
      return;
    }

    const clearProbBtn = target.closest<HTMLButtonElement>('[data-action="clear-problem-solved"]');
    if (clearProbBtn) {
      const prob = this.getInteractiveProblem();
      if (!prob) return;
      this.progress = clearSolvedProblem(this.progress, prob.meta.id);
      saveProgress(this.progress);
      this.refreshWorkspaceRuntimeStatus(prob.meta.id);
      return;
    }

    const actionBtn = target.closest<HTMLButtonElement>("button[data-action][data-runtime]");
    if (!actionBtn) return;
    const prob = this.getInteractiveProblem();
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
        editor.value = runtime === "washi" ? prob.washiStarter : prob.pulpStarter;
        this.syncEditorOverlay(runtime);
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
      const solCode = runtime === "washi" ? prob.washiSolution : prob.pulpSolution;
      this.progress = saveDraft(this.progress, prob.meta.id, runtime, solCode);
      saveProgress(this.progress);
      const editor = this.root.querySelector<HTMLTextAreaElement>(`#editor-${runtime}`);
      if (editor) {
        editor.value = solCode;
        this.syncEditorOverlay(runtime);
      }
      this.clearArmingState();
      actionBtn.textContent = this.strings.editor.solutionBtn;
      actionBtn.classList.remove("ex-btn-warning");
      trackExerciseEvent("exercise_solution_reveal", {
        problem_id: prob.meta.id,
        exercise_runtime: toAnalyticsRuntime(runtime),
        locale: this.locale,
      });
    }
  }

  private handleInput(e: Event): void {
    const target = e.target as HTMLElement | null;
    if (!(target instanceof HTMLTextAreaElement) || !target.classList.contains("code-editor")) {
      return;
    }
    const prob = this.getInteractiveProblem();
    if (!prob) return;
    const runtime = target.dataset.runtime as RuntimeId;
    this.syncEditorOverlay(runtime);
    this.progress = saveDraft(this.progress, prob.meta.id, runtime, target.value);
    saveProgress(this.progress);
    this.recordCodeEdit(prob.meta.id, runtime, this.locale);
  }

  private setTocDrawerOpen(open: boolean): void {
    const shell = this.root.querySelector<HTMLElement>(".book-shell.is-workspace");
    const toggleBtn = this.root.querySelector<HTMLButtonElement>("#toc-drawer-toggle");
    const sidebar = shell?.querySelector<HTMLElement>(".book-sidebar");
    if (!shell) return;
    if (
      !open &&
      sidebar &&
      document.activeElement instanceof Node &&
      sidebar.contains(document.activeElement)
    ) {
      toggleBtn?.focus();
    }
    shell.classList.toggle("is-toc-open", open);
    toggleBtn?.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      sidebar?.removeAttribute("inert");
    } else {
      sidebar?.setAttribute("inert", "");
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      const shell = this.root.querySelector<HTMLElement>(".book-shell.is-workspace.is-toc-open");
      if (shell) {
        this.setTocDrawerOpen(false);
        this.root.querySelector<HTMLButtonElement>("#toc-drawer-toggle")?.focus();
        return;
      }
    }

    const target = e.target as HTMLElement | null;
    if (!target) return;

    const stmtTabBtn = target.closest<HTMLButtonElement>('[role="tab"][data-stmt-tab]');
    if (stmtTabBtn) {
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "Home" ||
        e.key === "End"
      ) {
        e.preventDefault();
        const next: "problem" | "editorial" =
          e.key === "Home"
            ? "problem"
            : e.key === "End"
              ? "editorial"
              : this.problemTab === "problem"
                ? "editorial"
                : "problem";
        this.activeActionPromise = this.switchStatementTab(next, true);
      }
      return;
    }

    const tabBtn = target.closest<HTMLButtonElement>('[role="tab"][data-runtime]');
    if (tabBtn) {
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "Home" ||
        e.key === "End"
      ) {
        e.preventDefault();
        const prob = this.getInteractiveProblem();
        if (!prob || prob.meta.runtimes.length < 2) return;
        const next: RuntimeId =
          e.key === "Home"
            ? "washi"
            : e.key === "End"
              ? "pulp"
              : this.activeRuntime === "washi"
                ? "pulp"
                : "washi";
        this.switchRuntimeTab(next, true);
      }
      return;
    }

    if (target instanceof HTMLTextAreaElement && target.classList.contains("code-editor")) {
      const prob = this.getInteractiveProblem();
      if (!prob) return;

      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        const runtime = target.dataset.runtime as RuntimeId;
        this.activeActionPromise = this.runProblem(prob, runtime);
        return;
      }

      if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const val = target.value;
        target.value = val.slice(0, start) + "  " + val.slice(end);
        target.selectionStart = target.selectionEnd = start + 2;
        const runtime = target.dataset.runtime as RuntimeId;
        this.syncEditorOverlay(runtime);
        this.progress = saveDraft(this.progress, prob.meta.id, runtime, target.value);
        saveProgress(this.progress);
        this.recordCodeEdit(prob.meta.id, runtime, this.locale);
      }
    }
  }

  private async runProblem(prob: ProblemDefinition, runtime: RuntimeId): Promise<void> {
    const originGeneration = this.viewGeneration;
    if (this.runningGeneration === originGeneration) return;
    this.runningGeneration = originGeneration;
    const runLocale = this.locale;

    trackExerciseEvent("exercise_run_start", {
      problem_id: prob.meta.id,
      exercise_runtime: toAnalyticsRuntime(runtime),
      locale: runLocale,
    });

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
        liveResults.scrollTop = 0;
      }
    };

    try {
      const inputs = prob.cases.map((c) => structuredClone(c.input));

      if (runtime === "washi") {
        const runRes = await this.runWashi(code, inputs);
        this.applyRunResult(
          prob,
          runtime,
          runRes.ok,
          runRes.outputs,
          runRes.logs,
          runRes.runTimeMs,
          originGeneration,
          runLocale,
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
        const runRes = await this.runPulp(code, inputs, {
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
          runLocale,
          {
            error: runRes.error,
            metrics: runRes.metrics,
            failedSolverStatus: runRes.failedSolverStatus,
          }
        );
      }
    } catch (err: unknown) {
      this.applyRunResult(prob, runtime, false, [], [], 0, originGeneration, runLocale, {
        error: err instanceof Error ? err.message : String(err),
      });
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
    runLocale: Locale,
    extra: {
      error?: string;
      failedSolverStatus?: string;
      lpPreview?: string | null;
      metrics?: Array<{
        varCount: number;
        constraintCount: number;
        solveTimeMs: number | null;
        solverStatus?: string | null;
      }>;
    }
  ): void {
    const idx = PROBLEMS.findIndex((p) => p.meta.id === prob.meta.id);
    const nextProb = idx >= 0 && idx + 1 < PROBLEMS.length ? PROBLEMS[idx + 1] : null;
    const isStillCurrent =
      this.viewGeneration === originGeneration && this.problemId === prob.meta.id;

    let report: RenderedRunReport;

    if (!ok) {
      const errText = extra.error || "Unknown execution error";
      const mapped = extra.failedSolverStatus
        ? applySolverStatusToVerdict(
            { status: "RUNTIME_ERROR", ok: false, message: errText },
            extra.failedSolverStatus,
            this.strings.results.solverStatus
          )
        : null;
      const looksInfeasible =
        mapped?.status === "INFEASIBLE" ||
        /\b(?:Infeasible|INFEASIBLE|Unsat|UNSAT)\b/i.test(errText);
      report = {
        overallStatus: looksInfeasible ? "INFEASIBLE" : "RUNTIME_ERROR",
        cases: [],
        error: mapped ? mapped.message : errText,
        logs,
        lpPreview: extra.lpPreview ?? null,
        runTimeMs,
        nextProblemId: nextProb?.meta.id ?? null,
      };
    } else {
      const caseReports: RenderedRunReport["cases"] = [];
      let allAc = true;
      let hasRuntimeError = false;
      let hasInfeasible = false;
      let hasViolation = false;
      let hasSuboptimal = false;

      for (let i = 0; i < prob.cases.length; i++) {
        const c = prob.cases[i];
        const mInfo = extra.metrics?.[i];
        const baseVerdict: JudgeResult = prob.judge(
          c.input,
          outputs[i],
          c.expectedOptimal,
          this.locale
        );
        const verdict = applySolverStatusToVerdict(
          baseVerdict,
          mInfo?.solverStatus,
          this.strings.results.solverStatus
        );

        if (!verdict.ok) {
          allAc = false;
          if (verdict.status === "RUNTIME_ERROR") {
            hasRuntimeError = true;
          } else if (verdict.status === "INFEASIBLE") {
            hasInfeasible = true;
          } else if (verdict.status === "VIOLATION") {
            hasViolation = true;
          } else if (verdict.status === "SUBOPTIMAL") {
            hasSuboptimal = true;
          }
        }

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

      const overallStatus: VerdictStatus = allAc
        ? "AC"
        : hasRuntimeError
          ? "RUNTIME_ERROR"
          : hasInfeasible
            ? "INFEASIBLE"
            : hasViolation
              ? "VIOLATION"
              : hasSuboptimal
                ? "SUBOPTIMAL"
                : "VIOLATION";

      if (allAc) {
        this.progress = recordSolvedProblem(this.progress, prob.meta.id, runtime, runTimeMs);
        saveProgress(this.progress);
        if (isStillCurrent) {
          this.refreshWorkspaceRuntimeStatus(prob.meta.id);
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

    trackExerciseEvent("exercise_run", {
      problem_id: prob.meta.id,
      exercise_runtime: toAnalyticsRuntime(runtime),
      verdict: report.overallStatus,
      locale: runLocale,
    });
    if (report.overallStatus === "AC") {
      trackExerciseEvent("exercise_solve", {
        problem_id: prob.meta.id,
        exercise_runtime: toAnalyticsRuntime(runtime),
        locale: runLocale,
      });
    }

    this.lastReport = report;
    const resultsEl = this.root.querySelector<HTMLElement>("#judge-results");
    if (resultsEl) {
      resultsEl.innerHTML = renderResultsHtml(this.locale, this.strings, report);
      resultsEl.scrollTop = 0;
    }
  }

  private refreshWorkspaceRuntimeStatus(problemId: string): void {
    const solvedRuntimes = this.progress.solved[problemId]?.runtimes ?? [];
    const washiSolved = solvedRuntimes.includes("washi");
    const pulpSolved = solvedRuntimes.includes("pulp");
    const solvedAny = isProblemSolved(this.progress, problemId);

    const statusContainer = this.root.querySelector("#ws-solve-status");
    if (statusContainer) {
      statusContainer.innerHTML = renderWorkspaceSolvedControlHtml(solvedAny, this.strings);
    }
    const edPanel = this.root.querySelector<HTMLElement>("#stmt-panel-editorial");
    if (edPanel) {
      const existingNotice = edPanel.querySelector(".editorial-notice");
      if (!solvedAny && !existingNotice) {
        const notice = document.createElement("p");
        notice.className = "editorial-notice";
        notice.textContent = this.strings.sections.editorialNotice;
        edPanel.prepend(notice);
      } else if (solvedAny && existingNotice) {
        existingNotice.remove();
      }
    }
    const washiCheck = this.root.querySelector("#tab-washi .runtime-tab-check");
    if (washiCheck) washiCheck.textContent = washiSolved ? "✓" : "";
    const pulpCheck = this.root.querySelector("#tab-pulp .runtime-tab-check");
    if (pulpCheck) pulpCheck.textContent = pulpSolved ? "✓" : "";

    // Also update sidebar solved marker, progress label, and clear-all-solved controls
    const sidebarLinks = this.root.querySelectorAll<HTMLElement>(
      `[data-sidebar-id="${problemId}"]`
    );
    sidebarLinks.forEach((link) => {
      link.classList.toggle("is-solved", solvedAny);
      const check = link.querySelector(".book-sidebar-check");
      if (check) check.textContent = solvedAny ? "✓" : "";
    });

    const hasAnySolved = Object.keys(this.progress.solved).length > 0;
    this.root.querySelectorAll<HTMLElement>(".book-sidebar-progress-row").forEach((row) => {
      const existingBtn = row.querySelector<HTMLButtonElement>('[data-action="clear-all-solved"]');
      if (hasAnySolved && !existingBtn) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "clear-solved-link";
        btn.dataset.action = "clear-all-solved";
        btn.textContent = this.strings.clearSolvedBtn;
        row.appendChild(btn);
      } else if (!hasAnySolved && existingBtn) {
        existingBtn.remove();
      }
    });

    const mainSolved = countMainSolved(
      this.progress,
      PROBLEMS.map((p) => p.meta)
    );
    const label = this.strings.progressLabel(mainSolved, 100);
    const sideProg = this.root.querySelector("#sidebar-progress-text");
    if (sideProg) sideProg.textContent = label;
    const mobProg = this.root.querySelector(".mobile-toc-count");
    if (mobProg) mobProg.textContent = label;
  }

  private render(): Promise<void> {
    const p = this.performRender();
    this.activeRenderPromise = p;
    return p;
  }

  private async performRender(): Promise<void> {
    const seq = ++this.renderSeq;
    const locale = this.locale;
    const problemId = this.problemId;
    const strings = this.strings;
    const effective = getEffectiveTheme();
    const themeLabel =
      effective === "dark" ? strings.theme.switchToLight : strings.theme.switchToDark;
    const themeIcon = effective === "dark" ? "☀️" : "🌙";

    document.documentElement.lang = locale;

    const headerHtml = renderHeaderHtml(locale, strings, themeLabel, themeIcon);
    let bodyHtml = "";

    let nextRenderedProblemId: string | null = null;

    if (this.viewMode === "workspace" && problemId) {
      const idx = PROBLEMS.findIndex((p) => p.meta.id === problemId);
      const prob = idx >= 0 ? PROBLEMS[idx] : PROBLEMS[0];
      nextRenderedProblemId = prob.meta.id;
      const prevProb = idx > 0 ? PROBLEMS[idx - 1] : null;
      const nextProb = idx >= 0 && idx + 1 < PROBLEMS.length ? PROBLEMS[idx + 1] : null;
      const cacheKey = `${prob.meta.id}:${locale}`;
      let problemMarkdown = this.markdownCache.get(cacheKey);
      let editorialMarkdown: string | null = null;
      if (this.problemTab === "editorial" && prob.loadEditorial) {
        editorialMarkdown = this.editorialCache.get(cacheKey) ?? null;
      }

      if (
        problemMarkdown === undefined ||
        (this.problemTab === "editorial" && prob.loadEditorial && editorialMarkdown === null)
      ) {
        // Disable stale workspace controls while loading the next statement so edits/actions
        // cannot be applied to the newly selected route before its DOM renders.
        const staleSplit = this.root.querySelector<HTMLElement>(".ws-split");
        if (staleSplit) {
          staleSplit.setAttribute("inert", "");
          staleSplit.setAttribute("aria-busy", "true");
        }
        this.root.querySelectorAll<HTMLTextAreaElement>("textarea.code-editor").forEach((ta) => {
          ta.readOnly = true;
        });

        const tasks: Array<Promise<void>> = [];
        if (problemMarkdown === undefined) {
          tasks.push(
            prob
              .loadMarkdown(locale)
              .then((md) => {
                if (seq === this.renderSeq) {
                  this.markdownCache.set(cacheKey, md);
                }
                problemMarkdown = md;
              })
              .catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                problemMarkdown = `# ${prob.meta.title[locale]}\n\n<!-- section:scenario -->\nFailed to load problem statement (${msg}). Please reload to retry.\n`;
              })
          );
        }
        if (this.problemTab === "editorial" && prob.loadEditorial && editorialMarkdown === null) {
          tasks.push(
            prob
              .loadEditorial(locale)
              .then((md) => {
                if (seq === this.renderSeq) {
                  this.editorialCache.set(cacheKey, md);
                }
                editorialMarkdown = md;
              })
              .catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                editorialMarkdown = `Failed to load editorial (${msg}).`;
              })
          );
        }
        await Promise.all(tasks);
      }

      if (seq !== this.renderSeq) return;

      document.title = `${prob.meta.title[locale]} — ${strings.brandTitle}`;
      const effectiveRuntime: RuntimeId = prob.meta.runtimes.includes(this.activeRuntime)
        ? this.activeRuntime
        : (prob.meta.runtimes[0] ?? "washi");
      this.activeRuntime = effectiveRuntime;
      bodyHtml = renderWorkspaceHtml({
        locale,
        strings,
        chapters: CHAPTERS,
        problems: PROBLEMS,
        problem: prob,
        problemMarkdown: problemMarkdown ?? "",
        editorialMarkdown,
        problemTab: this.problemTab,
        prevProblem: prevProb,
        nextProblem: nextProb,
        progress: this.progress,
        activeRuntime: effectiveRuntime,
        washiCode: this.getDraftCode(prob, "washi"),
        pulpCode: prob.meta.runtimes.includes("pulp") ? this.getDraftCode(prob, "pulp") : "",
      });
    } else if (this.viewMode === "guide") {
      let guideMarkdown = this.guideCache.get(locale);
      if (guideMarkdown === undefined) {
        try {
          guideMarkdown = await loadGuideMarkdown(locale);
          if (seq !== this.renderSeq) return;
          this.guideCache.set(locale, guideMarkdown);
        } catch (err) {
          if (seq !== this.renderSeq) return;
          const msg = err instanceof Error ? err.message : String(err);
          guideMarkdown = `# ${strings.guideTitle}\n\nFailed to load guide (${msg}).`;
        }
      }
      if (seq !== this.renderSeq) return;
      document.title = `${strings.guideTitle} — ${strings.brandTitle}`;
      bodyHtml = renderGuidePageHtml({
        locale,
        strings,
        chapters: CHAPTERS,
        problems: PROBLEMS,
        progress: this.progress,
        guideMarkdown,
      });
    } else {
      document.title = `${strings.brandTitle} | WaSHI`;
      bodyHtml = renderExerciseIndexHtml({
        locale,
        strings,
        chapters: CHAPTERS,
        problems: PROBLEMS,
        progress: this.progress,
      });
    }

    if (seq !== this.renderSeq) return;
    this.root.innerHTML = `${headerHtml}${bodyHtml}`;
    this.renderedProblemId = nextRenderedProblemId;
    if (nextRenderedProblemId !== null) {
      if (this.trackedViewProblemId !== nextRenderedProblemId) {
        this.trackedViewProblemId = nextRenderedProblemId;
        this.viewedRuntimesInVisit.clear();
        this.editedRuntimesInVisit.clear();
        trackExerciseEvent("exercise_view", {
          problem_id: nextRenderedProblemId,
          exercise_runtime: toAnalyticsRuntime(this.activeRuntime),
          locale,
        });
        this.recordRuntimeView(nextRenderedProblemId, this.activeRuntime, locale);
      }
    } else {
      this.trackedViewProblemId = null;
      this.viewedRuntimesInVisit.clear();
      this.editedRuntimesInVisit.clear();
    }

    if (this.pendingHash) {
      const targetId = this.pendingHash.replace(/^#/, "");
      this.pendingHash = null;
      if (targetId) {
        document.getElementById(targetId)?.scrollIntoView();
      }
    }

    if (this.viewMode === "workspace" && problemId && this.lastReport) {
      const resultsEl = this.root.querySelector<HTMLElement>("#judge-results");
      if (resultsEl) {
        resultsEl.innerHTML = renderResultsHtml(locale, strings, this.lastReport);
        resultsEl.scrollTop = 0;
      }
    }
  }
}

const mount = typeof document !== "undefined" ? document.getElementById("app") : null;
if (mount) {
  new ExercisesApp(mount);
}
