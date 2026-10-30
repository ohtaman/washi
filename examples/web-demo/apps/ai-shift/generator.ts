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
      label: "リーダー業務可",
      shortLabel: "リ",
      badge: "👑リーダー",
      category: "skill",
      aliases: [
        "leader_cap",
        "リーダー業務可",
        "リーダー",
        "リーダー業務",
        "リーダースキル",
        "日勤リーダー",
        "夜勤リーダー",
      ],
      minDay: 2,
      minEvening: 1,
      minNight: 1,
      builtIn: true,
    },
    {
      code: "icu_er",
      label: "救急・重症対応",
      shortLabel: "救",
      badge: "🚑救急/ICU",
      category: "skill",
      aliases: ["icu_er", "救急・重症対応", "救急・ICU", "救急", "ICU", "重症対応"],
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
      shortLabel: "新",
      badge: "🌱新人",
      category: "role",
      aliases: ["newcomer", "新人", "新人スタッフ", "新人看護師"],
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
      shortLabel: "中",
      badge: "中堅",
      category: "role",
      aliases: ["mid", "中堅", "中堅スタッフ", "中堅看護師"],
      minDay: 0,
      minEvening: 0,
      minNight: 0,
      builtIn: true,
    },
    {
      code: "leader",
      label: "リーダー・主任",
      shortLabel: "主任",
      badge: "主任",
      category: "role",
      aliases: ["leader", "role_leader", "リーダー・主任", "主任"],
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
        "グループA",
        "グループ A",
        "Aグループ",
        "A グループ",
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
        "グループB",
        "グループ B",
        "Bグループ",
        "B グループ",
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
  { name: "佐藤 美咲", kana: "さとう みさき" },
  { name: "鈴木 陽菜", kana: "すずき ひな" },
  { name: "高橋 健太", kana: "たかはし けんた" },
  { name: "田中 彩乃", kana: "たなか あやの" },
  { name: "伊藤 結衣", kana: "いとう ゆい" },
  { name: "渡辺 翔太", kana: "わたなべ しょうた" },
  { name: "山本 凛", kana: "やまもと りん" },
  { name: "中村 優奈", kana: "なかむら ゆうな" },
  { name: "小林 誠", kana: "こばやし まこと" },
  { name: "加藤 美月", kana: "かとう みづき" },
  { name: "吉田 葵", kana: "よしだ あおい" },
  { name: "山田 拓海", kana: "やまだ たくみ" },
  { name: "佐々木 楓", kana: "ささき かえで" },
  { name: "山口 莉子", kana: "やまぐち りこ" },
  { name: "松本 大輝", kana: "まつもと だいき" },
  { name: "井上 芽依", kana: "いのうえ めい" },
  { name: "木村 琴音", kana: "きむら ことね" },
  { name: "林 颯太", kana: "はやし そうた" },
  { name: "斎藤 杏奈", kana: "さいとう あんな" },
  { name: "清水 遥", kana: "しみず はるか" },
  { name: "山崎 翼", kana: "やまざき つばさ" },
  { name: "森 花音", kana: "もり かのん" },
  { name: "池田 結菜", kana: "いけだ ゆいな" },
  { name: "橋本 陸", kana: "はしもと りく" },
  { name: "阿部 桜", kana: "あべ さくら" },
  { name: "石川 菜々美", kana: "いしかわ ななみ" },
  { name: "山下 蓮", kana: "やました れん" },
  { name: "中島 詩織", kana: "なかじま しおり" },
  { name: "石井 亮介", kana: "いしい りょうすけ" },
  { name: "小川 真央", kana: "おがわ まお" },
  { name: "前田 奏", kana: "まえだ かなで" },
  { name: "岡田 千尋", kana: "おかだ ちひろ" },
  { name: "長谷川 駿", kana: "はせがわ しゅん" },
  { name: "藤田 茉白", kana: "ふじた ましろ" },
  { name: "後藤 優斗", kana: "ごとう ゆうと" },
  { name: "近藤 未来", kana: "こんどう みらい" },
];

const HARD_OFF_REASONS = [
  "有給休暇（申請済）",
  "冠婚葬祭",
  "院外研修・学会参加",
  "通院・健診予約",
  "家族行事（確定休）",
];

const SOFT_OFF_REASONS = [
  "公休希望（旅行）",
  "リフレッシュ休希望",
  "家庭の都合（希望休）",
  "週末休み希望",
];

const SOFT_DAY_REASONS = [
  "日勤希望（夕方予定あり）",
  "委員会出席のため日勤希望",
  "カンファレンス担当日",
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

    // 2 nurses in mid-career are daytime-only (日勤専従 / 育児短時間・夜勤免除)
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
  // 1) 3 Incompatible NG Pairs (相性NGペア: 同時夜勤不可)
  // 2) 3 Preceptor Pairs (プリセプター指導ペア: 新人×先輩)
  const relations: PairRelation[] = [];
  const nightEligible = nurses.filter((n) => n.nightOk);

  if (nightEligible.length >= 10) {
    relations.push({
      id: "ng_1",
      type: "ng_pair",
      nurseA: nightEligible[0].id,
      nurseB: nightEligible[4].id,
      reason: "過去のインシデント対応方針の相違により少人数夜勤の同席NG",
    });
    relations.push({
      id: "ng_2",
      type: "ng_pair",
      nurseA: nightEligible[2].id,
      nurseB: nightEligible[7].id,
      reason: "師長配慮：準夜・深夜帯の同一シフト配置を回避",
    });
    relations.push({
      id: "ng_3",
      type: "ng_pair",
      nurseA: nightEligible[5].id,
      nurseB: nightEligible[9].id,
      reason: "本人間の申し出により夜勤ペア配置を回避",
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
      reason: `プリセプター指導ペア（新人:${newcomers[k].name} ⇄ 指導:${seniors[k].name}）`,
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
      description: `日勤は平日に全員が${dayWeekday}人以上 (必須)`,
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
      description: `日勤は土日祝に全員が${dayWeekend}人以上 (必須)`,
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
      description: `準夜勤は毎日に全員が${eveStaff}人以上${eveStaff}人以下 (必須)`,
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
      description: `深夜勤は毎日に全員が${nightStaff}人以上${nightStaff}人以下 (必須)`,
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
      description: `日勤は毎日にリーダーが2人以上 (必須)`,
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
      description: `準夜勤は毎日にリーダーが1人以上 (必須)`,
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
      description: `深夜勤は毎日にリーダーが1人以上 (必須)`,
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
      description: `深夜勤は毎日に新人が1人以下 (必須)`,
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
      description: `【矛盾シナリオ】${n01.name}(${n01.id}) に1日の「日勤(D)固定」を指定（前月末日が深夜勤(N)のためインターバル違反と衝突）`,
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
      descriptionJa: `${n01.name}さんは前月末日が「深夜勤(N)」ですが、当月1日に「日勤(D)固定」を追加したため、前月引き継ぎのシフト遷移禁止（深夜→日勤禁止）と矛盾が発生します。`,
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
      description: `【矛盾シナリオ】${targetDay}日の日勤(D)必要人数を18名以上に引き上げ（準夜4名＋深夜4名＋確定休と衝突）`,
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
        description: `【矛盾シナリオ】${targetDay}日: ${nurse.name}(${nurse.id}) の学会参加による確定公休(O)`,
      });
    }
    return {
      updatedState: {
        ...state,
        customRules: nextCustomRules,
      },
      descriptionJa: `${targetDay}日に日勤18名以上（＋準夜4名・深夜4名＝計26名出勤）を要求しつつ、8名に学会参加の確定公休を指定したため、30名では物理的に人数が不足する矛盾が発生します。`,
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
      description: `【矛盾シナリオ】${targetDay}日: リーダー資格者 ${nurse.name}(${nurse.id}) の院外リーダー研修による確定休(O)`,
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
    descriptionJa: `${targetDay}日にリーダー資格者${offLeaders.length}名が院外研修で一斉に確定休（O）となったため、同日のリーダー必須配置（日勤2名＋準夜1名＋深夜1名＝計4名必要、残りリーダー2名のみ）が満たせず矛盾が発生します。`,
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

