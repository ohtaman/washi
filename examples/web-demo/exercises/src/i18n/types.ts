import type { Locale, ProblemRole, VerdictStatus } from "../types.js";

export interface ExercisesUiStrings {
  brandTitle: string;
  brandSubtitle: string;
  aboutTitle: string;
  aboutBody: string;
  aboutPoints: Array<{ label: string; body: string }>;
  navDocs: string;
  navShowcase: string;
  navPlayground: string;
  backToMap: string;
  startFirstBtn: string;
  resumeBtn: (id: string) => string;
  progressLabel: (solved: number, total: number) => string;
  solvedBadge: string;
  unsolvedBadge: string;
  clearSolvedBtn: string;
  confirmClearSolved: string;
  clearThisSolvedBtn: string;
  clearThisSolvedLabel: string;
  sidebarTocLabel: string;
  overviewLink: string;
  guideLink: string;
  guideTitle: string;
  tutorialGroupTitle: string;
  mobileTocToggle: string;
  provenanceFootnote: string;
  difficultyLabel: (level: number) => string;
  estimatedMinutesLabel: (mins: number) => string;
  comingSoonBadge: string;
  chapterPrefix: (n: number) => string;
  roleLabels: Record<ProblemRole, string>;
  provenance: {
    generatedBy: string;
    reviewedBy: (handles: string[]) => string;
    legendUnreviewed: string;
    legendAction: string;
  };
  workspace: {
    jumpToEditorBtn: string;
    tocDrawerBtn: string;
    tocDrawerClose: string;
    statementTablistLabel: string;
    problemTab: string;
    editorialTab: string;
    reviewAction: string;
    discussionNote: string;
    discussionBtn: string;
  };
  tabs: {
    washi: string;
    pulp: string;
    tablistLabel: string;
    pythonLazyNote: string;
  };
  sections: {
    scenario: string;
    io: string;
    example: string;
    hintsTitle: string;
    hint1: string;
    hint2: string;
    formulation: string;
    editorialNotice: string;
  };
  editor: {
    workbenchTitle: string;
    eitherRuntimeHint: string;
    washiOnlyHint: string;
    label: string;
    runBtn: string;
    runningBtn: string;
    loadingPyodide: string;
    loadingHighspy: string;
    runningPython: string;
    resetBtn: string;
    solutionBtn: string;
    confirmSolution: string;
    shortcutHint: string;
  };
  results: {
    title: string;
    placeholder: string;
    verdicts: Record<VerdictStatus, string>;
    solverStatus: {
      infeasible: string;
      unbounded: string;
      notSolved: string;
      solverError: (status: string) => string;
    };
    caseLabel: (idx: number, name: string) => string;
    objectiveDiff: (yours: number, optimal: number) => string;
    metricsLine: (vars: number, constrs: number, ms: number | null) => string;
    previewLabel: string;
    lpPreviewLabel: string;
    consoleLabel: string;
    nextProblemBtn: (nextId: string) => string;
  };
  theme: {
    toggleLabel: string;
    switchToDark: string;
    switchToLight: string;
  };
  localeNames: Record<Locale, string>;
}
