import type { ExercisesUiStrings } from "../i18n/types.js";
import type { ProgressState } from "../store/progress.js";
import {
  countChapterSolved,
  countMainSolved,
  getNextRecommendedProblemId,
  isProblemSolved,
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
import { highlightCode, renderLineNumbers } from "./code-editor.js";
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

function stripProblemIdPrefix(title: string): string {
  return title.replace(/^#\d{3}\.\s*/, "");
}

export function renderSolvedStatusBadgeHtml(
  solved: boolean,
  strings: ExercisesUiStrings
): string {
  return `<span class="status-badge${solved ? " is-solved" : ""}">${escapeHtml(
    solved ? strings.solvedBadge : strings.unsolvedBadge
  )}</span>`;
}

export function renderWorkspaceSolvedControlHtml(
  solved: boolean,
  strings: ExercisesUiStrings
): string {
  const badge = renderSolvedStatusBadgeHtml(solved, strings);
  if (!solved) return badge;
  return `${badge}<button
    type="button"
    id="clear-problem-solved-btn"
    class="ws-clear-solved-btn"
    data-action="clear-problem-solved"
    aria-label="${escapeHtml(strings.clearThisSolvedLabel)}"
    title="${escapeHtml(strings.clearThisSolvedLabel)}"
  >${escapeHtml(strings.clearThisSolvedBtn)}</button>`;
}

export const GITHUB_DISCUSSIONS_BASE = "https://github.com/ohtaman/washi/discussions";

export function getProblemDiscussionUrl(
  meta: Pick<ProblemMeta, "id" | "discussionNumber">
): string {
  if (
    typeof meta.discussionNumber === "number" &&
    Number.isInteger(meta.discussionNumber) &&
    meta.discussionNumber > 0
  ) {
    return `${GITHUB_DISCUSSIONS_BASE}/${meta.discussionNumber}`;
  }
  return `${GITHUB_DISCUSSIONS_BASE}?discussions_q=${encodeURIComponent(`#${meta.id}`)}`;
}

export function renderProvenanceText(
  meta: ProblemMeta,
  strings: ExercisesUiStrings
): string {
  if (meta.provenance.reviewedBy.length > 0) {
    return `${strings.provenance.generatedBy} · ${strings.provenance.reviewedBy(
      meta.provenance.reviewedBy
    )}`;
  }
  return strings.provenance.generatedBy;
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
          <div class="lang-switch-group" role="group" aria-label="Language">
            <button
              type="button"
              id="lang-btn-en"
              class="lang-btn${locale === "en" ? " active" : ""}"
              data-lang-btn="en"
              aria-pressed="${locale === "en" ? "true" : "false"}"
            >${escapeHtml(strings.localeNames.en)}</button>
            <button
              type="button"
              id="lang-btn-ja"
              class="lang-btn${locale === "ja" ? " active" : ""}"
              data-lang-btn="ja"
              aria-pressed="${locale === "ja" ? "true" : "false"}"
            >${escapeHtml(strings.localeNames.ja)}</button>
            <button
              type="button"
              id="lang-btn-zh"
              class="lang-btn${locale === "zh" ? " active" : ""}"
              data-lang-btn="zh"
              aria-pressed="${locale === "zh" ? "true" : "false"}"
            >${escapeHtml(strings.localeNames.zh)}</button>
          </div>
          <button
            type="button"
            id="theme-toggle-btn"
            class="theme-toggle-btn"
            aria-label="${escapeHtml(themeButtonLabel)}"
            title="${escapeHtml(themeButtonLabel)}"
          >${themeIcon}</button>
        </nav>
      </div>
    </header>
  `;
}

function renderSidebarProblemItemHtml(
  p: ProblemDefinition,
  locale: Locale,
  progress: ProgressState,
  activeProblemId: string | null
): string {
  const solved = isProblemSolved(progress, p.meta.id);
  const active = activeProblemId === p.meta.id;
  const classes = [
    "book-sidebar-link",
    active ? "is-active" : "",
    solved ? "is-solved" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <li>
      <a
        href="?id=${encodeURIComponent(p.meta.id)}&lang=${locale}"
        class="${classes}"
        data-sidebar-id="${escapeHtml(p.meta.id)}"
        data-nav-id="${escapeHtml(p.meta.id)}"
      >
        <span class="book-sidebar-label">#${escapeHtml(p.meta.id)} ${escapeHtml(
          stripProblemIdPrefix(p.meta.title[locale])
        )}</span>
        <span class="book-sidebar-check">${solved ? "✓" : ""}</span>
      </a>
    </li>
  `;
}

function renderBookSidebarHtml(params: {
  locale: Locale;
  strings: ExercisesUiStrings;
  chapters: ChapterInfo[];
  problems: ProblemDefinition[];
  progress: ProgressState;
  activeProblemId: string | null;
  activePage?: "overview" | "guide" | "problem";
  isDrawer?: boolean;
}): string {
  const {
    locale,
    strings,
    chapters,
    problems,
    progress,
    activeProblemId,
    activePage = activeProblemId !== null ? "problem" : "overview",
    isDrawer = false,
  } = params;
  const summaries = problems.map((p) => p.meta);
  const mainSolved = countMainSolved(progress, summaries);
  const hasAnySolved = Object.keys(progress.solved).length > 0;
  const tutorialProblems = problems.filter((p) => p.meta.chapter === 0);
  const availableChapters = chapters.filter((ch) => ch.available);
  const upcomingChapters = chapters.filter((ch) => !ch.available);

  const tutorialBlockHtml =
    tutorialProblems.length > 0
      ? `
        <div class="book-sidebar-group">
          <div class="book-sidebar-chapter-title">
            ${escapeHtml(strings.tutorialGroupTitle)}
          </div>
          <ol class="book-sidebar-items">
            ${tutorialProblems
              .map((p) => renderSidebarProblemItemHtml(p, locale, progress, activeProblemId))
              .join("")}
          </ol>
        </div>
      `
      : "";

  const chapterBlocksHtml = availableChapters
    .map((ch) => {
      const chProblems = problems.filter((p) => p.meta.chapter === ch.chapter);
      return `
        <div class="book-sidebar-group">
          <div class="book-sidebar-chapter-title">
            ${escapeHtml(strings.chapterPrefix(ch.chapter))}: ${escapeHtml(ch.title[locale])}
          </div>
          <ol class="book-sidebar-items">
            ${chProblems
              .map((p) => renderSidebarProblemItemHtml(p, locale, progress, activeProblemId))
              .join("")}
          </ol>
        </div>
      `;
    })
    .join("");

  const upcomingHtml =
    upcomingChapters.length > 0
      ? `
      <div class="book-sidebar-group book-sidebar-upcoming-group">
        ${upcomingChapters
          .map(
            (ch) => `
          <div class="book-sidebar-upcoming">
            <span>${escapeHtml(strings.chapterPrefix(ch.chapter))} (${escapeHtml(ch.idRange)})</span>
          </div>
        `
          )
          .join("")}
      </div>
    `
      : "";

  const mobileLinksHtml = problems
    .map((p) => renderSidebarProblemItemHtml(p, locale, progress, activeProblemId))
    .join("");

  const mobileTocHtml = isDrawer
    ? ""
    : `
    <details class="mobile-toc">
      <summary class="mobile-toc-summary">
        <span>${escapeHtml(strings.mobileTocToggle)}</span>
        <span class="mobile-toc-count">${escapeHtml(strings.progressLabel(mainSolved, 100))}</span>
      </summary>
      <div class="mobile-toc-body">
        <a
          href="?lang=${locale}"
          class="book-sidebar-overview${activePage === "overview" ? " is-active" : ""}"
          data-action="home"
        >${escapeHtml(strings.overviewLink)}</a>
        <a
          href="?view=guide&lang=${locale}"
          class="book-sidebar-overview${activePage === "guide" ? " is-active" : ""}"
          data-action="guide"
        >${escapeHtml(strings.guideLink)}</a>
        <ol class="book-sidebar-items">
          ${mobileLinksHtml}
        </ol>
      </div>
    </details>
  `;

  const backdropHtml = isDrawer
    ? `<div class="toc-drawer-backdrop" data-action="close-toc" aria-hidden="true"></div>`
    : "";

  const closeBtnHtml = isDrawer
    ? `<button type="button" class="toc-drawer-close" data-action="close-toc" aria-label="${escapeHtml(
        strings.workspace.tocDrawerClose
      )}" title="${escapeHtml(strings.workspace.tocDrawerClose)}">×</button>`
    : "";

  return `
    ${mobileTocHtml}
    ${backdropHtml}
    <aside class="book-sidebar" aria-label="${escapeHtml(strings.sidebarTocLabel)}"${
      isDrawer ? " inert" : ""
    }>
      <div class="book-sidebar-head">
        <div class="book-sidebar-head-row">
          <a
            href="?lang=${locale}"
            class="book-sidebar-overview${activePage === "overview" ? " is-active" : ""}"
            data-action="home"
          >${escapeHtml(strings.overviewLink)}</a>
          ${closeBtnHtml}
        </div>
        <a
          href="?view=guide&lang=${locale}"
          class="book-sidebar-overview${activePage === "guide" ? " is-active" : ""}"
          data-action="guide"
        >${escapeHtml(strings.guideLink)}</a>
        <div class="book-sidebar-progress-row">
          <div class="book-sidebar-progress" id="sidebar-progress-text">
            ${escapeHtml(strings.progressLabel(mainSolved, 100))}
          </div>
          ${
            hasAnySolved
              ? `<button type="button" class="clear-solved-link" data-action="clear-all-solved">${escapeHtml(
                  strings.clearSolvedBtn
                )}</button>`
              : ""
          }
        </div>
      </div>
      <nav class="book-sidebar-nav" aria-label="${escapeHtml(strings.sidebarTocLabel)}">
        ${tutorialBlockHtml}
        ${chapterBlocksHtml}
        ${upcomingHtml}
      </nav>
    </aside>
  `;
}

function renderTocRowHtml(
  prob: ProblemDefinition,
  locale: Locale,
  strings: ExercisesUiStrings,
  progress: ProgressState
): string {
  const { meta } = prob;
  const solved = isProblemSolved(progress, meta.id);
  const isCapstone = meta.role === "capstone";
  const roleLabel = strings.roleLabels[meta.role] ?? meta.role;

  const rowClasses = [
    "toc-row",
    isCapstone ? "is-capstone" : "",
    solved ? "is-solved" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const metaParts = [
    ...meta.paradigms,
    strings.difficultyLabel(meta.difficulty),
    strings.estimatedMinutesLabel(meta.estimatedMinutes),
  ]
    .map((part) => escapeHtml(part))
    .join(" · ");

  return `
    <li class="${rowClasses}" data-problem-id="${escapeHtml(meta.id)}">
      <span class="toc-num">#${escapeHtml(meta.id)}</span>
      <div class="toc-row-main">
        <a
          href="?id=${encodeURIComponent(meta.id)}&lang=${locale}"
          class="toc-title-link"
          data-nav-id="${escapeHtml(meta.id)}"
        >${escapeHtml(stripProblemIdPrefix(meta.title[locale]))}</a>
        <p class="toc-row-sub">${escapeHtml(meta.subtitle[locale])}</p>
      </div>
      <div class="toc-row-meta">
        <span class="toc-meta-tags"><span class="toc-role${isCapstone ? " is-capstone" : ""}">${escapeHtml(roleLabel)}</span> · ${metaParts}</span>
        ${renderSolvedStatusBadgeHtml(solved, strings)}
      </div>
    </li>
  `;
}

export function renderExerciseIndexHtml(params: {
  locale: Locale;
  strings: ExercisesUiStrings;
  chapters: ChapterInfo[];
  problems: ProblemDefinition[];
  progress: ProgressState;
}): string {
  const { locale, strings, chapters, problems, progress } = params;
  const summaries = problems.map((p) => p.meta);
  const mainSolved = countMainSolved(progress, summaries);
  const hasAnySolved = Object.keys(progress.solved).length > 0;
  const nextId = getNextRecommendedProblemId(progress, summaries);
  const ctaLabel =
    mainSolved === 0 ? strings.startFirstBtn : strings.resumeBtn(nextId);

  const tutorialProblems = problems.filter((p) => p.meta.chapter === 0);
  const ch1Problems = problems.filter((p) => p.meta.chapter === 1);
  const ch1Info = chapters.find((c) => c.chapter === 1);
  const upcomingChapters = chapters.filter((c) => !c.available);
  const pct = Math.min(100, Math.round((mainSolved / 100) * 100));

  return `
    <div class="book-shell">
      ${renderBookSidebarHtml({
        locale,
        strings,
        chapters,
        problems,
        progress,
        activeProblemId: null,
        activePage: "overview",
      })}
      <main class="book-main">
        <section class="ex-hero">
          <h1 class="ex-hero-title">${escapeHtml(strings.brandTitle)}</h1>
          <p class="ex-hero-sub">${escapeHtml(strings.brandSubtitle)}</p>
          <div class="ex-hero-actions">
            <a
              href="?id=${encodeURIComponent(nextId)}&lang=${locale}"
              class="ex-btn-primary"
              data-nav-id="${escapeHtml(nextId)}"
              id="hero-primary-cta"
            >${escapeHtml(ctaLabel)}</a>
            <a
              href="?view=guide&lang=${locale}"
              class="ex-btn-ghost"
              data-action="guide"
              id="hero-guide-link"
            >${escapeHtml(strings.guideLink)}</a>
            <div class="ex-progress-inline">
              <span class="ex-stat-main" id="main-progress-text">${escapeHtml(strings.progressLabel(mainSolved, 100))}</span>
              <div class="progress-track" aria-hidden="true">
                <div class="progress-fill" style="width: ${pct}%"></div>
              </div>
              ${
                hasAnySolved
                  ? `<button type="button" id="clear-all-solved-btn" class="clear-solved-link" data-action="clear-all-solved">${escapeHtml(
                      strings.clearSolvedBtn
                    )}</button>`
                  : ""
              }
            </div>
          </div>
        </section>

        <section class="chapter-section ex-about-section" id="about-exercises" aria-labelledby="about-heading">
          <div class="chapter-head">
            <div class="chapter-title-wrap">
              <h2 id="about-heading" class="chapter-title">${escapeHtml(strings.aboutTitle)}</h2>
            </div>
          </div>
          <p class="ex-about-body">${escapeHtml(strings.aboutBody)}</p>
          <ul class="ex-about-points">
            ${strings.aboutPoints
              .map(
                (pt) =>
                  `<li><strong>${escapeHtml(pt.label)}</strong> — ${escapeHtml(pt.body)}</li>`
              )
              .join("")}
          </ul>
        </section>

        ${
          tutorialProblems.length > 0
            ? `
          <section class="chapter-section chapter-tutorial" aria-labelledby="ch0-heading">
            <div class="chapter-head">
              <div class="chapter-title-wrap">
                <h2 id="ch0-heading" class="chapter-title">${escapeHtml(strings.tutorialGroupTitle)}</h2>
              </div>
            </div>
            <ol class="toc-list">
              ${tutorialProblems.map((p) => renderTocRowHtml(p, locale, strings, progress)).join("")}
            </ol>
          </section>
        `
            : ""
        }

        ${
          ch1Info
            ? `
          <section class="chapter-section" aria-labelledby="ch1-heading">
            <div class="chapter-head">
              <div class="chapter-title-wrap">
                <span class="chapter-kicker">${escapeHtml(strings.chapterPrefix(1))} (${escapeHtml(ch1Info.idRange)})</span>
                <h2 id="ch1-heading" class="chapter-title">${escapeHtml(ch1Info.title[locale])}</h2>
              </div>
              <span class="chapter-count">${countChapterSolved(progress, summaries, 1)} / ${ch1Problems.length}</span>
            </div>
            <p class="chapter-desc">${escapeHtml(ch1Info.description[locale])}</p>
            <ol class="toc-list">
              ${ch1Problems.map((p) => renderTocRowHtml(p, locale, strings, progress)).join("")}
            </ol>
            <p class="provenance-footnote">${escapeHtml(strings.provenanceFootnote)}</p>
          </section>
        `
            : ""
        }

        <section class="chapter-section chapter-syllabus" aria-label="Upcoming chapters">
          <ol class="toc-list toc-list-upcoming">
            ${upcomingChapters
              .map(
                (ch) => `
              <li class="toc-row toc-row-upcoming">
                <span class="chapter-kicker">${escapeHtml(strings.chapterPrefix(ch.chapter))} (${escapeHtml(ch.idRange)})</span>
                <div class="toc-row-main">
                  <span class="toc-upcoming-title">${escapeHtml(ch.title[locale])}</span>
                  <p class="toc-row-sub">${escapeHtml(ch.description[locale])}</p>
                </div>
                <div class="toc-row-meta">
                  <span class="toc-meta-tags">${ch.paradigms.map((p) => escapeHtml(p)).join(" · ")}</span>
                  <span class="toc-coming-soon">${escapeHtml(strings.comingSoonBadge)}</span>
                </div>
              </li>
            `
              )
              .join("")}
          </ol>
        </section>
      </main>
    </div>
  `;
}

export function renderGuidePageHtml(params: {
  locale: Locale;
  strings: ExercisesUiStrings;
  chapters: ChapterInfo[];
  problems: ProblemDefinition[];
  progress: ProgressState;
  guideMarkdown: string;
}): string {
  const { locale, strings, chapters, problems, progress, guideMarkdown } = params;
  return `
    <div class="book-shell">
      ${renderBookSidebarHtml({
        locale,
        strings,
        chapters,
        problems,
        progress,
        activeProblemId: null,
        activePage: "guide",
      })}
      <main class="book-main">
        <div class="guide-topbar">
          <a href="?lang=${locale}" class="ws-back-link" data-action="home" id="guide-back-to-map-btn">
            ${escapeHtml(strings.backToMap)}
          </a>
        </div>
        <article class="guide-sheet md-body" id="guide-content">
          ${renderSafeMarkdown(guideMarkdown)}
        </article>
      </main>
    </div>
  `;
}

export function renderWorkspaceHtml(params: {
  locale: Locale;
  strings: ExercisesUiStrings;
  chapters: ChapterInfo[];
  problems: ProblemDefinition[];
  problem: ProblemDefinition;
  problemMarkdown: string;
  editorialMarkdown?: string | null;
  problemTab?: "problem" | "editorial";
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
    chapters,
    problems,
    problem,
    problemMarkdown,
    editorialMarkdown = null,
    problemTab = "problem",
    prevProblem,
    nextProblem,
    progress,
    activeRuntime,
    washiCode,
    highspyCode,
  } = params;
  const { meta } = problem;
  const sections = parseProblemMarkdown(problemMarkdown);
  const solvedRuntimes = progress.solved[meta.id]?.runtimes ?? [];
  const solvedAny = isProblemSolved(progress, meta.id);
  const washiSolved = solvedRuntimes.includes("washi");
  const highspySolved = solvedRuntimes.includes("highspy");
  const supportsHighspy = meta.runtimes.includes("highspy");
  const effectiveRuntime: RuntimeId = meta.runtimes.includes(activeRuntime)
    ? activeRuntime
    : (meta.runtimes[0] ?? "washi");
  const roleLabel = strings.roleLabels[meta.role] ?? meta.role;
  const kickerItems = [
    roleLabel,
    ...meta.paradigms,
    strings.difficultyLabel(meta.difficulty),
    strings.estimatedMinutesLabel(meta.estimatedMinutes),
  ];

  const hasExternalEditorial = Boolean(problem.loadEditorial);
  const hintItemsHtml = [
    sections.hint1
      ? `<details class="hint-accordion"><summary>${escapeHtml(strings.sections.hint1)}</summary><div class="hint-accordion-body md-body">${renderSafeMarkdown(sections.hint1)}</div></details>`
      : "",
    sections.hint2
      ? `<details class="hint-accordion"><summary>${escapeHtml(strings.sections.hint2)}</summary><div class="hint-accordion-body md-body">${renderSafeMarkdown(sections.hint2)}</div></details>`
      : "",
    !hasExternalEditorial && sections.formulation
      ? `<details class="hint-accordion"><summary>${escapeHtml(strings.sections.formulation)}</summary><div class="hint-accordion-body md-body">${renderSafeMarkdown(sections.formulation)}</div></details>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const hintsGroupHtml = hintItemsHtml
    ? `
      <div class="hints-group">
        <h2 class="hints-heading">${escapeHtml(strings.sections.hintsTitle)}</h2>
        ${hintItemsHtml}
      </div>
    `
    : "";

  const editorialSource = editorialMarkdown ?? (sections.formulation || "");
  const editorialBodyHtml = editorialSource
    ? renderSafeMarkdown(editorialSource)
    : `<p class="editorial-loading">Loading…</p>`;

  const renderToolbarAndEditor = (runtime: RuntimeId, code: string) => {
    const lang = runtime === "washi" ? "ts" : "py";
    return `
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
        <div class="code-editor-wrap" data-runtime="${runtime}">
          <pre
            class="editor-gutter"
            id="gutter-${runtime}"
            aria-hidden="true"
          >${renderLineNumbers(code)}</pre>
          <div class="editor-stage">
            <pre
              class="editor-highlight"
              id="highlight-${runtime}"
              aria-hidden="true"
            ><code>${highlightCode(code, lang)}</code></pre>
            <textarea
              id="editor-${runtime}"
              class="code-editor"
              data-runtime="${runtime}"
              wrap="off"
              spellcheck="false"
              autocomplete="off"
              autocapitalize="off"
            >${escapeHtml(code)}</textarea>
          </div>
        </div>
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
  };

  return `
    <div class="book-shell is-workspace">
      ${renderBookSidebarHtml({
        locale,
        strings,
        chapters,
        problems,
        progress,
        activeProblemId: meta.id,
        isDrawer: true,
      })}
      <main class="book-main ws-main">
        <div class="ws-subbar">
          <div class="ws-nav-group">
            <button
              type="button"
              id="toc-drawer-toggle"
              class="ex-btn-ghost ws-toc-toggle"
              aria-expanded="false"
            >☰ ${escapeHtml(strings.workspace.tocDrawerBtn)}</button>
            <a href="?lang=${locale}" class="ws-back-link" data-action="home" id="back-to-map-btn">
              ${escapeHtml(strings.backToMap)}
            </a>
            ${
              prevProblem
                ? `<a href="?id=${encodeURIComponent(prevProblem.meta.id)}&lang=${locale}" class="ws-nav-link" data-nav-id="${escapeHtml(prevProblem.meta.id)}">← ${escapeHtml(prevProblem.meta.id)}</a>`
                : ""
            }
            ${
              nextProblem
                ? `<a href="?id=${encodeURIComponent(nextProblem.meta.id)}&lang=${locale}" class="ws-nav-link" data-nav-id="${escapeHtml(nextProblem.meta.id)}">${escapeHtml(nextProblem.meta.id)} →</a>`
                : ""
            }
          </div>
          <div class="ws-nav-group">
            <button type="button" id="jump-to-editor-btn" class="ex-btn-ghost ws-mobile-jump-btn">
              ${escapeHtml(strings.workspace.jumpToEditorBtn)}
            </button>
            <div id="ws-solve-status" class="ws-solve-status">
              ${renderWorkspaceSolvedControlHtml(solvedAny, strings)}
            </div>
          </div>
        </div>

        <div class="ws-split">
          <div class="ws-pane-problem">
            <article class="ws-problem-sheet" aria-labelledby="ws-problem-title">
              <div class="ws-kicker">${escapeHtml(kickerItems.join(" · "))}</div>

              <h1 id="ws-problem-title" class="ws-title">${escapeHtml(meta.title[locale])}</h1>
              <p class="ws-subtitle">${escapeHtml(meta.subtitle[locale])}</p>

              <p class="ws-provenance">${escapeHtml(renderProvenanceText(meta, strings))}</p>

              <div
                role="tablist"
                class="ws-stmt-tablist"
                focusgroup="tablist nomemory"
                aria-label="${escapeHtml(strings.workspace.statementTablistLabel)}"
              >
                <button
                  type="button"
                  role="tab"
                  id="stmt-tab-problem"
                  class="runtime-tab ws-stmt-tab"
                  data-stmt-tab="problem"
                  aria-selected="${problemTab === "problem" ? "true" : "false"}"
                  tabindex="${problemTab === "problem" ? "0" : "-1"}"
                >${escapeHtml(strings.workspace.problemTab)}</button>
                <button
                  type="button"
                  role="tab"
                  id="stmt-tab-editorial"
                  class="runtime-tab ws-stmt-tab"
                  data-stmt-tab="editorial"
                  aria-selected="${problemTab === "editorial" ? "true" : "false"}"
                  tabindex="${problemTab === "editorial" ? "0" : "-1"}"
                >${escapeHtml(strings.workspace.editorialTab)}</button>
              </div>

              <div
                role="tabpanel"
                id="stmt-panel-problem"
                class="ws-stmt-panel"
                aria-labelledby="stmt-tab-problem"
                ${problemTab !== "problem" ? "hidden" : ""}
              >
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

                ${hintsGroupHtml}
              </div>

              <div
                role="tabpanel"
                id="stmt-panel-editorial"
                class="ws-stmt-panel"
                aria-labelledby="stmt-tab-editorial"
                ${problemTab !== "editorial" ? "hidden" : ""}
              >
                ${
                  !solvedAny
                    ? `<p class="editorial-notice">${escapeHtml(strings.sections.editorialNotice)}</p>`
                    : ""
                }
                <div id="editorial-content" class="md-body editorial-body">${editorialBodyHtml}</div>
              </div>

              <div class="ws-discussion-footer">
                <span class="ws-discussion-note">${escapeHtml(strings.workspace.discussionNote)}</span>
                <a
                  href="${escapeHtml(getProblemDiscussionUrl(meta))}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="ws-discussion-link"
                  id="ws-discussion-link"
                >${escapeHtml(strings.workspace.discussionBtn)} ↗</a>
              </div>
            </article>
          </div>

          <div class="ws-pane-editor">
            <section
              id="answer-workbench"
              class="answer-workbench"
              aria-label="${escapeHtml(strings.editor.workbenchTitle)}"
            >
              <div class="answer-workbench-head">
                <div>
                  <h2 class="answer-workbench-title">${escapeHtml(strings.editor.workbenchTitle)}</h2>
                  <p class="answer-workbench-hint">${escapeHtml(
                    supportsHighspy ? strings.editor.eitherRuntimeHint : strings.editor.washiOnlyHint
                  )}</p>
                </div>
              </div>

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
                  aria-selected="${effectiveRuntime === "washi" ? "true" : "false"}"
                  tabindex="${effectiveRuntime === "washi" ? "0" : "-1"}"
                >
                  <span>${escapeHtml(strings.tabs.washi)}</span>
                  <span class="runtime-tab-check">${washiSolved ? "✓" : ""}</span>
                </button>
                ${
                  supportsHighspy
                    ? `<button
                  type="button"
                  role="tab"
                  id="tab-highspy"
                  class="runtime-tab"
                  data-runtime="highspy"
                  aria-selected="${effectiveRuntime === "highspy" ? "true" : "false"}"
                  tabindex="${effectiveRuntime === "highspy" ? "0" : "-1"}"
                >
                  <span>${escapeHtml(strings.tabs.highspy)}</span>
                  <span class="runtime-tab-check">${highspySolved ? "✓" : ""}</span>
                </button>`
                    : ""
                }
              </div>

              <div
                role="tabpanel"
                id="panel-washi"
                aria-labelledby="tab-washi"
                ${effectiveRuntime !== "washi" ? "hidden" : ""}
              >${renderToolbarAndEditor("washi", washiCode)}</div>

              ${
                supportsHighspy
                  ? `<div
                role="tabpanel"
                id="panel-highspy"
                aria-labelledby="tab-highspy"
                ${effectiveRuntime !== "highspy" ? "hidden" : ""}
              >${renderToolbarAndEditor("highspy", highspyCode)}</div>`
                  : ""
              }

              <section id="judge-results" class="results-section" aria-live="polite">
                <div class="results-head">
                  <h2 class="results-title">${escapeHtml(strings.results.title)}</h2>
                </div>
                <p class="results-placeholder">${escapeHtml(strings.results.placeholder)}</p>
              </section>
            </section>
          </div>
        </div>
      </main>
    </div>
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
        <strong>✓ ${escapeHtml(pillLabel)} (${Math.round(report.runTimeMs)} ms)</strong>
        ${
          report.nextProblemId
            ? `<a href="?id=${encodeURIComponent(report.nextProblemId)}&lang=${locale}" class="ex-btn-primary" data-nav-id="${escapeHtml(report.nextProblemId)}">${escapeHtml(
                strings.results.nextProblemBtn(report.nextProblemId)
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
              c.varCount !== undefined &&
              c.constraintCount !== undefined &&
              (c.varCount > 0 || c.constraintCount > 0 || c.solveTimeMs !== null)
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
