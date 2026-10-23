import type { GameLang } from "../i18n.js";
import { solveOptimalPasture, evaluatePasture } from "./solver.js";
import { TILE_META, type StagePuzzle, type TileType } from "./types.js";

/**
 * Compact stage DSL legend:
 * - '.' : grass (+1)
 * - 'I' : strawberry (+5)
 * - 'M' : mushroom (-5)
 * - 'B' : bridge (+1, passable, cannot place fence)
 * - '~' : water (impassable)
 * - 'R' : rock (impassable)
 * - 'S' : sheep (+2, start)
 * - 'W' : wolf (0, hazard start)
 */
const CHAR_TO_TILE: Record<string, TileType> = {
  ".": "grass",
  I: "strawberry",
  M: "mushroom",
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
  // Chapter 1: ちっちゃな盤面でルールを知る導入（Stage 1〜4: 3x4 / 3x5 / 4x5）
  // ===========================================================================

  // Stage 1 [Introduce: 柵を置く / 3x4・柵1本]
  {
    id: "stage-1",
    stageNumber: 1,
    title: "はじめての柵",
    oneLiner: "マスをタップして柵🪵を置き、🐺から🐑を守ろう",
    maxFences: 1,
    targetScore: 7,
    grid: parseGrid([
      "R R R R",
      "W . S I",
      "R R R R",
    ]),
  },
  // Stage 2 [Introduce: 目標スコアと広さ / 3x5・柵1本]
  {
    id: "stage-2",
    stageNumber: 2,
    title: "いちごの丘",
    oneLiner: "🐑のすぐ隣で塞ぐと🍓に届かない。🐺の近くで塞いで目標スコアを達成しよう",
    maxFences: 1,
    targetScore: 8,
    grid: parseGrid([
      "~ ~ ~ ~ ~",
      "W . I . S",
      "~ ~ ~ ~ ~",
    ]),
  },
  // Stage 3 [Introduce: 石橋 🌉 / 4x5・柵1本]
  {
    id: "stage-3",
    stageNumber: 3,
    title: "石橋のルール",
    oneLiner: "🌉石橋の上には柵を置けないよ。橋を渡って南西の🍓も回収しよう",
    maxFences: 1,
    targetScore: 24,
    grid: parseGrid([
      "W . ~ I S",
      "~ B . . .",
      "~ I ~ . I",
      "~ ~ ~ . .",
    ]),
  },
  // Stage 4 [Introduce: どくキノコ 🍄 / 4x5・柵2本]
  {
    id: "stage-4",
    stageNumber: 4,
    title: "どくキノコ退治",
    oneLiner: "🍄(-5点)がまきばに入ると減点になるよ。🍄の真上に柵🪵を置いて毒を消そう",
    maxFences: 2,
    targetScore: 16,
    grid: parseGrid([
      "W . ~ S I",
      "~ . . . .",
      "~ ~ ~ M I",
      "~ ~ ~ ~ ~",
    ]),
  },

  // ===========================================================================
  // Chapter 2: 応用とひねり（Stage 5〜8: 5x5 / 5x6）
  // ===========================================================================

  // Stage 5 [Develop: 2つの石橋ルート / 5x5・柵2本]
  {
    id: "stage-5",
    stageNumber: 5,
    title: "石橋のむこう側",
    oneLiner: "ただ守るだけでは目標に届かないよ。2つの橋の出口まで柵を押し上げよう",
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
  // Stage 6 [Twist: 一石二鳥のキノコ潰し / 5x5・柵2本]
  {
    id: "stage-6",
    stageNumber: 6,
    title: "一石二鳥の柵",
    oneLiner: "🍄(-5)の上に直接柵🪵を置けば、🐺の侵入阻止と毒消しを同時に達成できるよ",
    maxFences: 2,
    targetScore: 26,
    grid: parseGrid([
      "W B . ~ I",
      "B . M . .",
      ". ~ R . S",
      ". . B R .",
      "~ I . . I",
    ]),
  },
  // Stage 7 [Twist: 毒を喰らわば皿まで / 5x6・柵3本]
  {
    id: "stage-7",
    stageNumber: 7,
    title: "毒を喰らわば皿まで",
    oneLiner: "東の🍄(-5)を柵で潰すと奥の🍓畑に届かない。あえて毒を通す逆転の発想で挑もう",
    maxFences: 3,
    targetScore: 26,
    grid: parseGrid([
      "W B . . ~ I",
      "~ ~ R . ~ I",
      "~ I . S M I",
      "~ ~ R . ~ .",
      "W B . I ~ W",
    ]),
  },
  // Stage 8 [Twist: おとりの野いちご / 5x6・柵3本]
  {
    id: "stage-8",
    stageNumber: 8,
    title: "おとりの野いちご",
    oneLiner: "すぐ隣の🍓に飛びつくと柵が足りなくなるよ。西を1本で切って東の果樹園を広げよう",
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
  // Chapter 3: 本格パズル＆総決算（Stage 9〜12: 6x6 / 6x7 / 7x7）
  // ===========================================================================

  // Stage 9 [Develop: 2匹のヒツジの合流 / 6x6・柵3本]
  {
    id: "stage-9",
    stageNumber: 9,
    title: "ふたりの合流作戦",
    oneLiner: "2匹の🐑を別々に囲うと目標に届かない。中央の回廊でひとつの牧場につなごう",
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
  // Stage 10 [Develop: キノコの森の選別 / 6x6・柵4本]
  {
    id: "stage-10",
    stageNumber: 10,
    title: "キノコの森の選別",
    oneLiner: "3つの🍄(-5)がある森。柵で潰すキノコと、切り離すキノコを見極めよう",
    maxFences: 4,
    targetScore: 25,
    grid: parseGrid([
      "W B . ~ I .",
      "B . M . . I",
      "I . R S R ~",
      "~ R . . M I",
      "B . B ~ . .",
      "W B . ~ M I",
    ]),
  },
  // Stage 11 [Develop: 三方からの包囲網 / 6x7・柵4本]
  {
    id: "stage-11",
    stageNumber: 11,
    title: "三方からの包囲網",
    oneLiner: "3匹の🐺が石橋から迫る。4本の柵で守れる最大の果樹園を見つけ出そう",
    maxFences: 4,
    targetScore: 28,
    grid: parseGrid([
      "W B . ~ I . W",
      "B . . . ~ . B",
      "I . R S . M .",
      "~ R . B R . I",
      "B . . S ~ . .",
      "W B ~ I . I ~",
    ]),
  },
  // Stage 12 [Conclude: 最終問題・黄金のまきば / 7x7・柵5本]
  {
    id: "stage-12",
    stageNumber: 12,
    title: "黄金のまきば",
    oneLiner: "最終問題。5本の柵すべてを使い切り、満点の黄金牧場を完成させよう",
    maxFences: 5,
    targetScore: 28,
    grid: parseGrid([
      "W B . ~ I . W",
      "B . . I R ~ B",
      "I . R S I M .",
      "~ . B R B . I",
      "I M . S I . ~",
      "B ~ R I . . B",
      "W . I ~ I B W",
    ]),
  },
];

const STAGE_I18N: Record<
  string,
  { en: { title: string; oneLiner: string }; zh: { title: string; oneLiner: string } }
> = {
  "stage-1": {
    en: {
      title: "First Fence",
      oneLiner: "Tap a cell to place a fence 🪵 and protect 🐑 from 🐺",
    },
    zh: {
      title: "第一道栅栏",
      oneLiner: "点击格子放置栅栏🪵，保护🐑免受🐺袭击",
    },
  },
  "stage-2": {
    en: {
      title: "Strawberry Hill",
      oneLiner: "Blocking right next to 🐑 misses the 🍓. Block closer to 🐺 to reach the target score",
    },
    zh: {
      title: "草莓山丘",
      oneLiner: "如果在🐑旁边封堵就会漏掉🍓。在靠近🐺的位置设栏以达成目标分数吧",
    },
  },
  "stage-3": {
    en: {
      title: "Stone Bridge Rule",
      oneLiner: "You cannot place fences on stone bridges 🌉. Cross the bridge to claim the southwest 🍓",
    },
    zh: {
      title: "石桥的规则",
      oneLiner: "🌉石桥上不能放置栅栏。跨过石桥把西南方的🍓也纳入牧场吧",
    },
  },
  "stage-4": {
    en: {
      title: "Clearing Poison Mushrooms",
      oneLiner: "Enclosing a 🍄 (-5 pt) lowers your score. Place a fence 🪵 directly on 🍄 to crush it",
    },
    zh: {
      title: "清除毒蘑菇",
      oneLiner: "若将🍄(-5分)圈入牧场会扣分。直接在🍄正上方放置栅栏🪵即可将其消除",
    },
  },
  "stage-5": {
    en: {
      title: "Beyond the Bridges",
      oneLiner: "Merely blocking near 🐑 falls short of the target. Push your fences up to the two bridge exits",
    },
    zh: {
      title: "石桥彼端",
      oneLiner: "仅仅守在附近无法达到目标分数。把防线推进到两座石桥的出口吧",
    },
  },
  "stage-6": {
    en: {
      title: "Two Birds with One Fence",
      oneLiner: "Placing a fence 🪵 directly on 🍄 (-5) blocks 🐺 and removes the poison at the same time",
    },
    zh: {
      title: "一举两得的栅栏",
      oneLiner: "直接把栅栏🪵放在🍄(-5)上，就能同时阻挡🐺并消除毒蘑菇",
    },
  },
  "stage-7": {
    en: {
      title: "Through the Poison",
      oneLiner: "Crushing the east 🍄 (-5) cuts off the 🍓 orchard behind it. Dare to walk through the poison",
    },
    zh: {
      title: "舍小取大",
      oneLiner: "如果用栅栏压掉东侧的🍄(-5)，就拿不到深处的🍓田。试着保留通道穿过它吧",
    },
  },
  "stage-8": {
    en: {
      title: "Decoy Strawberry",
      oneLiner: "Chasing the nearby 🍓 runs out of fences. Seal the west with 1 fence and expand the east orchard",
    },
    zh: {
      title: "诱饵野草莓",
      oneLiner: "如果贪图眼前的🍓会导致栅栏不够用。用1根栅栏封住西侧，向东扩展果园吧",
    },
  },
  "stage-9": {
    en: {
      title: "Two Sheep Reunion",
      oneLiner: "Enclosing the two 🐑 separately falls short. Connect them through the central corridor",
    },
    zh: {
      title: "双羊会师作战",
      oneLiner: "把两只🐑分开圈起来无法达到目标。通过中央走廊将它们连成同一个牧场吧",
    },
  },
  "stage-10": {
    en: {
      title: "Mushroom Forest Triage",
      oneLiner: "Three 🍄 (-5) lie in the woods. Decide which mushrooms to crush and which to wall off",
    },
    zh: {
      title: "蘑菇森林的取舍",
      oneLiner: "森林里有3个🍄(-5)。仔细分辨哪些该直接压掉、哪些该隔在外面吧",
    },
  },
  "stage-11": {
    en: {
      title: "Three-Way Siege",
      oneLiner: "Three 🐺 approach across stone bridges. Find the largest orchard you can protect with 4 fences",
    },
    zh: {
      title: "三面合围",
      oneLiner: "3只🐺正从石桥逼近。找出用4根栅栏能够守护的最大果园吧",
    },
  },
  "stage-12": {
    en: {
      title: "Golden Meadow",
      oneLiner: "Final stage. Use all 5 fences wisely to complete the highest-scoring golden pasture",
    },
    zh: {
      title: "黄金牧场",
      oneLiner: "最终关卡。充分利用全部5根栅栏，完成最高分的黄金牧场吧",
    },
  },
};

export function getLocalizedStageText(
  stage: StagePuzzle,
  lang: GameLang
): { title: string; oneLiner: string } {
  if (lang === "ja") {
    return { title: stage.title, oneLiner: stage.oneLiner };
  }
  const entry = STAGE_I18N[stage.id]?.[lang];
  if (entry) {
    return entry;
  }
  const numMatch = stage.title.match(/#(\d+)/);
  const numStr = numMatch ? `#${numMatch[1]}` : "";
  if (lang === "en") {
    return {
      title: `Breezy Extra Meadow ${numStr}`.trim(),
      oneLiner: `Reach the target score using at most ${stage.maxFences} fences`,
    };
  }
  return {
    title: `微风额外牧场 ${numStr}`.trim(),
    oneLiner: `使用最多 ${stage.maxFences} 根栅栏达成目标分数吧`,
  };
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible random stage generation.
 */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a brand-new 6x6 puzzle board and verifies with HiGHS that:
 * 1. Without fences, the wolves can reach the sheep.
 * 2. Wolves have adjacent bridges so trivial 1-fence spawn caging is prevented.
 * 3. With `maxFences`, HiGHS finds a proven Optimal solution and sets `targetScore = optimalScore`.
 */
export async function generateVerifiedPastureStage(seed = Date.now()): Promise<StagePuzzle> {
  const rows = 6;
  const cols = 6;

  for (let attempt = 0; attempt < 32; attempt++) {
    const rng = createRng(seed + attempt * 9973);
    const grid: TileType[][] = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => "grass" as TileType)
    );

    // Place 1 or 2 sheep near the center
    const s1r = 2 + Math.floor(rng() * 2);
    const s1c = 2 + Math.floor(rng() * 2);
    grid[s1r][s1c] = "sheep";
    if (rng() < 0.5) {
      const s2r = s1r === 2 ? 3 : 2;
      const s2c = s1c === 2 ? 3 : 2;
      grid[s2r][s2c] = "sheep";
    }

    // Place 2 or 3 wolves on outer corners with two adjacent bridges so spawn-caging is impossible
    const corners: [number, number, number, number, number, number][] = [
      [0, 0, 0, 1, 1, 0],
      [0, cols - 1, 0, cols - 2, 1, cols - 1],
      [rows - 1, 0, rows - 1, 1, rows - 2, 0],
      [rows - 1, cols - 1, rows - 1, cols - 2, rows - 2, cols - 1],
    ];
    for (let i = corners.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = corners[i];
      corners[i] = corners[j];
      corners[j] = tmp;
    }
    const wolfCount = rng() < 0.45 ? 2 : 3;
    for (let w = 0; w < wolfCount; w++) {
      const [wr, wc, b1r, b1c, b2r, b2c] = corners[w];
      grid[wr][wc] = "wolf";
      grid[b1r][b1c] = "bridge";
      grid[b2r][b2c] = "bridge";
    }

    // Sprinkle natural obstacles and items on remaining cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== "grass") continue;
        const distCenter = Math.abs(r - 2.5) + Math.abs(c - 2.5);
        const roll = rng();
        if (distCenter >= 1.5 && roll < 0.17) {
          grid[r][c] = "water";
        } else if (distCenter >= 1.5 && roll < 0.28) {
          grid[r][c] = "rock";
        } else if (roll < 0.35) {
          grid[r][c] = "bridge";
        } else if (roll < 0.52) {
          grid[r][c] = "strawberry";
        } else if (roll < 0.63) {
          grid[r][c] = "mushroom";
        }
      }
    }

    const maxFences = wolfCount === 2 ? 3 : 4;
    const candidate: StagePuzzle = {
      id: `random-${seed}-${attempt}`,
      stageNumber: CAMPAIGN_STAGES.length + 1,
      title: `風そよぐおかわり牧場 #${String(seed % 1000).padStart(3, "0")}`,
      oneLiner: `${maxFences}本の柵でクリア目標スコアを達成しよう`,
      maxFences,
      targetScore: 20,
      grid,
    };

    const emptyEval = evaluatePasture(
      candidate,
      Array.from({ length: rows }, () => Array.from({ length: cols }, () => false))
    );
    if (emptyEval.isSafe) continue;

    const solved = await solveOptimalPasture(candidate);
    if (
      solved.status === "Optimal" &&
      solved.verified &&
      solved.optimalFenceCount >= 2 &&
      solved.optimalEvaluation.pastureTileCount >= 8 &&
      solved.optimalScore >= 20
    ) {
      candidate.targetScore = solved.optimalScore;
      return candidate;
    }
  }

  return {
    ...CAMPAIGN_STAGES[CAMPAIGN_STAGES.length - 1],
    id: `random-fallback-${seed}`,
    stageNumber: CAMPAIGN_STAGES.length + 1,
    title: `風そよぐおかわり牧場 #${String(seed % 1000).padStart(3, "0")}`,
  };
}

export function countStageTiles(stage: StagePuzzle): Record<TileType, number> {
  const counts: Record<TileType, number> = {
    grass: 0,
    strawberry: 0,
    mushroom: 0,
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
