import type { Locale, ProblemRole, VerdictStatus } from "../types.js";

export interface ExercisesUiStrings {
  brandTitle: string;
  brandSubtitle: string;
  navDocs: string;
  navShowcase: string;
  navPlayground: string;
  backToMap: string;
  startFirstBtn: string;
  resumeBtn: (id: string) => string;
  tutorialBannerTitle: string;
  tutorialBannerDesc: string;
  tutorialDismissBtn: string;
  tutorialRestoreBtn: string;
  progressLabel: (solved: number, total: number) => string;
  runtimeProgressLabel: (solved: number, total: number) => string;
  difficultyLabel: (level: number) => string;
  estimatedMinutesLabel: (mins: number) => string;
  comingSoonBadge: string;
  chapterPrefix: (n: number) => string;
  roleLabels: Record<ProblemRole, string>;
  provenance: {
    aiDrafted: string;
    solverVerified: string;
    reviewedBy: (handles: string[]) => string;
    feedbackHint: string;
  };
  tabs: {
    washi: string;
    highspy: string;
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
  };
  editor: {
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
    caseLabel: (idx: number, name: string) => string;
    objectiveDiff: (yours: number, optimal: number) => string;
    metricsLine: (vars: number, constrs: number, ms: number | null) => string;
    previewLabel: string;
    lpPreviewLabel: string;
    consoleLabel: string;
    nextProblemBtn: (nextId: string) => string;
  };
  backup: {
    openBtn: string;
    title: string;
    desc: string;
    exportBtn: string;
    copyBtn: string;
    copied: string;
    importBtn: string;
    importPlaceholder: string;
    importSuccess: string;
    importError: (msg: string) => string;
    resetAllBtn: string;
    resetAllConfirm: string;
    closeBtn: string;
  };
  theme: {
    toggleLabel: string;
    switchToDark: string;
    switchToLight: string;
  };
  localeNames: Record<Locale, string>;
}
