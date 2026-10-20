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

export const DAY_LABELS: readonly string[] = ["月曜", "火曜", "水曜", "木曜", "金曜"];
export const DAY_KEYS: readonly string[] = ["mon", "tue", "wed", "thu", "fri"];

/**
 * ============================================================================
 * 難易度調整レバー（Difficulty & Probabilistic Battle Tuning Knobs）
 * ============================================================================
 * 敵パーティの戦闘力は「上限なしの対数正規分布（Log-Normal Distribution）」から生成されます：
 *   Z ~ Normal(0, 1)
 *   EnemyPower = round(expectedPower * exp(enemyLogSigma * Z))
 *
 * - `enemyLogSigma`: 1σあたりの対数標準偏差（デフォルト 0.12 ≒ 1σで約±13%）。
 *   上限（+2σカット）を設けないため、どれほど守りを固めてもごく稀な上振れ（強襲）で突破される可能性が残り、
 *   「何事も100%確実ではない」緊張感と城門ライフ（3）のリスク管理が生まれます。
 * - `expectedToMaxRatio`: 各枠の目標防衛ライン（`requiredPower`）に対する「敵予測値（中央値 M）」の比率。
 *   デフォルト 0.80（例：目標ライン 400 のとき、敵予測値 M = 320）。
 * - `raidOccurrenceRatio`: 全時間帯のうち実際に勇者軍が襲来する割合の目安（デフォルト 0.45）。
 *   毎日2回律儀に必ず現れるのではなく、週のうち数回ランダムな時間帯に襲来します（ただし守りが手薄な枠は斥候に見抜かれて狙われます）。
 * - `castleMaxHp`: 魔王城の城門耐久ライフ（デフォルト 1 ＝ 一度でも突破されたら即敗北、すべての襲来を防衛成功する必要があります）。
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
  /** +2σ 安全上限（味方防衛力がこの値以上なら 100% 確実に勝利） */
  requiredPower: number;
  /** 敵の予測戦力（対数正規分布の中央値 M。省略時は requiredPower * BALANCE_CONFIG.expectedToMaxRatio） */
  expectedPower?: number;
  /** 警備アニメーション中に表示される敵部隊の1行セリフ */
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
  /** +2σ 安全上限（この値以上なら勝率 100%） */
  requiredPower: number;
  /** 敵の予測戦力（中央値 M） */
  expectedPower: number;
  /** -2σ 最小戦力 */
  minEnemyPower: number;
  /** 対数正規分布にもとづく防衛成功率（0〜100%） */
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
  /** この時間帯に勇者軍が実際に現れたかどうか（false の場合は敵襲なし・平穏） */
  hasRaid?: boolean;
  isWin: boolean;
}

export interface ScheduleEvaluation {
  /** 全枠で安全上限（+2σ）と人数を満たし、かつ勤務条件違反がない場合は true（ソルバーの最適解検証用） */
  isValid: boolean;
  /** 勤務条件違反（連勤・夜→昼・指定休・満月・単独夜）が0件で、1人以上配置されていれば確率勝負に出撃可能 */
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
