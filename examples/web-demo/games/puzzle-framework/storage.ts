import type { PuzzleAppProgress } from "./types.js";

export interface StorageManager {
  loadProgress: () => PuzzleAppProgress;
  saveProgress: (progress: PuzzleAppProgress) => void;
  saveBoardState: (stageNumber: number, state: unknown) => void;
  clearBoardState: () => void;
  resetAll: () => void;
}

export function createStorageManager(gameId: string): StorageManager {
  const STORAGE_KEY = `washi_puzzle_${gameId}_progress_v1`;
  let memoryFallback: PuzzleAppProgress = {
    clearedStageIds: {},
    stageStars: {},
    stageBestScores: {},
    highestUnlockedStage: 1,
    currentStageNumber: 1,
  };

  const getLocalStorage = (): Storage | null => {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    try {
      const testKey = `__washi_test_${Math.random()}__`;
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch {
      return null;
    }
  };

  const loadProgress = (): PuzzleAppProgress => {
    const ls = getLocalStorage();
    if (!ls) return { ...memoryFallback };

    try {
      const raw = ls.getItem(STORAGE_KEY);
      if (!raw) return { ...memoryFallback };
      const parsed = JSON.parse(raw) as Partial<PuzzleAppProgress>;
      return {
        clearedStageIds: parsed.clearedStageIds ?? {},
        stageStars: parsed.stageStars ?? {},
        stageBestScores: parsed.stageBestScores ?? {},
        highestUnlockedStage: Math.max(1, parsed.highestUnlockedStage ?? 1),
        currentStageNumber: Math.max(1, parsed.currentStageNumber ?? 1),
        savedBoardState: parsed.savedBoardState,
      };
    } catch {
      return { ...memoryFallback };
    }
  };

  const saveProgress = (progress: PuzzleAppProgress): void => {
    memoryFallback = { ...progress };
    const ls = getLocalStorage();
    if (!ls) return;

    try {
      ls.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // Ignore quota exceeded or storage failure
    }
  };

  const saveBoardState = (stageNumber: number, state: unknown): void => {
    const current = loadProgress();
    current.savedBoardState = {
      stageNumber,
      serialized: state,
    };
    saveProgress(current);
  };

  const clearBoardState = (): void => {
    const current = loadProgress();
    delete current.savedBoardState;
    saveProgress(current);
  };

  const resetAll = (): void => {
    memoryFallback = {
      clearedStageIds: {},
      stageStars: {},
      stageBestScores: {},
      highestUnlockedStage: 1,
      currentStageNumber: 1,
    };
    const ls = getLocalStorage();
    if (ls) {
      try {
        ls.removeItem(STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
  };

  return {
    loadProgress,
    saveProgress,
    saveBoardState,
    clearBoardState,
    resetAll,
  };
}
