import type { GameLang } from "../i18n.js";

export type LocalizedText = string | {
  en: string;
  ja: string;
  zh?: string;
};

export function resolveLocalizedText(text: LocalizedText | undefined, lang: GameLang, fallback = ""): string {
  if (!text) return fallback;
  if (typeof text === "string") return text;
  return text[lang] || text.en || text.ja || fallback;
}

export interface StageEvaluation {
  /** Whether the current board state fulfills all clear criteria */
  isCleared: boolean;
  /** Current player score */
  score: number;
  /** Target score needed to clear (optional) */
  targetScore?: number;
  /** Star rating awarded (e.g. 1, 2, or 3 stars) */
  stars?: number;
  /**
   * Actionable advice or shortfall explanation when the player is close to winning
   * or has violated a soft/hard constraint (e.g. "Need +3 more points to reach target")
   */
  shortfallReason?: LocalizedText;
  /** Whether no hard constraints are currently violated (even if target score isn't reached yet) */
  isSafe?: boolean;
}

export interface OptimalSolution<TMove> {
  /** Complete sequence or set of moves leading to the optimal score */
  optimalMoves: TMove[];
  /** Recommended next single move for hint generation */
  nextBestMove?: TMove;
  /** Optimal score proven by the solver */
  optimalScore?: number;
  /** Optional explanation or solver note */
  explanation?: LocalizedText;
}

export type HudPillStatus = "normal" | "warning" | "danger" | "success";

export interface HudPillConfig {
  id: string;
  label: LocalizedText;
  value: string | number;
  icon?: string;
  status?: HudPillStatus;
}

export interface RenderContext<TMove> {
  isCleared: boolean;
  showingModelSolution: boolean;
  highlightedMove?: TMove | null;
  lang: GameLang;
  playSound: (type: SoundType) => void;
}

export type SoundType = "tap" | "clear" | "undo" | "hint" | "invalid" | "restart";

export interface PuzzleDefinition<TState, TMove, TStageSpec> {
  /** Unique identifier for storage keys and routing */
  id: string;
  /** Localized game title */
  title: LocalizedText;
  /** Localized game subtitle or genre tag */
  subtitle?: LocalizedText;
  /** Quick how-to-play description for rules modal */
  rulesSummary?: LocalizedText;
  /** Detailed rules or tips as bullet points */
  rulesList?: LocalizedText[];

  /** Fixed campaign/tutorial stages (typically 4-12 stages) */
  campaignStages: readonly TStageSpec[];

  /** Extracts stage number from stage spec */
  getStageNumber: (stage: TStageSpec) => number;
  /** Extracts stage title (e.g. "First Fence") */
  getStageTitle?: (stage: TStageSpec) => LocalizedText;
  /** Single-line mission prompt displayed prominently below header */
  getStageOneLiner?: (stage: TStageSpec) => LocalizedText;

  /**
   * Generates a procedural stage for endless mode (typically stageNumber > campaignStages.length).
   * Implementations should verify solvability with Washi (HiGHS/Z3).
   */
  generateStage?: (stageNumber: number, seed: number) => Promise<TStageSpec>;

  /** Creates clean initial state for a given stage */
  createInitialState: (stage: TStageSpec) => TState;

  /** Applies a player move to derive next board state */
  applyMove: (state: TState, move: TMove, stage: TStageSpec) => TState;

  /** Evaluates current board state against stage goals and constraints */
  evaluate: (state: TState, stage: TStageSpec) => StageEvaluation;

  /**
   * Custom HUD pills configuration (e.g. Remaining Moves, Score / Target, Guard Status).
   * Defaults to score / target if omitted.
   */
  getHudPills?: (state: TState, stage: TStageSpec, evaluation: StageEvaluation) => HudPillConfig[];

  /**
   * Invokes mathematical solver (Washi/HiGHS/Z3) to compute optimal moves and hints.
   * If omitted, hint and model solution buttons will be hidden.
   */
  solveOptimal?: (stage: TStageSpec, currentState: TState) => Promise<OptimalSolution<TMove> | null>;

  /** Renders the puzzle board into the provided container element */
  renderBoard: (
    container: HTMLElement,
    state: TState,
    stage: TStageSpec,
    onMove: (move: TMove) => void,
    context: RenderContext<TMove>
  ) => void;

  /** Optional state serialization for interruption recovery (auto-save mid-puzzle) */
  serializeState?: (state: TState) => unknown;
  /** Optional state deserialization */
  deserializeState?: (raw: unknown, stage: TStageSpec) => TState | null;

  /** Optional custom legend items for tile / piece types */
  legendItems?: Array<{
    icon: string;
    label: LocalizedText;
    scoreModifier?: string;
  }>;
}

export interface PuzzleAppProgress {
  clearedStageIds: Record<string, boolean>;
  stageStars: Record<string, number>;
  stageBestScores: Record<string, number>;
  highestUnlockedStage: number;
  currentStageNumber: number;
  savedBoardState?: {
    stageNumber: number;
    serialized: unknown;
  };
}

export interface PuzzleAppInstance {
  mount: (container: HTMLElement | string) => void;
  destroy: () => void;
  resetProgress: () => void;
  jumpToStage: (stageNumber: number) => Promise<void>;
}
