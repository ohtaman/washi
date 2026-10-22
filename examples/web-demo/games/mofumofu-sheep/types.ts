export type TileType =
  | "grass" // 🌱 草地 (+1)
  | "strawberry" // 🍓 野いちご (+5)
  | "mushroom" // 🍄 どくキノコ (-5)
  | "bridge" // 🌉 石橋 (+1, 柵を置けない)
  | "water" // 💧 池・川 (通行不可・天然の壁)
  | "rock" // 🪨 岩 (通行不可・天然の壁)
  | "sheep" // 🐑 ヒツジ (+2, 起点)
  | "wolf"; // 🐺 オオカミ (侵入源)

export interface CellCoord {
  row: number;
  col: number;
}

export interface TileMeta {
  type: TileType;
  label: string;
  emoji: string;
  score: number;
  passable: boolean;
  canPlaceFence: boolean;
}

export const TILE_META: Record<TileType, TileMeta> = {
  grass: {
    type: "grass",
    label: "草地",
    emoji: "🌱",
    score: 1,
    passable: true,
    canPlaceFence: true,
  },
  strawberry: {
    type: "strawberry",
    label: "野いちご",
    emoji: "🍓",
    score: 5,
    passable: true,
    canPlaceFence: true,
  },
  mushroom: {
    type: "mushroom",
    label: "どくキノコ",
    emoji: "🍄",
    score: -5,
    passable: true,
    canPlaceFence: true,
  },
  bridge: {
    type: "bridge",
    label: "石橋",
    emoji: "🌉",
    score: 1,
    passable: true,
    canPlaceFence: false,
  },
  water: {
    type: "water",
    label: "水辺",
    emoji: "💧",
    score: 0,
    passable: false,
    canPlaceFence: false,
  },
  rock: {
    type: "rock",
    label: "岩",
    emoji: "🪨",
    score: 0,
    passable: false,
    canPlaceFence: false,
  },
  sheep: {
    type: "sheep",
    label: "ヒツジ",
    emoji: "🐑",
    score: 2,
    passable: true,
    canPlaceFence: false,
  },
  wolf: {
    type: "wolf",
    label: "オオカミ",
    emoji: "🐺",
    score: 0,
    passable: true,
    canPlaceFence: false,
  },
};

export type FenceGrid = boolean[][];

export interface PastureEvaluation {
  /** オオカミがどのヒツジにも到達できず、かつ柵の本数が上限以内なら true（クリア可能） */
  isSafe: boolean;
  /** 柵の本数が上限を超えている場合は true */
  isOverBudget: boolean;
  fencesUsed: number;
  maxFences: number;
  /** 安全確保時のまきば合計スコア（未確保時は見込みスコア） */
  pastureScore: number;
  /** 安全なまきばに含まれたマスの数 */
  pastureTileCount: number;
  /** 内訳カウント */
  breakdown: {
    sheepCount: number;
    grassCount: number;
    strawberryCount: number;
    mushroomCount: number;
  };
  /** ヒツジから到達可能なマス一覧 */
  sheepReachable: boolean[][];
  /** オオカミから到達可能なマス一覧 */
  wolfReachable: boolean[][];
  /** オオカミがヒツジに到達してしまう場合の最短侵入経路 */
  breachPath: CellCoord[];
}

export interface OptimalPastureResult {
  status: "Optimal" | "Feasible" | "Infeasible" | "Error";
  optimalFences: FenceGrid;
  optimalScore: number;
  optimalFenceCount: number;
  optimalEvaluation: PastureEvaluation;
  solveTimeMs: number;
  verified: boolean;
}

export interface HintDiagnosis {
  status: "can_achieve_optimal" | "can_achieve_safe_only" | "bad_fence_placed";
  /** 次に柵を置くべきおすすめマス（または外すべき柵マス） */
  targetCell: CellCoord | null;
  action: "place" | "remove";
}

export interface StagePuzzle {
  id: string;
  stageNumber: number;
  title: string;
  /** 画面上部に1行だけ表示する簡潔なテーマ（長文説明なし） */
  oneLiner: string;
  maxFences: number;
  /** クリアに必要な目標まきばスコア */
  targetScore: number;
  grid: TileType[][];
}
