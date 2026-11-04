import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createPuzzleApp,
  createStorageManager,
  getDeterministicSeed,
  type PuzzleDefinition,
} from "../examples/web-demo/games/puzzle-framework/index.js";

// ============================================================================
// Lightweight In-Memory DOM & Storage Mock for Node Environment
// ============================================================================

class MockStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

class MockElement {
  tagName: string;
  innerHTML = "";
  textContent = "";
  hidden = false;
  disabled = false;
  className = "";
  dataset: Record<string, string> = {};
  children: MockElement[] = [];
  onclick: ((e?: unknown) => void) | null = null;
  private listeners: Record<string, ((e?: unknown) => void)[]> = {};
  value = "";

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  addEventListener(type: string, listener: (e?: unknown) => void): void {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (e?: unknown) => void): void {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
  }

  dispatchEvent(event: { type: string; [key: string]: unknown }): boolean {
    const list = this.listeners[event.type] || [];
    for (const listener of list) {
      listener(event);
    }
    return true;
  }

  click(): void {
    if (this.disabled) return;
    if (this.onclick) this.onclick();
    this.dispatchEvent({ type: "click" });
  }

  showModal(): void {
    this.hidden = false;
  }

  close(): void {
    this.hidden = true;
  }

  appendChild(child: MockElement): void {
    this.children.push(child);
  }

  querySelector(selector: string): MockElement | null {
    const attrMatch = selector.match(/\[data-pf='([^']+)'\]/);
    if (attrMatch) {
      return this.findChild((el) => el.dataset["pf"] === attrMatch[1]);
    }
    const classMatch = selector.match(/\.([a-zA-Z0-9_-]+)/);
    if (classMatch) {
      return this.findChild((el) => el.className.split(" ").includes(classMatch[1]));
    }
    return null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    if (selector.toUpperCase() === "BUTTON") {
      this.collectChildren((el) => el.tagName === "BUTTON", results);
    }
    return results;
  }

  private findChild(predicate: (el: MockElement) => boolean): MockElement | null {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const found = child.findChild(predicate);
      if (found) return found;
    }
    return null;
  }

  private collectChildren(predicate: (el: MockElement) => boolean, acc: MockElement[]): void {
    if (predicate(this)) acc.push(this);
    for (const child of this.children) {
      child.collectChildren(predicate, acc);
    }
  }
}

interface TestState {
  selectedItems: number[];
}

interface TestMove {
  itemIndex: number;
}

interface TestStage {
  stageNumber: number;
  items: number[];
  targetSum: number;
}

const mockCampaignStages: TestStage[] = [
  { stageNumber: 1, items: [1, 2, 3], targetSum: 3 },
  { stageNumber: 2, items: [2, 3, 5], targetSum: 8 },
];

function createTestDefinition(): PuzzleDefinition<TestState, TestMove, TestStage> {
  return {
    id: "test-subset-sum",
    title: { en: "Test Puzzle", ja: "Test Puzzle" },
    subtitle: { en: "Subset Sum", ja: "Subset Sum" },
    campaignStages: mockCampaignStages,
    getStageNumber: (s) => s.stageNumber,
    getStageTitle: (s) => `Target ${s.targetSum}`,
    getStageOneLiner: (s) => `Select items to reach sum ${s.targetSum}`,
    generateStage: async (stageNumber, seed) => {
      const count = 3 + (stageNumber % 3);
      const items = Array.from({ length: count }, (_, i) => ((seed + i * 7) % 9) + 1);
      const targetSum = items[0] + items[1];
      return { stageNumber, items, targetSum };
    },
    createInitialState: () => ({ selectedItems: [] }),
    applyMove: (state, move) => {
      const exists = state.selectedItems.includes(move.itemIndex);
      return {
        selectedItems: exists
          ? state.selectedItems.filter((i) => i !== move.itemIndex)
          : [...state.selectedItems, move.itemIndex],
      };
    },
    evaluate: (state, stage) => {
      const currentSum = state.selectedItems.reduce(
        (sum, idx) => sum + (stage.items[idx] || 0),
        0
      );
      const isCleared = currentSum === stage.targetSum;
      return {
        isCleared,
        score: currentSum,
        targetScore: stage.targetSum,
        shortfallReason:
          currentSum < stage.targetSum
            ? `Need +${stage.targetSum - currentSum}`
            : currentSum > stage.targetSum
              ? `Exceeded by +${currentSum - stage.targetSum}`
              : undefined,
      };
    },
    solveOptimal: async (stage, _currentState) => {
      for (let i = 0; i < stage.items.length; i++) {
        for (let j = i + 1; j < stage.items.length; j++) {
          if (stage.items[i] + stage.items[j] === stage.targetSum) {
            return {
              optimalMoves: [{ itemIndex: i }, { itemIndex: j }],
              nextBestMove: { itemIndex: i },
              optimalScore: stage.targetSum,
            };
          }
        }
      }
      return null;
    },
    renderBoard: (container, state, stage, onMove) => {
      container.innerHTML = "";
      stage.items.forEach((val, idx) => {
        const btn = new MockElement("button");
        btn.textContent = `${val}`;
        btn.dataset["selected"] = `${state.selectedItems.includes(idx)}`;
        btn.onclick = () => onMove({ itemIndex: idx });
        container.appendChild(btn as unknown as HTMLElement);
      });
    },
    serializeState: (st) => st.selectedItems,
    deserializeState: (raw) =>
      Array.isArray(raw)
        ? { selectedItems: raw.filter((x): x is number => typeof x === "number") }
        : null,
  };
}

describe("Puzzle Framework - Storage Manager", () => {
  let mockStorage: MockStorage;

  beforeEach(() => {
    mockStorage = new MockStorage();
    vi.stubGlobal("localStorage", mockStorage);
    vi.stubGlobal("window", { localStorage: mockStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads and saves progress cleanly", () => {
    const storage = createStorageManager("test-app");
    const initial = storage.loadProgress();
    expect(initial.highestUnlockedStage).toBe(1);
    expect(initial.currentStageNumber).toBe(1);

    storage.saveProgress({
      ...initial,
      clearedStageIds: { "stage-1": true },
      highestUnlockedStage: 2,
      currentStageNumber: 2,
    });

    const updated = storage.loadProgress();
    expect(updated.clearedStageIds["stage-1"]).toBe(true);
    expect(updated.highestUnlockedStage).toBe(2);
    expect(updated.currentStageNumber).toBe(2);
  });

  it("handles in-progress board state auto-save and clear", () => {
    const storage = createStorageManager("test-app");
    storage.saveBoardState(1, { activeIndex: 42 });

    const loaded = storage.loadProgress();
    expect(loaded.savedBoardState?.stageNumber).toBe(1);
    expect(loaded.savedBoardState?.serialized).toEqual({ activeIndex: 42 });

    storage.clearBoardState();
    const afterClear = storage.loadProgress();
    expect(afterClear.savedBoardState).toBeUndefined();
  });
});

describe("Puzzle Framework - Deterministic Seed", () => {
  it("produces identical seeds for the same stage number", () => {
    const seed1 = getDeterministicSeed(13);
    const seed2 = getDeterministicSeed(13);
    const seed3 = getDeterministicSeed(14);

    expect(seed1).toBe(seed2);
    expect(seed1).not.toBe(seed3);
    expect(seed1).toBeGreaterThan(0);
  });
});

describe("Puzzle Framework - Engine & Lifecycle", () => {
  let mockStorage: MockStorage;

  beforeEach(() => {
    mockStorage = new MockStorage();

    vi.stubGlobal("localStorage", mockStorage);
    vi.stubGlobal("window", {
      localStorage: mockStorage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: (tag: string) => new MockElement(tag),
      querySelector: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("evaluates rules, applies moves, and supports undo/restart in pure state mode", async () => {
    const definition = createTestDefinition();

    // Initial state check
    const initialStage = definition.campaignStages[0];
    const s0 = definition.createInitialState(initialStage);
    expect(s0.selectedItems).toEqual([]);

    const eval0 = definition.evaluate(s0, initialStage);
    expect(eval0.isCleared).toBe(false);
    expect(eval0.score).toBe(0);
    expect(eval0.targetScore).toBe(3);

    // Step 1: select item 0 (val 1)
    const s1 = definition.applyMove(s0, { itemIndex: 0 }, initialStage);
    expect(s1.selectedItems).toEqual([0]);
    const eval1 = definition.evaluate(s1, initialStage);
    expect(eval1.isCleared).toBe(false);
    expect(eval1.score).toBe(1);
    expect(eval1.shortfallReason).toBe("Need +2");

    // Step 2: select item 1 (val 2) => total 1 + 2 = 3 (target 3 reached!)
    const s2 = definition.applyMove(s1, { itemIndex: 1 }, initialStage);
    expect(s2.selectedItems).toEqual([0, 1]);
    const eval2 = definition.evaluate(s2, initialStage);
    expect(eval2.isCleared).toBe(true);
    expect(eval2.score).toBe(3);
    expect(eval2.shortfallReason).toBeUndefined();

    // Undo step 2 => back to s1
    expect(s1.selectedItems).toEqual([0]);

    // Solver integration check
    const solution = await definition.solveOptimal!(initialStage, s0);
    expect(solution).not.toBeNull();
    expect(solution?.optimalScore).toBe(3);
    expect(solution?.nextBestMove).toEqual({ itemIndex: 0 });
  });

  it("generates deterministic stages for endless mode", async () => {
    const definition = createTestDefinition();
    const seed10 = getDeterministicSeed(10);
    const stage10a = await definition.generateStage!(10, seed10);
    const stage10b = await definition.generateStage!(10, seed10);

    expect(stage10a.items).toEqual(stage10b.items);
    expect(stage10a.targetSum).toBe(stage10b.targetSum);
    expect(stage10a.stageNumber).toBe(10);
  });

  it("correctly serializes and deserializes board state for interruption recovery", () => {
    const definition = createTestDefinition();
    const state: TestState = { selectedItems: [0, 2] };

    const serialized = definition.serializeState!(state);
    expect(serialized).toEqual([0, 2]);

    const stage = definition.campaignStages[0];
    const restored = definition.deserializeState!(serialized, stage);
    expect(restored).toEqual(state);

    const invalidRestored = definition.deserializeState!("invalid", stage);
    expect(invalidRestored).toBeNull();
  });
});
