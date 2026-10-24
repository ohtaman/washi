import type { GameLang } from "../i18n.js";
import { solveOptimalPasture, evaluatePasture } from "./solver.js";
import { TILE_META, type OptimalPastureResult, type StagePuzzle, type TileType } from "./types.js";

/**
 * Compact stage DSL legend:
 * - '.' : grass (+1)
 * - 'I' : strawberry (+5)
 * - 'P' / 'M' : pit (-5)
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
  M: "pit",
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
  // Stage 4 [Introduce: 穴ぼこ 🕳️ / 4x5・柵2本]
  {
    id: "stage-4",
    stageNumber: 4,
    title: "穴ぼこ埋め",
    oneLiner: "🕳️穴ぼこ(-5点)がまきばに入ると減点になるよ。🕳️の真上に丸太の柵🪵を打ち込んで穴を塞ごう",
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
  // Stage 6 [Twist: 一石二鳥の杭打ち / 5x5・柵2本]
  {
    id: "stage-6",
    stageNumber: 6,
    title: "一石二鳥の杭打ち",
    oneLiner: "🕳️(-5)の真上に丸太の柵🪵を打ち込めば、穴埋めと🐺の侵入阻止を同時に達成できるよ",
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
  // Stage 7 [Twist: 穴ぼこの向こう側 / 5x6・柵3本]
  {
    id: "stage-7",
    stageNumber: 7,
    title: "穴ぼこの向こう側",
    oneLiner: "東の🕳️(-5)を柵で塞ぐと奥の🍓畑に届かない。あえて通路を残して奥へ進む逆転の発想で挑もう",
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
  // Chapter 3: さらなる広がり（Stage 9〜12: 6x6 / 6x7 / 7x7）
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
  // Stage 10 [Develop: 穴ぼこだらけの丘 / 6x6・柵4本]
  {
    id: "stage-10",
    stageNumber: 10,
    title: "穴ぼこだらけの丘",
    oneLiner: "3つの🕳️(-5)がある丘。丸太で直接埋める穴と、柵の外へ切り離す穴を見極めよう",
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
      "I . R S . P .",
      "~ R . B R . I",
      "B . . S ~ . .",
      "W B ~ I . I ~",
    ]),
  },
  // Stage 12 [Develop: 黄金のまきば / 7x7・柵5本]
  {
    id: "stage-12",
    stageNumber: 12,
    title: "黄金のまきば",
    oneLiner: "5本の柵すべてを使い切り、満点の黄金牧場を完成させよう",
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
      title: "Plugging the Pitfall",
      oneLiner: "Leaving a pitfall 🕳️ (-5 pt) inside the pasture lowers your score. Drive a wooden fence 🪵 right into 🕳️ to plug it",
    },
    zh: {
      title: "填平坑洞",
      oneLiner: "若将🕳️坑洞(-5分)圈入牧场会扣分。直接在🕳️正上方打入木栅栏🪵即可把坑填平",
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
      title: "Two Birds with One Post",
      oneLiner: "Driving a fence 🪵 directly into 🕳️ (-5) plugs the pit and blocks 🐺 at the same time",
    },
    zh: {
      title: "一举两得的木桩",
      oneLiner: "直接把木栅栏🪵打进🕳️(-5)里，就能同时填平坑洞并阻挡🐺",
    },
  },
  "stage-7": {
    en: {
      title: "Beyond the Pitfall",
      oneLiner: "Plugging the east 🕳️ (-5) cuts off the 🍓 orchard behind it. Leave the path open to claim the orchard",
    },
    zh: {
      title: "舍小取大",
      oneLiner: "如果用栅栏封住东侧的🕳️(-5)，就拿不到深处的🍓田。试着保留通道跨过去吧",
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
      title: "Pitfall Hill Triage",
      oneLiner: "Three 🕳️ (-5) dot the hill. Decide which pits to plug directly with a post and which to wall off",
    },
    zh: {
      title: "坑洞山丘的取舍",
      oneLiner: "山丘上有3个🕳️(-5)。仔细分辨哪些该直接打桩填平、哪些该隔在牧场外吧",
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
      oneLiner: "Use all 5 fences wisely to complete the highest-scoring golden pasture",
    },
    zh: {
      title: "黄金牧场",
      oneLiner: "充分利用全部5根栅栏，完成最高分的黄金牧场吧",
    },
  },
};

const GENERATED_STAGE_THEMES: readonly { ja: string; en: string; zh: string }[] = [
  { ja: "風わたる高原牧場", en: "Windy Highland Pasture", zh: "微风高原牧场" },
  { ja: "石橋の渓谷", en: "Stone Bridge Valley", zh: "石桥溪谷" },
  { ja: "いちご薫る深森", en: "Strawberry Deepwoods", zh: "草莓深林" },
  { ja: "霧晴れる大草原", en: "Misty Grand Meadow", zh: "雾霁大草原" },
  { ja: "岩山の回廊", en: "Rocky Crag Corridor", zh: "岩山回廊" },
  { ja: "せせらぎの果樹園", en: "Brookside Orchard", zh: "溪畔果园" },
  { ja: "星降る夜のまきば", en: "Starlit Night Pasture", zh: "星夜牧场" },
  { ja: "陽だまりの丘陵", en: "Sunlit Hills", zh: "暖阳丘陵" },
  { ja: "迷宮の石畳", en: "Labyrinth Causeway", zh: "迷宫石道" },
  { ja: "双子川のほとり", en: "Twin Riverbanks", zh: "双子河畔" },
  { ja: "古の石垣牧場", en: "Ancient Stonewall Meadow", zh: "古石垣牧场" },
  { ja: "天空の黄金牧場", en: "Skyward Golden Pasture", zh: "天空黄金牧场" },
];

export function getStageTitleByNumber(stageNumber: number, lang: GameLang): string {
  if (stageNumber >= 1 && stageNumber <= CAMPAIGN_STAGES.length) {
    const st = CAMPAIGN_STAGES[stageNumber - 1];
    if (lang === "ja") return st.title;
    return STAGE_I18N[st.id]?.[lang]?.title ?? st.title;
  }
  const themeIdx =
    Math.abs(stageNumber - (CAMPAIGN_STAGES.length + 1)) % GENERATED_STAGE_THEMES.length;
  return GENERATED_STAGE_THEMES[themeIdx][lang];
}

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
  const themeIdx =
    Math.abs(stage.stageNumber - (CAMPAIGN_STAGES.length + 1)) % GENERATED_STAGE_THEMES.length;
  const theme = GENERATED_STAGE_THEMES[themeIdx];
  if (lang === "en") {
    return {
      title: theme.en,
      oneLiner: `Block 🐺 with up to ${stage.maxFences} fences and reach the target score of ${stage.targetScore} pt`,
    };
  }
  return {
    title: theme.zh,
    oneLiner: `使用最多 ${stage.maxFences} 根栅栏阻挡🐺，达成 ${stage.targetScore} pt 的目标分数吧`,
  };
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible procedural stage generation.
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

export interface StageDifficultySpec {
  rows: number;
  cols: number;
  wolfCount: number;
  sheepCount: number;
  maxFences: number;
}

/**
 * Progressive level scaling schedule:
 * Rises smoothly from Stage 13 (7x7) through 8x8 and 9x9 up to the 10x10 cap (8-10 fences, up to 6 wolves).
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
      wolfCount: stageNumber >= 23 ? 5 : 4,
      sheepCount: 3,
      maxFences: stageNumber === 22 ? 7 : 8,
    };
  }
  if (stageNumber <= 27) {
    return {
      rows: 9,
      cols: 9,
      wolfCount: 5,
      sheepCount: 3,
      maxFences: 8,
    };
  }
  if (stageNumber <= 30) {
    return {
      rows: 9,
      cols: 10,
      wolfCount: 5,
      sheepCount: 3,
      maxFences: stageNumber === 28 ? 8 : 9,
    };
  }
  return {
    rows: 10,
    cols: 10,
    wolfCount: stageNumber % 2 === 0 ? 6 : 5,
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
  { stage: StagePuzzle; optimal: OptimalPastureResult }
>();

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

  const spec = getDifficultySpecForStage(stageNumber);
  const { rows, cols, wolfCount, sheepCount } = spec;
  const baseSeed = getSeedForStageNumber(stageNumber);
  const themeIdx = Math.abs(stageNumber - (CAMPAIGN_STAGES.length + 1)) % GENERATED_STAGE_THEMES.length;
  const theme = GENERATED_STAGE_THEMES[themeIdx];

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

    // 2. Place wolves on outer corners and mid-edges with adjacent stone bridges
    const midEdgeR = Math.floor(rows / 2);
    const midEdgeC = Math.floor(cols / 2);
    const spawnSlots: { wolf: [number, number]; bridges: [number, number][] }[] = [
      {
        wolf: [0, 0],
        bridges: [
          [0, 1],
          [1, 0],
        ],
      },
      {
        wolf: [0, cols - 1],
        bridges: [
          [0, cols - 2],
          [1, cols - 1],
        ],
      },
      {
        wolf: [rows - 1, 0],
        bridges: [
          [rows - 1, 1],
          [rows - 2, 0],
        ],
      },
      {
        wolf: [rows - 1, cols - 1],
        bridges: [
          [rows - 1, cols - 2],
          [rows - 2, cols - 1],
        ],
      },
    ];
    if (cols >= 8) {
      spawnSlots.push(
        {
          wolf: [0, midEdgeC],
          bridges: [
            [0, midEdgeC - 1],
            [1, midEdgeC],
          ],
        },
        {
          wolf: [rows - 1, midEdgeC],
          bridges: [
            [rows - 1, midEdgeC + 1],
            [rows - 2, midEdgeC],
          ],
        }
      );
    }
    if (rows >= 9) {
      spawnSlots.push(
        {
          wolf: [midEdgeR, 0],
          bridges: [
            [midEdgeR, 1],
            [midEdgeR - 1, 0],
          ],
        },
        {
          wolf: [midEdgeR, cols - 1],
          bridges: [
            [midEdgeR, cols - 2],
            [midEdgeR + 1, cols - 1],
          ],
        }
      );
    }

    for (let i = spawnSlots.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = spawnSlots[i];
      spawnSlots[i] = spawnSlots[j];
      spawnSlots[j] = tmp;
    }

    const activeWolves = Math.min(wolfCount, spawnSlots.length);
    for (let w = 0; w < activeWolves; w++) {
      const slot = spawnSlots[w];
      grid[slot.wolf[0]][slot.wolf[1]] = "wolf";
      for (const [br, bc] of slot.bridges) {
        if (grid[br]?.[bc] === "grass") {
          grid[br][bc] = "bridge";
        }
      }
    }

    // 3. Sprinkle natural rock/water maze formations, bridges, strawberries, and pitfalls
    // Higher wall density on 8x8..10x10 creates tactical valleys/chokepoints and keeps MILP fast
    const isLarge = rows >= 8 || cols >= 8;
    const waterCut = isLarge ? 0.21 : 0.17;
    const rockCut = isLarge ? 0.38 : 0.29;
    const bridgeCut = isLarge ? 0.45 : 0.36;
    const strawberryCut = isLarge ? 0.62 : 0.53;
    const pitCut = isLarge ? 0.73 : 0.64;

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
      title: theme.ja,
      oneLiner: `${spec.maxFences}本の柵で🐺の侵入を防ぎ、目標スコアを達成しよう`,
      maxFences: spec.maxFences,
      targetScore: 20,
      grid,
    };

    const emptyEval = evaluatePasture(
      candidate,
      Array.from({ length: rows }, () => Array.from({ length: cols }, () => false))
    );
    if (emptyEval.isSafe) continue;
    // Fast pre-check: ensure sheep can reach a wide connected area before invoking MILP
    if (emptyEval.pastureTileCount < Math.floor(rows * cols * 0.38)) continue;

    const solved = await solveOptimalPasture(candidate);
    const minRequiredFences = Math.max(3, spec.maxFences - 2);
    if (
      solved.status === "Optimal" &&
      solved.verified &&
      solved.optimalFenceCount >= minRequiredFences &&
      solved.optimalEvaluation.pastureTileCount >= Math.max(8, Math.floor(rows * cols * 0.22)) &&
      solved.optimalScore >= 22
    ) {
      candidate.maxFences = solved.optimalFenceCount;
      candidate.targetScore = solved.optimalScore;
      candidate.oneLiner = `${candidate.maxFences}本の柵で🐺の侵入を防ぎ、目標スコア ${candidate.targetScore} pt を達成しよう`;
      generatedStageCache.set(stageNumber, { stage: candidate, optimal: solved });
      return candidate;
    }
  }

  const fallback: StagePuzzle = {
    ...CAMPAIGN_STAGES[CAMPAIGN_STAGES.length - 1],
    id: `stage-${stageNumber}`,
    stageNumber,
    title: theme.ja,
  };
  return fallback;
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

export function getCachedStageMeta(
  stageNumber: number
): { targetScore?: number; isGenerated: boolean } {
  if (stageNumber <= CAMPAIGN_STAGES.length) {
    return {
      targetScore: CAMPAIGN_STAGES[stageNumber - 1]?.targetScore,
      isGenerated: false,
    };
  }
  const cached = generatedStageCache.get(stageNumber);
  return {
    targetScore: cached?.stage.targetScore,
    isGenerated: true,
  };
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
