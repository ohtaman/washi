import {
  DAYS_OF_WEEK,
  STUDENT_COHORTS,
  type CohortId,
  type ConstraintMeta,
  type CourseCategory,
  type CourseProfile,
  type CustomTimetableRule,
  type EquipmentTag,
  type ProfessorProfile,
  type RoomProfile,
  type RoomType,
  type TimetableDay,
  type TimetableDiffReason,
  type TimetablePeriod,
  type TimetableState,
} from "./types.js";

import enCatalog from "./locales/en.json" with { type: "json" };
import jaCatalog from "./locales/ja.json" with { type: "json" };
import zhCatalog from "./locales/zh.json" with { type: "json" };

export type TimetableLang = "ja" | "en" | "zh";

export const TIMETABLE_LANG_STORAGE_KEY = "washi_games_lang";

const CATALOGS = {
  en: enCatalog,
  ja: jaCatalog,
  zh: zhCatalog,
};

export function detectBrowserTimetableLang(
  nav?: { languages?: readonly string[]; language?: string }
): TimetableLang {
  const navObj = nav ?? (typeof navigator !== "undefined" ? navigator : undefined);
  if (navObj) {
    const list = navObj.languages?.length
      ? navObj.languages
      : navObj.language
        ? [navObj.language]
        : [];
    for (const raw of list) {
      const lower = raw.toLowerCase();
      if (lower.startsWith("ja")) return "ja";
      if (lower.startsWith("zh")) return "zh";
      if (lower.startsWith("en")) return "en";
    }
  }
  return "en";
}

export function getTimetableLang(): TimetableLang {
  if (typeof window !== "undefined") {
    try {
      const q = new URLSearchParams(window.location.search).get("lang");
      if (q === "ja" || q === "en" || q === "zh") {
        return q;
      }
    } catch {
      // Ignore
    }
    try {
      const saved = window.localStorage.getItem(TIMETABLE_LANG_STORAGE_KEY);
      if (saved === "ja" || saved === "en" || saved === "zh") {
        return saved;
      }
    } catch {
      // Ignore
    }
    return detectBrowserTimetableLang();
  }
  return "en";
}

export function setTimetableLang(lang: TimetableLang): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(TIMETABLE_LANG_STORAGE_KEY, lang);
    } catch {
      // Ignore
    }
  }
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  }
}

export function pickTimetableLang<T>(
  lang: TimetableLang,
  map: { ja: T; en: T; zh: T }
): T {
  return map[lang] ?? map.ja;
}

export const DAY_SHORT_I18N: Record<TimetableLang, Record<TimetableDay, string>> = {
  en: enCatalog.daysShort as Record<TimetableDay, string>,
  ja: jaCatalog.daysShort as Record<TimetableDay, string>,
  zh: zhCatalog.daysShort as Record<TimetableDay, string>,
};

export const DAY_HEADER_I18N: Record<TimetableLang, Record<TimetableDay, string>> = {
  en: enCatalog.daysHeader as Record<TimetableDay, string>,
  ja: jaCatalog.daysHeader as Record<TimetableDay, string>,
  zh: zhCatalog.daysHeader as Record<TimetableDay, string>,
};

export const DAY_FULL_I18N: Record<TimetableLang, Record<TimetableDay, string>> = {
  en: enCatalog.daysFull as Record<TimetableDay, string>,
  ja: jaCatalog.daysFull as Record<TimetableDay, string>,
  zh: zhCatalog.daysFull as Record<TimetableDay, string>,
};

export function formatPeriodI18n(period: TimetablePeriod, lang: TimetableLang): string {
  if (lang === "en") return `P${period}`;
  if (lang === "zh") return `\u7B2C${period}\u8282`;
  return `${period}\u9650`;
}

export function formatSlotI18n(
  day: TimetableDay,
  period: TimetablePeriod,
  lang: TimetableLang
): string {
  if (lang === "en") return `${DAY_SHORT_I18N.en[day]} P${period}`;
  if (lang === "zh") return `${DAY_SHORT_I18N.zh[day]}\u7B2C${period}\u8282`;
  return `${DAY_SHORT_I18N.ja[day]}\u66DC${period}\u9650`;
}

export const COHORT_I18N: Record<
  TimetableLang,
  Record<CohortId, { label: string; shortLabel: string }>
> = {
  en: enCatalog.cohorts as Record<CohortId, { label: string; shortLabel: string }>,
  ja: jaCatalog.cohorts as Record<CohortId, { label: string; shortLabel: string }>,
  zh: zhCatalog.cohorts as Record<CohortId, { label: string; shortLabel: string }>,
};

export const CATEGORY_I18N: Record<
  TimetableLang,
  Record<CourseCategory, { label: string; shortLabel: string; colorClass: string }>
> = {
  en: enCatalog.categories as Record<CourseCategory, { label: string; shortLabel: string; colorClass: string }>,
  ja: jaCatalog.categories as Record<CourseCategory, { label: string; shortLabel: string; colorClass: string }>,
  zh: zhCatalog.categories as Record<CourseCategory, { label: string; shortLabel: string; colorClass: string }>,
};

export const ROOM_TYPE_I18N: Record<TimetableLang, Record<RoomType, string>> = {
  en: enCatalog.roomTypes as Record<RoomType, string>,
  ja: jaCatalog.roomTypes as Record<RoomType, string>,
  zh: zhCatalog.roomTypes as Record<RoomType, string>,
};

export const EQUIPMENT_I18N: Record<TimetableLang, Record<EquipmentTag, string>> = {
  en: enCatalog.equipment as Record<EquipmentTag, string>,
  ja: jaCatalog.equipment as Record<EquipmentTag, string>,
  zh: zhCatalog.equipment as Record<EquipmentTag, string>,
};

export interface RoomI18nEntry {
  name: string;
  shortName: string;
  building: string;
}

export const ROOM_PROFILE_I18N: Record<
  string,
  Record<TimetableLang, RoomI18nEntry>
> = {};
for (const id of Object.keys(enCatalog.rooms)) {
  ROOM_PROFILE_I18N[id] = {
    en: (enCatalog.rooms as Record<string, RoomI18nEntry>)[id],
    ja: (jaCatalog.rooms as Record<string, RoomI18nEntry>)[id],
    zh: (zhCatalog.rooms as Record<string, RoomI18nEntry>)[id],
  };
}

export interface ProfessorI18nEntry {
  name: string;
  shortName: string;
  title: string;
  specialty: string;
}

export const PROFESSOR_PROFILE_I18N: Record<
  string,
  Record<TimetableLang, ProfessorI18nEntry>
> = {};
for (const id of Object.keys(enCatalog.professors)) {
  PROFESSOR_PROFILE_I18N[id] = {
    en: (enCatalog.professors as Record<string, ProfessorI18nEntry>)[id],
    ja: (jaCatalog.professors as Record<string, ProfessorI18nEntry>)[id],
    zh: (zhCatalog.professors as Record<string, ProfessorI18nEntry>)[id],
  };
}

export interface CourseI18nEntry {
  title: string;
  shortTitle: string;
}

export const COURSE_PROFILE_I18N: Record<
  string,
  Record<TimetableLang, CourseI18nEntry>
> = {};
for (const id of Object.keys(enCatalog.courses)) {
  COURSE_PROFILE_I18N[id] = {
    en: (enCatalog.courses as Record<string, CourseI18nEntry>)[id],
    ja: (jaCatalog.courses as Record<string, CourseI18nEntry>)[id],
    zh: (zhCatalog.courses as Record<string, CourseI18nEntry>)[id],
  };
}

export function getRoomI18n(room: RoomProfile, lang: TimetableLang) {
  return (
    ROOM_PROFILE_I18N[room.id]?.[lang] ?? {
      name: room.name,
      shortName: room.shortName,
      building: room.building,
    }
  );
}

export function getProfessorI18n(prof: ProfessorProfile, lang: TimetableLang) {
  return (
    PROFESSOR_PROFILE_I18N[prof.id]?.[lang] ?? {
      name: prof.name,
      shortName: prof.name.split(" ")[0],
      title: prof.title,
      specialty: prof.specialty,
    }
  );
}

export function getCourseI18n(course: CourseProfile, lang: TimetableLang) {
  return (
    COURSE_PROFILE_I18N[course.id]?.[lang] ?? {
      title: course.title,
      shortTitle: course.shortTitle,
    }
  );
}

export function formatSlotReasonI18n(reason: string | undefined, lang: TimetableLang): string {
  if (!reason) return "";
  const currentReasons = CATALOGS[lang].slotReasons as Record<string, string>;
  for (const l of ["en", "ja", "zh"] as const) {
    const cat = CATALOGS[l].slotReasons as Record<string, string>;
    for (const [key, val] of Object.entries(cat)) {
      if (val === reason) {
        return currentReasons[key] ?? reason;
      }
    }
  }
  return currentReasons[reason] ?? reason;
}

function DAY_SHORT_I18n(d: TimetableDay, lang: TimetableLang): string {
  return DAY_SHORT_I18N[lang][d];
}

export function formatCustomRuleI18n(
  rule: CustomTimetableRule,
  state: TimetableState,
  lang: TimetableLang
): string {
  const courseMap = new Map(state.courses.map((c) => [c.id, c]));
  const roomMap = new Map(state.rooms.map((r) => [r.id, r]));
  const profMap = new Map(state.professors.map((p) => [p.id, p]));

  const c1 = rule.courseId ? courseMap.get(rule.courseId) : undefined;
  const c2 = rule.secondCourseId ? courseMap.get(rule.secondCourseId) : undefined;
  const r = rule.roomId ? roomMap.get(rule.roomId) : undefined;
  const p = rule.professorId ? profMap.get(rule.professorId) : undefined;

  const c1Name = c1 ? `${getCourseI18n(c1, lang).title} (${c1.id})` : (rule.courseId ?? "");
  const c1Short = c1 ? `${getCourseI18n(c1, lang).shortTitle} (${c1.id})` : (rule.courseId ?? "");
  const c2Short = c2 ? `${getCourseI18n(c2, lang).shortTitle} (${c2.id})` : (rule.secondCourseId ?? "");
  const rName = r ? `${getRoomI18n(r, lang).name} (${r.id})` : "";
  const pName = p ? `${getProfessorI18n(p, lang).name} (${p.id})` : "";

  const isDemo = rule.id.startsWith("conflict_demo_");
  const rulesCatalog = CATALOGS[lang].rules;
  const demoPrefix = isDemo ? rulesCatalog.demoPrefix : "";

  if (rule.kind === "pin_slot" && rule.days?.length && rule.periods?.length) {
    const slotStr =
      rule.days.length === 1 && rule.periods.length === 1
        ? formatSlotI18n(rule.days[0], rule.periods[0], lang)
        : `${rule.days.map((d) => DAY_SHORT_I18n(d, lang)).join("/")} ${rule.periods.map((pr) => formatPeriodI18n(pr, lang)).join("/")}`;
    const rPart = rName ? (lang === "en" ? ` in ${rName}` : `\u30FB${rName}`) : "";
    return rulesCatalog.pinSlot
      .replace("{demoPrefix}", demoPrefix)
      .replace("{c1Name}", c1Name)
      .replace("{slotStr}", slotStr)
      .replace("{rName}", rPart);
  }

  if (rule.kind === "forbid_slot") {
    const daysStr = (rule.days ?? DAYS_OF_WEEK).map((d) => DAY_SHORT_I18n(d, lang)).join("/");
    const periodsStr =
      !rule.periods || rule.periods.length === 5
        ? rulesCatalog.allDay
        : rule.periods.map((pr) => formatPeriodI18n(pr, lang)).join("/");
    return rulesCatalog.forbidSlot
      .replace("{target}", c1Name || pName)
      .replace("{daysStr}", daysStr)
      .replace("{periodsStr}", periodsStr);
  }

  if (rule.kind === "require_room" || rule.kind === "forbid_room") {
    const target = rName || (rule.roomType ? ROOM_TYPE_I18N[lang][rule.roomType] : "");
    const template = rule.kind === "require_room" ? rulesCatalog.requireRoom : rulesCatalog.forbidRoom;
    return template
      .replace("{c1Name}", c1Name)
      .replace("{target}", target);
  }

  if (rule.kind === "course_no_overlap") {
    return rulesCatalog.noOverlap
      .replace("{c1Short}", c1Short)
      .replace("{c2Short}", c2Short);
  }

  if (rule.kind === "course_consecutive") {
    const c2Part = c2 ? rulesCatalog.andOther.replace("{other}", c2Short) : "";
    return rulesCatalog.consecutive
      .replace("{c1Short}", c1Short)
      .replace("{c2Short}", c2Part);
  }

  if (rule.kind === "course_same_day") {
    const c2Part = c2 ? rulesCatalog.andOther.replace("{other}", c2Short) : "";
    return rulesCatalog.sameDay
      .replace("{c1Short}", c1Short)
      .replace("{c2Short}", c2Part);
  }

  if (rule.kind === "course_precedence") {
    return rulesCatalog.precedence
      .replace("{c1Short}", c1Short)
      .replace("{c2Short}", c2Short);
  }

  if (rule.kind === "room_closure") {
    const daysStr = (rule.days ?? DAYS_OF_WEEK).map((d) => DAY_SHORT_I18n(d, lang)).join("/");
    const periodsStr = (rule.periods ?? []).map((pr) => formatPeriodI18n(pr, lang)).join("/");
    return rulesCatalog.closure
      .replace("{rName}", rName)
      .replace("{daysStr}", daysStr)
      .replace("{periodsStr}", periodsStr);
  }

  return rule.description;
}

export function formatConstraintMetaI18n(
  meta: ConstraintMeta,
  state: TimetableState,
  lang: TimetableLang
): { label: string; suggestion?: string } {
  const courseMap = new Map(state.courses.map((c) => [c.id, c]));
  const roomMap = new Map(state.rooms.map((r) => [r.id, r]));
  const profMap = new Map(state.professors.map((p) => [p.id, p]));
  const templates = CATALOGS[lang].constraintTemplates;

  if (meta.category === "custom" && meta.relatedRuleId) {
    const rule = state.customRules.find((r) => r.id === meta.relatedRuleId);
    if (rule) {
      const desc = formatCustomRuleI18n(rule, state, lang);
      return {
        label: templates.custom.label.replace("{desc}", desc),
        suggestion: templates.custom.suggestion.replace("{desc}", desc),
      };
    }
  }

  if (meta.name.startsWith("prof_unavail_day_")) {
    const parts = meta.name.split("_");
    const profId = parts[3];
    const day = parts[4] as TimetableDay;
    const prof = profMap.get(profId);
    const pI18n = prof ? getProfessorI18n(prof, lang) : null;
    const availDays = prof
      ? DAYS_OF_WEEK.filter((d) => !prof.unavailableDays.includes(d))
          .map((d) => DAY_SHORT_I18N[lang][d])
          .join("/")
      : "";
    const dayName = DAY_FULL_I18N[lang][day];
    const name = pI18n?.name ?? profId;
    const title = pI18n?.title ?? "";
    return {
      label: templates.profUnavailDay.label
        .replace("{name}", name)
        .replace("{title}", title)
        .replace("{day}", dayName)
        .replace("{availDays}", availDays),
      suggestion: templates.profUnavailDay.suggestion
        .replace("{name}", name)
        .replace("{title}", title)
        .replace("{day}", dayName)
        .replace("{availDays}", availDays),
    };
  }

  if (meta.name.startsWith("room_excl_")) {
    const parts = meta.name.split("_");
    const roomId = parts[2];
    const day = parts[3] as TimetableDay;
    const period = Number(parts[4]?.replace("P", "")) as TimetablePeriod;
    const room = roomMap.get(roomId);
    const rI18n = room ? getRoomI18n(room, lang) : null;
    const slot = formatSlotI18n(day, period, lang);
    const name = rI18n?.name ?? roomId;
    return {
      label: templates.roomExcl.label
        .replace("{name}", name)
        .replace("{slot}", slot),
      suggestion: templates.roomExcl.suggestion
        .replace("{name}", name)
        .replace("{slot}", slot),
    };
  }

  if (meta.name.startsWith("prof_excl_")) {
    const parts = meta.name.split("_");
    const profId = parts[2];
    const day = parts[3] as TimetableDay;
    const period = Number(parts[4]?.replace("P", "")) as TimetablePeriod;
    const prof = profMap.get(profId);
    const pI18n = prof ? getProfessorI18n(prof, lang) : null;
    const slot = formatSlotI18n(day, period, lang);
    const name = pI18n?.name ?? profId;
    const title = pI18n?.title ?? "";
    return {
      label: templates.profExcl.label
        .replace("{name}", name)
        .replace("{title}", title)
        .replace("{slot}", slot),
      suggestion: templates.profExcl.suggestion
        .replace("{name}", name)
        .replace("{title}", title)
        .replace("{slot}", slot),
    };
  }

  if (meta.name.startsWith("cohort_excl_") || meta.name.startsWith("cohort_lab_excl_")) {
    const parts = meta.name.split("_");
    const cohortId = (parts[2] === "excl" ? parts[3] : parts[2]) as CohortId;
    const cohortLabel = COHORT_I18N[lang][cohortId]?.shortLabel ?? cohortId;
    const day = parts[parts.length - 2] as TimetableDay;
    const period = Number(parts[parts.length - 1]?.replace("P", "")) as TimetablePeriod;
    const slot = formatSlotI18n(day, period, lang);
    return {
      label: templates.cohortExcl.label
        .replace("{cohort}", cohortLabel)
        .replace("{slot}", slot),
      suggestion: templates.cohortExcl.suggestion
        .replace("{cohort}", cohortLabel)
        .replace("{slot}", slot),
    };
  }

  if (meta.name.startsWith("course_sessions_")) {
    const courseId = meta.name.replace("course_sessions_", "");
    const c = courseMap.get(courseId);
    const cI18n = c ? getCourseI18n(c, lang) : null;
    const title = cI18n?.title ?? courseId;
    const count = String(c?.sessionsPerWeek ?? 1);
    return {
      label: templates.courseSessions.label
        .replace("{title}", title)
        .replace("{count}", count),
      suggestion: templates.courseSessions.suggestion
        .replace("{title}", title)
        .replace("{count}", count),
    };
  }

  if (meta.name.startsWith("course_diff_day_")) {
    const parts = meta.name.split("_");
    const day = parts[parts.length - 1] as TimetableDay;
    const courseId = parts.slice(3, -1).join("_");
    const c = courseMap.get(courseId);
    const title = c ? getCourseI18n(c, lang).title : courseId;
    const dayName = DAY_FULL_I18N[lang][day] ?? day;
    return {
      label: templates.courseDiffDay.label
        .replace("{title}", title)
        .replace("{day}", dayName),
      suggestion: templates.courseDiffDay.suggestion
        .replace("{title}", title)
        .replace("{day}", dayName),
    };
  }

  if (meta.name.startsWith("prof_unavail_slot_")) {
    const parts = meta.name.split("_");
    const period = Number(parts[parts.length - 1]?.replace("P", "")) as TimetablePeriod;
    const day = parts[parts.length - 2] as TimetableDay;
    const profId = parts.slice(3, -2).join("_");
    const prof = profMap.get(profId);
    const pI18n = prof ? getProfessorI18n(prof, lang) : null;
    const slot = formatSlotI18n(day, period, lang);
    const unavailEntry = prof?.unavailableSlots.find(
      (s) => s.day === day && s.period === period
    );
    const reason = unavailEntry?.reason ? ` (${unavailEntry.reason})` : "";
    const name = pI18n?.name ?? profId;
    const profTitle = pI18n?.title ?? "";
    return {
      label: templates.profUnavailSlot.label
        .replace("{name}", name)
        .replace("{title}", profTitle)
        .replace("{slot}", slot)
        .replace("{reason}", reason),
      suggestion: templates.profUnavailSlot.suggestion
        .replace("{name}", name)
        .replace("{title}", profTitle)
        .replace("{slot}", slot)
        .replace("{reason}", reason),
    };
  }

  if (meta.name.startsWith("prof_daily_max_")) {
    const parts = meta.name.split("_");
    const day = parts[parts.length - 1] as TimetableDay;
    const profId = parts.slice(3, -1).join("_");
    const prof = profMap.get(profId);
    const pI18n = prof ? getProfessorI18n(prof, lang) : null;
    const customMaxRule = state.customRules.find(
      (r) => r.enabled && r.kind === "prof_max_daily" && r.professorId === profId
    );
    const max = String(
      customMaxRule?.maxDailySessions ??
        Math.min(prof?.maxSessionsPerDay ?? state.config.maxProfessorSessionsPerDay, state.config.maxProfessorSessionsPerDay)
    );
    const dayName = DAY_FULL_I18N[lang][day] ?? day;
    const name = pI18n?.name ?? profId;
    return {
      label: templates.profDailyMax.label
        .replace("{name}", name)
        .replace("{day}", dayName)
        .replace("{max}", max),
      suggestion: templates.profDailyMax.suggestion
        .replace("{name}", name)
        .replace("{day}", dayName)
        .replace("{max}", max),
    };
  }

  if (meta.name.startsWith("prof_consec_")) {
    const parts = meta.name.split("_");
    const pEnd = parts[parts.length - 1]?.replace("P", "") ?? "";
    const pStart = parts[parts.length - 2]?.replace("P", "") ?? "";
    const day = parts[parts.length - 3] as TimetableDay;
    const profId = parts.slice(2, -3).join("_");
    const prof = profMap.get(profId);
    const pI18n = prof ? getProfessorI18n(prof, lang) : null;
    const dayName = DAY_FULL_I18N[lang][day] ?? day;
    const max = String(state.config.maxProfessorConsecutivePeriods);
    const name = pI18n?.name ?? profId;
    return {
      label: templates.profConsec.label
        .replace("{name}", name)
        .replace("{max}", max)
        .replace("{day}", dayName)
        .replace("{pStart}", pStart)
        .replace("{pEnd}", pEnd),
      suggestion: templates.profConsec.suggestion
        .replace("{name}", name)
        .replace("{max}", max)
        .replace("{day}", dayName)
        .replace("{pStart}", pStart)
        .replace("{pEnd}", pEnd),
    };
  }

  if (meta.name.startsWith("cohort_daily_max_")) {
    const parts = meta.name.split("_");
    const day = parts[parts.length - 1] as TimetableDay;
    const cohortId = parts.slice(3, -1).join("_") as CohortId;
    const cohortLabel = COHORT_I18N[lang][cohortId]?.shortLabel ?? cohortId;
    const dayName = DAY_FULL_I18N[lang][day] ?? day;
    const max = String(state.config.maxCohortCompulsoryPerDay);
    return {
      label: templates.cohortDailyMax.label
        .replace("{cohort}", cohortLabel)
        .replace("{day}", dayName)
        .replace("{max}", max),
      suggestion: templates.cohortDailyMax.suggestion
        .replace("{cohort}", cohortLabel)
        .replace("{day}", dayName)
        .replace("{max}", max),
    };
  }

  if (meta.name.startsWith("room_compat_")) {
    const courseId = meta.name.replace("room_compat_", "");
    const c = courseMap.get(courseId);
    const title = c ? getCourseI18n(c, lang).title : courseId;
    const enrollment = String(c?.enrollment ?? 0);
    return {
      label: templates.roomCompat.label
        .replace("{title}", title)
        .replace("{enrollment}", enrollment),
      suggestion: templates.roomCompat.suggestion
        .replace("{title}", title)
        .replace("{enrollment}", enrollment),
    };
  }

  return { label: meta.labelJa, suggestion: meta.relaxSuggestion };
}

export function formatDiffReasonI18n(
  reason: TimetableDiffReason | undefined,
  state: TimetableState,
  lang: TimetableLang
): string {
  if (!reason) return "";
  const catalog = CATALOGS[lang].diffReasons;
  if (!catalog) return "";

  const courseMap = new Map(state.courses.map((c) => [c.id, c]));
  const roomMap = new Map(state.rooms.map((r) => [r.id, r]));
  const profMap = new Map(state.professors.map((p) => [p.id, p]));

  const otherCourse = reason.relatedCourseId ? courseMap.get(reason.relatedCourseId) : undefined;
  const otherCourseName = otherCourse
    ? getCourseI18n(otherCourse, lang).shortTitle
    : (reason.relatedCourseId ?? "");

  const prof = reason.relatedProfessorId ? profMap.get(reason.relatedProfessorId) : undefined;
  const profName = prof ? getProfessorI18n(prof, lang).name : (reason.relatedProfessorId ?? "");

  const room = reason.relatedRoomId ? roomMap.get(reason.relatedRoomId) : undefined;
  const roomName = room ? getRoomI18n(room, lang).name : (reason.relatedRoomId ?? "");

  const cohort = STUDENT_COHORTS.find((k) => k.id === reason.relatedCohortId);
  const cohortLabel = cohort ? cohort.shortLabel : (reason.relatedCohortId ?? "");

  switch (reason.kind) {
    case "user_pin":
      return catalog.userPin;
    case "room_only":
      return catalog.roomOnly.replace("{room}", roomName);
    case "room_conflict":
      return catalog.roomConflict
        .replace("{room}", roomName)
        .replace("{otherCourse}", otherCourseName);
    case "prof_conflict":
      return catalog.profConflict
        .replace("{prof}", profName)
        .replace("{otherCourse}", otherCourseName);
    case "cohort_conflict":
      return catalog.cohortConflict
        .replace("{cohort}", cohortLabel)
        .replace("{otherCourse}", otherCourseName);
    case "rebalance":
    default:
      return catalog.rebalance;
  }
}

export type TimetableUiStrings = typeof enCatalog.ui;

export const TIMETABLE_UI_I18N: Record<TimetableLang, TimetableUiStrings> = {
  en: enCatalog.ui,
  ja: jaCatalog.ui,
  zh: zhCatalog.ui,
};

export const UI_TEXT_I18N = TIMETABLE_UI_I18N;

export function formatUiTemplate(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
  );
}
