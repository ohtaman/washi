export type TileType =
  | "grass" // Grass (+1)
  | "strawberry" // Wild strawberry (+5)
  | "pit" // Mud pit (-5)
  | "bridge" // Stone bridge (+1, cannot place fence)
  | "water" // Pond / River (impassable natural barrier)
  | "rock" // Rock / Boulder (impassable natural barrier)
  | "sheep" // Sheep (+2, starting source)
  | "wolf"; // Wolf (danger source)

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
    label: "Grass",
    emoji: "🌱",
    score: 1,
    passable: true,
    canPlaceFence: true,
  },
  strawberry: {
    type: "strawberry",
    label: "Wild Strawberry",
    emoji: "🍓",
    score: 5,
    passable: true,
    canPlaceFence: true,
  },
  pit: {
    type: "pit",
    label: "Pit",
    emoji: "🕳️",
    score: -5,
    passable: true,
    canPlaceFence: true,
  },
  bridge: {
    type: "bridge",
    label: "Stone Bridge",
    emoji: "🌉",
    score: 1,
    passable: true,
    canPlaceFence: false,
  },
  water: {
    type: "water",
    label: "Pond",
    emoji: "💧",
    score: 0,
    passable: false,
    canPlaceFence: false,
  },
  rock: {
    type: "rock",
    label: "Rock",
    emoji: "🪨",
    score: 0,
    passable: false,
    canPlaceFence: false,
  },
  sheep: {
    type: "sheep",
    label: "Sheep",
    emoji: "🐑",
    score: 2,
    passable: true,
    canPlaceFence: false,
  },
  wolf: {
    type: "wolf",
    label: "Wolf",
    emoji: "🐺",
    score: 0,
    passable: true,
    canPlaceFence: false,
  },
};

export type FenceGrid = boolean[][];

export interface PastureEvaluation {
  /** True if no wolf can reach any sheep and fence count is within budget */
  isSafe: boolean;
  /** True if placed fence count exceeds budget */
  isOverBudget: boolean;
  fencesUsed: number;
  maxFences: number;
  /** Total pasture score when secured */
  pastureScore: number;
  /** Number of secured pasture tiles */
  pastureTileCount: number;
  /** Breakdown count */
  breakdown: {
    sheepCount: number;
    grassCount: number;
    strawberryCount: number;
    pitCount: number;
  };
  /** Tiles reachable from any sheep */
  sheepReachable: boolean[][];
  /** Tiles reachable from any wolf */
  wolfReachable: boolean[][];
  /** Shortest breach path if wolf can reach sheep */
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
  /** Recommended cell to place or remove a fence */
  targetCell: CellCoord | null;
  action: "place" | "remove";
}

export interface StagePuzzle {
  id: string;
  stageNumber: number;
  title: string;
  /** Single-line concise objective */
  oneLiner: string;
  maxFences: number;
  /** Target pasture score required for stage clear */
  targetScore: number;
  grid: TileType[][];
}
