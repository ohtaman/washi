import enLocale from "../locales/en.json";
import jaLocale from "../locales/ja.json";
import zhLocale from "../locales/zh.json";
import { formatTemplate } from "../problems/judge-helpers.js";
import type { Locale } from "../types.js";
import type { ExercisesUiStrings } from "./types.js";

function buildUiStrings(catalog: typeof enLocale.ui): ExercisesUiStrings {
  return {
    brandTitle: catalog.brandTitle,
    brandSubtitle: catalog.brandSubtitle,
    aboutTitle: catalog.aboutTitle,
    aboutBody: catalog.aboutBody,
    aboutPoints: catalog.aboutPoints,
    navDocs: catalog.navDocs,
    navShowcase: catalog.navShowcase,
    navPlayground: catalog.navPlayground,
    backToMap: catalog.backToMap,
    startFirstBtn: catalog.startFirstBtn,
    resumeBtn: (id) => formatTemplate(catalog.resumeBtn, { id }),
    progressLabel: (solved, total) => formatTemplate(catalog.progressLabel, { solved, total }),
    solvedBadge: catalog.solvedBadge,
    unsolvedBadge: catalog.unsolvedBadge,
    clearSolvedBtn: catalog.clearSolvedBtn,
    confirmClearSolved: catalog.confirmClearSolved,
    clearThisSolvedBtn: catalog.clearThisSolvedBtn,
    clearThisSolvedLabel: catalog.clearThisSolvedLabel,
    sidebarTocLabel: catalog.sidebarTocLabel,
    overviewLink: catalog.overviewLink,
    guideLink: catalog.guideLink,
    guideTitle: catalog.guideTitle,
    tutorialGroupTitle: catalog.tutorialGroupTitle,
    mobileTocToggle: catalog.mobileTocToggle,
    provenanceFootnote: catalog.provenanceFootnote,
    difficultyLabel: (level) => formatTemplate(catalog.difficultyLabel, { level }),
    estimatedMinutesLabel: (mins) => formatTemplate(catalog.estimatedMinutesLabel, { mins }),
    comingSoonBadge: catalog.comingSoonBadge,
    chapterPrefix: (n) => formatTemplate(catalog.chapterPrefix, { n }),
    roleLabels: catalog.roleLabels,
    provenance: {
      generatedBy: catalog.provenance.generatedBy,
      reviewedBy: (handles) =>
        formatTemplate(catalog.provenance.reviewedBy, {
          handles: handles.map((h) => `@${h}`).join(", "),
        }),
      unreviewedBadge: catalog.provenance.unreviewedBadge,
      reviewedBadge: catalog.provenance.reviewedBadge,
      legendUnreviewed: catalog.provenance.legendUnreviewed,
      legendReviewed: catalog.provenance.legendReviewed,
    },
    workspace: catalog.workspace,
    tabs: catalog.tabs,
    sections: catalog.sections,
    editor: catalog.editor,
    results: {
      title: catalog.results.title,
      placeholder: catalog.results.placeholder,
      verdicts: catalog.results.verdicts,
      solverStatus: {
        infeasible: catalog.results.solverStatus.infeasible,
        unbounded: catalog.results.solverStatus.unbounded,
        notSolved: catalog.results.solverStatus.notSolved,
        solverError: (status) => formatTemplate(catalog.results.solverStatus.solverError, { status }),
      },
      caseLabel: (idx, name) => formatTemplate(catalog.results.caseLabel, { num: idx + 1, name }),
      objectiveDiff: (yours, optimal) =>
        formatTemplate(catalog.results.objectiveDiff, { yours, optimal }),
      metricsLine: (vars, constrs, ms) =>
        ms === null
          ? formatTemplate(catalog.results.metricsLineNoMs, { vars, constrs })
          : formatTemplate(catalog.results.metricsLineWithMs, {
              vars,
              constrs,
              ms: ms.toFixed(1),
            }),
      previewLabel: catalog.results.previewLabel,
      lpPreviewLabel: catalog.results.lpPreviewLabel,
      consoleLabel: catalog.results.consoleLabel,
      nextProblemBtn: (nextId) => formatTemplate(catalog.results.nextProblemBtn, { nextId }),
    },
    theme: catalog.theme,
    localeNames: catalog.localeNames,
  };
}

export const UI_STRINGS: Record<Locale, ExercisesUiStrings> = {
  en: buildUiStrings(enLocale.ui),
  ja: buildUiStrings(jaLocale.ui),
  zh: buildUiStrings(zhLocale.ui),
};
