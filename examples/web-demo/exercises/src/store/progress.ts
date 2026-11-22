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

// Exercises whose v1 schemas/problem definitions were redesigned in v2:
// invalidate legacy v1 solved badges and drafts so returning users are not
// shown stale starter/solution code or unearned solved badges.
const V1_TO_V2_RESET_IDS = new Set(["001", "002"]);

// Exercises whose schemas were replaced in v3 (migrating from v1 or v2):
const V2_TO_V3_RESET_IDS = new Set(["003"]);

export interface ProgressState {
  version: 3;
  solved: Record<string, SolvedEntry>;
  drafts: Record<string, DraftEntry>;
  tutorialDismissed?: boolean;
}

export function createEmptyProgress(): ProgressState {
  return {
    version: 3,
    solved: {},
    drafts: {},
    tutorialDismissed: false,
  };
}

function isValidRuntime(v: unknown): v is RuntimeId {
  return v === "washi" || v === "highspy";
}

function normalizeProgress(raw: unknown): { state: ProgressState; migrated: boolean } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Invalid progress JSON: expected an object.");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1 && obj.version !== 2 && obj.version !== 3) {
    throw new Error(`Unsupported progress version: ${String(obj.version)}.`);
  }
  const migratingFromV1 = obj.version === 1;
  const migratingFromPreV3 = obj.version === 1 || obj.version === 2;
  const shouldResetId = (id: string): boolean =>
    (migratingFromV1 && V1_TO_V2_RESET_IDS.has(id)) ||
    (migratingFromPreV3 && V2_TO_V3_RESET_IDS.has(id));
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
    if (shouldResetId(id)) {
      continue;
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
      if (shouldResetId(id)) {
        continue;
      }
      if (draft.washi !== undefined || draft.highspy !== undefined) {
        drafts[id] = draft;
      }
    }
  }

  return {
    state: {
      version: 3,
      solved,
      drafts,
      ...(obj.tutorialDismissed === true ? { tutorialDismissed: true } : { tutorialDismissed: false }),
    },
    migrated: migratingFromPreV3,
  };
}

export function loadProgress(
  storage?: (Pick<Storage, "getItem"> & Partial<Pick<Storage, "setItem">>) | null
): ProgressState {
  try {
    const targetStorage =
      storage !== undefined ? storage : typeof window !== "undefined" ? window.localStorage : null;
    if (!targetStorage) return createEmptyProgress();
    const raw = targetStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return createEmptyProgress();
    const { state, migrated } = normalizeProgress(JSON.parse(raw));
    if (migrated && typeof targetStorage.setItem === "function") {
      saveProgress(state, { setItem: targetStorage.setItem.bind(targetStorage) });
    }
    return state;
  } catch {
    return createEmptyProgress();
  }
}

export function saveProgress(
  state: ProgressState,
  storage?: Pick<Storage, "setItem"> | null
): void {
  try {
    const targetStorage =
      storage !== undefined ? storage : typeof window !== "undefined" ? window.localStorage : null;
    if (!targetStorage) return;
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

export function clearSolvedProblem(state: ProgressState, problemId: string): ProgressState {
  if (!(problemId in state.solved)) return state;
  const nextSolved = { ...state.solved };
  delete nextSolved[problemId];
  return {
    ...state,
    solved: nextSolved,
  };
}

export function clearAllSolved(state: ProgressState): ProgressState {
  if (Object.keys(state.solved).length === 0) return state;
  return {
    ...state,
    solved: {},
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

export function isProblemSolved(state: ProgressState, problemId: string): boolean {
  return (state.solved[problemId]?.runtimes.length ?? 0) > 0;
}

export function getSolvedRuntimeCount(state: ProgressState, problemId: string): 0 | 1 | 2 {
  const count = state.solved[problemId]?.runtimes.length ?? 0;
  if (count >= 2) return 2;
  if (count === 1) return 1;
  return 0;
}

export function totalRuntimePasses(
  state: ProgressState,
  problems: ReadonlyArray<{ id: string; chapter: number }>
): number {
  let total = 0;
  for (const p of problems) {
    if (p.chapter <= 0) continue;
    total += getSolvedRuntimeCount(state, p.id);
  }
  return total;
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
  return normalizeProgress(parsed).state;
}
