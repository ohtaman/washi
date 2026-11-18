import type { ExercisesUiStrings } from "../i18n/types.js";
import type { ProgressState } from "../store/progress.js";
import {
  countChapterSolved,
  countMainSolved,
  getNextRecommendedProblemId,
  getStarLevel,
  totalStarsEarned,
} from "../store/progress.js";
import type {
  ChapterInfo,
  JudgeResult,
  Locale,
  ProblemDefinition,
  ProblemMeta,
  RuntimeId,
  VerdictStatus,
} from "../types.js";
import { parseProblemMarkdown, renderSafeMarkdown } from "./markdown.js";

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getDocsBaseUrl(locale: Locale): string {
  if (locale === "ja") return "/ja/";
  if (locale === "zh") return "/zh/";
  return "/";
}

function getShowcaseUrl(locale: Locale): string {
  if (locale === "ja") return "/ja/showcase/";
  if (locale === "zh") return "/zh/showcase/";
  return "/showcase/";
}

function renderStars(level: 0 | 1 | 2): string {
  if (level === 2) return "★★";
  if (level === 1) return "★☆";
  return "☆☆";
}

function renderDifficultyStars(difficulty: number): string {
  const filled = "★".repeat(Math.max(1, Math.min(5, difficulty)));
  const empty = "☆".repeat(Math.max(0, 5 - difficulty));
  return `${filled}${empty}`;
}

export function renderProvenanceBadges(
  meta: ProblemMeta,
  strings: ExercisesUiStrings
): string {
  const badges: string[] = [
    `<span class="prov-badge prov-ai">${escapeHtml(strings.provenance.aiDrafted)}</span>`,
  ];
  if (meta.provenance.autoVerified) {
    badges.push(
      `<span class="prov-badge prov-verified">${escapeHtml(strings.provenance.solverVerified)}</span>`
    );
  }
  if (meta.provenance.reviewedBy.length > 0) {
    badges.push(
      `<span class="prov-badge prov-reviewed">${escapeHtml(
        strings.provenance.reviewedBy(meta.provenance.reviewedBy)
      )}</span>`
    );
  }
  return badges.join("");
}

export function renderHeaderHtml(
  locale: Locale,
  strings: ExercisesUiStrings,
  themeButtonLabel: string,
  themeIcon: string
): string {
  return `
    <header class="ex-header">
      <div class="ex-header-inner">
        <a href="?lang=${locale}" class="ex-brand" data-action="home">
          <img src="/washi-logo.svg" alt="" width="28" height="28" class="ex-brand-logo" />
          <span class="ex-brand-text">
            <span>${escapeHtml(strings.brandTitle)}</span>
            <span class="ex-brand-sub">${escapeHtml(strings.brandSubtitle)}</span>
          </span>
        </a>
        <nav class="ex-header-actions" aria-label="Site navigation">
          <a href="${getDocsBaseUrl(locale)}" class="ex-nav-link ex-nav-link-text">${escapeHtml(strings.navDocs)}</a>
          <a href="${getShowcaseUrl(locale)}" class="ex-nav-link ex-nav-link-text">${escapeHtml(strings.navShowcase)}</a>
          <a href="/demo/" class="ex-nav-link ex-nav-link-text">${escapeHtml(strings.navPlayground)}</a>
          <select id="locale-select" class="ex-select" aria-label="Language">
            <option value="en"${locale === "en" ? " selected" : ""}>${escapeHtml(strings.localeNames.en)}</option>
            <option value="ja"${locale === "ja" ? " selected" : ""}>${escapeHtml(strings.localeNames.ja)}</option>
            <option value="zh"${locale === "zh" ? " selected" : ""}>${escapeHtml(strings.localeNames.zh)}</option>
          </select>
          <button
            type="button"
            id="theme-toggle-btn"
            class="ex-btn-ghost"
            aria-label="${escapeHtml(themeButtonLabel)}"
            title="${escapeHtml(themeButtonLabel)}"
          >${themeIcon}</button>
          <button type="button" id="backup-open-btn" class="ex-btn-ghost">
            ${escapeHtml(strings.backup.openBtn)}
          </button>
        </nav>
      </div>
    </header>
  `;
}

function renderProblemCardHtml(
  prob: ProblemDefinition,
  locale: Locale,
  strings: ExercisesUiStrings,
  progress: ProgressState
): string {
  const { meta } = prob;
  const starLevel = getStarLevel(progress, meta.id);
  const solvedEntry = progress.solved[meta.id];
  const isBoss = meta.role === "boss";
  const roleLabel = strings.roleLabels[meta.role] ?? meta.role;
  const solvedRuntimes = solvedEntry?.runtimes ?? [];

  const cardClasses = [
    "problem-card",
    isBoss ? "is-boss" : "",
    starLevel > 0 ? "is-solved" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <article class="${cardClasses}" data-problem-id="${escapeHtml(meta.id)}">
      <div>
        <div class="problem-card-top">
          <div class="problem-badges">
            <span class="role-pill role-${escapeHtml(meta.role)}">${escapeHtml(roleLabel)}</span>
            ${meta.paradigms
              .map((p) => `<span class="paradigm-pill">${escapeHtml(p)}</span>`)
              .join("")}
          </div>
          <span class="star-display" title="WaSHI / highspy">${renderStars(starLevel)}</span>
        </div>
        <h3 class="problem-card-title">
          <a href="?id=${encodeURIComponent(meta.id)}&lang=${locale}" data-nav-id="${escapeHtml(meta.id)}">
            ${escapeHtml(meta.title[locale])}
          </a>
        </h3>
        <p class="problem-card-sub">${escapeHtml(meta.subtitle[locale])}</p>
      </div>
      <div class="problem-card-foot">
        <div class="problem-badges">
          ${renderProvenanceBadges(meta, strings)}
        </div>
        <div class="problem-meta-line">
          <span>${renderDifficultyStars(meta.difficulty)} · ~${meta.estimatedMinutes}m</span>
          <span>${solvedRuntimes.length > 0 ? solvedRuntimes.join(" + ") : "—"}</span>
        </div>
      </div>
    </article>
  `;
}

export function renderQuestMapHtml(params: {
  locale: Locale;
  strings: ExercisesUiStrings;
  chapters: ChapterInfo[];
  problems: ProblemDefinition[];
  progress: ProgressState;
}): string {
  const { locale, strings, chapters, problems, progress } = params;
  const summaries = problems.map((p) => p.meta);
  const mainSolved = countMainSolved(progress, summaries);
  const stars = totalStarsEarned(progress, summaries);
  const nextId = getNextRecommendedProblemId(progress, summaries);
  const ctaLabel =
    mainSolved === 0 ? strings.startFirstBtn : strings.resumeBtn(nextId);

  const tutorialProblems = problems.filter((p) => p.meta.chapter === 0);
  const ch1Problems = problems.filter((p) => p.meta.chapter === 1);
  const ch1Info = chapters.find((c) => c.chapter === 1);
  const upcomingChapters = chapters.filter((c) => !c.available);
  const pct = Math.min(100, Math.round((mainSolved / 100) * 100));

  const tutorialHtml = progress.tutorialDismissed
    ? `
      <div class="tutorial-restore-bar">
        <button type="button" id="restore-tutorial-btn" class="ex-btn-ghost">
          ${escapeHtml(strings.tutorialRestoreBtn)}
        </button>
      </div>
    `
    : `
      <section class="tutorial-strip" aria-labelledby="tutorial-strip-title">
        <div class="tutorial-strip-head">
          <div>
            <h2 id="tutorial-strip-title" class="tutorial-strip-title">${escapeHtml(strings.tutorialBannerTitle)}</h2>
            <p class="tutorial-strip-desc">${escapeHtml(strings.tutorialBannerDesc)}</p>
          </div>
          <button type="button" id="dismiss-tutorial-btn" class="ex-btn-ghost">
            ${escapeHtml(strings.tutorialDismissBtn)}
          </button>
        </div>
        <div class="tutorial-cards">
          ${tutorialProblems.map((p) => renderProblemCardHtml(p, locale, strings, progress)).join("")}
        </div>
      </section>
    `;

  return `
    <main class="ex-container">
      <section class="quest-hero">
        <div>
          <h1 class="quest-hero-title">${escapeHtml(strings.brandTitle)}</h1>
          <p class="quest-hero-sub">${escapeHtml(strings.brandSubtitle)}</p>
          <div class="quest-hero-actions">
            <a
              href="?id=${encodeURIComponent(nextId)}&lang=${locale}"
              class="ex-btn-primary"
              data-nav-id="${escapeHtml(nextId)}"
              id="hero-primary-cta"
            >${escapeHtml(ctaLabel)}</a>
          </div>
        </div>
        <div class="quest-stats-box">
          <div class="quest-stats-row">
            <span class="quest-stat-main" id="main-progress-text">${escapeHtml(strings.progressLabel(mainSolved, 100))}</span>
            <span class="quest-stat-stars" id="stars-progress-text">${escapeHtml(strings.starsLabel(stars, 200))}</span>
          </div>
          <div class="progress-track" aria-hidden="true">
            <div class="progress-fill" style="width: ${pct}%"></div>
          </div>
        </div>
      </section>

      ${tutorialHtml}

      ${
        ch1Info
          ? `
        <section class="chapter-section" aria-labelledby="ch1-heading">
          <div class="chapter-head">
            <div class="chapter-title-wrap">
              <span class="chapter-kicker">${escapeHtml(strings.chapterPrefix(1))} (${escapeHtml(ch1Info.idRange)})</span>
              <h2 id="ch1-heading" class="chapter-title">${escapeHtml(ch1Info.title[locale])}</h2>
            </div>
            <span class="paradigm-pill">
              ${countChapterSolved(progress, summaries, 1)} / ${ch1Problems.length}
            </span>
          </div>
          <p class="chapter-desc">${escapeHtml(ch1Info.description[locale])}</p>
          <div class="problem-grid">
            ${ch1Problems.map((p) => renderProblemCardHtml(p, locale, strings, progress)).join("")}
          </div>
        </section>
      `
          : ""
      }

      <section class="chapter-section" aria-label="Upcoming chapters">
        <div class="roadmap-grid">
          ${upcomingChapters
            .map(
              (ch) => `
            <article class="roadmap-card">
              <div class="roadmap-card-head">
                <span class="chapter-kicker">${escapeHtml(strings.chapterPrefix(ch.chapter))} (${escapeHtml(ch.idRange)})</span>
                <span class="coming-soon-pill">${escapeHtml(strings.comingSoonBadge)}</span>
              </div>
              <h3 class="problem-card-title">${escapeHtml(ch.title[locale])}</h3>
              <p class="problem-card-sub">${escapeHtml(ch.description[locale])}</p>
              <div class="problem-badges" style="margin-top: 0.65rem">
                ${ch.paradigms.map((p) => `<span class="paradigm-pill">${escapeHtml(p)}</span>`).join("")}
              </div>
            </article>
          `
            )
            .join("")}
        </div>
      </section>
    </main>
  `;
}

export function renderWorkspaceHtml(params: {
  locale: Locale;
  strings: ExercisesUiStrings;
  problem: ProblemDefinition;
  prevProblem: ProblemDefinition | null;
  nextProblem: ProblemDefinition | null;
  progress: ProgressState;
  activeRuntime: RuntimeId;
  washiCode: string;
  highspyCode: string;
}): string {
  const {
    locale,
    strings,
    problem,
    prevProblem,
    nextProblem,
    progress,
    activeRuntime,
    washiCode,
    highspyCode,
  } = params;
  const { meta } = problem;
  const sections = parseProblemMarkdown(problem.markdown[locale]);
  const solvedRuntimes = progress.solved[meta.id]?.runtimes ?? [];
  const washiSolved = solvedRuntimes.includes("washi");
  const highspySolved = solvedRuntimes.includes("highspy");
  const roleLabel = strings.roleLabels[meta.role] ?? meta.role;
  const issueHref = `https://github.com/ohtaman/washi/issues/new?title=${encodeURIComponent(
    `[Exercises #${meta.id}] Feedback`
  )}`;

  const renderToolbarAndEditor = (runtime: RuntimeId, code: string) => `
    <div class="tab-panel-inner">
      ${
        runtime === "highspy"
          ? `<p class="python-lazy-note">${escapeHtml(strings.tabs.pythonLazyNote)}</p>`
          : ""
      }
      <div class="editor-header-row">
        <label for="editor-${runtime}">${escapeHtml(strings.editor.label)}</label>
        <span>${escapeHtml(strings.editor.shortcutHint)}</span>
      </div>
      <textarea
        id="editor-${runtime}"
        class="code-editor"
        data-runtime="${runtime}"
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
      >${escapeHtml(code)}</textarea>
      <div class="editor-toolbar">
        <div class="editor-toolbar-left">
          <button
            type="button"
            class="ex-btn-primary"
            data-action="run"
            data-runtime="${runtime}"
          >${escapeHtml(strings.editor.runBtn)}</button>
          <button
            type="button"
            class="ex-btn-ghost"
            data-action="reset"
            data-runtime="${runtime}"
          >${escapeHtml(strings.editor.resetBtn)}</button>
        </div>
        <div class="editor-toolbar-right">
          <button
            type="button"
            class="ex-btn-ghost"
            data-action="solution"
            data-runtime="${runtime}"
          >${escapeHtml(strings.editor.solutionBtn)}</button>
        </div>
      </div>
    </div>
  `;

  return `
    <main class="ex-container">
      <div class="ws-subbar">
        <div class="ws-nav-group">
          <a href="?lang=${locale}" class="ex-btn-ghost" data-action="home" id="back-to-map-btn">
            ${escapeHtml(strings.backToMap)}
          </a>
          ${
            prevProblem
              ? `<a href="?id=${encodeURIComponent(prevProblem.meta.id)}&lang=${locale}" class="ex-btn-ghost" data-nav-id="${escapeHtml(prevProblem.meta.id)}">← ${escapeHtml(prevProblem.meta.id)}</a>`
              : ""
          }
          ${
            nextProblem
              ? `<a href="?id=${encodeURIComponent(nextProblem.meta.id)}&lang=${locale}" class="ex-btn-ghost" data-nav-id="${escapeHtml(nextProblem.meta.id)}">${escapeHtml(nextProblem.meta.id)} →</a>`
              : ""
          }
        </div>
        <div class="ws-nav-group" id="ws-star-summary">
          <span class="star-display">
            WaSHI ${washiSolved ? "★" : "☆"} · highspy ${highspySolved ? "★" : "☆"}
          </span>
        </div>
      </div>

      <div class="ws-layout">
        <section class="ws-panel" aria-labelledby="ws-problem-title">
          <div class="problem-badges">
            <span class="role-pill role-${escapeHtml(meta.role)}">${escapeHtml(roleLabel)}</span>
            ${meta.paradigms
              .map((p) => `<span class="paradigm-pill">${escapeHtml(p)}</span>`)
              .join("")}
            <span class="paradigm-pill">${renderDifficultyStars(meta.difficulty)} · ~${meta.estimatedMinutes}m</span>
          </div>

          <h1 id="ws-problem-title" class="ws-title">${escapeHtml(meta.title[locale])}</h1>
          <p class="ws-subtitle">${escapeHtml(meta.subtitle[locale])}</p>

          <div class="ws-provenance-row">
            ${renderProvenanceBadges(meta, strings)}
            <a
              href="${issueHref}"
              target="_blank"
              rel="noopener noreferrer"
              class="ws-feedback-link"
            >${escapeHtml(strings.provenance.feedbackHint)} ↗</a>
          </div>

          <div class="md-section">
            <h2 class="md-section-label">${escapeHtml(strings.sections.scenario)}</h2>
            <div class="md-body">${renderSafeMarkdown(sections.scenario)}</div>
          </div>

          <div class="md-section">
            <h2 class="md-section-label">${escapeHtml(strings.sections.io)}</h2>
            <div class="md-body">${renderSafeMarkdown(sections.ioSpec)}</div>
          </div>

          <div class="md-section">
            <h2 class="md-section-label">${escapeHtml(strings.sections.example)}</h2>
            <div class="md-body">${renderSafeMarkdown(sections.example)}</div>
          </div>

          <div class="hints-group">
            <h2 class="hints-heading">${escapeHtml(strings.sections.hintsTitle)}</h2>
            <details class="hint-accordion">
              <summary>${escapeHtml(strings.sections.hint1)}</summary>
              <div class="hint-accordion-body md-body">${renderSafeMarkdown(sections.hint1)}</div>
            </details>
            <details class="hint-accordion">
              <summary>${escapeHtml(strings.sections.hint2)}</summary>
              <div class="hint-accordion-body md-body">${renderSafeMarkdown(sections.hint2)}</div>
            </details>
            <details class="hint-accordion">
              <summary>${escapeHtml(strings.sections.formulation)}</summary>
              <div class="hint-accordion-body md-body">${renderSafeMarkdown(sections.formulation)}</div>
            </details>
          </div>
        </section>

        <section class="ws-ide-panel" aria-label="${escapeHtml(strings.tabs.tablistLabel)}">
          <div
            role="tablist"
            class="runtime-tablist"
            focusgroup="tablist nomemory"
            aria-label="${escapeHtml(strings.tabs.tablistLabel)}"
          >
            <button
              type="button"
              role="tab"
              id="tab-washi"
              class="runtime-tab"
              data-runtime="washi"
              aria-selected="${activeRuntime === "washi" ? "true" : "false"}"
              tabindex="${activeRuntime === "washi" ? "0" : "-1"}"
            >
              <span>${escapeHtml(strings.tabs.washi)}</span>
              <span class="runtime-tab-star">${washiSolved ? "★" : ""}</span>
            </button>
            <button
              type="button"
              role="tab"
              id="tab-highspy"
              class="runtime-tab"
              data-runtime="highspy"
              aria-selected="${activeRuntime === "highspy" ? "true" : "false"}"
              tabindex="${activeRuntime === "highspy" ? "0" : "-1"}"
            >
              <span>${escapeHtml(strings.tabs.highspy)}</span>
              <span class="runtime-tab-star">${highspySolved ? "★" : ""}</span>
            </button>
          </div>

          <div
            role="tabpanel"
            id="panel-washi"
            aria-labelledby="tab-washi"
            ${activeRuntime !== "washi" ? "hidden" : ""}
          >${renderToolbarAndEditor("washi", washiCode)}</div>

          <div
            role="tabpanel"
            id="panel-highspy"
            aria-labelledby="tab-highspy"
            ${activeRuntime !== "highspy" ? "hidden" : ""}
          >${renderToolbarAndEditor("highspy", highspyCode)}</div>

          <section id="judge-results" class="results-section" aria-live="polite">
            <div class="results-head">
              <h2 class="results-title">${escapeHtml(strings.results.title)}</h2>
            </div>
            <p class="results-placeholder">${escapeHtml(strings.results.placeholder)}</p>
          </section>
        </section>
      </div>
    </main>
  `;
}

export interface RenderedRunReport {
  overallStatus: VerdictStatus;
  cases: Array<{
    name: string;
    verdict: JudgeResult;
    varCount?: number;
    constraintCount?: number;
    solveTimeMs?: number | null;
  }>;
  error?: string;
  logs: string[];
  lpPreview?: string | null;
  runTimeMs: number;
  nextProblemId?: string | null;
}

function verdictPillClass(status: VerdictStatus): string {
  if (status === "AC") return "is-ac";
  if (status === "SUBOPTIMAL") return "is-suboptimal";
  if (status === "VIOLATION") return "is-violation";
  if (status === "INFEASIBLE") return "is-infeasible";
  return "is-error";
}

export function renderResultsHtml(
  locale: Locale,
  strings: ExercisesUiStrings,
  report: RenderedRunReport
): string {
  const pillLabel = strings.results.verdicts[report.overallStatus];
  const pillClass = verdictPillClass(report.overallStatus);

  const acBanner =
    report.overallStatus === "AC"
      ? `
      <div class="ac-celebration">
        <strong>★ ${escapeHtml(pillLabel)} (${Math.round(report.runTimeMs)} ms)</strong>
        ${
          report.nextProblemId
            ? `<a href="?id=${encodeURIComponent(report.nextProblemId)}&lang=${locale}" class="ex-btn-primary" data-nav-id="${escapeHtml(report.nextProblemId)}">${escapeHtml(
                strings.results.nextQuestBtn(report.nextProblemId)
              )}</a>`
            : `<a href="?lang=${locale}" class="ex-btn-primary" data-action="home">${escapeHtml(
                strings.backToMap
              )}</a>`
        }
      </div>
    `
      : "";

  const errorBlock = report.error
    ? `<pre class="error-pre">${escapeHtml(report.error)}</pre>`
    : "";

  const casesHtml =
    report.cases.length > 0
      ? `
      <div class="case-list">
        ${report.cases
          .map(
            (c, i) => `
          <article class="case-card">
            <div class="case-card-top">
              <span class="case-name">${escapeHtml(strings.results.caseLabel(i, c.name))}</span>
              <span class="verdict-pill ${verdictPillClass(c.verdict.status)}">${escapeHtml(
                strings.results.verdicts[c.verdict.status]
              )}</span>
            </div>
            <p class="case-msg">${escapeHtml(c.verdict.message)}</p>
            ${
              c.verdict.status === "SUBOPTIMAL" &&
              c.verdict.yourObjective !== undefined &&
              c.verdict.optimalObjective !== undefined
                ? `<p class="case-diff">${escapeHtml(
                    strings.results.objectiveDiff(c.verdict.yourObjective, c.verdict.optimalObjective)
                  )}</p>`
                : ""
            }
            ${
              c.verdict.preview
                ? `<p class="case-meta">${escapeHtml(strings.results.previewLabel)}: ${escapeHtml(c.verdict.preview)}</p>`
                : ""
            }
            ${
              c.varCount !== undefined && c.constraintCount !== undefined
                ? `<p class="case-meta">${escapeHtml(
                    strings.results.metricsLine(c.varCount, c.constraintCount, c.solveTimeMs ?? null)
                  )}</p>`
                : ""
            }
          </article>
        `
          )
          .join("")}
      </div>
    `
      : "";

  const logsHtml =
    report.logs.length > 0
      ? `
      <details class="hint-accordion" style="margin-top: 0.75rem" open>
        <summary>${escapeHtml(strings.results.consoleLabel)}</summary>
        <div class="hint-accordion-body">
          <pre class="log-pre">${escapeHtml(report.logs.join("\n"))}</pre>
        </div>
      </details>
    `
      : "";

  const lpHtml = report.lpPreview
    ? `
      <details class="hint-accordion" style="margin-top: 0.65rem">
        <summary>${escapeHtml(strings.results.lpPreviewLabel)}</summary>
        <div class="hint-accordion-body">
          <pre class="log-pre">${escapeHtml(report.lpPreview)}</pre>
        </div>
      </details>
    `
    : "";

  return `
    <div class="results-head">
      <h2 class="results-title">${escapeHtml(strings.results.title)}</h2>
      <span class="verdict-pill ${pillClass}">${escapeHtml(pillLabel)}</span>
    </div>
    ${acBanner}
    ${errorBlock}
    ${casesHtml}
    ${logsHtml}
    ${lpHtml}
  `;
}

export function renderBackupDialogHtml(strings: ExercisesUiStrings): string {
  return `
    <dialog
      id="backup-dialog"
      class="backup-dialog"
      closedby="any"
      aria-labelledby="backup-dialog-title"
    >
      <div class="backup-dialog-inner">
        <div class="backup-dialog-head">
          <h2 id="backup-dialog-title" class="backup-dialog-title">${escapeHtml(strings.backup.title)}</h2>
          <button type="button" id="backup-close-btn" class="ex-btn-ghost">
            ${escapeHtml(strings.backup.closeBtn)}
          </button>
        </div>
        <p class="tutorial-strip-desc">${escapeHtml(strings.backup.desc)}</p>

        <div>
          <label for="backup-export-text" class="editor-header-row">${escapeHtml(strings.backup.exportBtn)}</label>
          <textarea id="backup-export-text" class="backup-textarea" readonly></textarea>
          <div class="backup-actions-row" style="margin-top: 0.45rem">
            <button type="button" id="backup-copy-btn" class="ex-btn-ghost">${escapeHtml(strings.backup.copyBtn)}</button>
            <button type="button" id="backup-download-btn" class="ex-btn-ghost">${escapeHtml(strings.backup.exportBtn)}</button>
          </div>
        </div>

        <div>
          <label for="backup-import-text" class="editor-header-row">${escapeHtml(strings.backup.importBtn)}</label>
          <textarea
            id="backup-import-text"
            class="backup-textarea"
            placeholder="${escapeHtml(strings.backup.importPlaceholder)}"
          ></textarea>
          <div class="backup-actions-row" style="margin-top: 0.45rem">
            <button type="button" id="backup-import-btn" class="ex-btn-primary">${escapeHtml(strings.backup.importBtn)}</button>
            <button type="button" id="backup-reset-all-btn" class="ex-btn-ghost">${escapeHtml(strings.backup.resetAllBtn)}</button>
          </div>
        </div>

        <p id="backup-status" class="backup-status" aria-live="polite"></p>
      </div>
    </dialog>
  `;
}
