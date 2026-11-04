import { pickLang, type GameLang } from "../i18n.js";
import { LILITH_PROFILE, MONSTERS } from "./characters.js";
import { getCastleCalendarYearMonth, getDifficultyLabel } from "./stages.js";
import {
  DAY_LABELS,
  type ActiveShiftType,
  type DayIndex,
  type DifficultyTier,
  type MonsterId,
  type MonsterProfile,
  type PairRelation,
  type RuleViolation,
  type ShiftSlotRequirement,
  type StageScenario,
  type TutorialStep,
} from "./types.js";
import enCatalog from "./locales/en.json";
import jaCatalog from "./locales/ja.json";
import zhCatalog from "./locales/zh.json";

export interface LocalizedCut {
  label: string;
  speaker: string;
  text: string;
  bg?: string;
  durationMs?: number;
}

export interface LocalizedPrologueSlide {
  slideNumber: number;
  title: string;
  summary: string;
  body: string;
  quoteSpeaker: string;
  quoteText: string;
}

const CATALOGS: Record<GameLang, typeof enCatalog> = {
  en: enCatalog,
  ja: jaCatalog,
  zh: zhCatalog,
};

export function getDayLabel(day: DayIndex, lang: GameLang): string {
  return CATALOGS[lang]?.days.short[day] ?? CATALOGS.en.days.short[day] ?? DAY_LABELS[day];
}

export function getDayFullLabel(day: DayIndex, lang: GameLang): string {
  return CATALOGS[lang]?.days.full[day] ?? CATALOGS.en.days.full[day];
}

const MONTH_NAMES_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export function formatCastleCalendarMonthLocalized(
  monthNumberOneBased: number,
  includeEra: boolean,
  lang: GameLang,
  refDate: Date = new Date()
): string {
  const { eraName, year, month } = getCastleCalendarYearMonth(monthNumberOneBased, refDate);
  if (lang === "en") {
    const mName = MONTH_NAMES_EN[(month - 1) % 12];
    return includeEra ? `Star-Moon Era ${mName} ${year}` : mName;
  }
  const mSuffix = "\u6708"; // "月"
  const ySuffix = "\u5E74"; // "年"
  const era = lang === "zh" ? "\u661F\u6708\u5386" : eraName;
  return includeEra ? `${era} ${year}${ySuffix}${month}${mSuffix}` : `${month}${mSuffix}`;
}

export function getDifficultyLabelLocalized(tier: DifficultyTier, lang: GameLang): string {
  const cat = CATALOGS[lang] ?? CATALOGS.en;
  return (cat.difficulty as Record<string, string>)[String(tier)] ?? getDifficultyLabel(tier);
}

export function getLilithProfileLocalized(lang: GameLang): {
  name: string;
  title: string;
  portrait: string;
  defaultQuote: string;
} {
  const cat = CATALOGS[lang] ?? CATALOGS.en;
  return {
    ...LILITH_PROFILE,
    name: cat.lilith.name,
    title: cat.lilith.title,
    defaultQuote: cat.lilith.defaultQuote,
  };
}

export function getMonsterLocalized(monsterId: MonsterId, lang: GameLang): MonsterProfile {
  const base = MONSTERS[monsterId];
  const cat = CATALOGS[lang] ?? CATALOGS.en;
  const l = (cat.monsters as Record<string, any>)[monsterId];
  if (!l) return base;
  return {
    ...base,
    name: l.name,
    title: l.title,
    race: l.race,
    usualPost: l.usualPost,
    traitTitle: l.traitTitle,
    traitSummary: l.traitSummary,
    quotes: {
      ...base.quotes,
      ...l.quotes,
    },
  };
}

export function getRelationLocalized(rel: PairRelation, lang: GameLang): PairRelation {
  const cat = CATALOGS[lang] ?? CATALOGS.en;
  const l = (cat.relations as Record<string, any>)[rel.id];
  if (!l) return rel;
  return {
    ...rel,
    title: l.title,
    story: l.story,
  };
}

export function getRequirementLocalized(
  req: ShiftSlotRequirement,
  lang: GameLang
): ShiftSlotRequirement {
  const cat = CATALOGS[lang] ?? CATALOGS.en;
  const ene = (cat.enemies as Record<string, any>)?.[req.enemyName];
  if (!ene) return req;
  return {
    ...req,
    enemyName: ene.name ?? req.enemyName,
    enemyQuote: ene.quote ?? req.enemyQuote,
  };
}

export function getRequestedOffReasonLocalized(reason: string, lang: GameLang): string {
  const cat = CATALOGS[lang] ?? CATALOGS.en;
  return (cat.requestedOffReasons as Record<string, string>)?.[reason] ?? reason;
}

export function getStageLocalized(
  stage: StageScenario,
  lang: GameLang
): {
  title: string;
  subtitle: string;
  newRuleTitle: string;
  newRuleSummary: string;
  lilithIntro: string;
  lilithHint: string;
} {
  const cat = CATALOGS[lang] ?? CATALOGS.en;
  const stg = (cat.stages as Record<string, any>)?.[stage.id];
  if (stg) {
    return {
      title: stg.title,
      subtitle: stg.subtitle,
      newRuleTitle: stg.newRuleTitle,
      newRuleSummary: stg.newRuleSummary,
      lilithIntro: stg.lilithIntro,
      lilithHint: stg.lilithHint,
    };
  }

  const calShort = formatCastleCalendarMonthLocalized(stage.weekNumber, false, lang);
  const isRetry = stage.subtitle.includes("New Lineup");
  const roster = stage.availableMonsters
    .map((id) => getMonsterLocalized(id, lang).name)
    .join(lang === "en" ? ", " : " · ");
  const diff = stage.difficultyTier
    ? getDifficultyLabelLocalized(stage.difficultyTier, lang)
    : "";
  const count = String(stage.availableMonsters.length);
  const numDays = String(stage.numDays ?? 5);

  const tpl = isRetry ? cat.retryStage : cat.adaptiveStage;
  const fill = (str: string) =>
    str
      .replace(/{calShort}/g, calShort)
      .replace(/{roster}/g, roster)
      .replace(/{diff}/g, diff)
      .replace(/{count}/g, count)
      .replace(/{numDays}/g, numDays);

  return {
    title: fill(tpl.title),
    subtitle: fill(tpl.subtitle),
    newRuleTitle: fill(tpl.newRuleTitle),
    newRuleSummary: fill(tpl.newRuleSummary),
    lilithIntro: fill(tpl.lilithIntro),
    lilithHint: fill(tpl.lilithHint),
  };
}

export function getTutorialStepLocalized(
  step: TutorialStep,
  idx: number,
  lang: GameLang
): { shortCallout: string; instruction: string } {
  const cat = CATALOGS[lang] ?? CATALOGS.en;
  const tStep = cat.stages?.["week-1"]?.tutorialSteps?.[idx];
  return {
    shortCallout: tStep?.shortCallout ?? step.shortCallout,
    instruction: tStep?.instruction ?? step.instruction,
  };
}

export function getViolationLocalized(
  v: RuleViolation,
  stage: StageScenario,
  lang: GameLang
): { shortBadge: string; message: string } {
  const cat = CATALOGS[lang] ?? CATALOGS.en;
  const viols = cat.violations as Record<string, any>;
  const dayLabel = v.day !== undefined ? getDayLabel(v.day, lang) : "";
  const shiftLabel =
    v.shift === "day"
      ? (cat.ui?.day ?? "Day")
      : (cat.ui?.night ?? "Night");
  const m = v.monsterId ? getMonsterLocalized(v.monsterId, lang) : null;
  const name = m?.name ?? "";

  switch (v.category) {
    case "raid_power": {
      const slot = stage.requirements.find((r) => r.day === v.day && r.shift === v.shift);
      const enemy = slot ? getRequirementLocalized(slot, lang).enemyName : "";
      const tpl = viols.raid_power;
      return {
        shortBadge: tpl.shortBadge,
        message: tpl.message
          .replace(/{day}/g, dayLabel)
          .replace(/{shift}/g, shiftLabel)
          .replace(/{enemy}/g, enemy),
      };
    }
    case "min_staff": {
      const slot = stage.requirements.find((r) => r.day === v.day && r.shift === v.shift);
      const minStaff = slot?.minStaff ?? 1;
      const tpl = viols.min_staff;
      return {
        shortBadge: tpl.shortBadge.replace(/{count}/g, String(minStaff)),
        message: tpl.message
          .replace(/{day}/g, dayLabel)
          .replace(/{shift}/g, shiftLabel)
          .replace(/{count}/g, String(minStaff)),
      };
    }
    case "full_moon": {
      const tpl = viols.full_moon;
      return {
        shortBadge: tpl.shortBadge,
        message: tpl.message.replace(/{day}/g, dayLabel).replace(/{name}/g, name),
      };
    }
    case "solo_night": {
      const tpl = viols.solo_night;
      return {
        shortBadge: tpl.shortBadge,
        message: tpl.message.replace(/{day}/g, dayLabel).replace(/{name}/g, name),
      };
    }
    case "weekly_cap": {
      const cap = String(m?.maxWeeklyShifts ?? 3);
      const tpl = viols.weekly_cap;
      return {
        shortBadge: tpl.shortBadge.replace(/{cap}/g, cap),
        message: tpl.message.replace(/{name}/g, name).replace(/{cap}/g, cap),
      };
    }
    case "night_to_day": {
      const prevDay = v.day !== undefined && v.day > 0 ? getDayLabel((v.day - 1) as DayIndex, lang) : "";
      const tpl = viols.night_to_day;
      return {
        shortBadge: tpl.shortBadge,
        message: tpl.message
          .replace(/{name}/g, name)
          .replace(/{prevDay}/g, prevDay)
          .replace(/{day}/g, dayLabel),
      };
    }
    case "consecutive": {
      const maxC = m?.maxConsecutiveDays ?? 1;
      const tpl = maxC === 1 ? viols.consecutive_single : viols.consecutive_multi;
      return {
        shortBadge: tpl.shortBadge.replace(/{cap}/g, String(maxC)),
        message: tpl.message.replace(/{name}/g, name).replace(/{cap}/g, String(maxC)),
      };
    }
    case "day_off": {
      const offReq = stage.requestedDaysOff.find((r) => r.day === v.day && r.monsterId === v.monsterId);
      const reason = offReq ? getRequestedOffReasonLocalized(offReq.reason, lang) : "";
      const tpl = viols.day_off;
      return {
        shortBadge: tpl.shortBadge,
        message: tpl.message
          .replace(/{day}/g, dayLabel)
          .replace(/{name}/g, name)
          .replace(/{reason}/g, reason),
      };
    }
    default:
      return { shortBadge: v.shortBadge, message: v.message };
  }
}

export function getOpeningMovieCutsLocalized(lang: GameLang): readonly LocalizedCut[] {
  const cat = CATALOGS[lang] ?? CATALOGS.en;
  return (cat.cuts ?? []) as LocalizedCut[];
}

export function getPrologueSlidesLocalized(lang: GameLang): readonly LocalizedPrologueSlide[] {
  const cat = CATALOGS[lang] ?? CATALOGS.en;
  return (cat.prologue ?? []) as LocalizedPrologueSlide[];
}
