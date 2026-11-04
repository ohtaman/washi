export type ShiftType = "off" | "day" | "night";

export type ActiveShiftType = "day" | "night";

export const ALL_MONSTER_IDS = [
  "drago",
  "carmilla",
  "fenrir",
  "pururu",
  "dullahan",
  "golem",
  "behemoth",
  "ifrit",
  "lich",
  "morgan",
  "banshee",
  "garuda",
  "centaur",
  "griffon",
  "gargoyle",
  "minotaur",
  "arachne",
  "mandra",
  "mimic",
  "wisp",
] as const;

export type MonsterId = (typeof ALL_MONSTER_IDS)[number];

export type MonsterArchetype = "heavy" | "nocturnal" | "daylight" | "knight" | "rookie";

export type DayIndex = 0 | 1 | 2 | 3 | 4;

export const DAY_LABELS: readonly string[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
export const DAY_KEYS: readonly string[] = ["mon", "tue", "wed", "thu", "fri"];

/**
 * ============================================================================
 * Difficulty & Probabilistic Battle Tuning Knobs
 * ============================================================================
 * Enemy party power is generated from an unbounded Log-Normal Distribution:
 *   Z ~ Normal(0, 1)
 *   EnemyPower = round(expectedPower * exp(enemyLogSigma * Z))
 *
 * - `enemyLogSigma`: Log standard deviation per 1σ (default 0.12 ~= ±13%).
 *   Because there is no upper cap (+2σ cut), rare high-power surges are possible,
 *   maintaining tactical suspense.
 * - `expectedToMaxRatio`: Ratio of forecast median M to target defense line requiredPower.
 *   Default 0.80 (e.g. requiredPower 400 -> median M = 320).
 * - `raidOccurrenceRatio`: Average proportion of slots facing an active raid (default 0.45).
 * - `castleMaxHp`: Gate health (default 1 = single breach causes defeat).
 */
export const BALANCE_CONFIG = {
  enemyLogSigma: 0.12,
  enemyTruncateSigma: 2.0,
  expectedToMaxRatio: 0.8,
  raidOccurrenceRatio: 0.45,
  castleMaxHp: 1,
} as const;

export interface MonsterProfile {
  id: MonsterId;
  name: string;
  title: string;
  race: string;
  archetype?: MonsterArchetype;
  usualPost?: string;
  portrait: string;
  accentColor: string;
  basePower: number;
  dayBonusPower: number;
  nightBonusPower: number;
  dayMorale: number;
  nightMorale: number;
  maxConsecutiveDays: number;
  maxWeeklyShifts: number;
  requiresNightPartner?: boolean;
  fullMoonNightForbidden?: boolean;
  bossRaidBonusMorale?: number;
  traitTitle: string;
  traitSummary: string;
  quotes: {
    intro: string;
    dayAssign: string;
    nightAssign: string;
    offAssign: string;
    happy: string;
    angry: string;
  };
}

export interface PairRelation {
  id: string;
  monsterA: MonsterId;
  monsterB: MonsterId;
  moraleDelta: number;
  title: string;
  description: string;
}

export interface ShiftSlotRequirement {
  day: DayIndex;
  shift: ActiveShiftType;
  raidTitle: string;
  enemyName: string;
  enemyIcon: string;
  /** Target defense line (~+2σ benchmark used by solver) */
  requiredPower: number;
  /** Forecast enemy power (median M; defaults to requiredPower * expectedToMaxRatio) */
  expectedPower?: number;
  /** Battle dialogue displayed during combat */
  enemyQuote?: string;
  minStaff: number;
  isFullMoon?: boolean;
  isBossRaid?: boolean;
}

export interface RequestedDayOff {
  monsterId: MonsterId;
  day: DayIndex;
  reason: string;
}

export interface TutorialStep {
  monsterId: MonsterId;
  day: DayIndex;
  targetShift: ShiftType;
  instruction: string;
  shortCallout?: string;
}

export interface LoreEpisode {
  episodeNumber: number;
  title: string;
  subtitle: string;
  paragraphs: string[];
}

export type DifficultyTier = 1 | 2 | 3 | 4 | 5;

export interface StagePlayRecord {
  weekNumber: number;
  rank: "S" | "A" | "B";
  scoreRatio: number;
  hintsUsed: number;
  failedAttempts: number;
}

export interface StageScenario {
  id: string;
  weekNumber: number;
  numDays?: number; // 3, 4, or 5 (defaults to 5)
  difficultyTier?: DifficultyTier;
  difficultyLabel?: string;
  title: string;
  subtitle: string;
  newRuleTitle: string;
  newRuleSummary: string;
  lilithIntro: string;
  lilithHint: string;
  availableMonsters: MonsterId[];
  requirements: ShiftSlotRequirement[];
  requestedDaysOff: RequestedDayOff[];
  activeRelations: PairRelation[];
  tutorialSteps?: TutorialStep[];
  loreEpisode?: LoreEpisode;
  clearQuotes?: Partial<Record<MonsterId, string>>;
}

export type ScheduleGrid = Record<MonsterId, ShiftType[]>;

export interface RuleViolation {
  id: string;
  category:
    | "raid_power"
    | "min_staff"
    | "day_off"
    | "night_to_day"
    | "consecutive"
    | "weekly_cap"
    | "full_moon"
    | "solo_night";
  severity: "error";
  message: string;
  shortBadge: string;
  day?: DayIndex;
  shift?: ActiveShiftType;
  monsterId?: MonsterId;
}

export interface MoraleEvent {
  label: string;
  delta: number;
  day: DayIndex;
  shift?: ActiveShiftType;
  monsters: MonsterId[];
}

export interface SlotStatus {
  day: DayIndex;
  shift: ActiveShiftType;
  currentPower: number;
  /** Target defense line (~+2σ benchmark) */
  requiredPower: number;
  /** Forecast enemy power (median M) */
  expectedPower: number;
  /** -2σ minimum enemy power benchmark */
  minEnemyPower: number;
  /** Defense success probability based on log-normal distribution (0-99%) */
  winProbability: number;
  currentStaff: number;
  minStaff: number;
  assignedMonsters: MonsterId[];
  powerMet: boolean;
  staffMet: boolean;
}

export interface SlotBattleOutcome {
  day: DayIndex;
  shift: ActiveShiftType;
  enemyName: string;
  enemyIcon: string;
  enemyPortrait: string;
  enemyQuote: string;
  defenderQuote: string;
  defenderName: string;
  defenderPortrait: string;
  assignedMonsters: MonsterId[];
  hasSynergy: boolean;
  synergyTitle?: string;
  hasConflict?: boolean;
  conflictTitle?: string;
  isPerfectDefense: boolean;
  isBossRaid: boolean;
  isFullMoon?: boolean;
  defensePower: number;
  expectedEnemyPower: number;
  maxEnemyPower: number;
  actualEnemyPower: number;
  winProbability: number;
  /** Whether enemy vanguard attacked during this slot (false = peaceful) */
  hasRaid?: boolean;
  isWin: boolean;
}

export interface ScheduleEvaluation {
  /** True if all slots meet requiredPower and minStaff with zero contract violations */
  isValid: boolean;
  /** True if zero hard violations and at least 1 guard assigned */
  canDispatch: boolean;
  violations: RuleViolation[];
  slotStatuses: SlotStatus[];
  moraleEvents: MoraleEvent[];
  baseScore: number;
  totalScore: number;
  monsterShiftCounts: Record<MonsterId, number>;
  monsterMorale: Record<MonsterId, number>;
}

export interface OptimalSolveResult {
  status: string;
  optimalScore: number;
  optimalSchedule: ScheduleGrid;
  lpString: string;
  solveTimeMs: number;
  verified: boolean;
  maxViolation: number;
}
