/**
 * Types & Domain Models for the University Course Timetabling AI Copilot Demo (UCTP)
 * Powered by Chrome Built-in AI (Gemini Nano / LanguageModel API) + WaSHI (HiGHS)
 */

export const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
export type TimetableDay = (typeof DAYS_OF_WEEK)[number];

export const DAY_LABELS_JA: Record<TimetableDay, string> = {
  Mon: "月",
  Tue: "火",
  Wed: "水",
  Thu: "木",
  Fri: "金",
};

export const DAY_FULL_LABELS_JA: Record<TimetableDay, string> = {
  Mon: "月曜",
  Tue: "火曜",
  Wed: "水曜",
  Thu: "木曜",
  Fri: "金曜",
};

export const PERIODS = [1, 2, 3, 4, 5] as const;
export type TimetablePeriod = (typeof PERIODS)[number];

export const PERIOD_TIME_RANGES: Record<TimetablePeriod, string> = {
  1: "09:00–10:30",
  2: "10:40–12:10",
  3: "13:00–14:30",
  4: "14:45–16:15",
  5: "16:30–18:00",
};

export type RoomType = "large_hall" | "medium_room" | "pc_lab" | "seminar_room";

export const ROOM_TYPE_LABELS_JA: Record<RoomType, string> = {
  large_hall: "大講義室",
  medium_room: "中講義室",
  pc_lab: "PC演習室",
  seminar_room: "ゼミ・小教室",
};

export type RoomEquipment = "projector" | "mic" | "pc_terminal" | "moveable_desks" | "recording";
export type EquipmentTag = RoomEquipment;

export const EQUIPMENT_LABELS_JA: Record<RoomEquipment, string> = {
  projector: "プロジェクター",
  mic: "音響・マイク",
  pc_terminal: "演習用PC端末",
  moveable_desks: "可動式デスク(GW対応)",
  recording: "講義収録設備",
};

export interface RoomProfile {
  id: string; // e.g., "R101"
  name: string; // e.g., "101大講義室"
  shortName: string; // e.g., "101大"
  building: string; // e.g., "情報棟1F"
  capacity: number; // e.g., 150
  roomType: RoomType;
  equipment: RoomEquipment[];
  aliases: string[];
}

export type CohortId = "Y1" | "Y2" | "Y3" | "Y4";

export interface StudentCohort {
  id: CohortId;
  label: string; // e.g., "1年次 (B1)"
  shortLabel: string; // e.g., "1年"
  studentCount: number;
}

export const STUDENT_COHORTS: ReadonlyArray<StudentCohort> = [
  { id: "Y1", label: "1年次 (B1: 基礎課程)", shortLabel: "1年", studentCount: 135 },
  { id: "Y2", label: "2年次 (B2: 専門基礎)", shortLabel: "2年", studentCount: 115 },
  { id: "Y3", label: "3年次 (B3: 専門応用)", shortLabel: "3年", studentCount: 95 },
  { id: "Y4", label: "4年次・院 (B4/M1: ゼミ・特論)", shortLabel: "4年/院", studentCount: 45 },
];

export type ProfessorEmploymentType = "full_time" | "adjunct";

export interface ProfessorProfile {
  id: string; // e.g., "P01"
  name: string; // e.g., "佐藤 健一"
  kana: string;
  title: string; // e.g., "教授" | "准教授" | "講師" | "非常勤講師"
  employment: ProfessorEmploymentType;
  specialty: string;
  /** Days the professor cannot teach at all (e.g. adjunct only comes Tue/Thu -> Mon/Wed/Fri here) */
  unavailableDays: TimetableDay[];
  /** Specific (day, period) slots the professor cannot teach */
  unavailableSlots: Array<{ day: TimetableDay; period: TimetablePeriod; reason?: string }>;
  /** Preferred or disliked periods/days (soft preferences) */
  avoidPeriod1: boolean;
  avoidPeriod5: boolean;
  maxSessionsPerDay: number;
}

export type CourseCategory = "compulsory" | "elective_core" | "elective" | "lab_exercise" | "seminar";

export const COURSE_CATEGORY_LABELS_JA: Record<CourseCategory, { label: string; shortLabel: string; colorClass: string }> = {
  compulsory: { label: "必修講義", shortLabel: "必修", colorClass: "course-compulsory" },
  elective_core: { label: "選択必修", shortLabel: "選必", colorClass: "course-elective-core" },
  lab_exercise: { label: "PC演習・実験", shortLabel: "演習", colorClass: "course-lab" },
  elective: { label: "専門選択", shortLabel: "選択", colorClass: "course-elective" },
  seminar: { label: "ゼミ・輪講", shortLabel: "ゼミ", colorClass: "course-seminar" },
};

export interface CourseProfile {
  id: string; // e.g., "C01"
  title: string; // e.g., "数理最適化"
  shortTitle: string; // e.g., "数理最適化"
  professorId: string; // e.g., "P01"
  cohorts: CohortId[]; // e.g., ["Y3"]
  category: CourseCategory;
  enrollment: number; // e.g., 85
  sessionsPerWeek: number; // 1 or 2 sessions per week
  requiredEquipment: RoomEquipment[];
  requiredRoomType?: RoomType;
  preferredRoomIds?: string[];
  aliases: string[];
}

export type CustomRuleKind =
  | "pin_slot" // Pin a course session to a specific (day, period) and optionally a specific room
  | "forbid_slot" // Forbid a course or professor on specific days/periods
  | "require_room" // Force a course into a specific room or room type
  | "forbid_room" // Forbid a course from using a specific room
  | "course_no_overlap" // Two courses must not be scheduled in the same (day, period)
  | "course_same_day" // A multi-session course (or two courses) must be on the same day (e.g. consecutive or same day)
  | "course_consecutive" // Two courses (or two sessions of a course) must be in consecutive periods on the same day
  | "course_precedence" // Course A must be scheduled on an earlier day of the week than Course B
  | "room_closure" // A room is closed/unavailable during specific days/periods (maintenance/event)
  | "prof_max_daily"; // Override professor's max sessions per day

export interface CustomTimetableRule {
  id: string;
  kind: CustomRuleKind;
  enabled: boolean;
  isHard: boolean; // true = Hard constraint, false = Soft constraint with weight
  weight?: number; // Default 60 when soft
  description: string;
  courseId?: string;
  secondCourseId?: string;
  professorId?: string;
  roomId?: string;
  roomType?: RoomType;
  days?: TimetableDay[];
  periods?: TimetablePeriod[];
  maxDailySessions?: number;
}

export interface TimetableConfig {
  academicYear: number;
  semester: "spring" | "autumn";
  seed: number;

  // Hard / Soft global policy toggles
  enforceRoomCapacity: boolean;
  enforceRoomEquipment: boolean;
  enforceCohortNoOverlap: boolean; // Compulsory & elective_core for same cohort cannot overlap
  enforceProfessorAvailability: boolean; // Respect professor unavailable days/slots
  enforceAdjunctDayRestrictions: boolean; // Adjunct professors only on their contracted days
  forbidSameCourseSameDay: boolean; // Multi-session courses (2 koma/week) on different days unless overridden
  enforceMaxConsecutivePeriods: boolean; // Professors cannot teach > maxConsecutivePeriods in a row
  maxProfessorConsecutivePeriods: number; // default 2 (or 3)
  maxProfessorSessionsPerDay: number; // default 3
  maxCohortCompulsoryPerDay: number; // default 4
  preserveCurrentTimetable: boolean; // Minimal perturbation mode

  // Soft objective weights
  weightAvoidPeriod1: number; // Penalty for assigning a course to Period 1 when professor/course dislikes it
  weightAvoidPeriod5: number; // Penalty for assigning a course to Period 5
  weightCohortIdleGaps: number; // Penalty for hollow free periods (空きコマ) between compulsory classes
  weightRoomFit: number; // Bonus/penalty for matching room size appropriately
}

export interface TimetableState {
  config: TimetableConfig;
  rooms: RoomProfile[];
  professors: ProfessorProfile[];
  courses: CourseProfile[];
  customRules: CustomTimetableRule[];
}

export interface AssignedSession {
  courseId: string;
  sessionIndex: number; // 0 or 1
  day: TimetableDay;
  period: TimetablePeriod;
  roomId: string;
}

/**
 * Full weekly timetable assignment:
 * Maps `${day}_${period}_${roomId}` -> AssignedSession, plus a list of all assigned sessions.
 */
export interface WeeklyTimetableSolution {
  sessions: AssignedSession[];
  /** Lookup by `${day}_${period}` -> array of AssignedSession across rooms */
  bySlot: Record<string, AssignedSession[]>;
  /** Lookup by `${day}_${period}_${roomId}` -> AssignedSession */
  bySlotAndRoom: Record<string, AssignedSession>;
  /** Lookup by courseId -> AssignedSession[] */
  byCourse: Record<string, AssignedSession[]>;
}

export interface TimetableCellDiff {
  courseId: string;
  courseTitle: string;
  sessionIndex: number;
  prevDay: TimetableDay;
  prevPeriod: TimetablePeriod;
  prevRoomId: string;
  nextDay: TimetableDay;
  nextPeriod: TimetablePeriod;
  nextRoomId: string;
}

export interface TimetableDiffSummary {
  totalSessions: number;
  changedSessionsCount: number;
  unchangedSessionsCount: number;
  retentionRatePct: number;
  changes: TimetableCellDiff[];
}

export interface ConstraintMeta {
  name: string;
  category:
    | "assignment"
    | "room_conflict"
    | "prof_conflict"
    | "cohort_conflict"
    | "capacity_equip"
    | "prof_avail"
    | "workload"
    | "custom";
  labelJa: string;
  /** Id of the `CustomTimetableRule` that generated this constraint (custom rules only). */
  relatedRuleId?: string;
  relatedCourseIds?: string[];
  relatedProfessorIds?: string[];
  relatedRoomIds?: string[];
  relaxSuggestion?: string;
}

export interface TimetableViolationItem {
  category: string;
  severity: "hard" | "soft";
  messageJa: string;
  courseId?: string;
  professorId?: string;
  roomId?: string;
  day?: TimetableDay;
  period?: TimetablePeriod;
}

export interface ProfessorWeeklySummary {
  professorId: string;
  assignedSessions: number;
  activeDaysCount: number;
  maxDailyCount: number;
  maxConsecutiveCount: number;
  period1Count: number;
  period5Count: number;
}

export interface CohortWeeklySummary {
  cohortId: CohortId;
  totalSessions: number;
  compulsorySessions: number;
  /** Number of hollow bridge periods (中空きコマ) between compulsory/core classes */
  hollowGapsCount: number;
}

export interface TimetableEvaluationReport {
  valid: boolean;
  hardViolationCount: number;
  softPenaltyCount: number;
  violations: TimetableViolationItem[];
  professorSummaries: Record<string, ProfessorWeeklySummary>;
  cohortSummaries: Record<CohortId, CohortWeeklySummary>;
  roomUtilizationPct: Record<string, number>;
}

export interface WashiTimetableSolveOutcome {
  status: "Optimal" | "Feasible" | "Infeasible" | "Error";
  solverUsed: string;
  buildTimeMs: number;
  solveTimeMs: number;
  numVariables: number;
  numConstraints: number;
  objectiveValue: number | null;
  validatedByWashi: boolean;
  maxViolation: number;
  timetable: WeeklyTimetableSolution | null;
  evaluation: TimetableEvaluationReport | null;
  diffFromPrevious?: TimetableDiffSummary | null;
  lpPreview: string;
  modelCodePreview: string;
  conflicts: ConstraintMeta[];
  rawConflictNames: string[];
  errorMessage?: string;
}

export type ChatTimetableOperation =
  | {
      op: "pin_course_slot";
      courseId: string;
      days: TimetableDay[];
      periods: TimetablePeriod[];
      roomId?: string;
      isHard: boolean;
    }
  | {
      op: "forbid_course_slot";
      courseId: string;
      days: TimetableDay[];
      periods: TimetablePeriod[];
      isHard: boolean;
    }
  | {
      op: "set_professor_unavailability";
      professorId: string;
      days: TimetableDay[];
      periods: TimetablePeriod[];
      exclusiveAvailable?: boolean; // When true, ONLY these days/periods are available (all others forbidden)
      isHard: boolean;
    }
  | {
      op: "set_professor_preference";
      professorId: string;
      avoidPeriod1?: boolean;
      avoidPeriod5?: boolean;
      maxSessionsPerDay?: number;
    }
  | {
      op: "set_course_room_rule";
      courseId: string;
      roomId?: string;
      roomType?: RoomType;
      mode: "require" | "forbid";
      isHard: boolean;
    }
  | {
      op: "add_course_relation_rule";
      kind: "course_no_overlap" | "course_same_day" | "course_consecutive" | "course_precedence";
      courseId: string;
      secondCourseId?: string;
      isHard: boolean;
    }
  | {
      op: "add_room_closure";
      roomId: string;
      days: TimetableDay[];
      periods: TimetablePeriod[];
      reason?: string;
    }
  | {
      op: "set_config_param";
      paramName:
        | "maxProfessorConsecutivePeriods"
        | "maxProfessorSessionsPerDay"
        | "maxCohortCompulsoryPerDay"
        | "enforceRoomCapacity"
        | "enforceRoomEquipment"
        | "enforceCohortNoOverlap"
        | "enforceProfessorAvailability"
        | "forbidSameCourseSameDay"
        | "enforceMaxConsecutivePeriods"
        | "preserveCurrentTimetable";
      paramValue: number | boolean;
    }
  | {
      op: "inject_conflict_demo";
      scenario: "room_double_book" | "prof_impossible_day" | "pc_lab_overload";
    }
  | {
      op: "clear_custom_rules";
    }
  | {
      op: "reset_all";
    }
  | {
      op: "solve_or_diagnose";
    };

export interface LlmCallTrace {
  stage: string;
  systemPrompt: string;
  userPrompt: string;
  schema?: unknown;
  rawOutput: string;
  durationMs: number;
}

export interface ParsedTimetableChatPlan {
  intentType: "modify_and_solve" | "consult_only" | "clarify" | "unsupported";
  thoughtJa: string;
  replyJa: string;
  operations: ChatTimetableOperation[];
  /** Tool calls emitted by the LLM that failed strict validation and were NOT applied. */
  rejectedToolCalls: Array<{ tool_name: string; args?: Record<string, unknown> }>;
  llmTraces: LlmCallTrace[];
}

export interface TrajectoryTurnRecord {
  turnIndex: number;
  timestamp: string;
  userMessage: string;
  plan: ParsedTimetableChatPlan;
  appliedLogs: string[];
  solveStatus?: string;
  solveTimeMs?: number;
  conflictNames?: string[];
  finalAssistantReply: string;
}

export interface AiTimetableTrajectoryExport {
  exportedAt: string;
  userAgent: string;
  nanoStatus: string;
  turnCount: number;
  currentStateSummary: {
    config: TimetableConfig;
    customRules: CustomTimetableRule[];
  };
  turns: TrajectoryTurnRecord[];
}

export function formatSlotJa(day: TimetableDay, period: TimetablePeriod): string {
  return `${DAY_LABELS_JA[day]}曜${period}限`;
}

/**
 * Resolves a single day token (ja / en / zh spellings of Mon–Fri). Returns `null` for anything else.
 */
export function resolveDayToken(raw: string): TimetableDay | null {
  const s = raw.trim();
  if (/^(mon|monday|月|月曜|月曜日|周一|星期一)$/i.test(s)) return "Mon";
  if (/^(tue|tuesday|火|火曜|火曜日|周二|星期二)$/i.test(s)) return "Tue";
  if (/^(wed|wednesday|水|水曜|水曜日|周三|星期三)$/i.test(s)) return "Wed";
  if (/^(thu|thursday|木|木曜|木曜日|周四|星期四)$/i.test(s)) return "Thu";
  if (/^(fri|friday|金|金曜|金曜日|周五|星期五)$/i.test(s)) return "Fri";
  return null;
}

/**
 * Strictly validates a list of periods. Accepts only a non-empty array of integers in 1..5.
 * Returns `null` when the input is missing, empty, or contains any invalid element —
 * there is no implicit fallback to "all periods".
 */
export function resolvePeriodNumbers(raw: unknown): TimetablePeriod[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: TimetablePeriod[] = [];
  for (const p of raw) {
    if (typeof p !== "number" || !Number.isInteger(p) || p < 1 || p > 5) return null;
    const period = p as TimetablePeriod;
    if (!out.includes(period)) out.push(period);
  }
  return out.sort((a, b) => a - b);
}
