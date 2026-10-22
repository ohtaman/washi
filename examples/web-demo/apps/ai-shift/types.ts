/**
 * Types & Domain Models for the 1-Month 3-Shift Nurse Scheduling AI Copilot Demo
 * Powered by Chrome Built-in AI (Gemini Nano / LanguageModel API) + WaSHI (HiGHS)
 */

export const BASE_SHIFT_CODES = ["D", "E", "N", "O"] as const;
export type BaseShiftCode = (typeof BASE_SHIFT_CODES)[number];
/**
 * Built-in shift & shift-group codes:
 * - "D", "E", "N", "O": base ODEN shifts
 * - "D_A", "D_B": day shift sub-groups (Group A / Group B)
 * - "W": Work shift group (勤務全般 = D | D_A | D_B | E | N | working custom shifts)
 * - "EN": Night shift group (夜勤全般 = E | N | night custom shifts)
 */
export type BuiltInShiftCode = BaseShiftCode | "D_A" | "D_B" | "W" | "EN";
/**
 * ShiftCode supports standard ODEN codes ("D" | "E" | "N" | "O"), built-in Day shift
 * sub-groups ("D_A" for 日A / Group A, "D_B" for 日B / Group B), shift groups ("W" for 勤務,
 * "EN" for 夜勤), as well as dynamically added custom shift codes (e.g. "T" for 新人研修).
 */
export type ShiftCode = BuiltInShiftCode | (string & {});
export type ActiveShiftCode = "D" | "D_A" | "D_B" | "E" | "N";

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
  D_A: {
    code: "D_A",
    label: "日勤A (Group A)",
    shortLabel: "日A",
    timeRange: "08:30–17:00",
    colorClass: "shift-D_A",
    colorKey: "D_A",
  },
  D_B: {
    code: "D_B",
    label: "日勤B (Group B)",
    shortLabel: "日B",
    timeRange: "08:30–17:00",
    colorClass: "shift-D_B",
    colorKey: "D_B",
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

export function isDaySubgroupShift(code: ShiftCode): boolean {
  return code === "D" || code === "D_A" || code === "D_B";
}

export function getBaseOdenShift(
  code: ShiftCode,
  customShiftDefs?: readonly CustomShiftDef[]
): BaseShiftCode {
  if (code === "D" || code === "D_A" || code === "D_B" || code === "W") return "D";
  if (code === "E" || code === "EN") return "E";
  if (code === "N") return "N";
  if (code === "O") return "O";
  const found = customShiftDefs?.find((c) => c.code === code);
  if (found) {
    return found.baseShift ?? (found.countsAsWorkDay ? "D" : "O");
  }
  return "D";
}

export function createDefaultShiftAliases(
  customShiftDefs?: readonly CustomShiftDef[]
): ShiftAliasDef[] {
  const customWorkCodes = (customShiftDefs ?? [])
    .filter((c) =>
      Array.isArray(c.includedInAliases)
        ? c.includedInAliases.includes("W")
        : getBaseOdenShift(c.code, customShiftDefs) !== "O"
    )
    .map((c) => c.code);
  const customDayCodes = (customShiftDefs ?? [])
    .filter((c) =>
      Array.isArray(c.includedInAliases) ? c.includedInAliases.includes("D") : false
    )
    .map((c) => c.code);
  const customNightCodes = (customShiftDefs ?? [])
    .filter((c) => {
      if (Array.isArray(c.includedInAliases)) {
        return c.includedInAliases.includes("EN");
      }
      const b = getBaseOdenShift(c.code, customShiftDefs);
      return b === "E" || b === "N";
    })
    .map((c) => c.code);
  return [
    {
      code: "W",
      label: "勤務 (シフトお任せ)",
      shortLabel: "勤",
      shifts: ["D", "D_A", "D_B", "E", "N", ...customWorkCodes],
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
      shifts: ["D", "D_A", "D_B", ...customDayCodes],
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
  const direct = checkBaseHoliday(month, day);
  if (direct) return direct;
  // 振替休日 (Substitute holiday when a holiday falls on Sunday)
  const dow = new Date(year, month - 1, day).getDay();
  if (dow === 1 && day > 1 && checkBaseHoliday(month, day - 1)) {
    return "振替休日";
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
 * Resolves a calendar pattern (either a structured spec or a Japanese pattern string
 * such as "土日", "土日祝", "祝日", "平日", "水・金", "月曜・木曜")
 * into 1-indexed day numbers (1..numDays) for the given year & month.
 */
export function resolveCalendarDaysByPattern(
  year: number,
  month: number,
  numDays: number,
  pattern: string | CalendarDayPatternSpec
): number[] {
  if (typeof pattern !== "string") {
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

  const s = pattern.trim();
  if (!s) return [];

  const hasWeekendAndHoliday = /土日祝|週末.*祝|休日すべて/.test(s);
  const hasWeekendOnly = !hasWeekendAndHoliday && /土日|週末/.test(s);
  const hasHolidayOnly = !hasWeekendAndHoliday && /祝日|祭日/.test(s);
  const hasWeekdayOnly = /平日/.test(s);
  const excludeHolidays = /祝日.*除|祝日は?(OK|可|出勤)/.test(s);

  const specificDows = new Set<number>();
  const dowMap: Array<[RegExp, number]> = [
    [/日曜|(?<![月火水木金土])日(?=[曜・,、\s]|$)/, 0],
    [/月曜|月(?=[曜・,、\s火水木金土日]|$)/, 1],
    [/火曜|火(?=[曜・,、\s月水木金土日]|$)/, 2],
    [/水曜|水(?=[曜・,、\s月火木金土日]|$)/, 3],
    [/木曜|木(?=[曜・,、\s月火水金土日]|$)/, 4],
    [/金曜|金(?=[曜・,、\s月火水木土日]|$)/, 5],
    [/土曜|(?<!土)土(?=[曜・,、\s日]|$)/, 6],
  ];
  if (!hasWeekendAndHoliday && !hasWeekendOnly && !hasWeekdayOnly) {
    for (const [re, dNum] of dowMap) {
      if (re.test(s)) specificDows.add(dNum);
    }
  }

  const days: number[] = [];
  for (let d = 1; d <= numDays; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    const isHol = isJapaneseHoliday(year, month, d);
    let matched = false;
    if (hasWeekendAndHoliday) {
      matched = dow === 0 || dow === 6 || isHol;
    } else if (hasWeekendOnly) {
      matched = dow === 0 || dow === 6;
    } else if (hasHolidayOnly) {
      matched = isHol;
    } else if (hasWeekdayOnly) {
      matched = dow >= 1 && dow <= 5 && !isHol;
    } else if (specificDows.size > 0) {
      matched = specificDows.has(dow);
    }
    if (matched && excludeHolidays && isHol) {
      matched = false;
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

export type NurseRole = "leader" | "mid" | "newcomer";

export const ROLE_LABELS: Record<NurseRole, string> = {
  leader: "リーダー・主任",
  mid: "中堅",
  newcomer: "新人",
};

export type BaseNurseSkill = "leader_cap" | "icu_er" | "ventilator";
export type NurseSkill = BaseNurseSkill | (string & {});

export interface SkillDefinition {
  code: NurseSkill;
  label: string;
  shortLabel?: string;
  badge?: string;
  minDay: number;
  minEvening: number;
  minNight: number;
  /** Optional target skill code that this skill can substitute for (e.g. "leader_cap" for "副リーダー") */
  substitutesFor?: NurseSkill;
  builtIn?: boolean;
}

export const SKILL_LABELS: Record<BaseNurseSkill, { label: string; badge: string }> = {
  leader_cap: { label: "リーダー業務可", badge: "👑リーダー" },
  icu_er: { label: "救急・重症対応", badge: "🚑救急/ICU" },
  ventilator: { label: "人工呼吸器管理", badge: "🫁呼吸器" },
};

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
  if (code in SKILL_LABELS) {
    return SKILL_LABELS[code as BaseNurseSkill];
  }
  return { label: code, badge: `🎖️${code}` };
}

export function createDefaultSkillDefs(config?: Partial<NurseScheduleConfig>): SkillDefinition[] {
  return [
    {
      code: "leader_cap",
      label: "リーダー業務可",
      shortLabel: "リ",
      badge: "👑リーダー",
      minDay: config?.minLeadersDay ?? 2,
      minEvening: config?.minLeadersEvening ?? 1,
      minNight: config?.minLeadersNight ?? 1,
      builtIn: true,
    },
    {
      code: "icu_er",
      label: "救急・重症対応",
      shortLabel: "救",
      badge: "🚑救急/ICU",
      minDay: config?.minIcuDay ?? 2,
      minEvening: config?.minIcuEvening ?? 1,
      minNight: config?.minIcuNight ?? 1,
      builtIn: true,
    },
    {
      code: "ventilator",
      label: "人工呼吸器管理",
      shortLabel: "呼",
      badge: "🫁呼吸器",
      minDay: 0,
      minEvening: 0,
      minNight: 0,
      builtIn: true,
    },
  ];
}

/**
 * Checks whether a nurse holds `targetSkillCode` directly OR holds a skill that substitutes for `targetSkillCode`
 * (e.g. holding "sub_leader" with `substitutesFor: "leader_cap"`).
 */
export function doesNurseSatisfySkill(
  nurse: NurseProfile,
  targetSkillCode: NurseSkill,
  skillDefs?: readonly SkillDefinition[]
): boolean {
  if (nurse.skills.includes(targetSkillCode)) return true;
  if (!skillDefs || skillDefs.length === 0) return false;
  return nurse.skills.some((heldCode) => {
    const def = skillDefs.find((d) => d.code === heldCode);
    return def?.substitutesFor === targetSkillCode;
  });
}

/**
 * Checks whether a nurse matches a unified attribute code/label:
 * - "all" / "全員": all nurses
 * - "team_A" / "A" / "A班": nurses in Team A (`nurse.team === "A"`)
 * - "team_B" / "B" / "B班": nurses in Team B (`nurse.team === "B"`)
 * - "newcomer" / "新人": newcomer role (`nurse.role === "newcomer"`)
 * - "mid" / "中堅": mid-career role (`nurse.role === "mid"`)
 * - "role_leader" / "主任": leader role (`nurse.role === "leader"`)
 * - any skill code or label in `skillDefs` (via `doesNurseSatisfySkill`)
 */
export function doesNurseMatchAttribute(
  nurse: NurseProfile,
  attribute: string,
  skillDefs?: readonly SkillDefinition[]
): boolean {
  const norm = attribute.trim();
  if (!norm || norm === "all" || norm === "全員" || norm === "全体") return true;
  if (norm === "team_A" || norm === "A" || norm === "A班" || norm === "Group A" || norm === "グループA") {
    return nurse.team === "A";
  }
  if (norm === "team_B" || norm === "B" || norm === "B班" || norm === "Group B" || norm === "グループB") {
    return nurse.team === "B";
  }
  if (norm === "newcomer" || norm === "新人") return nurse.role === "newcomer";
  if (norm === "mid" || norm === "中堅") return nurse.role === "mid";
  if (norm === "role_leader" || norm === "主任") return nurse.role === "leader";
  return doesNurseSatisfySkill(nurse, norm, skillDefs);
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
  role: NurseRole;
  /** Optional subgroup label (e.g., "新人1", "新人2(研済)") displayed in UI when role is split */
  subRoleLabel?: string;
  team: "A" | "B";
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
  | "nurse_max_night"
  | "ng_pair_custom"
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
  nurseBId?: string;
  /** Explicit subset of nurse IDs (e.g. 新人1 group vs 新人2 group) */
  nurseIds?: string[];
  targetRole?: NurseRole | "all";
  day?: number; // 1..numDays
  shift?: ShiftCode;
  forbidShifts?: ShiftCode[];
  /** Target shifts for pair rules (`ng_pair_custom`) or unified staffing rules (`staffing_rule`), e.g. ["D_A"], ["D_B"], ["D_A", "D_B"], ["E", "N"], or custom shift codes */
  shifts?: ShiftCode[];
  /** Target nurse attribute/skill/role/team for `staffing_rule` (e.g. "all", "team_A", "team_B", "newcomer", "leader_cap", "icu_er") */
  attribute?: string;
  /** When true, assigning nurses matching `attribute` to `shifts` incurs a calibrated soft penalty (used for cross-team help only when short) */
  onlyWhenShort?: boolean;
  minStaff?: number;
  maxStaff?: number;
  maxNight?: number;
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
  /** Grouping mode for night shift leveling ("role_and_skill" | "role" | "skill" | "all") */
  levelGroupBy?: "role_and_skill" | "role" | "skill" | "all";
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

  // 2. Skill & Role Coverage per Shift
  enforceSkillCoverage: boolean;
  minLeadersDay: number; // default 2
  minLeadersEvening: number; // default 1
  minLeadersNight: number; // default 1
  minIcuDay: number; // default 2
  minIcuEvening: number; // default 1
  minIcuNight: number; // default 1
  enforceNewcomerNightLimit: boolean;
  maxNewcomersNight: number; // default 1 per E/N shift

  // 3. 3-Shift Transition & Previous Month Carryover Rules
  enforcePrevMonthCarryover: boolean;
  forbidNightToDay: boolean; // N -> D forbidden
  forbidEveningToDay: boolean; // E -> D forbidden
  forbidEveningToNight: boolean; // E -> N forbidden
  forbidNightToEvening: boolean; // N -> E forbidden
  /** 日勤→翌日深夜勤（日深夜 D -> N）の禁止 */
  forbidDayToNight?: boolean;
  /** 連続準夜勤（準夜→翌日準夜 E -> E）の禁止 */
  forbidEveningToEvening?: boolean;
  /** 連続深夜勤（深夜→翌日深夜 N -> N）の禁止（深夜は単発1回のみ可） */
  forbidNightToNight?: boolean;
  maxConsecutiveNight2: boolean; // N -> N -> N forbidden (at most 2 consecutive N)
  /** 深夜勤明けの翌日は必ず公休にする（連続深夜勤 N -> N も禁止し N -> O を必須化） */
  requireOffAfterNight?: boolean;

  // 4. Monthly & Consecutive Workload Rules + 36 Agreement (36協定)
  maxConsecutiveWorkDays: number; // default 5 (window of 6 days <= 5)
  minMonthlyDaysOff: number; // default 9 days off
  minMonthlyWorkDays: number; // default 14 work days
  maxMonthlyNightShifts: number; // default 8 (E + N <= 8)
  requireWeekendOff: boolean; // at least 2 weekend days off per month
  enforceNgPairs: boolean; // NG pairs cannot share E or N shifts on the same day
  /** プリセプター同行夜勤（新人が夜勤に入る日は指導ペアの先輩も同シフトに配置） */
  enforcePreceptorPairs?: boolean;
  /** 固定チームナーシング（A班・B班）の日勤帯均等配置 */
  enforceTeamBalance?: boolean;
  minTeamMembersDay?: number; // default 3 per team on Day shift
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
   * 指定された基本ルールキー（例: "requireWeekendOff", "enforceSkillCoverage", "enforcePreceptorPairs", "enforceNgPairs", "enforceTeamBalance", "maxConsecutiveWorkDays", "maxMonthlyNightShifts" 等）に
   * 正の数値（ペナルティ重み w > 0）が設定されている場合、その基本ルールはハード制約ではなくスラック重み w のソフト制約として動作する。
   */
  softRuleWeights?: Record<string, number>;
}

export type ShiftTransitionPolicy = "allow" | "forbid" | "require";

export type ShiftTransitionMatrix = Record<
  "D" | "E" | "N",
  Record<"D" | "E" | "N" | "O", ShiftTransitionPolicy>
>;

/**
 * Builds the 3×4 Shift Transition Matrix (`fromShift` in `D | E | N` -> `toShift` in `D | E | N | O`)
 * synchronized with `NurseScheduleConfig`.
 */
export function getShiftTransitionMatrix(
  config: NurseScheduleConfig
): ShiftTransitionMatrix {
  const nReqOff = Boolean(
    config.requireOffAfterNight ||
      (config.forbidNightToDay &&
        config.forbidNightToEvening &&
        config.forbidNightToNight)
  );
  return {
    D: {
      D: "allow",
      E: "allow",
      N: config.forbidDayToNight ? "forbid" : "allow",
      O: "allow",
    },
    E: {
      D: config.forbidEveningToDay ? "forbid" : "allow",
      E: config.forbidEveningToEvening ? "forbid" : "allow",
      N: config.forbidEveningToNight ? "forbid" : "allow",
      O: "allow",
    },
    N: {
      D: nReqOff || config.forbidNightToDay ? "forbid" : "allow",
      E: nReqOff || config.forbidNightToEvening ? "forbid" : "allow",
      N: nReqOff || config.forbidNightToNight ? "forbid" : "allow",
      O: nReqOff ? "require" : "allow",
    },
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
  const next: NurseScheduleConfig = { ...config };
  const isForbid = policy === "forbid";
  const isRequire = policy === "require";

  if (fromShift === "N" && toShift === "O") {
    next.requireOffAfterNight = isRequire;
    if (isRequire) {
      next.forbidNightToDay = true;
      next.forbidNightToEvening = true;
      next.forbidNightToNight = true;
    }
    return next;
  }

  if (fromShift === "N") {
    if (policy === "allow") {
      next.requireOffAfterNight = false;
    }
    if (toShift === "D") next.forbidNightToDay = isForbid;
    else if (toShift === "E") next.forbidNightToEvening = isForbid;
    else if (toShift === "N") next.forbidNightToNight = isForbid;
    return next;
  }

  if (fromShift === "E") {
    if (toShift === "D") next.forbidEveningToDay = isForbid;
    else if (toShift === "E") next.forbidEveningToEvening = isForbid;
    else if (toShift === "N") next.forbidEveningToNight = isForbid;
    return next;
  }

  if (fromShift === "D" && toShift === "N") {
    next.forbidDayToNight = isForbid;
  }
  return next;
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
  leaders: Record<ActiveShiftCode, number>;
  icuSkills: Record<ActiveShiftCode, number>;
  newcomers: Record<ActiveShiftCode, number>;
}

export interface NurseMonthlySummary {
  nurseId: string;
  counts: Record<string, number>;
  totalWorkDays: number;
  totalNightShifts: number; // E + N
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

/**
 * Structured operation extracted by Gemini Nano from user chat messages
 */
export interface ChatConstraintOperation {
  op:
    | "set_param"
    | "toggle_rule"
    | "add_request"
    | "forbid_shift"
    | "add_date_coverage"
    | "add_daily_shift_cap"
    | "add_ng_pair"
    | "add_preceptor_pair"
    | "add_custom_shift"
    | "add_shift_quota"
    | "add_shift_day_restriction"
    | "add_shift_prerequisite"
    | "allow_prev_month_shift"
    | "level_night_shifts"
    | "add_skill_def"
    | "remove_skill_def"
    | "update_nurse_skill"
    | "set_staffing_rule"
    | "set_nurse_contract"
    | "set_shift_transition"
    | "clear_custom_rules"
    | "inject_conflict_demo"
    | "reset_default";
  paramName?:
    | "weekdayDayStaff"
    | "weekendDayStaff"
    | "eveningStaff"
    | "nightStaff"
    | "maxConsecutiveWorkDays"
    | "minMonthlyDaysOff"
    | "minMonthlyWorkDays"
    | "maxMonthlyNightShifts"
    | "minLeadersDay"
    | "minLeadersEvening"
    | "minLeadersNight"
    | "minIcuDay"
    | "minIcuEvening"
    | "minIcuNight"
    | "maxNewcomersNight"
    | "minTeamMembersDay"
    | "maxMonthlyOvertimeHours"
    | "maxAnnualOvertimeHours"
    | "staffCount";
  paramValue?: number;
  ruleName?:
    | "forbidNightToDay"
    | "forbidEveningToDay"
    | "forbidEveningToNight"
    | "forbidNightToEvening"
    | "forbidDayToNight"
    | "forbidEveningToEvening"
    | "forbidNightToNight"
    | "maxConsecutiveNight2"
    | "requireOffAfterNight"
    | "enforcePrevMonthCarryover"
    | "enforceSkillCoverage"
    | "enforceNewcomerNightLimit"
    | "requireWeekendOff"
    | "enforceNgPairs"
    | "enforcePreceptorPairs"
    | "enforceTeamBalance"
    | "enforceHardRequests"
    | "enforce36Agreement"
    | "preserveCurrentSchedule";
  ruleEnabled?: boolean;
  /** Shift transition fields for `set_shift_transition` */
  fromShift?: "D" | "E" | "N";
  toShift?: "D" | "E" | "N" | "O";
  transitionPolicy?: "forbid" | "allow" | "require";
  nurseNameOrId?: string;
  nurseBNameOrId?: string;
  nurseIds?: string[];
  targetRole?: NurseRole | "all";
  day?: number;
  days?: number[];
  shift?: ShiftCode;
  baseShift?: BaseShiftCode;
  includedInAliases?: string[];
  shiftName?: string;
  shortLabel?: string;
  forbidShifts?: ShiftCode[];
  shifts?: ShiftCode[];
  targetShift?: string;
  attribute?: string;
  onlyWhenShort?: boolean;
  minStaff?: number;
  maxStaff?: number;
  minCount?: number;
  maxCount?: number;
  includePrevMonth?: boolean;
  allowedDaysOfWeek?: number[];
  startDay?: number;
  endDay?: number;
  prereqShift?: ShiftCode;
  prereqMinCount?: number;
  restrictedShifts?: ShiftCode[];
  levelGroupBy?: "role_and_skill" | "role" | "skill" | "all";
  /** Skill management fields */
  skillName?: string;
  skillCode?: string;
  skillShortLabel?: string;
  substitutesFor?: string;
  skillMinDay?: number;
  skillMinEvening?: number;
  skillMinNight?: number;
  skillAction?: "add" | "remove";
  /** Individual nurse contract fields */
  nightOk?: boolean;
  maxMonthlyNightShifts?: number;
  minMonthlyDaysOff?: number;
  minMonthlyWorkDays?: number;
  maxMonthlyWorkDays?: number;
  maxConsecutiveWorkDays?: number;
  forbiddenShifts?: ActiveShiftCode[];
  weekdayOnly?: boolean;
  holidaysOff?: boolean;
  onlyMatchedDaysWork?: boolean;
  isCalendarPattern?: boolean;
  isHard?: boolean;
  penaltyWeight?: number;
  reason?: string;
}

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
  /** Trace of Stage 1 (tool_types) and Stage 2 (tool_name + args) selected by Gemini Nano */
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
