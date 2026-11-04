import type { GameLang } from "../i18n.js";
import { solveOptimalPasture, evaluatePasture } from "./solver.js";
import { TILE_META, type OptimalPastureResult, type StagePuzzle, type TileType } from "./types.js";
import enCatalog from "./locales/en.json";
import jaCatalog from "./locales/ja.json";
import zhCatalog from "./locales/zh.json";

const STAGE_CATALOGS: Record<GameLang, typeof enCatalog> = {
  en: enCatalog,
  ja: jaCatalog,
  zh: zhCatalog,
};

/**
 * Compact stage DSL legend:
 * - '.' : grass (+1)
 * - 'I' : strawberry (+5)
 * - 'P' : pit (-5)
 * - 'B' : bridge (+1, passable, cannot place fence)
 * - '~' : water (impassable)
 * - 'R' : rock (impassable)
 * - 'S' : sheep (+2, start)
 * - 'W' : wolf (0, hazard start)
 */
const CHAR_TO_TILE: Record<string, TileType> = {
  ".": "grass",
  I: "strawberry",
  P: "pit",
  B: "bridge",
  "~": "water",
  R: "rock",
  S: "sheep",
  W: "wolf",
};

export function parseGrid(rows: readonly string[]): TileType[][] {
  return rows.map((rowStr, rIdx) => {
    const chars = rowStr.trim().split(/\s+/);
    return chars.map((ch, cIdx) => {
      const tile = CHAR_TO_TILE[ch];
      if (!tile) {
        throw new Error(`Unknown tile code "${ch}" at (${rIdx}, ${cIdx})`);
      }
      return tile;
    });
  });
}

export const CAMPAIGN_STAGES: readonly StagePuzzle[] = [
  // ===========================================================================
  // Chapter 1: Introduction to rules on small boards (Stages 1-4: 3x4 / 3x5 / 4x5)
  // ===========================================================================

  // Stage
  {
    id: "stage-1",
    stageNumber: 1,
    title: "First Fence",
    oneLiner: "Tap a cell to place a fence and protect 🐑 from 🐺",
    maxFences: 1,
    targetScore: 7,
    grid: parseGrid([
      "R R R R",
      "W . S I",
      "R R R R",
    ]),
  },
  // Stage
  {
    id: "stage-2",
    stageNumber: 2,
    title: "Strawberry Hill",
    oneLiner: "Blocking right next to 🐑 misses the 🍓. Block closer to 🐺 to reach the target score",
    maxFences: 1,
    targetScore: 8,
    grid: parseGrid([
      "~ ~ ~ ~ ~",
      "W . I . S",
      "~ ~ ~ ~ ~",
    ]),
  },
  // Stage
  {
    id: "stage-3",
    stageNumber: 3,
    title: "Stone Bridge Rule",
    oneLiner: "You cannot place fences on stone bridges 🌉. Cross the bridge to claim the southwest 🍓",
    maxFences: 1,
    targetScore: 24,
    grid: parseGrid([
      "W . ~ I S",
      "~ B . . .",
      "~ I ~ . I",
      "~ ~ ~ . .",
    ]),
  },
  // Stage
  {
    id: "stage-4",
    stageNumber: 4,
    title: "Plugging the Pitfall",
    oneLiner: "Leaving a pitfall 🕳️ (-5 pt) inside the pasture lowers your score. Drive a wooden fence right into 🕳️ to plug it",
    maxFences: 2,
    targetScore: 16,
    grid: parseGrid([
      "W . ~ S I",
      "~ . . . .",
      "~ ~ ~ P I",
      "~ ~ ~ ~ ~",
    ]),
  },

  // ===========================================================================
  // Chapter 2: Applied mechanics and twists (Stages 5-8: 5x5 / 5x6)
  // ===========================================================================

  // Stage
  {
    id: "stage-5",
    stageNumber: 5,
    title: "Beyond the Bridges",
    oneLiner: "Merely blocking near 🐑 falls short of the target. Push your fences up to the two bridge exits",
    maxFences: 2,
    targetScore: 27,
    grid: parseGrid([
      "W B . ~ I",
      "B ~ . . .",
      ". . R . S",
      "~ . . R .",
      "~ I . . I",
    ]),
  },
  // Stage
  {
    id: "stage-6",
    stageNumber: 6,
    title: "Two Birds with One Post",
    oneLiner: "Driving a fence directly into 🕳️ (-5) plugs the pit and blocks 🐺 at the same time",
    maxFences: 2,
    targetScore: 26,
    grid: parseGrid([
      "W B . ~ I",
      "B . P . .",
      ". ~ R . S",
      ". . B R .",
      "~ I . . I",
    ]),
  },
  // Stage
  {
    id: "stage-7",
    stageNumber: 7,
    title: "Beyond the Pitfall",
    oneLiner: "Plugging the east 🕳️ (-5) cuts off the 🍓 orchard behind it. Leave the path open to claim the orchard",
    maxFences: 3,
    targetScore: 26,
    grid: parseGrid([
      "W B . . ~ I",
      "~ ~ R . ~ I",
      "~ I . S P I",
      "~ ~ R . ~ .",
      "W B . I ~ W",
    ]),
  },
  // Stage
  {
    id: "stage-8",
    stageNumber: 8,
    title: "Decoy Strawberry",
    oneLiner: "Chasing the nearby 🍓 runs out of fences. Seal the west with 1 fence and expand the east orchard",
    maxFences: 3,
    targetScore: 20,
    grid: parseGrid([
      "W B . ~ I I",
      "B . . ~ . .",
      "R I . S . I",
      "B . . R . .",
      "W B . ~ B W",
    ]),
  },

  // ===========================================================================
  // Chapter 3: Broader pastures (Stages 9-12: 6x6 / 6x7 / 7x7)
  // ===========================================================================

  // Stage
  {
    id: "stage-9",
    stageNumber: 9,
    title: "Two Sheep Reunion",
    oneLiner: "Enclosing the two 🐑 separately falls short. Connect them through the central corridor",
    maxFences: 3,
    targetScore: 27,
    grid: parseGrid([
      "W B . ~ I .",
      "B . . . S .",
      "~ . R B R ~",
      "I R B R . I",
      ". S . . . B",
      "~ I ~ . B W",
    ]),
  },
  // Stage
  {
    id: "stage-10",
    stageNumber: 10,
    title: "Pitfall Hill Triage",
    oneLiner: "Three 🕳️ (-5) dot the hill. Decide which pits to plug directly with a post and which to wall off",
    maxFences: 4,
    targetScore: 25,
    grid: parseGrid([
      "W B . ~ I .",
      "B . P . . I",
      "I . R S R ~",
      "~ R . . P I",
      "B . B ~ . .",
      "W B . ~ P I",
    ]),
  },
  // Stage
  {
    id: "stage-11",
    stageNumber: 11,
    title: "Three-Way Siege",
    oneLiner: "Three 🐺 approach across stone bridges. Find the largest orchard you can protect with 4 fences",
    maxFences: 4,
    targetScore: 28,
    grid: parseGrid([
      "W B . ~ I . W",
      "B . . . ~ . B",
      "I . R S . P .",
      "~ R . B R . I",
      "B . . S ~ . .",
      "W B ~ I . I ~",
    ]),
  },
  // Stage
  {
    id: "stage-12",
    stageNumber: 12,
    title: "Golden Meadow",
    oneLiner: "Use all 5 fences wisely to complete the highest-scoring golden pasture",
    maxFences: 5,
    targetScore: 28,
    grid: parseGrid([
      "W B . ~ I . W",
      "B . . I R ~ B",
      "I . R S I P .",
      "~ . B R B . I",
      "I P . S I . ~",
      "B ~ R I . . B",
      "W . I ~ I B W",
    ]),
  },
];

export function getStageTitleByNumber(stageNumber: number, lang: GameLang = "en"): string {
  const catalog = STAGE_CATALOGS[lang] ?? STAGE_CATALOGS.en;
  if (stageNumber >= 1 && stageNumber <= CAMPAIGN_STAGES.length) {
    const st = CAMPAIGN_STAGES[stageNumber - 1];
    return (catalog.stages as Record<string, { title: string; oneLiner: string }>)[st.id]?.title ?? st.title;
  }
  const themeIdx =
    Math.abs(stageNumber - (CAMPAIGN_STAGES.length + 1)) % catalog.themes.length;
  return catalog.themes[themeIdx] ?? CAMPAIGN_STAGES[0].title;
}

export function getLocalizedStageText(
  stage: StagePuzzle,
  lang: GameLang = "en"
): { title: string; oneLiner: string } {
  const catalog = STAGE_CATALOGS[lang] ?? STAGE_CATALOGS.en;
  const entry = (catalog.stages as Record<string, { title: string; oneLiner: string }>)[stage.id];
  if (entry) {
    return { title: entry.title, oneLiner: entry.oneLiner };
  }
  return {
    title: getStageTitleByNumber(stage.stageNumber, lang),
    oneLiner: catalog.stageDefaultOneLiner
      .replace("{n}", String(stage.maxFences))
      .replace("{target}", String(stage.targetScore)),
  };
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StageDifficultySpec {
  rows: number;
  cols: number;
  wolfCount: number;
  sheepCount: number;
  maxFences: number;
}

/**
 * Progressive level scaling schedule:
 * Rises smoothly from Stage 13 (7x7) through 8x8 and 9x9 up to the 10x10 cap (8-10 fences, 4 wolves).
 */
export function getDifficultySpecForStage(stageNumber: number): StageDifficultySpec {
  if (stageNumber <= 15) {
    return {
      rows: 7,
      cols: 7,
      wolfCount: stageNumber === 13 ? 3 : 4,
      sheepCount: 2,
      maxFences: stageNumber === 13 ? 5 : 6,
    };
  }
  if (stageNumber <= 18) {
    return {
      rows: 7,
      cols: 8,
      wolfCount: 4,
      sheepCount: 2,
      maxFences: 6,
    };
  }
  if (stageNumber <= 21) {
    return {
      rows: 8,
      cols: 8,
      wolfCount: 4,
      sheepCount: stageNumber >= 20 ? 3 : 2,
      maxFences: stageNumber === 19 ? 6 : 7,
    };
  }
  if (stageNumber <= 24) {
    return {
      rows: 8,
      cols: 9,
      wolfCount: 4,
      sheepCount: 3,
      maxFences: stageNumber === 22 ? 7 : 8,
    };
  }
  if (stageNumber <= 27) {
    return {
      rows: 9,
      cols: 9,
      wolfCount: 4,
      sheepCount: 3,
      maxFences: 8,
    };
  }
  if (stageNumber <= 30) {
    return {
      rows: 9,
      cols: 10,
      wolfCount: 4,
      sheepCount: 3,
      maxFences: stageNumber === 28 ? 8 : 9,
    };
  }
  return {
    rows: 10,
    cols: 10,
    wolfCount: 4,
    sheepCount: 3,
    maxFences: 8 + (stageNumber % 3), // 8, 9, or 10 fences
  };
}

/**
 * Derives a deterministic 32-bit seed from a stage number so that every generated stage
 * has a fixed layout that the player can revisit at any time.
 */
export function getSeedForStageNumber(stageNumber: number): number {
  return (Math.imul(stageNumber >>> 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
}

const generatedStageCache = new Map<
  number,
  { stage: StagePuzzle; optimal: OptimalPastureResult | null }
>();

const inFlightStagePromises = new Map<number, Promise<StagePuzzle>>();

interface WolfSpawnSlot {
  wolf: [number, number];
  bridges: [number, number][];
}

function getCandidateWolfSpawnSlots(rows: number, cols: number): WolfSpawnSlot[] {
  const slots: WolfSpawnSlot[] = [];

  const addSlot = (r: number, c: number) => {
    const bridges: [number, number][] = [];
    const deltas = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    for (const [dr, dc] of deltas) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        bridges.push([nr, nc]);
      }
    }
    slots.push({ wolf: [r, c], bridges });
  };

  // 1. Four corners
  addSlot(0, 0);
  addSlot(0, cols - 1);
  addSlot(rows - 1, 0);
  addSlot(rows - 1, cols - 1);

  // 2. Top and bottom edges (non-corner)
  const midC = Math.floor(cols / 2);
  addSlot(0, midC);
  addSlot(rows - 1, midC);

  if (cols >= 8) {
    const q1C = Math.floor(cols / 3);
    const q2C = cols - 1 - q1C;
    if (q1C > 1 && q1C !== midC) {
      addSlot(0, q1C);
      addSlot(rows - 1, q1C);
    }
    if (q2C < cols - 2 && q2C !== midC && q2C !== q1C) {
      addSlot(0, q2C);
      addSlot(rows - 1, q2C);
    }
  }

  // 3. Left and right edges (non-corner)
  const midR = Math.floor(rows / 2);
  addSlot(midR, 0);
  addSlot(midR, cols - 1);

  if (rows >= 8) {
    const q1R = Math.floor(rows / 3);
    const q2R = rows - 1 - q1R;
    if (q1R > 1 && q1R !== midR) {
      addSlot(q1R, 0);
      addSlot(q1R, cols - 1);
    }
    if (q2R < rows - 2 && q2R !== midR && q2R !== q1R) {
      addSlot(q2R, 0);
      addSlot(q2R, cols - 1);
    }
  }

  return slots;
}

/**
 * Generates a deterministic puzzle board for a given `stageNumber` (or seed) and verifies with HiGHS that:
 * 1. Without fences, the wolves can reach the sheep.
 * 2. Wolves have adjacent stone bridges so trivial 1-fence spawn caging is prevented.
 * 3. With `maxFences`, HiGHS finds a proven Optimal solution and sets `targetScore = optimalScore`.
 */
export async function generateVerifiedPastureStage(
  stageNumberOrSeed = CAMPAIGN_STAGES.length + 1
): Promise<StagePuzzle> {
  const stageNumber = Math.max(CAMPAIGN_STAGES.length + 1, Math.floor(stageNumberOrSeed));
  const cached = generatedStageCache.get(stageNumber);
  if (cached) {
    return cached.stage;
  }

  const inFlight = inFlightStagePromises.get(stageNumber);
  if (inFlight) {
    return inFlight;
  }

  const generationPromise = (async (): Promise<StagePuzzle> => {
    const spec = getDifficultySpecForStage(stageNumber);
    const { rows, cols, wolfCount, sheepCount } = spec;
    const baseSeed = getSeedForStageNumber(stageNumber);
    const themeIdx =
      Math.abs(stageNumber - (CAMPAIGN_STAGES.length + 1)) % STAGE_CATALOGS.en.themes.length;
    const themeName = STAGE_CATALOGS.en.themes[themeIdx] ?? "Highland Pasture";

    const centerR = (rows - 1) / 2;
    const centerC = (cols - 1) / 2;

    for (let attempt = 0; attempt < 36; attempt++) {
      const rng = createRng(baseSeed + attempt * 9973);
      const grid: TileType[][] = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => "grass" as TileType)
      );

      // 1. Place sheep near the center region
      const midR = Math.floor(rows / 2) - 1;
      const midC = Math.floor(cols / 2) - 1;
      const candidateSheepSpots: [number, number][] = [
        [midR, midC],
        [midR + 1, midC + 1],
        [midR, midC + 1],
        [midR + 1, midC],
      ];
      for (let i = candidateSheepSpots.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = candidateSheepSpots[i];
        candidateSheepSpots[i] = candidateSheepSpots[j];
        candidateSheepSpots[j] = tmp;
      }
      for (let s = 0; s < Math.min(sheepCount, candidateSheepSpots.length); s++) {
        const [sr, sc] = candidateSheepSpots[s];
        grid[sr][sc] = "sheep";
      }

      // 2. Place wolves across diverse perimeter positions (edges & corners) with adjacent stone bridges
      const candidateSlots = getCandidateWolfSpawnSlots(rows, cols);
      for (let i = candidateSlots.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = candidateSlots[i];
        candidateSlots[i] = candidateSlots[j];
        candidateSlots[j] = tmp;
      }

      const activeSlots: WolfSpawnSlot[] = [];
      for (const slot of candidateSlots) {
        if (activeSlots.length >= wolfCount) break;
        const [wr, wc] = slot.wolf;
        const tooClose = activeSlots.some(
          (s) => Math.abs(s.wolf[0] - wr) + Math.abs(s.wolf[1] - wc) < 3
        );
        if (!tooClose) {
          activeSlots.push(slot);
        }
      }
      if (activeSlots.length < wolfCount) {
        for (const slot of candidateSlots) {
          if (activeSlots.length >= wolfCount) break;
          if (!activeSlots.includes(slot)) {
            activeSlots.push(slot);
          }
        }
      }

      for (const slot of activeSlots) {
        grid[slot.wolf[0]][slot.wolf[1]] = "wolf";
        for (const [br, bc] of slot.bridges) {
          if (grid[br]?.[bc] === "grass") {
            grid[br][bc] = "bridge";
          }
        }
      }

      // 3. Sprinkle natural rock/water maze formations, bridges, strawberries, and pitfalls
      const isLarge = rows >= 8 || cols >= 8;
      const waterCut = isLarge ? 0.21 : 0.17;
      const rockCut = isLarge ? 0.37 : 0.29;
      const bridgeCut = isLarge ? 0.43 : 0.36;
      const strawberryCut = isLarge ? 0.61 : 0.53;
      const pitCut = isLarge ? 0.72 : 0.64;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (grid[r][c] !== "grass") continue;
          const distCenter = Math.abs(r - centerR) + Math.abs(c - centerC);
          const roll = rng();
          if (distCenter >= 1.8 && roll < waterCut) {
            grid[r][c] = "water";
          } else if (distCenter >= 1.8 && roll < rockCut) {
            grid[r][c] = "rock";
          } else if (roll < bridgeCut) {
            grid[r][c] = "bridge";
          } else if (roll < strawberryCut) {
            grid[r][c] = "strawberry";
          } else if (roll < pitCut) {
            grid[r][c] = "pit";
          }
        }
      }

      const candidate: StagePuzzle = {
        id: `stage-${stageNumber}`,
        stageNumber,
        title: themeName,
        oneLiner: `Protect 🐑 from 🐺 with ${spec.maxFences} fences and reach target score`,
        maxFences: spec.maxFences,
        targetScore: 20,
        grid,
      };

      const emptyEval = evaluatePasture(
        candidate,
        Array.from({ length: rows }, () => Array.from({ length: cols }, () => false))
      );
      if (emptyEval.isSafe) continue;
      if (emptyEval.pastureTileCount < 14) continue;

      const solved = await solveOptimalPasture(candidate);
      const minRequiredFences = Math.max(3, Math.min(5, spec.maxFences - 2));
      if (
        solved.status === "Optimal" &&
        solved.verified &&
        solved.optimalFenceCount >= minRequiredFences &&
        solved.optimalEvaluation.pastureTileCount >= 8 &&
        solved.optimalScore >= 20
      ) {
        candidate.maxFences = solved.optimalFenceCount;
        candidate.targetScore = solved.optimalScore;
        candidate.oneLiner = `Protect 🐑 from 🐺 with ${candidate.maxFences} fences and reach target score ${candidate.targetScore} pt`;
        generatedStageCache.set(stageNumber, { stage: candidate, optimal: solved });
        return candidate;
      }
    }

    const fallback: StagePuzzle = {
      ...CAMPAIGN_STAGES[CAMPAIGN_STAGES.length - 1],
      id: `stage-${stageNumber}`,
      stageNumber,
      title: themeName,
    };
    const fallbackSolved = await solveOptimalPasture(fallback);
    const verifiedFallbackOpt =
      fallbackSolved.status === "Optimal" && fallbackSolved.verified
        ? fallbackSolved
        : null;
    generatedStageCache.set(stageNumber, {
      stage: fallback,
      optimal: verifiedFallbackOpt,
    });
    return fallback;
  })();

  inFlightStagePromises.set(stageNumber, generationPromise);
  try {
    return await generationPromise;
  } finally {
    inFlightStagePromises.delete(stageNumber);
  }
}

export async function getStageByNumber(
  stageNumber: number
): Promise<{ stage: StagePuzzle; precomputedOptimal: OptimalPastureResult | null }> {
  const num = Math.max(1, Math.floor(stageNumber));
  if (num <= CAMPAIGN_STAGES.length) {
    return { stage: CAMPAIGN_STAGES[num - 1], precomputedOptimal: null };
  }
  const stage = await generateVerifiedPastureStage(num);
  const cached = generatedStageCache.get(num);
  return { stage, precomputedOptimal: cached?.optimal ?? null };
}

export function countStageTiles(stage: StagePuzzle): Record<TileType, number> {
  const counts: Record<TileType, number> = {
    grass: 0,
    strawberry: 0,
    pit: 0,
    bridge: 0,
    water: 0,
    rock: 0,
    sheep: 0,
    wolf: 0,
  };
  for (const row of stage.grid) {
    for (const tile of row) {
      if (TILE_META[tile]) {
        counts[tile]++;
      }
    }
  }
  return counts;
}
