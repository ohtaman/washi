/**
 * Types & Domain Models for the 1-Month 3-Shift Nurse Scheduling AI Copilot Demo
 * Powered by Chrome Built-in AI (Gemini Nano / LanguageModel API) + WaSHI (HiGHS)
 */

export const BASE_SHIFT_CODES = ["D", "E", "N", "O"] as const;
export type BaseShiftCode = (typeof BASE_SHIFT_CODES)[number];
/**
 * Built-in shift & shift-group codes:
 * - "D", "E", "N", "O": base ODEN shifts
 * - "W": Work shift group (勤務全般 = D | E | N | working custom shifts)
 * - "EN": Night shift group (夜勤全般 = E | N | night custom shifts)
 */
export type BuiltInShiftCode = BaseShiftCode | "W" | "EN";
/**
 * ShiftCode supports standard ODEN codes ("D" | "E" | "N" | "O"), shift groups ("W" for 勤務,
 * "EN" for 夜勤), as well as dynamically added custom shift codes (e.g. "T" for 新人研修).
 */
export type ShiftCode = BuiltInShiftCode | (string & {});
export type ActiveShiftCode = "D" | "E" | "N";

export interface ShiftMetaInfo {
  code: ShiftCode;
  label: string;
  shortLabel: string;
  timeRange: string;
  colorClass: string;
  colorKey: string;
}

export interface CustomShiftDef {
  code: string; // e.g., "T"
  shortLabel: string; // e.g., "研" (1-2 chars shown in cell)
  label: string; // e.g., "新人研修"
  /** Base ODEN shift category this custom shift belongs to ("D" | "E" | "N" | "O", default "D") */
  baseShift?: BaseShiftCode;
  /**
   * Optional explicit list of built-in shift alias codes ("W", "D", "EN") to include this custom shift in.
   * When omitted, defaults based on `baseShift` ("W" for D/E/N, "EN" for E/N, none for O).
   */
  includedInAliases?: string[];
  timeRange: string; // e.g., "09:00–17:00"
  colorClass: string; // e.g., "shift-custom"
  countsAsWorkDay: boolean; // true = counts toward work days & consecutive work limit
  overtimeHoursPerShift: number; // default 0.5h (training/committee has minimal overtime)
}

/**
 * ShiftAliasDef maps a named shift alias (e.g. "W" for 勤務全般, "EN" for 夜勤全般, or custom aliases like "DE")
 * to an array of underlying shift codes.
 */
export interface ShiftAliasDef {
  code: string;
  label: string;
  shortLabel: string;
  shifts: ShiftCode[];
  timeRange?: string;
  colorClass?: string;
  builtIn?: boolean;
}

export const SHIFT_META: Record<BuiltInShiftCode, ShiftMetaInfo> = {
  D: {
    code: "D",
    label: "日勤 (Day)",
    shortLabel: "日",
    timeRange: "08:30–17:00",
    colorClass: "shift-D",
    colorKey: "D",
  },
  E: {
    code: "E",
    label: "準夜勤 (Evening)",
    shortLabel: "準",
    timeRange: "16:30–01:00",
    colorClass: "shift-E",
    colorKey: "E",
  },
  N: {
    code: "N",
    label: "深夜勤 (Night)",
    shortLabel: "深",
    timeRange: "00:30–09:00",
    colorClass: "shift-N",
    colorKey: "N",
  },
  O: {
    code: "O",
    label: "公休 (Off)",
    shortLabel: "休",
    timeRange: "終日休",
    colorClass: "shift-O",
    colorKey: "O",
  },
  W: {
    code: "W",
    label: "勤務 (シフトお任せ)",
    shortLabel: "勤",
    timeRange: "出勤枠(日/準/深)",
    colorClass: "shift-D",
    colorKey: "W",
  },
  EN: {
    code: "EN",
    label: "夜勤 (準夜・深夜)",
    shortLabel: "夜",
    timeRange: "準夜または深夜",
    colorClass: "shift-E",
    colorKey: "EN",
  },
};

export const SHIFT_LABELS: Record<BuiltInShiftCode, string> = {
  D: SHIFT_META.D.label,
  E: SHIFT_META.E.label,
  N: SHIFT_META.N.label,
  O: SHIFT_META.O.label,
  W: SHIFT_META.W.label,
  EN: SHIFT_META.EN.label,
};

export function getBaseOdenShift(
  code: ShiftCode,
  customShiftDefs?: readonly CustomShiftDef[]
): BaseShiftCode {
  if (code === "D" || code === "W") return "D";
  if (code === "E" || code === "EN") return "E";
  if (code === "N") return "N";
  if (code === "O") return "O";
  const found = customShiftDefs?.find((c) => c.code === code);
  if (found) {
    return found.baseShift ?? (found.countsAsWorkDay ? "D" : "O");
  }
  return "D";
}

export function getEffectiveIncludedAliases(cs: CustomShiftDef): string[] {
  if (Array.isArray(cs.includedInAliases)) return [...cs.includedInAliases];
  const base = cs.baseShift ?? (cs.countsAsWorkDay ? "D" : "O");
  if (base === "O") return [];
  return base === "E" || base === "N" ? ["W", "EN"] : ["W"];
}

export function createDefaultShiftAliases(
  customShiftDefs?: readonly CustomShiftDef[]
): ShiftAliasDef[] {
  const customWorkCodes = (customShiftDefs ?? [])
    .filter((c) => getEffectiveIncludedAliases(c).includes("W"))
    .map((c) => c.code);
  const customDayCodes = (customShiftDefs ?? [])
    .filter((c) => getEffectiveIncludedAliases(c).includes("D"))
    .map((c) => c.code);
  const customNightCodes = (customShiftDefs ?? [])
    .filter((c) => getEffectiveIncludedAliases(c).includes("EN"))
    .map((c) => c.code);
  return [
    {
      code: "W",
      label: "勤務 (シフトお任せ)",
      shortLabel: "勤",
      shifts: ["D", "E", "N", ...customWorkCodes],
      timeRange: "出勤枠(日/準/深)",
      colorClass: "shift-D",
      builtIn: true,
    },
    {
      code: "EN",
      label: "夜勤 (準夜・深夜)",
      shortLabel: "夜",
      shifts: ["E", "N", ...customNightCodes],
      timeRange: "準夜または深夜",
      colorClass: "shift-E",
      builtIn: true,
    },
    {
      code: "D",
      label: "日勤 (Day)",
      shortLabel: "日",
      shifts: ["D", ...customDayCodes],
      timeRange: "08:30–17:00",
      colorClass: "shift-D",
      builtIn: true,
    },
  ];
}

export interface ShiftResolutionContext {
  customShiftDefs?: readonly CustomShiftDef[];
  shiftAliases?: readonly ShiftAliasDef[];
}

/**
 * Resolves any shift code or shift alias (`"W"`, `"EN"`, `"D"`, `"O"`, custom shift, or custom alias)
 * into a deduplicated list of concrete shift codes.
 */
export function resolveShiftSelector(
  selector: ShiftCode,
  contextOrDefs?: ShiftResolutionContext | readonly CustomShiftDef[]
): ShiftCode[] {
  const customShiftDefs: readonly CustomShiftDef[] | undefined = Array.isArray(contextOrDefs)
    ? contextOrDefs
    : (contextOrDefs as ShiftResolutionContext | undefined)?.customShiftDefs;
  const customAliases: readonly ShiftAliasDef[] | undefined = Array.isArray(contextOrDefs)
    ? undefined
    : (contextOrDefs as ShiftResolutionContext | undefined)?.shiftAliases;

  const builtInAliases = createDefaultShiftAliases(customShiftDefs);
  const aliasMap = new Map<string, ShiftCode[]>();
  for (const a of builtInAliases) {
    aliasMap.set(a.code, a.shifts);
  }
  if (customAliases) {
    for (const a of customAliases) {
      aliasMap.set(a.code, a.shifts);
    }
  }

  if (selector === "O") {
    const customOffs = (customShiftDefs ?? [])
      .filter((c) => getBaseOdenShift(c.code, customShiftDefs) === "O")
      .map((c) => c.code);
    return ["O", ...customOffs];
  }

  const result = new Set<ShiftCode>();
  const visited = new Set<string>();

  const expand = (code: ShiftCode) => {
    if (visited.has(code)) return;
    visited.add(code);
    const aliasTargets = aliasMap.get(code);
    if (aliasTargets) {
      for (const t of aliasTargets) {
        if (t === code) {
          result.add(t);
        } else {
          expand(t);
        }
      }
      return;
    }
    result.add(code);
  };

  expand(selector);
  return Array.from(result);
}

/**
 * Checks whether an assigned concrete shift (`actualShift`) satisfies a target shift or shift alias (`targetShiftOrGroup`).
 */
export function doesShiftMatchGroup(
  actualShift: ShiftCode,
  targetShiftOrGroup: ShiftCode,
  customShiftDefs?: readonly CustomShiftDef[],
  shiftAliases?: readonly ShiftAliasDef[]
): boolean {
  if (actualShift === targetShiftOrGroup) return true;
  const resolved = resolveShiftSelector(targetShiftOrGroup, { customShiftDefs, shiftAliases });
  return resolved.includes(actualShift);
}

/**
 * Returns the Japanese national holiday name for a given date (or `null` if not a holiday).
 */
export function getJapaneseHolidayName(year: number, month: number, day: number): string | null {
  const nthMonday = (n: number): number => {
    const firstDow = new Date(year, month - 1, 1).getDay();
    const firstMon = firstDow <= 1 ? 1 + (1 - firstDow) : 1 + (8 - firstDow);
    return firstMon + (n - 1) * 7;
  };
  const checkBaseHoliday = (m: number, d: number): string | null => {
    if (m === 1 && d === 1) return "元日";
    if (m === 1 && d === nthMonday(2)) return "成人の日";
    if (m === 2 && d === 11) return "建国記念の日";
    if (m === 2 && d === 23) return "天皇誕生日";
    if (m === 3 && d === Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))) {
      return "春分の日";
    }
    if (m === 4 && d === 29) return "昭和の日";
    if (m === 5 && d === 3) return "憲法記念日";
    if (m === 5 && d === 4) return "みどりの日";
    if (m === 5 && d === 5) return "こどもの日";
    if (m === 7 && d === nthMonday(3)) return "海の日";
    if (m === 8 && d === 11) return "山の日";
    if (m === 9 && d === nthMonday(3)) return "敬老の日";
    if (m === 9 && d === Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))) {
      return "秋分の日";
    }
    if (m === 10 && d === nthMonday(2)) return "スポーツの日";
    if (m === 11 && d === 3) return "文化の日";
    if (m === 11 && d === 23) return "勤労感謝の日";
    return null;
  };
  const dateObj = new Date(year, month - 1, day);
  if (day < 1 || dateObj.getFullYear() !== year || dateObj.getMonth() !== month - 1 || dateObj.getDate() !== day) {
    return null;
  }
  const direct = checkBaseHoliday(month, day);
  if (direct) return direct;
  // 振替休日 (Substitute holiday: first non-base-holiday weekday after a contiguous run of base holidays containing a Sunday)
  let prevDay = day - 1;
  while (prevDay >= 1 && checkBaseHoliday(month, prevDay) !== null) {
    if (new Date(year, month - 1, prevDay).getDay() === 0) {
      return "振替休日";
    }
    prevDay--;
  }
  // 国民の休日 (Citizens' holiday: a non-Sunday weekday sandwiched between two base national holidays)
  const dow = dateObj.getDay();
  if (
    dow !== 0 &&
    day > 1 &&
    checkBaseHoliday(month, day - 1) !== null &&
    checkBaseHoliday(month, day + 1) !== null
  ) {
    return "国民の休日";
  }
  return null;
}

export function isJapaneseHoliday(year: number, month: number, day: number): boolean {
  return getJapaneseHolidayName(year, month, day) !== null;
}

export type HolidayFilterMode = "ignore" | "include" | "exclude" | "only";

export type DaySelector =
  | { kind: "days"; days: readonly number[] }
  | { kind: "range"; startDay?: number; endDay?: number }
  | {
      kind: "pattern";
      daysOfWeek?: readonly number[];
      holidays?: HolidayFilterMode;
    };

export interface CalendarDayPatternSpec {
  daysOfWeek?: readonly number[];
  includeHolidays?: boolean;
  excludeHolidays?: boolean;
  onlyHolidays?: boolean;
}

/**
 * Resolves a unified `DaySelector` (`days`, `range`, or `pattern` with holiday mode)
 * into sorted 1-indexed day numbers (1..numDays).
 */
export function resolveDaysBySelector(
  year: number,
  month: number,
  numDays: number,
  selector: DaySelector
): number[] {
  if (selector.kind === "days") {
    return Array.from(
      new Set(selector.days.filter((d) => typeof d === "number" && d >= 1 && d <= numDays))
    ).sort((a, b) => a - b);
  }
  if (selector.kind === "range") {
    const rawStart = typeof selector.startDay === "number" ? selector.startDay : 1;
    const rawEnd = typeof selector.endDay === "number" ? selector.endDay : numDays;
    const s = Math.max(1, Math.min(numDays, Math.min(rawStart, rawEnd)));
    const e = Math.max(1, Math.min(numDays, Math.max(rawStart, rawEnd)));
    const out: number[] = [];
    for (let d = s; d <= e; d++) out.push(d);
    return out;
  }
  const hol = selector.holidays ?? "ignore";
  return resolveCalendarDaysByPattern(year, month, numDays, {
    daysOfWeek: selector.daysOfWeek ?? [],
    includeHolidays: hol === "include",
    excludeHolidays: hol === "exclude",
    onlyHolidays: hol === "only",
  });
}

/**
 * Resolves a structured calendar pattern (`CalendarDayPatternSpec`)
 * into 1-indexed day numbers (1..numDays) for the given year & month.
 */
export function resolveCalendarDaysByPattern(
  year: number,
  month: number,
  numDays: number,
  pattern: CalendarDayPatternSpec
): number[] {
  const dowSet = new Set<number>(pattern.daysOfWeek ?? []);
  const days: number[] = [];
  for (let d = 1; d <= numDays; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    const isHol = isJapaneseHoliday(year, month, d);
    let matched = false;
    if (pattern.onlyHolidays) {
      matched = isHol;
    } else {
      if (dowSet.has(dow)) matched = true;
      if (pattern.includeHolidays && isHol) matched = true;
      if (pattern.excludeHolidays && isHol) matched = false;
    }
    if (matched) days.push(d);
  }
  return days;
}

export function getShiftMeta(
  code: ShiftCode,
  customShiftDefs?: readonly CustomShiftDef[],
  shiftAliases?: readonly ShiftAliasDef[]
): ShiftMetaInfo {
  if (code in SHIFT_META) {
    return SHIFT_META[code as BuiltInShiftCode];
  }
  const found = customShiftDefs?.find((c) => c.code === code);
  if (found) {
    return {
      code: found.code,
      label: `${found.label} (${found.shortLabel})`,
      shortLabel: found.shortLabel,
      timeRange: found.timeRange,
      colorClass: found.colorClass || "shift-custom",
      colorKey: "custom",
    };
  }
  const foundAlias = shiftAliases?.find((a) => a.code === code);
  if (foundAlias) {
    return {
      code: foundAlias.code,
      label: `${foundAlias.label} (${foundAlias.shortLabel})`,
      shortLabel: foundAlias.shortLabel,
      timeRange: foundAlias.timeRange || foundAlias.shifts.join("/"),
      colorClass: foundAlias.colorClass || "shift-D",
      colorKey: foundAlias.code,
    };
  }
  return {
    code,
    label: code,
    shortLabel: code.slice(0, 2),
    timeRange: "09:00–17:00",
    colorClass: "shift-custom",
    colorKey: "custom",
  };
}

export type NurseSkill = string;

export interface SkillDefinition {
  code: NurseSkill;
  label: string;
  shortLabel?: string;
  badge?: string;
  aliases?: readonly string[];
  category?: "skill" | "role" | "group";
  minDay: number;
  minEvening: number;
  minNight: number;
  maxDay?: number;
  maxEvening?: number;
  maxNight?: number;
  /** Optional target skill code that this skill can substitute for (e.g. "leader_cap" for "副リーダー") */
  substitutesFor?: NurseSkill;
  builtIn?: boolean;
}

export function getSkillMeta(
  code: NurseSkill,
  skillDefs?: readonly SkillDefinition[]
): { label: string; badge: string } {
  const found = skillDefs?.find((d) => d.code === code);
  if (found) {
    return {
      label: found.label,
      badge: found.badge || `🎖️${found.shortLabel || found.label}`,
    };
  }
  return { label: code, badge: `🎖️${code}` };
}

export interface DefaultAttributeDef {
  code: string;
  label: string;
  shortLabel: string;
  aliases: readonly string[];
}

export const ALL_STAFF_ATTRIBUTE_DEF: DefaultAttributeDef = {
  code: "all",
  label: "全スタッフ",
  shortLabel: "全",
  aliases: ["all", "全員", "全体", "全スタッフ", "全"],
};

export const DEFAULT_ATTRIBUTE_DEFS: readonly DefaultAttributeDef[] = [
  ALL_STAFF_ATTRIBUTE_DEF,
];

export function stripTrailingParenLabel(raw: string): string {
  return raw
    .trim()
    .replace(/^[「『"']|[」』"']$/g, "")
    .replace(/\s*[（(][^）)]*[）)]$/, "")
    .trim();
}

export function findSkillOrAttributeDef(
  raw: string,
  skillDefs?: readonly SkillDefinition[]
): SkillDefinition | DefaultAttributeDef | undefined {
  const trimmed = raw.trim().replace(/^[「『"']|[」』"']$/g, "").trim();
  const stripped = stripTrailingParenLabel(trimmed);
  const candidates = [trimmed, stripped].map((x) => x.toLowerCase()).filter(Boolean);
  if (candidates.length === 0) return undefined;
  if (
    candidates.includes(ALL_STAFF_ATTRIBUTE_DEF.code.toLowerCase()) ||
    candidates.includes(ALL_STAFF_ATTRIBUTE_DEF.label.toLowerCase()) ||
    candidates.includes(ALL_STAFF_ATTRIBUTE_DEF.shortLabel.toLowerCase()) ||
    ALL_STAFF_ATTRIBUTE_DEF.aliases.some((a) => candidates.includes(a.toLowerCase()))
  ) {
    return ALL_STAFF_ATTRIBUTE_DEF;
  }
  if (!skillDefs || skillDefs.length === 0) return undefined;
  const byCode = skillDefs.find((def) => candidates.includes(def.code.toLowerCase()));
  if (byCode) return byCode;
  const byLabel = skillDefs.find(
    (def) =>
      candidates.includes(def.label.toLowerCase()) ||
      Boolean(def.shortLabel && candidates.includes(def.shortLabel.toLowerCase()))
  );
  if (byLabel) return byLabel;
  return skillDefs.find(
    (def) => def.aliases?.some((a) => candidates.includes(a.toLowerCase())) ?? false
  );
}

/**
 * Checks whether a nurse holds `targetSkillCode` directly in `nurse.skills`,
 * OR holds a skill that substitutes for `targetSkillCode`.
 */
export function doesNurseSatisfySkill(
  nurse: NurseProfile,
  targetSkillCode: NurseSkill,
  skillDefs?: readonly SkillDefinition[]
): boolean {
  const cleaned = stripTrailingParenLabel(String(targetSkillCode));
  const matchedDef = findSkillOrAttributeDef(String(targetSkillCode), skillDefs);
  const resolvedCode = matchedDef ? matchedDef.code : cleaned;
  if (resolvedCode === "all") return true;
  if (
    nurse.skills.includes(resolvedCode) ||
    nurse.skills.includes(targetSkillCode)
  ) {
    return true;
  }
  if (!skillDefs || skillDefs.length === 0) return false;
  return nurse.skills.some((heldCode) => {
    const def = skillDefs.find((d) => d.code === heldCode);
    return def?.substitutesFor === resolvedCode || def?.substitutesFor === targetSkillCode;
  });
}

/**
 * Checks whether a nurse matches a unified attribute code/label resolved via `ALL_STAFF_ATTRIBUTE_DEF` or `skillDefs`.
 */
export function doesNurseMatchAttribute(
  nurse: NurseProfile,
  attribute: string,
  skillDefs?: readonly SkillDefinition[]
): boolean {
  const norm = stripTrailingParenLabel(attribute);
  if (!norm) return true;
  return doesNurseSatisfySkill(nurse, attribute, skillDefs);
}

export const PREV_MONTH_DAYS = 7;

/**
 * 36協定（労働基準法第36条）管理のための直近1年間（過去11ヶ月分）の累計勤務・時間外集計データ
 */
export interface NurseYearly36Stats {
  /** 過去11ヶ月の累計出勤日数 (例: 210〜228日) */
  prev11MonthsWorkDays: number;
  /** 過去11ヶ月の累計夜勤回数 (準夜+深夜, 例: 55〜86回) */
  prev11MonthsNightShifts: number;
  /** 過去11ヶ月の累計時間外労働時間 (時間, 年間上限360hに対して例: 140h〜334h) */
  prev11MonthsOvertimeHours: number;
  /** 直近2ヶ月平均の時間外労働時間 (時間/月, 複数月平均80h基準の参照用) */
  recent2MonthsAvgOvertime: number;
  /** 過去11ヶ月の有給休暇取得日数 (年5日取得義務の参照用) */
  paidLeaveDaysTaken: number;
}

export type ContractPresetId =
  | "full_time"
  | "day_only"
  | "night_only"
  | "no_late_night"
  | "no_evening"
  | "part_time"
  | "short_streak";

export interface ContractPresetDef {
  id: ContractPresetId;
  label: string;
  badge: string;
  description: string;
  defaults: {
    nightOk: boolean;
    forbiddenShifts: ActiveShiftCode[];
    minMonthlyWorkDays?: number;
    maxMonthlyWorkDays?: number;
    minMonthlyDaysOff?: number;
    maxMonthlyNightShifts?: number;
    maxConsecutiveWorkDays?: number;
    weekdayOnly?: boolean;
  };
}

export const CONTRACT_PRESETS: readonly ContractPresetDef[] = [
  {
    id: "full_time",
    label: "常勤（標準）",
    badge: "🏥常勤",
    description: "病棟標準の3交代勤務（日勤・準夜・深夜すべて可）",
    defaults: {
      nightOk: true,
      forbiddenShifts: [],
      weekdayOnly: false,
    },
  },
  {
    id: "day_only",
    label: "日勤専従（夜勤免除）",
    badge: "☀️日勤専従",
    description: "日勤帯のみ勤務（準夜勤・深夜勤は配置不可）",
    defaults: {
      nightOk: false,
      forbiddenShifts: [],
    },
  },
  {
    id: "night_only",
    label: "夜勤専従（日勤免除）",
    badge: "🌙夜勤専従",
    description: "夜勤帯（準夜・深夜）のみ勤務（日勤帯は配置不可）",
    defaults: {
      nightOk: true,
      forbiddenShifts: ["D"],
      minMonthlyWorkDays: 8,
    },
  },
  {
    id: "no_late_night",
    label: "深夜勤免除",
    badge: "🌆深夜免除",
    description: "日勤・準夜勤のみ可（深夜勤Nは配置不可）",
    defaults: {
      nightOk: true,
      forbiddenShifts: ["N"],
    },
  },
  {
    id: "no_evening",
    label: "準夜勤免除",
    badge: "🌃準夜免除",
    description: "日勤・深夜勤のみ可（準夜勤Eは配置不可）",
    defaults: {
      nightOk: true,
      forbiddenShifts: ["E"],
    },
  },
  {
    id: "part_time",
    label: "パート（日数制限・日勤のみ）",
    badge: "⏱️パート",
    description: "月間勤務日数上限（既定10日以内）・日勤専従・最低勤務日数免除",
    defaults: {
      nightOk: false,
      forbiddenShifts: [],
      minMonthlyWorkDays: 0,
      maxMonthlyWorkDays: 10,
    },
  },
  {
    id: "short_streak",
    label: "育児・体調配慮（連勤・夜勤軽減）",
    badge: "🌱配慮契約",
    description: "個人連勤上限（既定3連勤まで）・月間夜勤上限（既定4回まで）",
    defaults: {
      nightOk: true,
      forbiddenShifts: [],
      maxConsecutiveWorkDays: 3,
      maxMonthlyNightShifts: 4,
    },
  },
];

export interface NurseContractOverrides {
  nightOk?: boolean;
  forbiddenShifts?: ActiveShiftCode[];
  minMonthlyWorkDays?: number;
  maxMonthlyWorkDays?: number;
  minMonthlyDaysOff?: number;
  maxMonthlyNightShifts?: number;
  maxConsecutiveWorkDays?: number;
  weekdayOnly?: boolean;
  holidaysOff?: boolean;
}

export function applyContractPresetToNurse(
  nurse: NurseProfile,
  presetId: ContractPresetId,
  overrides?: NurseContractOverrides
): NurseProfile {
  const preset =
    CONTRACT_PRESETS.find((p) => p.id === presetId) ?? CONTRACT_PRESETS[0]!;
  const d = preset.defaults;
  return {
    ...nurse,
    contractPreset: preset.id,
    nightOk: overrides?.nightOk ?? d.nightOk,
    forbiddenShifts: overrides?.forbiddenShifts ?? [...d.forbiddenShifts],
    minMonthlyWorkDays:
      overrides && "minMonthlyWorkDays" in overrides
        ? overrides.minMonthlyWorkDays
        : d.minMonthlyWorkDays,
    maxMonthlyWorkDays:
      overrides && "maxMonthlyWorkDays" in overrides
        ? overrides.maxMonthlyWorkDays
        : d.maxMonthlyWorkDays,
    minMonthlyDaysOff:
      overrides && "minMonthlyDaysOff" in overrides
        ? overrides.minMonthlyDaysOff
        : d.minMonthlyDaysOff,
    maxMonthlyNightShifts:
      overrides && "maxMonthlyNightShifts" in overrides
        ? overrides.maxMonthlyNightShifts
        : d.maxMonthlyNightShifts,
    maxConsecutiveWorkDays:
      overrides && "maxConsecutiveWorkDays" in overrides
        ? overrides.maxConsecutiveWorkDays
        : d.maxConsecutiveWorkDays,
    weekdayOnly:
      overrides && "weekdayOnly" in overrides
        ? overrides.weekdayOnly
        : d.weekdayOnly,
    holidaysOff:
      overrides && "holidaysOff" in overrides
        ? overrides.holidaysOff
        : undefined,
  };
}

export interface NurseProfile {
  id: string; // e.g., "N01"
  name: string; // e.g., "佐藤 美咲"
  kana: string;
  skills: NurseSkill[];
  /** Optional base contract preset ID */
  contractPreset?: ContractPresetId;
  nightOk: boolean; // false = 日勤専従 (no E/N shifts)
  /** Optional per-nurse monthly night shift limit (for part-time / childcare staff) */
  maxMonthlyNightShifts?: number;
  /** Optional per-nurse minimum monthly days off (for part-time / reduced-workload staff) */
  minMonthlyDaysOff?: number;
  /** Optional per-nurse minimum monthly working days (0 = exempted from ward minimum) */
  minMonthlyWorkDays?: number;
  /** Optional per-nurse maximum monthly working days (for part-time / 扶養内 contracts, e.g. <= 10 days) */
  maxMonthlyWorkDays?: number;
  /** Optional per-nurse maximum consecutive working days (e.g. <= 3 consecutive days) */
  maxConsecutiveWorkDays?: number;
  /** Optional per-nurse forbidden shift categories across the month (e.g. ["D"] for 夜勤専従, ["N"] for 深夜免除, ["E"] for 準夜免除) */
  forbiddenShifts?: ActiveShiftCode[];
  /** Optional per-nurse weekday-only contract (true = weekends are always Off "O") */
  weekdayOnly?: boolean;
  /** Optional per-nurse holidays-off contract (true = Japanese holidays are Off "O") */
  holidaysOff?: boolean;
  yearsExp: number;
  /**
   * Last 7 days of the previous month (index 0 = -6d, ..., index 6 = last day of prev month).
   */
  prevMonthShifts: ShiftCode[];
  /**
   * Optional count of custom/training shifts already completed in previous months (e.g. { T: 2 } for 新人2).
   */
  prevCompletedShifts?: Record<string, number>;
  /**
   * Rolling 11-month cumulative statistics for 36 Agreement (36協定) compliance.
   */
  yearly36Stats: NurseYearly36Stats;
}

export interface PairRelation {
  id?: string;
  type: "ng_pair" | "preceptor";
  /** Whether this pair relation is individually enabled (default true; if false, only active when ward-wide toggle is enabled) */
  enabled?: boolean;
  nurseA: string; // Nurse ID
  nurseB: string; // Nurse ID
  /** Target shifts where the pair constraint applies (defaults to ["E", "N"] if omitted) */
  shifts?: ShiftCode[];
  /** Whether this pair rule is a Hard constraint (default true) or Soft constraint (false) */
  isHard?: boolean;
  /** Penalty weight when `isHard === false` (default 35) */
  penaltyWeight?: number;
  reason: string;
}

export interface ShiftPreference {
  id: string;
  nurseId: string;
  day: number; // 1..numDays (1-indexed day of the month)
  shift: ShiftCode; // "O" = 希望休, "D" = 日勤希望, or custom shift code
  isHard: boolean; // true = 有給・確定休/固定シフト (Hard), false = 希望シフト (Soft)
  /** Optional custom penalty/bonus weight when `isHard === false` (defaults to 20 for "O", 15 for shifts) */
  penaltyWeight?: number;
  reason: string;
}

export type CustomConstraintKind =
  | "pin_shift"
  | "forbid_shift"
  | "date_coverage"
  | "daily_shift_cap"
  | "staffing_rule"
  | "shift_count_quota"
  | "shift_day_restriction"
  | "shift_prerequisite"
  | "level_night_shifts";

export interface CustomConstraintRule {
  id: string;
  kind: CustomConstraintKind;
  enabled: boolean;
  description: string;
  /** Whether this rule is enforced as a Hard constraint (default true) or Soft constraint (false) */
  isHard?: boolean;
  /** Penalty weight per unit of slack when `isHard === false` (default 30) */
  penaltyWeight?: number;
  // Payload fields depending on kind
  nurseId?: string;
  day?: number; // 1..numDays
  shift?: ShiftCode;
  forbidShifts?: ShiftCode[];
  /** Target shifts for unified staffing rules (`staffing_rule`), e.g. ["D"], ["E", "N"], or custom shift codes */
  shifts?: ShiftCode[];
  /** Target nurse attribute/skill for `staffing_rule`, `shift_count_quota`, `daily_shift_cap`, `shift_prerequisite` (e.g. "all", "team_A", "team_B", "newcomer", "leader_cap", "icu_er") */
  attribute?: string;
  minStaff?: number;
  maxStaff?: number;
  minCount?: number;
  maxCount?: number;
  /** Whether shifts completed in previous months (`prevMonthShifts` / `prevCompletedShifts`) count toward quota/prerequisite */
  includePrevMonth?: boolean;
  /** Allowed days of week (0=Sun..6=Sat), e.g., [1,2,3,4,5] for weekdays only ("研修は平日のみ") */
  allowedDaysOfWeek?: number[];
  /** Optional start day of the month (1..numDays) for date-bounded rules (`shift_day_restriction`, `daily_shift_cap`, `staffing_rule`) */
  startDay?: number;
  /** Optional end day of the month (1..numDays) for date-bounded rules (`shift_day_restriction`, `daily_shift_cap`, `staffing_rule`) */
  endDay?: number;
  /** Prerequisite shift code that must be completed at least `prereqMinCount` times on earlier days (1..d-1) before `restrictedShifts` can be worked on day d */
  prereqShift?: ShiftCode;
  prereqMinCount?: number;
  restrictedShifts?: ShiftCode[];
  /** Grouping mode for night shift leveling ("skill" | "all") */
  levelGroupBy?: "skill" | "all";
}

export type ShiftTransitionPolicy = "allow" | "forbid" | "require";

export type ShiftTransitionMatrix = Record<
  "D" | "E" | "N",
  Record<"D" | "E" | "N" | "O", ShiftTransitionPolicy>
>;

/**
 * Returns the standard 3-shift default transition matrix:
 * - Evening -> Day (`E -> D`), Evening -> Night (`E -> N`), Night -> Day (`N -> D`), Night -> Evening (`N -> E`) are forbidden.
 * - All other 2-day transitions are allowed by default.
 */
export function createDefaultShiftTransitions(): ShiftTransitionMatrix {
  return {
    D: { D: "allow", E: "allow", N: "allow", O: "allow" },
    E: { D: "forbid", E: "allow", N: "forbid", O: "allow" },
    N: { D: "forbid", E: "forbid", N: "allow", O: "allow" },
  };
}

export interface NurseScheduleConfig {
  year: number;
  month: number; // 1..12
  numDays: number; // 28..31
  staffCount: number; // default 30
  seed: number;

  // 1. Daily Headcount Coverage
  weekdayDayStaff: number; // default 10
  weekendDayStaff: number; // default 7
  eveningStaff: number; // default 3
  nightStaff: number; // default 3

  // 2. Skill & Attribute Coverage Toggle
  enforceSkillCoverage: boolean;

  // 3. 3-Shift Transition Matrix & Previous Month Carryover Rules
  enforcePrevMonthCarryover: boolean;
  shiftTransitions: ShiftTransitionMatrix;

  // 4. Monthly & Consecutive Workload Rules + Pair Rules
  maxConsecutiveWorkDays: number; // default 5 (window of 6 days <= 5)
  minMonthlyDaysOff: number; // default 9 days off
  minMonthlyWorkDays: number; // default 14 work days
  maxMonthlyNightShifts: number; // default 8 (E + N <= 8)
  requireWeekendOff: boolean; // at least 2 weekend days off per month
  enforceNgPairs: boolean; // NG pairs cannot share E or N shifts on the same day
  /** プリセプター同行夜勤（新人が夜勤に入る日は指導ペアの先輩も同シフトに配置） */
  enforcePreceptorPairs?: boolean;
  enforceHardRequests: boolean; // Hard day-off / shift requests enforced

  // 5. 36協定（時間外労働の月間上限・直近1年累計上限）
  enforce36Agreement: boolean; // default true
  maxMonthlyOvertimeHours: number; // default 45 (hours/month)
  maxAnnualOvertimeHours: number; // default 360 (hours/year = prev 11 months + current month)

  // 6. 微調整・既存シフト維持モード（Minimal Perturbation / Rescheduling Stability）
  /** 再最適化時に現在のシフト表からの変更マス数を最小化するかどうか（デフォルト: true） */
  preserveCurrentSchedule?: boolean;

  /**
   * 7. ソフト制約化＆重み設定 (`softRuleWeights`):
   * 指定された基本ルールキー（例: "requireWeekendOff", "enforceSkillCoverage", "enforcePreceptorPairs", "enforceNgPairs", "shiftTransitions", "maxConsecutiveWorkDays", "maxMonthlyNightShifts" 等）に
   * 正の数値（ペナルティ重み w > 0）が設定されている場合、その基本ルールはハード制約ではなくスラック重み w のソフト制約として動作する。
   */
  softRuleWeights?: Record<string, number>;
}

const ALL_TRANS_COLS = ["D", "E", "N", "O"] as const;

/**
 * Returns the 3×4 Shift Transition Matrix (`fromShift` in `D | E | N` -> `toShift` in `D | E | N | O`)
 * from `NurseScheduleConfig`.
 */
export function getShiftTransitionMatrix(
  config: NurseScheduleConfig
): ShiftTransitionMatrix {
  const base = config.shiftTransitions ?? createDefaultShiftTransitions();
  const normalizeRow = (row: Record<"D" | "E" | "N" | "O", ShiftTransitionPolicy>) => {
    const reqTarget = ALL_TRANS_COLS.find((k) => row[k] === "require");
    if (reqTarget) {
      return {
        D: reqTarget === "D" ? ("require" as const) : ("forbid" as const),
        E: reqTarget === "E" ? ("require" as const) : ("forbid" as const),
        N: reqTarget === "N" ? ("require" as const) : ("forbid" as const),
        O: reqTarget === "O" ? ("require" as const) : ("forbid" as const),
      };
    }
    return {
      D: row.D === "forbid" ? ("forbid" as const) : ("allow" as const),
      E: row.E === "forbid" ? ("forbid" as const) : ("allow" as const),
      N: row.N === "forbid" ? ("forbid" as const) : ("allow" as const),
      O: row.O === "forbid" ? ("forbid" as const) : ("allow" as const),
    };
  };
  return {
    D: normalizeRow(base.D),
    E: normalizeRow(base.E),
    N: normalizeRow(base.N),
  };
}

/**
 * Applies a single cell transition policy (`fromShift -> toShift: allow | forbid | require`)
 * and returns a synchronized `NurseScheduleConfig`.
 */
export function applyShiftTransitionToConfig(
  config: NurseScheduleConfig,
  fromShift: "D" | "E" | "N",
  toShift: "D" | "E" | "N" | "O",
  policy: ShiftTransitionPolicy
): NurseScheduleConfig {
  const current = getShiftTransitionMatrix(config);
  const defaultRow = createDefaultShiftTransitions()[fromShift];
  const nextRow = { ...current[fromShift] };

  if (policy === "require") {
    for (const k of ALL_TRANS_COLS) {
      nextRow[k] = k === toShift ? "require" : "forbid";
    }
  } else if (policy === "allow" && nextRow[toShift] === "require") {
    for (const k of ALL_TRANS_COLS) {
      nextRow[k] = k === toShift ? "allow" : defaultRow[k] === "forbid" ? "forbid" : "allow";
    }
  } else {
    for (const k of ALL_TRANS_COLS) {
      if (nextRow[k] === "require") {
        nextRow[k] = "allow";
      }
    }
    nextRow[toShift] = policy === "forbid" ? "forbid" : "allow";
  }

  return {
    ...config,
    shiftTransitions: {
      ...current,
      [fromShift]: nextRow,
    },
  };
}

export interface NurseSchedulingState {
  config: NurseScheduleConfig;
  nurses: NurseProfile[];
  relations: PairRelation[];
  preferences: ShiftPreference[];
  customRules: CustomConstraintRule[];
  customShiftDefs: CustomShiftDef[];
  shiftAliases?: ShiftAliasDef[];
  skillDefs?: SkillDefinition[];
}

/**
 * Schedule assignment matrix: nurseId -> array of length `numDays` (0-indexed for day 1..numDays)
 */
export type MonthlyScheduleMap = Record<string, ShiftCode[]>;

export interface ConstraintMeta {
  name: string;
  category:
    | "coverage"
    | "skill"
    | "carryover"
    | "transition"
    | "consecutive"
    | "monthly"
    | "labor_36"
    | "ng_pair"
    | "request"
    | "custom";
  labelJa: string;
  relatedNurseIds?: string[];
  relatedDay?: number;
  relaxSuggestion?: string;
  /** Optional config rule key (e.g. "requireWeekendOff", "enforceSkillCoverage") for softRuleWeights lookup */
  ruleKey?: string;
  /** Whether this constraint is Hard (default true) or Soft (false) */
  isHard?: boolean;
  /** Penalty weight per unit of slack when `isHard === false` */
  softWeight?: number;
}

export interface DailySlotSummary {
  day: number; // 1..numDays
  dayOfWeek: number; // 0=Sun .. 6=Sat
  isWeekend: boolean;
  counts: Record<string, number>;
  required: Record<ActiveShiftCode, number>;
  skillCounts: Record<string, Record<ActiveShiftCode, number>>;
}

export interface NurseMonthlySummary {
  nurseId: string;
  counts: Record<string, number>;
  totalWorkDays: number;
  totalOffDays: number;
  totalNightShifts: number; // E + N (+ E/N-based custom shifts)
  maxConsecutiveWork: number; // including carryover
  prevMonthTailStreak: number; // how many consecutive work days at the end of prev month
  weekendDaysOff: number;
  hardRequestsMet: number;
  hardRequestsTotal: number;
  softRequestsMet: number;
  softRequestsTotal: number;
  /** 当月の見込時間外労働時間 (h) */
  estMonthOvertimeHours: number;
  /** 過去11ヶ月＋当月の年間累計時間外労働時間 (h) */
  projectedAnnualOvertimeHours: number;
  /** 36協定の年間上限(360h)までの残り時間 (h) */
  remainingAnnual36Hours: number;
  /** 36協定の年間上限に近づいている要注意対象か */
  is36Warning: boolean;
  violations: string[];
}

export interface ScheduleViolationItem {
  id: string;
  category: ConstraintMeta["category"];
  message: string;
  nurseId?: string;
  day?: number;
  /** True when this item is a soft-constraint compromise rather than a hard constraint violation */
  isSoft?: boolean;
}

export interface ScheduleEvaluationReport {
  valid: boolean;
  violations: ScheduleViolationItem[];
  dailySummaries: DailySlotSummary[];
  nurseSummaries: Record<string, NurseMonthlySummary>;
  hardRequestSatisfactionRate: number;
  softRequestSatisfactionRate: number;
  objectiveScore: number;
}

export interface ScheduleCellChange {
  nurseId: string;
  nurseName: string;
  day: number; // 1..numDays
  prevShift: ShiftCode;
  nextShift: ShiftCode;
}

export interface ScheduleDiffSummary {
  totalCells: number;
  changedCellsCount: number;
  unchangedCellsCount: number;
  retentionRatePct: number;
  affectedNursesCount: number;
  changes: ScheduleCellChange[];
}

export interface WashiSolveOutcome {
  status: "Optimal" | "Feasible" | "Infeasible" | "Unsat" | "Error";
  solverUsed: string;
  buildTimeMs: number;
  solveTimeMs: number;
  numVariables: number;
  numConstraints: number;
  objectiveValue: number | null;
  validatedByWashi: boolean;
  maxViolation: number;
  schedule: MonthlyScheduleMap | null;
  evaluation: ScheduleEvaluationReport | null;
  /** Summary of cell changes compared to `referenceSchedule` when re-optimizing */
  diffFromPrevious?: ScheduleDiffSummary | null;
  lpPreview: string;
  modelCodePreview: string;
  conflicts: ConstraintMeta[];
  rawConflictNames: string[];
  errorMessage?: string;
}

export type WardNumericParamName =
  | "weekdayDayStaff"
  | "weekendDayStaff"
  | "eveningStaff"
  | "nightStaff"
  | "maxConsecutiveWorkDays"
  | "minMonthlyDaysOff"
  | "minMonthlyWorkDays"
  | "maxMonthlyNightShifts"
  | "maxMonthlyOvertimeHours"
  | "maxAnnualOvertimeHours"
  | "staffCount";

export type WardBooleanRuleName =
  | "enforcePrevMonthCarryover"
  | "enforceSkillCoverage"
  | "requireWeekendOff"
  | "enforceNgPairs"
  | "enforcePreceptorPairs"
  | "enforceHardRequests"
  | "enforce36Agreement"
  | "preserveCurrentSchedule";

export interface SetParamOperation {
  op: "set_param";
  paramName: WardNumericParamName;
  paramValue: number;
}

export interface ToggleRuleOperation {
  op: "toggle_rule";
  ruleName: WardBooleanRuleName;
  ruleEnabled: boolean;
}

export interface SetShiftTransitionOperation {
  op: "set_shift_transition";
  fromShift: "D" | "E" | "N";
  toShift: "D" | "E" | "N" | "O";
  transitionPolicy: "forbid" | "allow" | "require";
}

export interface LevelNightShiftsOperation {
  op: "level_night_shifts";
  levelGroupBy?: "skill" | "all";
}

export interface AddDateCoverageOperation {
  op: "add_date_coverage";
  day: number;
  shift: "D" | "E" | "N";
  minStaff: number;
}

export interface AddRequestOperation {
  op: "add_request";
  nurseNameOrId: string;
  day?: number;
  days?: number[];
  shift: ShiftCode;
  isHard?: boolean;
  onlyMatchedDaysWork?: boolean;
  isCalendarPattern?: boolean;
  reason?: string;
}

export interface ForbidShiftOperation {
  op: "forbid_shift";
  nurseNameOrId: string;
  day?: number;
  days?: number[];
  forbidShifts?: ShiftCode[];
}

export interface SetNurseContractOperation {
  op: "set_nurse_contract";
  nurseNameOrId: string;
  resetContract?: boolean;
  nightOk?: boolean;
  maxMonthlyNightShifts?: number;
  minMonthlyDaysOff?: number;
  minMonthlyWorkDays?: number;
  maxMonthlyWorkDays?: number;
  maxConsecutiveWorkDays?: number;
  forbiddenShifts?: ActiveShiftCode[];
  weekdayOnly?: boolean;
  holidaysOff?: boolean;
}

export interface AddSkillDefOperation {
  op: "add_skill_def";
  skillName: string;
  skillShortLabel?: string;
  substitutesFor?: NurseSkill;
  skillMinDay?: number;
  skillMinEvening?: number;
  skillMinNight?: number;
}

export interface RemoveSkillDefOperation {
  op: "remove_skill_def";
  skillName: string;
}

export interface UpdateNurseSkillOperation {
  op: "update_nurse_skill";
  skillName: string;
  skillAction: "add" | "remove";
  nurseNameOrId?: string;
  attribute?: string;
}

export interface SetStaffingRuleOperation {
  op: "set_staffing_rule";
  targetShift: string;
  shifts?: ShiftCode[];
  attribute: string;
  minCount?: number;
  maxCount?: number;
  isHard?: boolean;
  penaltyWeight?: number;
}

export interface AddNgPairOperation {
  op: "add_ng_pair";
  nurseNameOrId: string;
  nurseBNameOrId: string;
  shifts?: ShiftCode[];
  isHard?: boolean;
  penaltyWeight?: number;
}

export interface AddPreceptorPairOperation {
  op: "add_preceptor_pair";
  nurseNameOrId: string;
  nurseBNameOrId: string;
  shifts?: ShiftCode[];
  isHard?: boolean;
  penaltyWeight?: number;
}

export interface AddCustomShiftOperation {
  op: "add_custom_shift";
  shiftName: string;
  shortLabel?: string;
  shift?: ShiftCode;
  baseShift?: BaseShiftCode;
  countsAsWorkDay?: boolean;
  includedInAliases?: string[];
}

export interface AddShiftQuotaOperation {
  op: "add_shift_quota";
  shiftName: string;
  shift?: ShiftCode;
  nurseNameOrId?: string;
  attribute?: string;
  minCount?: number;
  maxCount?: number;
}

export interface AddShiftPrerequisiteOperation {
  op: "add_shift_prerequisite";
  shiftName: string;
  prereqShift?: ShiftCode;
  shift?: ShiftCode;
  attribute: string;
  prereqMinCount: number;
  restrictedShifts?: ShiftCode[];
}

export interface AddShiftDayRestrictionOperation {
  op: "add_shift_day_restriction";
  shiftName: string;
  shift?: ShiftCode;
  allowedDaysOfWeek?: number[];
  startDay?: number;
  endDay?: number;
}

export interface AddDailyShiftCapOperation {
  op: "add_daily_shift_cap";
  shiftName: string;
  shift?: ShiftCode;
  minStaff?: number;
  maxStaff?: number;
  attribute?: string;
}

export interface AllowPrevMonthShiftOperation {
  op: "allow_prev_month_shift";
  shiftName: string;
  shift?: ShiftCode;
  includePrevMonth?: boolean;
}

export interface ClearCustomRulesOperation {
  op: "clear_custom_rules";
}

export interface InjectConflictDemoOperation {
  op: "inject_conflict_demo";
}

export interface ResetDefaultOperation {
  op: "reset_default";
}

/**
 * Discriminated union of structured operations extracted from user chat messages.
 * Each operation `op` strictly defines its own required and optional parameters.
 */
export type ChatConstraintOperation =
  | SetParamOperation
  | ToggleRuleOperation
  | SetShiftTransitionOperation
  | LevelNightShiftsOperation
  | AddDateCoverageOperation
  | AddRequestOperation
  | ForbidShiftOperation
  | SetNurseContractOperation
  | AddSkillDefOperation
  | RemoveSkillDefOperation
  | UpdateNurseSkillOperation
  | SetStaffingRuleOperation
  | AddNgPairOperation
  | AddPreceptorPairOperation
  | AddCustomShiftOperation
  | AddShiftQuotaOperation
  | AddShiftPrerequisiteOperation
  | AddShiftDayRestrictionOperation
  | AddDailyShiftCapOperation
  | AllowPrevMonthShiftOperation
  | ClearCustomRulesOperation
  | InjectConflictDemoOperation
  | ResetDefaultOperation;

export interface LlmCallTrace {
  step: "turn1_router" | "turn2_extractor" | "turn3_consultation_stream";
  category?: string;
  systemPrompt: string;
  userPrompt: string;
  responseConstraintSchema?: unknown;
  rawOutput: string;
  parsedOutput?: unknown;
  parseError?: string;
  durationMs: number;
  tokenUsage?: { usage: number; quota: number } | null;
}

export interface ExecutionVerificationResult {
  verified: boolean;
  checkedRoutesCount: number;
  appliedCount: number;
  repairedRoutes: string[];
  missingRoutes: string[];
  summaryJa: string;
}

export interface ParsedChatPlan {
  intentType: "modify_and_solve" | "solve_only" | "diagnose_conflict" | "consult_only";
  operations: ChatConstraintOperation[];
  summaryJa: string;
  /** Optional 1st-turn reasoning/planning thought from the Stage 1 Planner/Router */
  stage1Thought?: string;
  /** Optional 1st-turn response from the Stage 1 Router */
  stage1Response?: string;
  /** Reason when intentType is "consult_only" ("question" | "unsupported" | "clarify") */
  nonToolReason?: "question" | "unsupported" | "clarify";
  /** Trace of Stage 1 (routes) and Stage 2 (tool_name + args) selected by Gemini Nano */
  routerTrace?: string[];
  /** Post-Turn-2 verification result checking that extracted operations match the planned routes */
  verificationResult?: ExecutionVerificationResult;
  /** Detailed trace of every LanguageModel call executed during extractPlan() */
  llmCalls?: LlmCallTrace[];
}

export interface TrajectoryTurnRecord {
  turnIndex: number;
  timestamp: string;
  userMessage: string;
  llmCalls: LlmCallTrace[];
  extractedPlan: {
    intentType: ParsedChatPlan["intentType"];
    stage1Thought?: string;
    stage1Response?: string;
    routerTrace?: string[];
    operations: ChatConstraintOperation[];
  };
  appliedResult: {
    appliedLogs: string[];
    customShiftDefsAfter: CustomShiftDef[];
    customRulesAfter: CustomConstraintRule[];
    configAfter: NurseScheduleConfig;
  };
  solverOutcome: {
    ran: boolean;
    mode: "solve" | "diagnose" | "none";
    status?: WashiSolveOutcome["status"];
    buildTimeMs?: number;
    solveTimeMs?: number;
    numVariables?: number;
    numConstraints?: number;
    objectiveValue?: number | null;
    validatedByWashi?: boolean;
    maxViolation?: number;
    violationCount?: number;
    conflicts?: ConstraintMeta[];
    rawConflictNames?: string[];
    errorMessage?: string;
  };
  finalAssistantReply: string;
  error?: string;
}

export interface AiShiftTrajectoryExport {
  exportedAt: string;
  userAgent: string;
  nanoStatus: string;
  turnCount: number;
  currentStateSummary: {
    config: NurseScheduleConfig;
    customShiftDefs: CustomShiftDef[];
    customRules: CustomConstraintRule[];
  };
  turns: TrajectoryTurnRecord[];
}

/**
 * Removes a custom shift definition (`shiftCode`) and cascades the deletion across
 * `shiftAliases`, `customRules`, `preferences`, `relations`, and nurse history.
 */
export function removeCustomShiftFromState(
  state: NurseSchedulingState,
  shiftCode: string
): NurseSchedulingState {
  const nextCustom = state.customShiftDefs.filter((d) => d.code !== shiftCode);
  const defaultAliases = createDefaultShiftAliases(nextCustom);
  const customNonBuiltInAliases = (state.shiftAliases ?? [])
    .filter((a) => !a.builtIn && a.code !== shiftCode)
    .map((a) => ({
      ...a,
      shifts: a.shifts.filter((s) => s !== shiftCode),
    }))
    .filter((a) => a.shifts.length > 0);

  const nextRules: CustomConstraintRule[] = [];
  for (const r of state.customRules) {
    if (r.shift === shiftCode || r.prereqShift === shiftCode) continue;
    let nextRule: CustomConstraintRule = r;
    if (Array.isArray(r.shifts) && r.shifts.includes(shiftCode)) {
      const filtered = r.shifts.filter((s) => s !== shiftCode);
      if (r.shifts.length > 0 && filtered.length === 0) continue;
      nextRule = { ...nextRule, shifts: filtered };
    }
    if (Array.isArray(r.restrictedShifts) && r.restrictedShifts.includes(shiftCode)) {
      const filtered = r.restrictedShifts.filter((s) => s !== shiftCode);
      if (r.restrictedShifts.length > 0 && filtered.length === 0) continue;
      nextRule = { ...nextRule, restrictedShifts: filtered };
    }
    if (Array.isArray(r.forbidShifts) && r.forbidShifts.includes(shiftCode)) {
      const filtered = r.forbidShifts.filter((s) => s !== shiftCode);
      if (r.forbidShifts.length > 0 && filtered.length === 0) continue;
      nextRule = { ...nextRule, forbidShifts: filtered };
    }
    nextRules.push(nextRule);
  }

  const nextRelations: PairRelation[] = [];
  for (const rel of state.relations) {
    if (Array.isArray(rel.shifts) && rel.shifts.includes(shiftCode)) {
      const filtered = rel.shifts.filter((s) => s !== shiftCode);
      if (rel.shifts.length > 0 && filtered.length === 0) continue;
      nextRelations.push({ ...rel, shifts: filtered });
    } else {
      nextRelations.push(rel);
    }
  }

  return {
    ...state,
    customShiftDefs: nextCustom,
    shiftAliases: [...defaultAliases, ...customNonBuiltInAliases],
    customRules: nextRules,
    preferences: state.preferences.filter((p) => p.shift !== shiftCode),
    relations: nextRelations,
    nurses: state.nurses.map((n) => {
      const nextPrevShifts = n.prevMonthShifts.includes(shiftCode)
        ? n.prevMonthShifts.map((s) => (s === shiftCode ? "O" : s))
        : n.prevMonthShifts;
      let nextPrevCompleted = n.prevCompletedShifts;
      if (nextPrevCompleted && shiftCode in nextPrevCompleted) {
        const { [shiftCode]: _removed, ...rest } = nextPrevCompleted;
        nextPrevCompleted = rest;
      }
      if (nextPrevShifts === n.prevMonthShifts && nextPrevCompleted === n.prevCompletedShifts) {
        return n;
      }
      return {
        ...n,
        prevMonthShifts: nextPrevShifts,
        prevCompletedShifts: nextPrevCompleted,
      };
    }),
  };
}

/**
 * Clears all individual contract overrides for `nurseId`.
 */
export function clearNurseContractFromState(
  state: NurseSchedulingState,
  nurseId: string,
  options?: { resetNightOk?: boolean }
): NurseSchedulingState {
  return {
    ...state,
    customRules: state.customRules.filter((r) => !r.id.startsWith(`pin_hol_${nurseId}_`)),
    preferences: state.preferences.filter((p) => !p.id.startsWith(`pref_hol_${nurseId}_`)),
    nurses: state.nurses.map((n) =>
      n.id === nurseId
        ? {
            ...n,
            ...(options?.resetNightOk !== false ? { nightOk: true } : {}),
            contractPreset: undefined,
            minMonthlyWorkDays: undefined,
            maxMonthlyWorkDays: undefined,
            minMonthlyDaysOff: undefined,
            maxMonthlyNightShifts: undefined,
            maxConsecutiveWorkDays: undefined,
            forbiddenShifts: undefined,
            weekdayOnly: undefined,
            holidaysOff: undefined,
          }
        : n
    ),
  };
}

/**
 * Reconciles cell-level `pin_shift`, `forbid_shift`, and hard `preferences` when pinning `shift`
 * for `nurseId` on `daySet`.
 */
export function reconcileCellRulesForPin(
  state: NurseSchedulingState,
  nurseId: string,
  daySet: ReadonlySet<number>,
  shift: ShiftCode
): Pick<NurseSchedulingState, "customRules" | "preferences"> {
  const pinnedResolved = new Set(resolveShiftSelector(shift, state));
  const customRules: CustomConstraintRule[] = [];
  for (const r of state.customRules) {
    if (r.nurseId === nurseId && r.day !== undefined && daySet.has(r.day)) {
      if (r.kind === "pin_shift") {
        continue;
      }
      if (r.kind === "forbid_shift" && r.forbidShifts) {
        const remaining = r.forbidShifts.filter(
          (fs) => !resolveShiftSelector(fs, state).some((c) => pinnedResolved.has(c))
        );
        if (remaining.length === 0) continue;
        customRules.push({ ...r, forbidShifts: remaining });
        continue;
      }
    }
    customRules.push(r);
  }
  const preferences = state.preferences.filter(
    (p) =>
      !(
        p.nurseId === nurseId &&
        daySet.has(p.day) &&
        p.isHard &&
        !resolveShiftSelector(p.shift, state).some((c) => pinnedResolved.has(c))
      )
  );
  return { customRules, preferences };
}

/**
 * Reconciles cell-level `forbid_shift`, `pin_shift`, and hard `preferences` when forbidding
 * `forbidShifts` for `nurseId` on `daySet`.
 */
export function reconcileCellRulesForForbid(
  state: NurseSchedulingState,
  nurseId: string,
  daySet: ReadonlySet<number>,
  forbidShifts: readonly ShiftCode[]
): Pick<NurseSchedulingState, "customRules" | "preferences"> {
  const forbiddenResolved = new Set(
    forbidShifts.flatMap((fs) => resolveShiftSelector(fs, state))
  );
  const customRules = state.customRules.filter((r) => {
    if (r.nurseId !== nurseId || r.day === undefined || !daySet.has(r.day)) {
      return true;
    }
    if (r.kind === "forbid_shift") {
      return false;
    }
    if (
      r.kind === "pin_shift" &&
      r.shift &&
      resolveShiftSelector(r.shift, state).every((c) => forbiddenResolved.has(c))
    ) {
      return false;
    }
    return true;
  });
  const preferences = state.preferences.filter(
    (p) =>
      !(
        p.nurseId === nurseId &&
        daySet.has(p.day) &&
        p.isHard &&
        resolveShiftSelector(p.shift, state).every((c) => forbiddenResolved.has(c))
      )
  );
  return { customRules, preferences };
}

