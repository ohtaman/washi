import type { RuntimeId } from "../types.js";

export const PROGRESS_STORAGE_KEY = "washi_exercises_progress_v1";

export interface SolvedEntry {
  runtimes: RuntimeId[];
  bestMs?: number;
  solvedAt: string;
}

export interface DraftEntry {
  washi?: string;
  highspy?: string;
}

export interface ProgressState {
  version: 1;
  solved: Record<string, SolvedEntry>;
  drafts: Record<string, DraftEntry>;
  tutorialDismissed?: boolean;
}

export function createEmptyProgress(): ProgressState {
  return {
    version: 1,
    solved: {},
    drafts: {},
    tutorialDismissed: false,
  };
}

function isValidRuntime(v: unknown): v is RuntimeId {
  return v === "washi" || v === "highspy";
}

function validateAndNormalizeProgress(raw: unknown): ProgressState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Invalid progress JSON: expected an object.");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new Error(`Unsupported progress version: ${String(obj.version)}.`);
  }
  if (typeof obj.solved !== "object" || obj.solved === null || Array.isArray(obj.solved)) {
    throw new Error("Invalid progress JSON: 'solved' must be an object.");
  }

  const solved: Record<string, SolvedEntry> = {};
  for (const [id, entryVal] of Object.entries(obj.solved as Record<string, unknown>)) {
    if (typeof entryVal !== "object" || entryVal === null || Array.isArray(entryVal)) {
      throw new Error(`Invalid solved entry for "${id}".`);
    }
    const entry = entryVal as Record<string, unknown>;
    if (!Array.isArray(entry.runtimes) || entry.runtimes.some((r) => !isValidRuntime(r))) {
      throw new Error(`Invalid runtimes array for "${id}".`);
    }
    const uniqueRuntimes = Array.from(new Set(entry.runtimes));
    const solvedAt =
      typeof entry.solvedAt === "string" && entry.solvedAt.length > 0
        ? entry.solvedAt
        : new Date().toISOString();
    const normalized: SolvedEntry = {
      runtimes: uniqueRuntimes,
      solvedAt,
    };
    if (typeof entry.bestMs === "number" && Number.isFinite(entry.bestMs) && entry.bestMs >= 0) {
      normalized.bestMs = entry.bestMs;
    }
    solved[id] = normalized;
  }

  const drafts: Record<string, DraftEntry> = {};
  if (obj.drafts !== undefined) {
    if (typeof obj.drafts !== "object" || obj.drafts === null || Array.isArray(obj.drafts)) {
      throw new Error("Invalid progress JSON: 'drafts' must be an object.");
    }
    for (const [id, dVal] of Object.entries(obj.drafts as Record<string, unknown>)) {
      if (typeof dVal !== "object" || dVal === null || Array.isArray(dVal)) {
        throw new Error(`Invalid draft entry for "${id}".`);
      }
      const dObj = dVal as Record<string, unknown>;
      const draft: DraftEntry = {};
      if (dObj.washi !== undefined) {
        if (typeof dObj.washi !== "string") throw new Error(`Invalid washi draft for "${id}".`);
        draft.washi = dObj.washi;
      }
      if (dObj.highspy !== undefined) {
        if (typeof dObj.highspy !== "string") throw new Error(`Invalid highspy draft for "${id}".`);
        draft.highspy = dObj.highspy;
      }
      if (draft.washi !== undefined || draft.highspy !== undefined) {
        drafts[id] = draft;
      }
    }
  }

  return {
    version: 1,
    solved,
    drafts,
    ...(obj.tutorialDismissed === true ? { tutorialDismissed: true } : { tutorialDismissed: false }),
  };
}

export function loadProgress(storage?: Pick<Storage, "getItem"> | null): ProgressState {
  const targetStorage =
    storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!targetStorage) return createEmptyProgress();
  try {
    const raw = targetStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return createEmptyProgress();
    return validateAndNormalizeProgress(JSON.parse(raw));
  } catch {
    return createEmptyProgress();
  }
}

export function saveProgress(
  state: ProgressState,
  storage?: Pick<Storage, "setItem"> | null
): void {
  const targetStorage =
    storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!targetStorage) return;
  try {
    targetStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota or private browsing write errors cleanly.
  }
}

export function recordSolvedProblem(
  state: ProgressState,
  problemId: string,
  runtime: RuntimeId,
  timeMs?: number,
  nowIso: string = new Date().toISOString()
): ProgressState {
  const existing = state.solved[problemId];
  const runtimes = existing
    ? Array.from(new Set([...existing.runtimes, runtime]))
    : [runtime];
  let bestMs = existing?.bestMs;
  if (typeof timeMs === "number" && Number.isFinite(timeMs) && timeMs >= 0) {
    bestMs = bestMs === undefined ? timeMs : Math.min(bestMs, timeMs);
  }
  return {
    ...state,
    solved: {
      ...state.solved,
      [problemId]: {
        runtimes,
        ...(bestMs !== undefined ? { bestMs } : {}),
        solvedAt: existing?.solvedAt || nowIso,
      },
    },
  };
}

export function saveDraft(
  state: ProgressState,
  problemId: string,
  runtime: RuntimeId,
  code: string
): ProgressState {
  return {
    ...state,
    drafts: {
      ...state.drafts,
      [problemId]: {
        ...state.drafts[problemId],
        [runtime]: code,
      },
    },
  };
}

export function clearDraft(
  state: ProgressState,
  problemId: string,
  runtime: RuntimeId
): ProgressState {
  const prev = state.drafts[problemId];
  if (!prev) return state;
  const nextEntry: DraftEntry = { ...prev };
  delete nextEntry[runtime];
  const nextDrafts = { ...state.drafts };
  if (nextEntry.washi === undefined && nextEntry.highspy === undefined) {
    delete nextDrafts[problemId];
  } else {
    nextDrafts[problemId] = nextEntry;
  }
  return {
    ...state,
    drafts: nextDrafts,
  };
}

export function dismissTutorial(state: ProgressState, dismissed: boolean = true): ProgressState {
  return {
    ...state,
    tutorialDismissed: dismissed,
  };
}

export function countMainSolved(
  state: ProgressState,
  problems: ReadonlyArray<{ id: string; chapter: number }>
): number {
  let count = 0;
  for (const p of problems) {
    if (p.chapter <= 0) continue;
    if ((state.solved[p.id]?.runtimes.length ?? 0) > 0) {
      count++;
    }
  }
  return count;
}

export function countChapterSolved(
  state: ProgressState,
  problems: ReadonlyArray<{ id: string; chapter: number }>,
  chapter: number
): number {
  let count = 0;
  for (const p of problems) {
    if (p.chapter !== chapter) continue;
    if ((state.solved[p.id]?.runtimes.length ?? 0) > 0) {
      count++;
    }
  }
  return count;
}

export function getStarLevel(state: ProgressState, problemId: string): 0 | 1 | 2 {
  const count = state.solved[problemId]?.runtimes.length ?? 0;
  if (count >= 2) return 2;
  if (count === 1) return 1;
  return 0;
}

export function totalStarsEarned(
  state: ProgressState,
  problems: ReadonlyArray<{ id: string; chapter: number }>
): number {
  let stars = 0;
  for (const p of problems) {
    if (p.chapter <= 0) continue;
    stars += getStarLevel(state, p.id);
  }
  return stars;
}

export function getNextRecommendedProblemId(
  state: ProgressState,
  problems: ReadonlyArray<{ id: string; chapter: number }>
): string {
  const mainProblems = problems.filter((p) => p.chapter > 0);
  const firstUnsolved = mainProblems.find(
    (p) => (state.solved[p.id]?.runtimes.length ?? 0) === 0
  );
  if (firstUnsolved) return firstUnsolved.id;
  return mainProblems[0]?.id ?? problems[0]?.id ?? "001";
}

export function exportProgressJson(state: ProgressState): string {
  return JSON.stringify(state, null, 2);
}

export function importProgressJson(rawJson: string): ProgressState {
  const parsed: unknown = JSON.parse(rawJson);
  return validateAndNormalizeProgress(parsed);
}
