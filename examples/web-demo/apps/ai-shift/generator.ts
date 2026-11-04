import {
  PREV_MONTH_DAYS,
  applyShiftTransitionToConfig,
  createDefaultShiftAliases,
  createDefaultShiftTransitions,
  type CustomConstraintRule,
  type NurseProfile,
  type NurseScheduleConfig,
  type NurseSchedulingState,
  type NurseSkill,
  type PairRelation,
  type ShiftCode,
  type ShiftPreference,
  type SkillDefinition,
} from "./types.js";

export const MIN_STAFF_COUNT = 15;
export const MAX_STAFF_COUNT = 36;

/**
 * Creates the initial demo skill, role, and group attribute definitions (`SkillDefinition[]`).
 * All domain attributes (clinical skills, staff roles, and ward teams) are represented uniformly
 * here in the demo generator rather than hardcoded in core solver/type primitives.
 */
export function createDefaultSkillDefs(): SkillDefinition[] {
  return [
    {
      code: "leader_cap",
      label: "Leader Qualified",
      shortLabel: "Lead",
      badge: "👑Leader",
      category: "skill",
      aliases: [
        "leader_cap",
        "\u30EA\u30FC\u30C0\u30FC業務可",
        "\u30EA\u30FC\u30C0\u30FC",
        "\u30EA\u30FC\u30C0\u30FC業務",
        "\u30EA\u30FC\u30C0\u30FC\u30B9\u30AD\u30EB",
        "日勤\u30EA\u30FC\u30C0\u30FC",
        "夜勤\u30EA\u30FC\u30C0\u30FC",
      ],
      minDay: 2,
      minEvening: 1,
      minNight: 1,
      builtIn: true,
    },
    {
      code: "icu_er",
      label: "ICU / Critical Care",
      shortLabel: "救",
      badge: "🚑救急/ICU",
      category: "skill",
      aliases: ["icu_er", "救急\u30FB重症対応", "救急\u30FBICU", "救急", "ICU", "重症対応"],
      minDay: 2,
      minEvening: 1,
      minNight: 1,
      builtIn: true,
    },
    {
      code: "ventilator",
      label: "人工呼吸器管理",
      shortLabel: "呼",
      badge: "🫁呼吸器",
      category: "skill",
      aliases: ["ventilator", "人工呼吸器管理", "人工呼吸器", "呼吸器"],
      minDay: 0,
      minEvening: 0,
      minNight: 0,
      builtIn: true,
    },
    {
      code: "newcomer",
      label: "新人",
      shortLabel: "New",
      badge: "🌱Newcomer",
      category: "role",
      aliases: ["newcomer", "新人", "新人\u30B9\u30BF\u30C3\u30D5", "新人看護師"],
      minDay: 0,
      minEvening: 0,
      minNight: 0,
      maxEvening: 1,
      maxNight: 1,
      builtIn: true,
    },
    {
      code: "mid",
      label: "中堅",
      shortLabel: "Mid",
      badge: "中堅",
      category: "role",
      aliases: ["mid", "中堅", "中堅\u30B9\u30BF\u30C3\u30D5", "中堅看護師"],
      minDay: 0,
      minEvening: 0,
      minNight: 0,
      builtIn: true,
    },
    {
      code: "leader",
      label: "Charge Nurse / Leader",
      shortLabel: "主任",
      badge: "主任",
      category: "role",
      aliases: ["leader", "role_leader", "\u30EA\u30FC\u30C0\u30FC\u30FB主任", "主任"],
      minDay: 0,
      minEvening: 0,
      minNight: 0,
      builtIn: true,
    },
    {
      code: "team_A",
      label: "A班(Group A)",
      shortLabel: "A班",
      badge: "A班",
      category: "group",
      aliases: [
        "team_A",
        "A",
        "A班",
        "Group A",
        "\u30B0\u30EB\u30FC\u30D7A",
        "\u30B0\u30EB\u30FC\u30D7 A",
        "A\u30B0\u30EB\u30FC\u30D7",
        "A \u30B0\u30EB\u30FC\u30D7",
        "属性A",
      ],
      minDay: 0,
      minEvening: 0,
      minNight: 0,
      builtIn: true,
    },
    {
      code: "team_B",
      label: "B班(Group B)",
      shortLabel: "B班",
      badge: "B班",
      category: "group",
      aliases: [
        "team_B",
        "B",
        "B班",
        "Group B",
        "\u30B0\u30EB\u30FC\u30D7B",
        "\u30B0\u30EB\u30FC\u30D7 B",
        "B\u30B0\u30EB\u30FC\u30D7",
        "B \u30B0\u30EB\u30FC\u30D7",
        "属性B",
      ],
      minDay: 0,
      minEvening: 0,
      minNight: 0,
      builtIn: true,
    },
  ];
}

const NURSE_CATALOG: ReadonlyArray<{ name: string; kana: string }> = [
  { name: "佐藤 美咲", kana: "\u3055\u3068\u3046 \u307F\u3055\u304D" },
  { name: "鈴木 陽菜", kana: "\u3059\u305A\u304D \u3072\u306A" },
  { name: "高橋 健太", kana: "\u305F\u304B\u306F\u3057 \u3051\u3093\u305F" },
  { name: "田中 彩乃", kana: "\u305F\u306A\u304B \u3042\u3084\u306E" },
  { name: "伊藤 結衣", kana: "\u3044\u3068\u3046 \u3086\u3044" },
  { name: "渡辺 翔太", kana: "\u308F\u305F\u306A\u3079 \u3057\u3087\u3046\u305F" },
  { name: "山本 凛", kana: "\u3084\u307E\u3082\u3068 \u308A\u3093" },
  { name: "中村 優奈", kana: "\u306A\u304B\u3080\u3089 \u3086\u3046\u306A" },
  { name: "小林 誠", kana: "\u3053\u3070\u3084\u3057 \u307E\u3053\u3068" },
  { name: "加藤 美月", kana: "\u304B\u3068\u3046 \u307F\u3065\u304D" },
  { name: "吉田 葵", kana: "\u3088\u3057\u3060 \u3042\u304A\u3044" },
  { name: "山田 拓海", kana: "\u3084\u307E\u3060 \u305F\u304F\u307F" },
  { name: "佐々木 楓", kana: "\u3055\u3055\u304D \u304B\u3048\u3067" },
  { name: "山口 莉子", kana: "\u3084\u307E\u3050\u3061 \u308A\u3053" },
  { name: "松本 大輝", kana: "\u307E\u3064\u3082\u3068 \u3060\u3044\u304D" },
  { name: "井上 芽依", kana: "\u3044\u306E\u3046\u3048 \u3081\u3044" },
  { name: "木村 琴音", kana: "\u304D\u3080\u3089 \u3053\u3068\u306D" },
  { name: "林 颯太", kana: "\u306F\u3084\u3057 \u305D\u3046\u305F" },
  { name: "斎藤 杏奈", kana: "\u3055\u3044\u3068\u3046 \u3042\u3093\u306A" },
  { name: "清水 遥", kana: "\u3057\u307F\u305A \u306F\u308B\u304B" },
  { name: "山崎 翼", kana: "\u3084\u307E\u3056\u304D \u3064\u3070\u3055" },
  { name: "森 花音", kana: "\u3082\u308A \u304B\u306E\u3093" },
  { name: "池田 結菜", kana: "\u3044\u3051\u3060 \u3086\u3044\u306A" },
  { name: "橋本 陸", kana: "\u306F\u3057\u3082\u3068 \u308A\u304F" },
  { name: "阿部 桜", kana: "\u3042\u3079 \u3055\u304F\u3089" },
  { name: "石川 菜々美", kana: "\u3044\u3057\u304B\u308F \u306A\u306A\u307F" },
  { name: "山下 蓮", kana: "\u3084\u307E\u3057\u305F \u308C\u3093" },
  { name: "中島 詩織", kana: "\u306A\u304B\u3058\u307E \u3057\u304A\u308A" },
  { name: "石井 亮介", kana: "\u3044\u3057\u3044 \u308A\u3087\u3046\u3059\u3051" },
  { name: "小川 真央", kana: "\u304A\u304C\u308F \u307E\u304A" },
  { name: "前田 奏", kana: "\u307E\u3048\u3060 \u304B\u306A\u3067" },
  { name: "岡田 千尋", kana: "\u304A\u304B\u3060 \u3061\u3072\u308D" },
  { name: "長谷川 駿", kana: "\u306F\u305B\u304C\u308F \u3057\u3085\u3093" },
  { name: "藤田 茉白", kana: "\u3075\u3058\u305F \u307E\u3057\u308D" },
  { name: "後藤 優斗", kana: "\u3054\u3068\u3046 \u3086\u3046\u3068" },
  { name: "近藤 未来", kana: "\u3053\u3093\u3069\u3046 \u307F\u3089\u3044" },
];

const HARD_OFF_REASONS = [
  "有給休暇（申請済）",
  "冠婚葬祭",
  "Conference / External Training",
  "Medical Appointment",
  "家族行事（確定休）",
];

const SOFT_OFF_REASONS = [
  "公休希望（旅行）",
  "Refresh Leave",
  "Family Matters",
  "Weekend Off Request",
];

const SOFT_DAY_REASONS = [
  "Day Shift Preferred (Evening Event)",
  "Day Shift Preferred (Committee Meeting)",
  "Conference Duty Day",
];

/**
 * Mulberry32 deterministic PRNG
 */
export function createPrng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getDayOfWeek(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getDay();
}

export const WEEKDAY_NAMES_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function createDefaultConfig(overrides?: Partial<NurseScheduleConfig>): NurseScheduleConfig {
  const year = overrides?.year ?? 2026;
  const month = overrides?.month ?? 11;
  const numDays = overrides?.numDays ?? getDaysInMonth(year, month);
  const staffCount = overrides?.staffCount ?? 30;

  return {
    year,
    month,
    numDays,
    staffCount,
    seed: overrides?.seed ?? 202611,

    // Daily headcount defaults for 30 nurses (Weekday: 10+3+3=16, Weekend: 7+3+3=13)
    weekdayDayStaff: Math.max(4, Math.round((staffCount * 10) / 30)),
    weekendDayStaff: Math.max(3, Math.round((staffCount * 7) / 30)),
    eveningStaff: Math.max(2, Math.round((staffCount * 3) / 30)),
    nightStaff: Math.max(2, Math.round((staffCount * 3) / 30)),

    enforceSkillCoverage: true,

    enforcePrevMonthCarryover: true,
    shiftTransitions: createDefaultShiftTransitions(),

    maxConsecutiveWorkDays: 5,
    minMonthlyDaysOff: 9,
    minMonthlyWorkDays: 14,
    maxMonthlyNightShifts: 8,
    requireWeekendOff: true,
    enforceNgPairs: true,
    enforcePreceptorPairs: false,
    enforceHardRequests: true,

    enforce36Agreement: true,
    maxMonthlyOvertimeHours: 45,
    maxAnnualOvertimeHours: 360,
    preserveCurrentSchedule: true,
    ...overrides,
  };
}

/**
 * Generates a realistic 7-day previous-month tail for a nurse that respects 3-shift transition rules
 * and max consecutive work days, while creating realistic carryover states at month end.
 */
function generatePrevMonthTail(
  rand: () => number,
  nightOk: boolean,
  nurseIndex: number,
  maxConsec: number
): ShiftCode[] {
  const tail: ShiftCode[] = [];
  let streak = 0;
  let consecN = 0;

  for (let d = 0; d < PREV_MONTH_DAYS; d++) {
    const prev: ShiftCode = d > 0 ? tail[d - 1] : "O";

    // Must take off if streak reached maxConsec - 1 (leave room or reset)
    if (streak >= Math.max(3, maxConsec - 1)) {
      tail.push("O");
      streak = 0;
      consecN = 0;
      continue;
    }

    const r = rand();
    // ~32% chance of day off
    if (r < 0.32) {
      tail.push("O");
      streak = 0;
      consecN = 0;
      continue;
    }

    if (!nightOk) {
      tail.push("D");
      streak++;
      consecN = 0;
      continue;
    }

    // Valid transitions from `prev`:
    // If prev === "N": cannot do "D" or "E", and if consecN >= 2 cannot do "N" -> must be "N" or "O"
    if (prev === "N") {
      if (consecN < 2 && rand() < 0.45) {
        tail.push("N");
        streak++;
        consecN++;
      } else {
        tail.push("O");
        streak = 0;
        consecN = 0;
      }
      continue;
    }

    // If prev === "E": cannot do "D" or "N" -> only "E" or "O"
    if (prev === "E") {
      if (rand() < 0.5) {
        tail.push("E");
        streak++;
        consecN = 0;
      } else {
        tail.push("O");
        streak = 0;
        consecN = 0;
      }
      continue;
    }

    // Otherwise prev is "D" or "O": can choose "D", "E", or "N"
    const pick = rand();
    if (pick < 0.62) {
      tail.push("D");
      streak++;
      consecN = 0;
    } else if (pick < 0.82) {
      tail.push("E");
      streak++;
      consecN = 0;
    } else {
      tail.push("N");
      streak++;
      consecN = 1;
    }
  }

  // Ensure deterministic showcase variety on the last day of previous month (index 6):
  // - Nurse 0 (N01): ends prev month with "N" (深夜勤) so Day 1 cannot be D or E
  // - Nurse 1 (N02): ends prev month with "E" (準夜勤) so Day 1 cannot be D or N
  // - Nurse 2 (N03): ends prev month on a 4-day work streak (O, O, O, D, D, D, D) so can only work 1 day before needing Off
  if (nurseIndex === 0 && nightOk) {
    tail[PREV_MONTH_DAYS - 2] = "O";
    tail[PREV_MONTH_DAYS - 1] = "N";
  } else if (nurseIndex === 1 && nightOk) {
    tail[PREV_MONTH_DAYS - 2] = "D";
    tail[PREV_MONTH_DAYS - 1] = "E";
  } else if (nurseIndex === 2) {
    tail[0] = "O";
    tail[1] = "D";
    tail[2] = "O";
    tail[3] = "D";
    tail[4] = "D";
    tail[5] = "D";
    tail[6] = "D";
  }

  return tail;
}

/**
 * Generates a complete ~30-nurse scheduling state with skills, compatibility pairs,
 * previous month carryover shifts, and monthly shift requests.
 */
export function generateNurseSchedulingState(
  configOverrides?: Partial<NurseScheduleConfig>
): NurseSchedulingState {
  const normalizedOverrides = configOverrides
    ? {
        ...configOverrides,
        ...(configOverrides.staffCount !== undefined
          ? {
              staffCount: Math.min(
                Math.max(MIN_STAFF_COUNT, Math.floor(configOverrides.staffCount) || 30),
                MAX_STAFF_COUNT
              ),
            }
          : {}),
      }
    : undefined;
  const config = createDefaultConfig(normalizedOverrides);
  const rand = createPrng(config.seed);
  const count = Math.min(Math.max(MIN_STAFF_COUNT, config.staffCount), MAX_STAFF_COUNT);
  config.staffCount = count;

  const nurses: NurseProfile[] = [];
  // Role breakdown for ~30 nurses:
  // ~30% leaders (9), ~50% mid-career (15), ~20% newcomers (6)
  const leaderCount = Math.max(4, Math.round(count * 0.3));
  const newcomerCount = Math.max(2, Math.round(count * 0.2));

  for (let i = 0; i < count; i++) {
    const id = `N${String(i + 1).padStart(2, "0")}`;
    const entry = NURSE_CATALOG[i];
    const teamAttr: NurseSkill = i % 2 === 0 ? "team_A" : "team_B";

    let tierAttr: "leader" | "mid" | "newcomer" = "mid";
    let yearsExp = 4 + Math.floor(rand() * 5);
    const skills: NurseSkill[] = [];

    if (i < leaderCount) {
      tierAttr = "leader";
      yearsExp = 8 + Math.floor(rand() * 10);
      skills.push("leader", teamAttr, "leader_cap");
      if (i % 2 === 0 || rand() < 0.65) skills.push("icu_er");
      if (rand() < 0.6) skills.push("ventilator");
    } else if (i >= count - newcomerCount) {
      tierAttr = "newcomer";
      yearsExp = 1;
      skills.push("newcomer", teamAttr);
    } else {
      tierAttr = "mid";
      skills.push("mid", teamAttr);
      // Top mid-career nurses also have leader_cap or icu_er
      if (i < leaderCount + Math.round(count * 0.18)) {
        skills.push("leader_cap");
      }
      if (rand() < 0.55) {
        skills.push("icu_er");
      }
      if (rand() < 0.45) {
        skills.push("ventilator");
      }
    }

    // 2 nurses in mid-career are daytime-only (日勤専従 / 育児短時間夜勤免除)
    const nightOk = !(tierAttr === "mid" && (i === leaderCount + 1 || i === leaderCount + 2));

    const prevMonthShifts = generatePrevMonthTail(
      rand,
      nightOk,
      i,
      config.maxConsecutiveWorkDays
    );

    // Deterministic 11-month cumulative statistics for 36 Agreement (36協定)
    // Nurses N04 (index 3) and N09 (index 8) are near the 360h annual limit (318h / 315h),
    // requiring careful current-month overtime control.
    const isNear36Limit = i === 3 || i === 8;
    const prev11MonthsOvertimeHours = isNear36Limit
      ? i === 3
        ? 318
        : 315
      : tierAttr === "leader"
        ? 210 + ((i * 19) % 75)
        : tierAttr === "mid"
          ? 175 + ((i * 23) % 85)
          : 120 + ((i * 17) % 60);
    const prev11MonthsWorkDays = 212 + ((i * 7) % 15);
    const prev11MonthsNightShifts = nightOk ? 62 + ((i * 11) % 24) : 0;
    const recent2MonthsAvgOvertime = isNear36Limit
      ? 36
      : Math.round((prev11MonthsOvertimeHours / 11) * 10) / 10;
    const paidLeaveDaysTaken = isNear36Limit ? 4 : 5 + (i % 6);

    nurses.push({
      id,
      name: entry.name,
      kana: entry.kana,
      skills,
      nightOk,
      yearsExp,
      prevMonthShifts,
      yearly36Stats: {
        prev11MonthsWorkDays,
        prev11MonthsNightShifts,
        prev11MonthsOvertimeHours,
        recent2MonthsAvgOvertime,
        paidLeaveDaysTaken,
      },
    });
  }

  // Generate Pairwise Relations:
  // 1) 3 Incompatible NG Pairs (相性NG: 同時夜勤不可)
  // 2) 3 Preceptor Pairs (指導: 新人×先輩)
  const relations: PairRelation[] = [];
  const nightEligible = nurses.filter((n) => n.nightOk);

  if (nightEligible.length >= 10) {
    relations.push({
      id: "ng_1",
      type: "ng_pair",
      nurseA: nightEligible[0].id,
      nurseB: nightEligible[4].id,
      reason: "Past incident handling discrepancy: avoid pairing for small night shifts",
    });
    relations.push({
      id: "ng_2",
      type: "ng_pair",
      nurseA: nightEligible[2].id,
      nurseB: nightEligible[7].id,
      reason: "Nurse manager accommodation: avoid same evening/night shift",
    });
    relations.push({
      id: "ng_3",
      type: "ng_pair",
      nurseA: nightEligible[5].id,
      nurseB: nightEligible[9].id,
      reason: "Mutual request: avoid night shift pairing",
    });
  }

  const newcomers = nurses.filter((n) => n.skills.includes("newcomer"));
  const seniors = nurses.filter((n) => n.skills.includes("leader") || n.skills.includes("leader_cap"));
  for (let k = 0; k < Math.min(3, newcomers.length, seniors.length); k++) {
    relations.push({
      id: `prec_${k + 1}`,
      type: "preceptor",
      enabled: false,
      nurseA: newcomers[k].id,
      nurseB: seniors[k].id,
      reason: `Preceptor training pair (Newcomer:${newcomers[k].name} <-> Mentor:${seniors[k].name})`,
    });
  }

  // Generate Monthly Shift Preferences (Hard & Soft)
  // Keep track of how many hard day-offs are placed on each day so we don't exceed safe capacity
  const preferences: ShiftPreference[] = [];
  const hardOffPerDay = new Array(config.numDays + 1).fill(0);
  const maxSafeHardOffPerDay = Math.max(2, Math.floor((count - (config.weekdayDayStaff + config.eveningStaff + config.nightStaff)) * 0.4));

  let prefSeq = 1;
  for (let i = 0; i < nurses.length; i++) {
    const nurse = nurses[i];
    // Each nurse has 1 hard request and 1-2 soft preferences across the month
    const usedDays = new Set<number>();

    // Avoid day 1 if nurse already has a special carryover demo state on day 1
    const tryPickDay = (): number | null => {
      for (let attempt = 0; attempt < 15; attempt++) {
        const d = 2 + Math.floor(rand() * (config.numDays - 2));
        if (!usedDays.has(d) && hardOffPerDay[d] < maxSafeHardOffPerDay) {
          return d;
        }
      }
      return null;
    };

    const hardDay = tryPickDay();
    if (hardDay !== null) {
      usedDays.add(hardDay);
      hardOffPerDay[hardDay]++;
      const reason = HARD_OFF_REASONS[Math.floor(rand() * HARD_OFF_REASONS.length)];
      preferences.push({
        id: `pref_${prefSeq++}`,
        nurseId: nurse.id,
        day: hardDay,
        shift: "O",
        isHard: true,
        reason,
      });
    }

    // 1 or 2 soft preferences
    const softCount = rand() < 0.6 ? 2 : 1;
    for (let s = 0; s < softCount; s++) {
      const d = 1 + Math.floor(rand() * config.numDays);
      if (usedDays.has(d)) continue;
      usedDays.add(d);

      const isDayPref = rand() < 0.3;
      const shift: ShiftCode = isDayPref ? "D" : "O";
      const reason = isDayPref
        ? SOFT_DAY_REASONS[Math.floor(rand() * SOFT_DAY_REASONS.length)]
        : SOFT_OFF_REASONS[Math.floor(rand() * SOFT_OFF_REASONS.length)];

      preferences.push({
        id: `pref_${prefSeq++}`,
        nurseId: nurse.id,
        day: d,
        shift,
        isHard: false,
        reason,
      });
    }
  }

  return {
    config,
    nurses,
    relations,
    preferences,
    customRules: [],
    customShiftDefs: [],
    skillDefs: createDefaultSkillDefs(),
  };
}

/**
 * Creates default staffing coverage rules (shift-, day-type-, and skill-level requirements).
 */
export function createDefaultStaffingRules(
  staffCount: number = 30
): CustomConstraintRule[] {
  const dayWeekday = Math.max(4, Math.round((staffCount / 30) * 10));
  const dayWeekend = Math.max(3, Math.round((staffCount / 30) * 7));
  const eveStaff = Math.max(2, Math.round((staffCount / 30) * 3));
  const nightStaff = Math.max(2, Math.round((staffCount / 30) * 3));

  return [
    {
      id: "default_staffing_day_weekday",
      kind: "staffing_rule",
      enabled: true,
      isHard: true,
      dayType: "weekday",
      shifts: ["D"],
      attribute: "all",
      minCount: dayWeekday,
      description: `Day shift requires at least ${dayWeekday} staff on weekdays (Mandatory)`,
    },
    {
      id: "default_staffing_day_weekend",
      kind: "staffing_rule",
      enabled: true,
      isHard: true,
      dayType: "weekend_holiday",
      shifts: ["D"],
      attribute: "all",
      minCount: dayWeekend,
      description: `Day shift requires at least ${dayWeekend} staff on weekends/holidays (Mandatory)`,
    },
    {
      id: "default_staffing_eve",
      kind: "staffing_rule",
      enabled: true,
      isHard: true,
      dayType: "all",
      shifts: ["E"],
      attribute: "all",
      minCount: eveStaff,
      maxCount: eveStaff,
      description: `Evening shift requires ${eveStaff} staff daily (Mandatory)`,
    },
    {
      id: "default_staffing_night",
      kind: "staffing_rule",
      enabled: true,
      isHard: true,
      dayType: "all",
      shifts: ["N"],
      attribute: "all",
      minCount: nightStaff,
      maxCount: nightStaff,
      description: `Night shift requires ${nightStaff} staff daily (Mandatory)`,
    },
    {
      id: "default_staffing_leader_day",
      kind: "staffing_rule",
      enabled: true,
      isHard: true,
      dayType: "all",
      shifts: ["D"],
      attribute: "leader_cap",
      minCount: 2,
      description: `Day shift requires at least 2 leaders daily (Mandatory)`,
    },
    {
      id: "default_staffing_leader_eve",
      kind: "staffing_rule",
      enabled: true,
      isHard: true,
      dayType: "all",
      shifts: ["E"],
      attribute: "leader_cap",
      minCount: 1,
      description: `Evening shift requires at least 1 leader daily (Mandatory)`,
    },
    {
      id: "default_staffing_leader_night",
      kind: "staffing_rule",
      enabled: true,
      isHard: true,
      dayType: "all",
      shifts: ["N"],
      attribute: "leader_cap",
      minCount: 1,
      description: `Night shift requires at least 1 leader daily (Mandatory)`,
    },
    {
      id: "default_staffing_newcomer_night",
      kind: "staffing_rule",
      enabled: true,
      isHard: true,
      dayType: "all",
      shifts: ["N"],
      attribute: "newcomer",
      maxCount: 1,
      description: `Night shift allows at most 1 newcomer daily (Mandatory)`,
    },
  ];
}

/**
 * Injects a realistic nurse scheduling conflict into the state so the user can experience
 * WaSHI (HiGHS Infeasible detection + Elastic conflict diagnosis) and consult Gemini Nano.
 */
export function injectConflictScenario(
  state: NurseSchedulingState,
  scenarioType: "leader_shortage" | "carryover_clash" | "overload_day" = "leader_shortage"
): { updatedState: NurseSchedulingState; descriptionJa: string } {
  const nextCustomRules: CustomConstraintRule[] = [...state.customRules];
  const targetDay = Math.min(15, state.config.numDays);

  if (scenarioType === "carryover_clash") {
    // Nurse N01 ended previous month with Night shift ("N"), and now requests fixed Day shift ("D") on Day 1!
    const n01 = state.nurses[0];
    // Ensure N01's last day of prev month is "N"
    const updatedNurses = state.nurses.map((n, idx) => {
      if (idx !== 0) return n;
      const prev = [...n.prevMonthShifts];
      prev[PREV_MONTH_DAYS - 1] = "N";
      return { ...n, prevMonthShifts: prev };
    });

    nextCustomRules.push({
      id: `conflict_carryover_${Date.now()}`,
      kind: "pin_shift",
      enabled: true,
      nurseId: n01.id,
      day: 1,
      shift: "D",
      description: `[Conflict Demo] Pin Day shift (D) on Day 1 for ${n01.name} (${n01.id}) (Clashes with previous month Night shift interval)`,
    });

    return {
      updatedState: {
        ...state,
        config: applyShiftTransitionToConfig(
          {
            ...state.config,
            enforcePrevMonthCarryover: true,
          },
          "N",
          "D",
          "forbid"
        ),
        nurses: updatedNurses,
        customRules: nextCustomRules,
      },
      descriptionJa: `Pinned Day shift (D) on Day 1 for ${n01.name} (${n01.id}) after previous month ending in Night shift (N), violating rest interval transition rule.`,
    };
  }

  if (scenarioType === "overload_day") {
    // Require 16 Day nurses on targetDay while also giving 12 nurses fixed Off on targetDay
    nextCustomRules.push({
      id: `conflict_cov_${Date.now()}`,
      kind: "date_coverage",
      enabled: true,
      day: targetDay,
      shift: "D",
      minStaff: 18,
      description: `[Conflict Demo] Day ${targetDay}: Raised Day shift requirement to 18+ staff (Clashes with Evening 4 + Night 4 + Confirmed Offs)`,
    });
    for (let i = 0; i < Math.min(8, state.nurses.length); i++) {
      const nurse = state.nurses[i];
      nextCustomRules.push({
        id: `conflict_off_${nurse.id}_${Date.now()}_${i}`,
        kind: "pin_shift",
        enabled: true,
        nurseId: nurse.id,
        day: targetDay,
        shift: "O",
        description: `[Conflict Demo] Day ${targetDay}: ${nurse.name} (${nurse.id}) confirmed Off (O) for conference`,
      });
    }
    return {
      updatedState: {
        ...state,
        customRules: nextCustomRules,
      },
      descriptionJa: `Requested 18+ Day staff (+ 4 Evening + 4 Night = 26 staff) on Day ${targetDay} while 8 nurses are on mandatory conference leave, causing staffing shortage for 30 nurses.`,
    };
  }

  // Default: "leader_shortage" - All leader-capable nurses except 2 request Day 15 off, while Day(2)+Evening(1)+Night(1)=4 leaders are needed!
  const leaderNurses = state.nurses.filter((n) => n.skills.includes("leader_cap"));
  const offLeaders = leaderNurses.slice(0, Math.max(1, leaderNurses.length - 2));
  for (let i = 0; i < offLeaders.length; i++) {
    const nurse = offLeaders[i];
    nextCustomRules.push({
      id: `conflict_leader_off_${nurse.id}_${Date.now()}_${i}`,
      kind: "pin_shift",
      enabled: true,
      nurseId: nurse.id,
      day: targetDay,
      shift: "O",
      description: `[Conflict Demo] Day ${targetDay}: Leader ${nurse.name} (${nurse.id}) confirmed Off (O) for leadership workshop`,
    });
  }

  const nextSkills = (state.skillDefs ?? createDefaultSkillDefs()).map((s) =>
    s.code === "leader_cap"
      ? { ...s, minDay: 2, minEvening: 1, minNight: 1 }
      : s
  );

  return {
    updatedState: {
      ...state,
      config: {
        ...state.config,
        enforceSkillCoverage: true,
      },
      skillDefs: nextSkills,
      customRules: nextCustomRules,
    },
    descriptionJa: `On Day ${targetDay}, all ${offLeaders.length} qualified leaders are on mandatory workshop leave, leaving only 2 leaders available when 4 are required (2 Day, 1 Evening, 1 Night).`,
  };
}

/**
 * Creates an empty/blank nurse scheduling state (no nurses, relations, preferences, or custom rules).
 * Used as the default starting state (blank slate) or when clearing the workspace.
 */
export function createBlankNurseSchedulingState(
  configOverrides?: Partial<NurseScheduleConfig>
): NurseSchedulingState {
  const config = createDefaultConfig({
    staffCount: 30,
    ...configOverrides,
  });
  return {
    config,
    nurses: [],
    relations: [],
    preferences: [],
    customRules: [],
    customShiftDefs: [],
    shiftAliases: createDefaultShiftAliases(),
    skillDefs: createDefaultSkillDefs(),
  };
}

