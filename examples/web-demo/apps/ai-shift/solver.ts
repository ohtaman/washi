import {
  Model,
  expr,
  sum,
  maximize,
  minimize,
  type Var,
  type LinExpr,
  type Constraint,
} from "../../../../src/index.js";
import { createDefaultSkillDefs, getDayOfWeek, WEEKDAY_NAMES_JA } from "./generator.js";
import {
  PREV_MONTH_DAYS,
  SHIFT_LABELS,
  doesNurseMatchAttribute,
  doesNurseSatisfySkill,
  doesShiftMatchGroup,
  getBaseOdenShift,
  getJapaneseHolidayName,
  getShiftMeta,
  getShiftTransitionMatrix,
  resolveShiftSelector,
  type ActiveShiftCode,
  type ConstraintMeta,
  type CustomConstraintRule,
  type CustomShiftDef,
  type DailySlotSummary,
  type MonthlyScheduleMap,
  type NurseMonthlySummary,
  type NurseProfile,
  type NurseSchedulingState,
  type ScheduleCellChange,
  type ScheduleDiffSummary,
  type ScheduleEvaluationReport,
  type ScheduleViolationItem,
  type ShiftCode,
  type WashiSolveOutcome,
} from "./types.js";

export type ElasticWeightMode = "prefer_structural" | "prefer_user";

export interface ElasticSlackEntry {
  slackVar: Var;
  meta: ConstraintMeta;
  weight: number;
}

export interface BuiltNurseWashiModel {
  model: Model;
  vD: Record<string, Var[]>;
  vE: Record<string, Var[]>;
  vN: Record<string, Var[]>;
  vCustom: Record<string, Record<string, Var[]>>;
  constraintMeta: Map<string, ConstraintMeta>;
  elasticSlacks: ElasticSlackEntry[];
}

/**
 * Computes estimated current-month overtime hours (時間外労働時間) for 36協定 management:
 * - Standard shift handover/record overtime: D = 1.0h, E = 1.5h, N = 2.0h, custom shift = 0.5h
 * - Statutory excess workday overtime: +8.0h for each workday exceeding 20 days/month
 */
export function computeNurseMonthOvertimeHours(
  counts: Record<string, number>,
  customShiftDefs: readonly CustomShiftDef[] = []
): number {
  const cD = counts.D ?? 0;
  const cE = counts.E ?? 0;
  const cN = counts.N ?? 0;
  let customWorkDays = 0;
  let customOvertime = 0;
  for (const cs of customShiftDefs) {
    const cnt = counts[cs.code] ?? 0;
    if (cs.countsAsWorkDay) {
      customWorkDays += cnt;
    }
    customOvertime += cnt * (cs.overtimeHoursPerShift ?? 0.5);
  }
  const totalWorkDays = cD + cE + cN + customWorkDays;
  const excessWorkDays = Math.max(0, totalWorkDays - 20);
  const raw = 1.0 * cD + 1.5 * cE + 2.0 * cN + customOvertime + 8.0 * excessWorkDays;
  return Math.round(raw * 10) / 10;
}

function getElasticPenaltyWeight(meta: ConstraintMeta, mode: ElasticWeightMode): number {
  if (meta.name.startsWith("one_shift_")) {
    return 500;
  }
  if (mode === "prefer_structural") {
    switch (meta.category) {
      case "custom":
        return 1;
      case "request":
        return 2;
      case "labor_36":
        return 2.5;
      case "monthly":
        return 5;
      case "ng_pair":
      case "skill":
        return 10;
      case "carryover":
      case "transition":
      case "consecutive":
        return 20;
      case "coverage":
      default:
        return 40;
    }
  } else {
    switch (meta.category) {
      case "coverage":
        return 1;
      case "carryover":
      case "transition":
      case "consecutive":
        return 2;
      case "skill":
      case "ng_pair":
        return 3;
      case "monthly":
        return 10;
      case "labor_36":
        return 25;
      case "request":
        return 30;
      case "custom":
      default:
        return 60;
    }
  }
}

/**
 * Counts how many consecutive working days a nurse had at the very end of the previous month.
 */
export function getPrevMonthTailWorkStreak(prevMonthShifts: readonly ShiftCode[]): number {
  let streak = 0;
  for (let i = prevMonthShifts.length - 1; i >= 0; i--) {
    if (prevMonthShifts[i] !== "O") {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Counts how many times a nurse completed a given shift code in previous months
 * (using `nurse.prevCompletedShifts[shiftCode]` if explicitly set, or counting occurrences in `nurse.prevMonthShifts`).
 */
export function getNursePrevCompletedShiftCount(
  nurse: NurseProfile,
  shiftCode: ShiftCode,
  customShiftDefs: readonly CustomShiftDef[] = []
): number {
  const explicit = nurse.prevCompletedShifts?.[shiftCode];
  if (typeof explicit === "number" && explicit >= 0) {
    return explicit;
  }
  return nurse.prevMonthShifts.filter((s) =>
    doesShiftMatchGroup(s, shiftCode, customShiftDefs)
  ).length;
}

/**
 * Determines whether a nurse is targeted by a custom constraint rule (`nurseIds`, `nurseId`, `attribute`, or `targetRole`).
 */
export function isNurseTargetedByRule(
  nurse: NurseProfile,
  rule: CustomConstraintRule,
  skillDefs?: readonly { code: string; label: string; shortLabel?: string; substitutesFor?: string }[]
): boolean {
  if (rule.nurseIds && rule.nurseIds.length > 0) {
    return rule.nurseIds.includes(nurse.id);
  }
  if (rule.nurseId) {
    return rule.nurseId === nurse.id;
  }
  const attr = rule.attribute || rule.targetRole;
  if (!attr) {
    return false;
  }
  if (attr === "all") {
    return true;
  }
  return doesNurseMatchAttribute(nurse, attr, skillDefs);
}

/**
 * Computes the required daily headcount for Day/Evening/Night shifts on a given day (1..numDays),
 * taking into account weekday/weekend defaults and any active `date_coverage` custom rules.
 */
export function getRequiredDailyCoverage(
  state: NurseSchedulingState,
  day: number
): Record<ActiveShiftCode, number> {
  const { config, customRules } = state;
  const dow = getDayOfWeek(config.year, config.month, day);
  const isWeekend = dow === 0 || dow === 6;
  const reqD = isWeekend ? config.weekendDayStaff : config.weekdayDayStaff;

  const req: Record<ActiveShiftCode, number> = {
    D: reqD,
    E: config.eveningStaff,
    N: config.nightStaff,
  };

  for (const rule of customRules) {
    if (
      rule.enabled &&
      rule.isHard !== false &&
      rule.kind === "date_coverage" &&
      rule.day === day &&
      typeof rule.minStaff === "number"
    ) {
      if (rule.shift === "D") req.D = rule.minStaff;
      else if (rule.shift === "E") req.E = rule.minStaff;
      else if (rule.shift === "N") req.N = rule.minStaff;
    }
  }

  return req;
}

/**
 * Builds the algebraic WaSHI Model (LP/MIP with HiGHS) for the 1-month 3-shift nurse scheduling problem.
 */
export function buildNurseWashiModel(
  state: NurseSchedulingState,
  options?: {
    solver?: "highs";
    onlyDays?: ReadonlySet<number>;
    elasticWeightMode?: ElasticWeightMode;
    referenceSchedule?: MonthlyScheduleMap | null;
  }
): BuiltNurseWashiModel {
  const { config, nurses, relations, preferences, customRules } = state;
  const customShiftDefs = state.customShiftDefs ?? [];
  const numDays = config.numDays;
  const onlyDays = options?.onlyDays;
  const elasticMode = options?.elasticWeightMode;
  const isDayIncluded = (d: number) => !onlyDays || onlyDays.has(d);

  const m = new Model("NurseMonthlySchedule_3Shift", {
    solver: "highs",
  });

  const vD: Record<string, Var[]> = {};
  const vE: Record<string, Var[]> = {};
  const vN: Record<string, Var[]> = {};
  const vCustom: Record<string, Record<string, Var[]>> = {};
  for (const cs of customShiftDefs) {
    vCustom[cs.code] = {};
  }

  const constraintMeta = new Map<string, ConstraintMeta>();
  const elasticSlacks: ElasticSlackEntry[] = [];
  const softPenaltyTerms: LinExpr[] = [];

  const addTrackedConstraint = (
    rawConstraint: Constraint | ReturnType<typeof expr>,
    meta: ConstraintMeta
  ) => {
    const c = rawConstraint as Constraint;
    const configSoftW =
      meta.ruleKey &&
      typeof config.softRuleWeights?.[meta.ruleKey] === "number" &&
      config.softRuleWeights[meta.ruleKey]! > 0
        ? config.softRuleWeights[meta.ruleKey]!
        : undefined;
    const effectiveSoftWeight =
      meta.isHard === false
        ? typeof meta.softWeight === "number" && meta.softWeight > 0
          ? meta.softWeight
          : (configSoftW ?? 30)
        : configSoftW;

    const normalizedMeta: ConstraintMeta =
      effectiveSoftWeight !== undefined && !meta.name.startsWith("one_shift_")
        ? {
            ...meta,
            isHard: false,
            softWeight: effectiveSoftWeight,
          }
        : meta;

    constraintMeta.set(normalizedMeta.name, normalizedMeta);
    if (!elasticMode) {
      if (
        normalizedMeta.isHard === false &&
        typeof normalizedMeta.softWeight === "number" &&
        normalizedMeta.softWeight > 0
      ) {
        const s = m.continuous(`soft_${normalizedMeta.name}`, { lb: 0 });
        const w = normalizedMeta.softWeight;
        if (c.sense === "<=") {
          m.constraint(expr`${c.lhs} - ${s} <= ${c.rhs}`, normalizedMeta.name);
          softPenaltyTerms.push(expr`-${w} * ${s}` as LinExpr);
        } else if (c.sense === ">=") {
          m.constraint(expr`${c.lhs} + ${s} >= ${c.rhs}`, normalizedMeta.name);
          softPenaltyTerms.push(expr`-${w} * ${s}` as LinExpr);
        } else {
          const sNeg = m.continuous(`softn_${normalizedMeta.name}`, { lb: 0 });
          m.constraint(expr`${c.lhs} + ${s} - ${sNeg} == ${c.rhs}`, normalizedMeta.name);
          softPenaltyTerms.push(expr`-${w} * ${s} - ${w} * ${sNeg}` as LinExpr);
        }
        return;
      }
      if (c.lhs.terms.size === 0) {
        const zeroVar =
          m.getVarByName("__zero_const__") ??
          m.continuous("__zero_const__", { lb: 0, ub: 0 });
        const effectiveRhs = c.rhs - (c.lhs.constant || 0);
        if (c.sense === "<=") {
          m.constraint(expr`${zeroVar} <= ${effectiveRhs}`, normalizedMeta.name);
        } else if (c.sense === ">=") {
          m.constraint(expr`${zeroVar} >= ${effectiveRhs}`, normalizedMeta.name);
        } else {
          m.constraint(expr`${zeroVar} == ${effectiveRhs}`, normalizedMeta.name);
        }
        return;
      }
      m.constraint(c, normalizedMeta.name);
      return;
    }
    const s = m.continuous(`slk_${normalizedMeta.name}`, { lb: 0 });
    const weight = getElasticPenaltyWeight(normalizedMeta, elasticMode);
    elasticSlacks.push({ slackVar: s, meta: normalizedMeta, weight });
    if (c.sense === "<=") {
      m.constraint(expr`${c.lhs} - ${s} <= ${c.rhs}`, normalizedMeta.name);
    } else if (c.sense === ">=") {
      m.constraint(expr`${c.lhs} + ${s} >= ${c.rhs}`, normalizedMeta.name);
    } else {
      const sNeg = m.continuous(`slkn_${normalizedMeta.name}`, { lb: 0 });
      elasticSlacks.push({ slackVar: sNeg, meta: normalizedMeta, weight });
      m.constraint(expr`${c.lhs} + ${s} - ${sNeg} == ${c.rhs}`, normalizedMeta.name);
    }
  };

  // Determine whether a calendar day d is allowed for a given shiftCode under active `shift_day_restriction` rules
  const isDayAllowedForShift = (d: number, shiftCode: ShiftCode): boolean => {
    const dow = getDayOfWeek(config.year, config.month, d);
    for (const r of customRules) {
      if (!r.enabled || r.isHard === false || r.kind !== "shift_day_restriction" || r.shift !== shiftCode) continue;
      if (
        r.allowedDaysOfWeek &&
        r.allowedDaysOfWeek.length > 0 &&
        !r.allowedDaysOfWeek.includes(dow)
      ) {
        return false;
      }
      if (typeof r.startDay === "number" && d < r.startDay) {
        return false;
      }
      if (typeof r.endDay === "number" && d > r.endDay) {
        return false;
      }
    }
    return true;
  };

  // Create binary variables for each nurse and each day (0..numDays-1 corresponding to Day 1..numDays)
  for (const nurse of nurses) {
    vD[nurse.id] = [];
    vE[nurse.id] = [];
    vN[nurse.id] = [];
    for (const cs of customShiftDefs) {
      vCustom[cs.code][nurse.id] = [];
    }
    for (let d = 1; d <= numDays; d++) {
      if (isDayIncluded(d)) {
        vD[nurse.id].push(m.binary(`D_${nurse.id}_d${d}`));
        vE[nurse.id].push(m.binary(`E_${nurse.id}_d${d}`));
        vN[nurse.id].push(m.binary(`N_${nurse.id}_d${d}`));
        for (const cs of customShiftDefs) {
          vCustom[cs.code][nurse.id].push(m.binary(`C_${cs.code}_${nurse.id}_d${d}`));
        }
      } else {
        // Placeholder reference when day is omitted in subset check
        vD[nurse.id].push(null as unknown as Var);
        vE[nurse.id].push(null as unknown as Var);
        vN[nurse.id].push(null as unknown as Var);
        for (const cs of customShiftDefs) {
          vCustom[cs.code][nurse.id].push(null as unknown as Var);
        }
      }
    }
  }

  const getCustomShiftBase = (cs: CustomShiftDef): "D" | "E" | "N" | "O" =>
    cs.baseShift ?? (cs.countsAsWorkDay ? "D" : "O");

  const filterActiveVars = (vars: Var[]): Var[] =>
    elasticMode ? vars.filter(Boolean) : vars.filter((v) => v && v.ub > 0);

  const getNurseDayWorkVars = (nurseId: string, idx: number): Var[] => {
    const vars: Var[] = [
      vD[nurseId][idx],
      vE[nurseId][idx],
      vN[nurseId][idx],
    ];
    for (const cs of customShiftDefs) {
      if (getCustomShiftBase(cs) !== "O") {
        vars.push(vCustom[cs.code][nurseId][idx]);
      }
    }
    return filterActiveVars(vars);
  };

  const getNurseDaytimeVars = (nurseId: string, idx: number): Var[] => {
    const vars: Var[] = [vD[nurseId][idx]];
    for (const cs of customShiftDefs) {
      if (getCustomShiftBase(cs) === "D") {
        vars.push(vCustom[cs.code][nurseId][idx]);
      }
    }
    return filterActiveVars(vars);
  };

  const getNurseNighttimeVars = (nurseId: string, idx: number): Var[] => {
    const vars: Var[] = [vE[nurseId][idx], vN[nurseId][idx]];
    for (const cs of customShiftDefs) {
      const b = getCustomShiftBase(cs);
      if (b === "E" || b === "N") {
        vars.push(vCustom[cs.code][nurseId][idx]);
      }
    }
    return filterActiveVars(vars);
  };

  const getNurseBaseShiftVars = (
    nurseId: string,
    idx: number,
    base: ActiveShiftCode
  ): Var[] => {
    const vars: Var[] = [
      base === "D" ? vD[nurseId][idx] : base === "E" ? vE[nurseId][idx] : vN[nurseId][idx],
    ];
    for (const cs of customShiftDefs) {
      if (getCustomShiftBase(cs) === base) {
        vars.push(vCustom[cs.code][nurseId][idx]);
      }
    }
    return filterActiveVars(vars);
  };

  const getShiftVarsForNurseDay = (shiftCode: ShiftCode, nurseId: string, idx: number): Var[] => {
    const resolved = resolveShiftSelector(shiftCode, state);
    const out = new Set<Var>();
    for (const c of resolved) {
      if (c === "D") {
        if (vD[nurseId]?.[idx]) out.add(vD[nurseId][idx]);
      } else if (c === "E") {
        if (vE[nurseId]?.[idx]) out.add(vE[nurseId][idx]);
      } else if (c === "N") {
        if (vN[nurseId]?.[idx]) out.add(vN[nurseId][idx]);
      } else if (vCustom[c]?.[nurseId]?.[idx]) {
        out.add(vCustom[c][nurseId][idx]);
      }
    }
    return filterActiveVars(Array.from(out));
  };

  const SHIFT_LABEL_JA: Record<ActiveShiftCode, string> = {
    D: "日勤(D)",
    E: "準夜勤(E)",
    N: "深夜勤(N)",
  };
  const SHIFT_SHORT_JA: Record<ActiveShiftCode, string> = {
    D: "日",
    E: "準",
    N: "深",
  };
  const transMatrix = getShiftTransitionMatrix(config);

  // 1. At most 1 shift per day per nurse, and Daytime-only nurses (nightOk === false)
  for (const nurse of nurses) {
    for (let d = 1; d <= numDays; d++) {
      if (!isDayIncluded(d)) continue;
      const idx = d - 1;
      const allDayShiftVars: Var[] = filterActiveVars([
        vD[nurse.id][idx],
        vE[nurse.id][idx],
        vN[nurse.id][idx],
        ...customShiftDefs.map((cs) => vCustom[cs.code][nurse.id][idx]),
      ]);
      addTrackedConstraint(
        expr`${sum(allDayShiftVars)} <= 1`,
        {
          name: `one_shift_${nurse.id}_d${d}`,
          category: "coverage",
          labelJa: `${config.month}/${d}: ${nurse.name}(${nurse.id}) は1日1シフトまで（重複不可）`,
          relatedNurseIds: [nurse.id],
          relatedDay: d,
        }
      );

      if (!nurse.nightOk) {
        addTrackedConstraint(
          expr`${sum(getNurseNighttimeVars(nurse.id, idx))} <= 0`,
          {
            name: `day_only_${nurse.id}_d${d}`,
            category: "skill",
            labelJa: `${config.month}/${d}: ${nurse.name}(${nurse.id}) は日勤専従（準夜勤・深夜勤の配置不可）`,
            relatedNurseIds: [nurse.id],
            relatedDay: d,
            relaxSuggestion: `${nurse.name}さんの夜勤固定指定を解除するか、日勤または公休に変更してください。`,
          }
        );
      }

      if (nurse.forbiddenShifts && nurse.forbiddenShifts.length > 0) {
        if (nurse.forbiddenShifts.includes("D")) {
          addTrackedConstraint(
            expr`${sum(getNurseDaytimeVars(nurse.id, idx))} <= 0`,
            {
              name: `forbid_contract_D_${nurse.id}_d${d}`,
              category: "skill",
              labelJa: `${config.month}/${d}: ${nurse.name}(${nurse.id}) は夜勤専従（日勤帯の配置不可）`,
              relatedNurseIds: [nurse.id],
              relatedDay: d,
              relaxSuggestion: `${nurse.name}さんの日勤固定指定を解除するか、夜勤専従契約を変更してください。`,
            }
          );
        }
        if (nurse.forbiddenShifts.includes("E")) {
          addTrackedConstraint(
            expr`${vE[nurse.id][idx]} <= 0`,
            {
              name: `forbid_contract_E_${nurse.id}_d${d}`,
              category: "skill",
              labelJa: `${config.month}/${d}: ${nurse.name}(${nurse.id}) は準夜勤免除（準夜勤の配置不可）`,
              relatedNurseIds: [nurse.id],
              relatedDay: d,
              relaxSuggestion: `${nurse.name}さんの準夜勤指定を解除するか、準夜勤免除契約を変更してください。`,
            }
          );
        }
        if (nurse.forbiddenShifts.includes("N")) {
          addTrackedConstraint(
            expr`${vN[nurse.id][idx]} <= 0`,
            {
              name: `forbid_contract_N_${nurse.id}_d${d}`,
              category: "skill",
              labelJa: `${config.month}/${d}: ${nurse.name}(${nurse.id}) は深夜勤免除（深夜勤の配置不可）`,
              relatedNurseIds: [nurse.id],
              relatedDay: d,
              relaxSuggestion: `${nurse.name}さんの深夜勤指定を解除するか、深夜勤免除契約を変更してください。`,
            }
          );
        }
      }

      if (nurse.weekdayOnly) {
        const dow = getDayOfWeek(config.year, config.month, d);
        if (dow === 0 || dow === 6) {
          addTrackedConstraint(
            expr`${sum(getNurseDayWorkVars(nurse.id, idx))} <= 0`,
            {
              name: `weekday_only_${nurse.id}_d${d}`,
              category: "monthly",
              labelJa: `${config.month}/${d}(${WEEKDAY_NAMES_JA[dow]}): ${nurse.name}(${nurse.id}) は平日のみ勤務契約（土日休）`,
              relatedNurseIds: [nurse.id],
              relatedDay: d,
              relaxSuggestion: `${nurse.name}さんの平日のみ勤務契約を解除するか、土日の出勤固定を変更してください。`,
            }
          );
        }
      }

      if (nurse.holidaysOff) {
        const holidayName = getJapaneseHolidayName(config.year, config.month, d);
        if (holidayName) {
          addTrackedConstraint(
            expr`${sum(getNurseDayWorkVars(nurse.id, idx))} <= 0`,
            {
              name: `holidays_off_${nurse.id}_d${d}`,
              category: "monthly",
              labelJa: `${config.month}/${d}(${holidayName}): ${nurse.name}(${nurse.id}) は祝日休み契約`,
              relatedNurseIds: [nurse.id],
              relatedDay: d,
              relaxSuggestion: `${nurse.name}さんの祝日休み契約を解除するか、祝日の出勤固定を変更してください。`,
            }
          );
        }
      }
    }
  }

  // 2. Previous Month Carryover Constraints (前月末シフトからの連続性・遷移・連勤引き継ぎ)
  if (config.enforcePrevMonthCarryover && isDayIncluded(1)) {
    for (const nurse of nurses) {
      const prev = nurse.prevMonthShifts;
      if (!prev || prev.length === 0) continue;
      const lastPrev = prev[prev.length - 1];
      const secondLastPrev = prev.length >= 2 ? prev[prev.length - 2] : "O";
      const prevBase = getBaseOdenShift(lastPrev, customShiftDefs);

      if (prevBase !== "O") {
        const rowPolicy = transMatrix[prevBase];
        if (rowPolicy.O === "require") {
          addTrackedConstraint(expr`${sum(getNurseDayWorkVars(nurse.id, 0))} <= 0`, {
            name: `carryover_${prevBase}_to_Off_${nurse.id}_d1`,
            category: "carryover",
            ruleKey: "enforcePrevMonthCarryover",
            labelJa: `前月引き継ぎ(${SHIFT_SHORT_JA[prevBase]}→休必須): ${nurse.name}(${nurse.id}) は前月末日が${SHIFT_LABEL_JA[prevBase]}のため、${config.month}/1は公休(O)必須`,
            relatedNurseIds: [nurse.id],
            relatedDay: 1,
            relaxSuggestion: `シフト遷移マトリクスの「${SHIFT_SHORT_JA[prevBase]}→休 必須」を解除するか、${nurse.name}さんの${config.month}/1の固定シフトを解除してください。`,
          });
        }
        for (const toShift of ["D", "E", "N"] as const) {
          if (rowPolicy[toShift] === "forbid") {
            addTrackedConstraint(
              expr`${sum(getNurseBaseShiftVars(nurse.id, 0, toShift))} <= 0`,
              {
                name: `carryover_${prevBase}_to_${toShift}_${nurse.id}_d1`,
                category: "carryover",
                ruleKey: "enforcePrevMonthCarryover",
                labelJa: `前月引き継ぎ: ${nurse.name}(${nurse.id}) は前月末日が${SHIFT_LABEL_JA[prevBase]}のため、${config.month}/1の${SHIFT_LABEL_JA[toShift]}は禁止`,
                relatedNurseIds: [nurse.id],
                relatedDay: 1,
                relaxSuggestion: `${nurse.name}さんの${config.month}/1の固定シフトを解除するか、前月引き継ぎ制約を緩和してください。`,
              }
            );
          }
        }
      }

      if (lastPrev === "N" && config.maxConsecutiveNight2) {
        if (secondLastPrev === "N") {
          addTrackedConstraint(expr`${vN[nurse.id][0]} <= 0`, {
            name: `carryover_max_N2_${nurse.id}_d1`,
            category: "carryover",
            ruleKey: "enforcePrevMonthCarryover",
            labelJa: `前月引き継ぎ: ${nurse.name}(${nurse.id}) は前月末に深夜勤2連続済のため、${config.month}/1の深夜勤(N)は禁止`,
            relatedNurseIds: [nurse.id],
            relatedDay: 1,
          });
        } else if (numDays >= 2 && isDayIncluded(2)) {
          addTrackedConstraint(
            expr`${vN[nurse.id][0]} + ${vN[nurse.id][1]} <= 1`,
            {
              name: `carryover_max_N2_${nurse.id}_d1_d2`,
              category: "carryover",
              ruleKey: "enforcePrevMonthCarryover",
              labelJa: `前月引き継ぎ: ${nurse.name}(${nurse.id}) は前月末日が深夜勤(N)のため、${config.month}/1〜2の連続深夜勤は禁止（深夜3連続防止）`,
              relatedNurseIds: [nurse.id],
              relatedDay: 1,
            }
          );
        }
      }

      // Consecutive work days across month boundary
      const tailStreak = getPrevMonthTailWorkStreak(prev);
      const maxConsec = nurse.maxConsecutiveWorkDays ?? config.maxConsecutiveWorkDays;
      if (tailStreak > 0 && maxConsec >= 1) {
        const clampedStreak = Math.min(tailStreak, maxConsec);
        const windowInCurrentMonth = maxConsec + 1 - clampedStreak;
        let allWindowDaysIncluded = windowInCurrentMonth >= 1 && windowInCurrentMonth <= numDays;
        for (let k = 1; k <= windowInCurrentMonth; k++) {
          if (!isDayIncluded(k)) allWindowDaysIncluded = false;
        }
        if (allWindowDaysIncluded) {
          const boundaryVars: Var[] = [];
          for (let k = 0; k < windowInCurrentMonth; k++) {
            boundaryVars.push(...getNurseDayWorkVars(nurse.id, k));
          }
          const allowedInWindow = maxConsec - clampedStreak;
          addTrackedConstraint(
            expr`${sum(boundaryVars)} <= ${allowedInWindow}`,
            {
              name: `carryover_consec_${nurse.id}_d1_to_d${windowInCurrentMonth}`,
              category: "carryover",
              ruleKey: "enforcePrevMonthCarryover",
              labelJa: `前月引き継ぎ連勤制限: ${nurse.name}(${nurse.id}) は前月末に${tailStreak}連勤中のため、${config.month}/1〜${config.month}/${windowInCurrentMonth}の間に必ず公休が必要（最大${maxConsec}連勤）`,
              relatedNurseIds: [nurse.id],
              relatedDay: windowInCurrentMonth,
              relaxSuggestion: `最大連勤日数の上限（現在:${maxConsec}連勤）を緩和するか、月初の出勤指定を調整してください。`,
            }
          );
        }
      }
    }
  }

  // 3. 3-Shift Forbidden Transitions within the Current Month (driven by ShiftTransitionMatrix)
  for (const nurse of nurses) {
    for (let d = 1; d < numDays; d++) {
      if (!isDayIncluded(d) || !isDayIncluded(d + 1)) continue;
      const idx = d - 1;
      const nextIdx = d;

      for (const fromShift of ["D", "E", "N"] as const) {
        const fromVars = getNurseBaseShiftVars(nurse.id, idx, fromShift);
        if (fromVars.length === 0) continue;
        const rowPolicy = transMatrix[fromShift];

        if (rowPolicy.O === "require") {
          addTrackedConstraint(
            expr`${sum(fromVars)} + ${sum(getNurseDayWorkVars(nurse.id, nextIdx))} <= 1`,
            {
              name: `trans_${fromShift}_to_Off_${nurse.id}_d${d}`,
              category: "transition",
              ruleKey: "shiftTransitions",
              labelJa: `シフト遷移必須(${SHIFT_SHORT_JA[fromShift]}→休): ${nurse.name}(${nurse.id}) の ${config.month}/${d}${SHIFT_LABEL_JA[fromShift]}の翌日(${config.month}/${d + 1})は公休必須`,
              relatedNurseIds: [nurse.id],
              relatedDay: d,
              relaxSuggestion: `シフト遷移マトリクスの「${SHIFT_SHORT_JA[fromShift]}→休 必須」を解除するか、${nurse.name}さんの固定シフトを調整してください。`,
            }
          );
        }

        for (const toShift of ["D", "E", "N"] as const) {
          if (rowPolicy[toShift] === "forbid") {
            const toVars = getNurseBaseShiftVars(nurse.id, nextIdx, toShift);
            if (toVars.length === 0) continue;
            addTrackedConstraint(
              expr`${sum(fromVars)} + ${sum(toVars)} <= 1`,
              {
                name: `trans_${fromShift}_to_${toShift}_${nurse.id}_d${d}`,
                category: "transition",
                ruleKey: "shiftTransitions",
                labelJa: `シフト遷移禁止(${SHIFT_SHORT_JA[fromShift]}→${SHIFT_SHORT_JA[toShift]}): ${nurse.name}(${nurse.id}) の ${config.month}/${d}${SHIFT_LABEL_JA[fromShift]} → ${config.month}/${d + 1}${SHIFT_LABEL_JA[toShift]} は禁止`,
                relatedNurseIds: [nurse.id],
                relatedDay: d,
                relaxSuggestion: `${nurse.name}さんの${config.month}/${d}〜${d + 1}の固定シフト指定またはシフト遷移マトリクスを見直してください。`,
              }
            );
          }
        }
      }
    }

    if (config.maxConsecutiveNight2) {
      for (let d = 1; d <= numDays - 2; d++) {
        if (!isDayIncluded(d) || !isDayIncluded(d + 1) || !isDayIncluded(d + 2)) continue;
        const idx = d - 1;
        addTrackedConstraint(
          expr`${vN[nurse.id][idx]} + ${vN[nurse.id][idx + 1]} + ${vN[nurse.id][idx + 2]} <= 2`,
          {
            name: `max_consec_N2_${nurse.id}_d${d}`,
            category: "transition",
            ruleKey: "maxConsecutiveNight2",
            labelJa: `深夜3連続禁止: ${nurse.name}(${nurse.id}) の ${config.month}/${d}〜${config.month}/${d + 2} における3日連続深夜勤は禁止`,
            relatedNurseIds: [nurse.id],
            relatedDay: d,
          }
        );
      }
    }
  }

  // 4. Max Consecutive Working Days
  for (const nurse of nurses) {
    const maxConsec = nurse.maxConsecutiveWorkDays ?? config.maxConsecutiveWorkDays;
    const windowSize = maxConsec + 1;
    for (let startDay = 1; startDay <= numDays - maxConsec; startDay++) {
      const endDay = startDay + maxConsec;
      let windowIncluded = true;
      for (let d = startDay; d <= endDay; d++) {
        if (!isDayIncluded(d)) {
          windowIncluded = false;
          break;
        }
      }
      if (!windowIncluded) continue;

      const windowVars: Var[] = [];
      for (let k = 0; k < windowSize; k++) {
        const idx = startDay - 1 + k;
        windowVars.push(...getNurseDayWorkVars(nurse.id, idx));
      }
      addTrackedConstraint(
        expr`${sum(windowVars)} <= ${maxConsec}`,
        {
          name: `consec_work_${nurse.id}_d${startDay}_to_d${endDay}`,
          category: "consecutive",
          ruleKey: "maxConsecutiveWorkDays",
          labelJa: `最大${maxConsec}連勤制限: ${nurse.name}(${nurse.id}) の ${config.month}/${startDay}〜${config.month}/${endDay}（${windowSize}日間）で最低1日は公休が必要`,
          relatedNurseIds: [nurse.id],
          relatedDay: startDay,
          relaxSuggestion: `最大連続勤務日数（現在:${maxConsec}日）を${maxConsec + 1}日に緩和するか、出勤固定を調整してください。`,
        }
      );
    }
  }

  // 5. Monthly Workload Bounds & 36 Agreement (only when building the full monthly model)
  if (!onlyDays) {
    const weekendDayIndices: number[] = [];
    for (let d = 1; d <= numDays; d++) {
      const dow = getDayOfWeek(config.year, config.month, d);
      if (dow === 0 || dow === 6) {
        weekendDayIndices.push(d - 1);
      }
    }

    for (const nurse of nurses) {
      const allWorkVars: Var[] = [];
      const allNightVars: Var[] = [];
      for (let idx = 0; idx < numDays; idx++) {
        allWorkVars.push(...getNurseDayWorkVars(nurse.id, idx));
        allNightVars.push(...getNurseNighttimeVars(nurse.id, idx));
      }

      const effectiveMinOff = nurse.minMonthlyDaysOff ?? config.minMonthlyDaysOff;
      const maxWorkDays = Math.max(0, numDays - effectiveMinOff);
      addTrackedConstraint(
        expr`${sum(allWorkVars)} <= ${maxWorkDays}`,
        {
          name: `monthly_off_min_${nurse.id}`,
          category: "monthly",
          ruleKey: "minMonthlyDaysOff",
          labelJa: `月間最低公休数(${effectiveMinOff}日以上): ${nurse.name}(${nurse.id}) の月間勤務日数は最大${maxWorkDays}日まで`,
          relatedNurseIds: [nurse.id],
          relaxSuggestion: `月間最低公休日数（現在:${effectiveMinOff}日）を1日減らすか、日別の必要人数を緩和してください。`,
        }
      );

      if (typeof nurse.maxMonthlyWorkDays === "number") {
        const maxContractWork = Math.max(0, nurse.maxMonthlyWorkDays);
        addTrackedConstraint(
          expr`${sum(allWorkVars)} <= ${maxContractWork}`,
          {
            name: `monthly_work_max_${nurse.id}`,
            category: "monthly",
            labelJa: `月間最大勤務日数(${maxContractWork}日以下): ${nurse.name}(${nurse.id}) の月間勤務日数は最大${maxContractWork}日まで`,
            relatedNurseIds: [nurse.id],
            relaxSuggestion: `${nurse.name}さん個人の月間最大勤務日数（現在:${maxContractWork}日）を引き上げるか、出勤固定を減らしてください。`,
          }
        );
      }

      const effectiveMinWork = nurse.minMonthlyWorkDays ?? config.minMonthlyWorkDays;
      if (effectiveMinWork > 0) {
        addTrackedConstraint(
          expr`${sum(allWorkVars)} >= ${effectiveMinWork}`,
          {
            name: `monthly_work_min_${nurse.id}`,
            category: "monthly",
            ruleKey: "minMonthlyWorkDays",
            labelJa: `月間最低勤務日数(${effectiveMinWork}日以上): ${nurse.name}(${nurse.id}) の最低勤務日数確保`,
            relatedNurseIds: [nurse.id],
            relaxSuggestion: `${nurse.name}さん個人の月間最低勤務日数（現在:${effectiveMinWork}日）を引き下げるか、公休固定の日数を減らしてください。`,
          }
        );
      }

      if (nurse.nightOk) {
        const customMaxNightRule = customRules.find(
          (r) => r.enabled && r.kind === "nurse_max_night" && r.nurseId === nurse.id && typeof r.maxNight === "number"
        );
        const effectiveMaxNight =
          customMaxNightRule?.maxNight ??
          nurse.maxMonthlyNightShifts ??
          config.maxMonthlyNightShifts;

        addTrackedConstraint(
          expr`${sum(allNightVars)} <= ${effectiveMaxNight}`,
          {
            name: `monthly_night_max_${nurse.id}`,
            category: "monthly",
            ruleKey: "maxMonthlyNightShifts",
            labelJa: `月間夜勤上限(${effectiveMaxNight}回以下): ${nurse.name}(${nurse.id}) の準夜＋深夜合計は月${effectiveMaxNight}回まで`,
            relatedNurseIds: [nurse.id],
            relaxSuggestion: `月間夜勤上限（現在:${effectiveMaxNight}回）を増やすか、準夜・深夜の必要人数を緩和してください。`,
            isHard: customMaxNightRule?.isHard,
            softWeight: customMaxNightRule?.penaltyWeight,
          }
        );
      }

      if (config.requireWeekendOff && weekendDayIndices.length >= 2) {
        const weekendWorkVars: Var[] = [];
        for (const wIdx of weekendDayIndices) {
          weekendWorkVars.push(...getNurseDayWorkVars(nurse.id, wIdx));
        }
        const maxWeekendWork = Math.max(0, weekendDayIndices.length - 2);
        addTrackedConstraint(
          expr`${sum(weekendWorkVars)} <= ${maxWeekendWork}`,
          {
            name: `weekend_off_${nurse.id}`,
            category: "monthly",
            ruleKey: "requireWeekendOff",
            labelJa: `週末公休確保: ${nurse.name}(${nurse.id}) は土日のうち最低2日以上を公休にする`,
            relatedNurseIds: [nurse.id],
            relaxSuggestion: `「週末休みの確保」ルールをOFFにするか、土日日勤の必要人数を緩和してください。`,
          }
        );
      }

      // 5b. 36協定（時間外労働の月間上限 & 直近1年累計上限）
      if (config.enforce36Agreement) {
        const prev11Hours = nurse.yearly36Stats?.prev11MonthsOvertimeHours ?? 180;
        const remainingAnnualHours = Math.max(0, config.maxAnnualOvertimeHours - prev11Hours);
        const effectiveOvertimeCap = Math.min(config.maxMonthlyOvertimeHours, remainingAnnualHours);

        const excessWorkVar = m.continuous(`excess_work_${nurse.id}`, {
          lb: 0,
        });
        // excessWorkVar >= sum(allWorkVars) - 20
        m.constraint(expr`${sum(allWorkVars)} - ${excessWorkVar} <= 20`, `excess_work_def_${nurse.id}`);

        const customOvertimeTerms: LinExpr[] = customShiftDefs.map(
          (cs) => expr`${cs.overtimeHoursPerShift ?? 0.5} * ${sum(vCustom[cs.code][nurse.id])}` as LinExpr
        );

        const monthOvertimeExpr =
          customOvertimeTerms.length > 0
            ? expr`1.0 * ${sum(vD[nurse.id])} + 1.5 * ${sum(vE[nurse.id])} + 2.0 * ${sum(vN[nurse.id])} + ${sum(customOvertimeTerms)} + 8.0 * ${excessWorkVar}`
            : expr`1.0 * ${sum(vD[nurse.id])} + 1.5 * ${sum(vE[nurse.id])} + 2.0 * ${sum(vN[nurse.id])} + 8.0 * ${excessWorkVar}`;

        addTrackedConstraint(
          expr`${monthOvertimeExpr} <= ${effectiveOvertimeCap}`,
          {
            name: `labor36_overtime_${nurse.id}`,
            category: "labor_36",
            ruleKey: "enforce36Agreement",
            labelJa: `36協定 時間外労働上限: ${nurse.name}(${nurse.id}) の当月時間外 <= ${effectiveOvertimeCap}h（過去11ヶ月累計:${prev11Hours}h / 年間上限:${config.maxAnnualOvertimeHours}h・月上限:${config.maxMonthlyOvertimeHours}h）`,
            relatedNurseIds: [nurse.id],
            relaxSuggestion: `36協定の年間時間外上限（現在:${config.maxAnnualOvertimeHours}h）または月間上限（現在:${config.maxMonthlyOvertimeHours}h）を調整するか、${nurse.name}さんの公休を増やしてください。`,
          }
        );
      }
    }
  }

  // 6. Daily Shift Coverage & Unified Skill / Role / Group Coverage
  const activeSkillDefs = state.skillDefs ?? createDefaultSkillDefs();

  for (let d = 1; d <= numDays; d++) {
    if (!isDayIncluded(d)) continue;
    const idx = d - 1;
    const dow = getDayOfWeek(config.year, config.month, d);
    const dowLabel = WEEKDAY_NAMES_JA[dow];
    const req = getRequiredDailyCoverage(state, d);

    for (const s of ["D", "E", "N"] as const) {
      const dayVars = nurses.flatMap((n) => getShiftVarsForNurseDay(s, n.id, idx));
      addTrackedConstraint(expr`${sum(dayVars)} >= ${req[s]}`, {
        name: `cov_${s}_d${d}`,
        category: "coverage",
        ruleKey: "dailyCoverage",
        labelJa: `${config.month}/${d}(${dowLabel}) ${SHIFT_LABEL_JA[s]}の必要人数確保 (>= ${req[s]}名)`,
        relatedDay: d,
        relaxSuggestion: `${config.month}/${d}(${dowLabel})の${SHIFT_LABEL_JA[s]}必要人数（${req[s]}名）を緩和してください。`,
      });
    }

    // Unified skill / role / group min & max bounds across all SkillDefinitions
    if (config.enforceSkillCoverage) {
      for (const sd of activeSkillDefs) {
        const minByShift: Record<"D" | "E" | "N", number> = {
          D: sd.minDay ?? 0,
          E: sd.minEvening ?? 0,
          N: sd.minNight ?? 0,
        };
        const maxByShift: Record<"D" | "E" | "N", number | undefined> = {
          D: sd.maxDay,
          E: sd.maxEvening,
          N: sd.maxNight,
        };
        const hasAnyBound =
          minByShift.D > 0 ||
          minByShift.E > 0 ||
          minByShift.N > 0 ||
          typeof maxByShift.D === "number" ||
          typeof maxByShift.E === "number" ||
          typeof maxByShift.N === "number";
        if (!hasAnyBound) continue;

        const holders = nurses.filter((n) =>
          doesNurseMatchAttribute(n, sd.code, activeSkillDefs)
        );

        const hasStaffingOverride = (s: ActiveShiftCode, bound: "min" | "max") =>
          customRules.some((r) => {
            if (!r.enabled || r.kind !== "staffing_rule") return false;
            if ((r.attribute ?? "all") !== sd.code) return false;
            if (!r.shifts?.includes(s)) return false;
            if (typeof r.startDay === "number" && d < r.startDay) return false;
            if (typeof r.endDay === "number" && d > r.endDay) return false;
            if (r.allowedDaysOfWeek?.length && !r.allowedDaysOfWeek.includes(dow)) return false;
            return bound === "min"
              ? typeof r.minCount === "number"
              : typeof r.maxCount === "number";
          });

        for (const s of ["D", "E", "N"] as const) {
          const minReq = minByShift[s];
          if (minReq > 0 && !hasStaffingOverride(s, "min")) {
            addTrackedConstraint(
              expr`${sum(holders.flatMap((n) => getShiftVarsForNurseDay(s, n.id, idx)))} >= ${minReq}`,
              {
                name: `skill_${sd.code}_${s}_d${d}`,
                category: "skill",
                ruleKey: "enforceSkillCoverage",
                labelJa: `${config.month}/${d}(${dowLabel}) ${SHIFT_LABEL_JA[s]}の「${sd.label}」配置 (>= ${minReq}名)`,
                relatedDay: d,
                relaxSuggestion: `「${sd.label}」の${SHIFT_LABEL_JA[s]}必要人数（${minReq}名）を緩和するか保持者を増やしてください。`,
              }
            );
          }

          const maxCap = maxByShift[s];
          if (
            typeof maxCap === "number" &&
            maxCap >= 0 &&
            holders.length > 0 &&
            !hasStaffingOverride(s, "max")
          ) {
            addTrackedConstraint(
              expr`${sum(holders.flatMap((n) => getShiftVarsForNurseDay(s, n.id, idx)))} <= ${maxCap}`,
              {
                name: `skill_max_${sd.code}_${s}_d${d}`,
                category: "skill",
                ruleKey: "enforceSkillCoverage",
                labelJa: `${config.month}/${d}(${dowLabel}) ${SHIFT_LABEL_JA[s]}の「${sd.label}」人数上限 (<= ${maxCap}名)`,
                relatedDay: d,
                relaxSuggestion: `「${sd.label}」の${SHIFT_LABEL_JA[s]}上限人数（現在:${maxCap}名）を緩和してください。`,
              }
            );
          }
        }
      }
    }
  }

  // 7. Pair Relations: Incompatible NG Pairs (同時配置禁止) & Preceptor Pairs (同行配置) across target shifts
  const nurseMap = new Map(nurses.map((n) => [n.id, n]));
  if (config.enforceNgPairs) {
    for (const rel of relations) {
      if (rel.type !== "ng_pair") continue;
      const nA = nurseMap.get(rel.nurseA);
      const nB = nurseMap.get(rel.nurseB);
      if (!nA || !nB) continue;
      const targetShifts: ShiftCode[] = rel.shifts?.length ? rel.shifts : ["E", "N"];

      for (let d = 1; d <= numDays; d++) {
        if (!isDayIncluded(d)) continue;
        const idx = d - 1;
        for (const s of targetShifts) {
          const varsA = getShiftVarsForNurseDay(s, nA.id, idx);
          const varsB = getShiftVarsForNurseDay(s, nB.id, idx);
          if (varsA.length === 0 || varsB.length === 0) continue;
          addTrackedConstraint(
            expr`${sum(varsA)} + ${sum(varsB)} <= 1`,
            {
              name: `ng_pair_${nA.id}_${nB.id}_${s}_d${d}`,
              category: "ng_pair",
              ruleKey: "enforceNgPairs",
              labelJa: `${config.month}/${d} ${SHIFT_LABEL_JA[s as ActiveShiftCode] ?? s}: 相性NGペア（${nA.name} × ${nB.name}）の同時配置禁止`,
              relatedNurseIds: [nA.id, nB.id],
              relatedDay: d,
              relaxSuggestion: `相性NGペア制約をOFFにするか、${nA.name}さん・${nB.name}さんの${config.month}/${d}のシフト指定を変更してください。`,
              isHard: rel.isHard,
              softWeight: rel.penaltyWeight,
            }
          );
        }
      }
    }
  }

  for (const rel of relations) {
    if (rel.type !== "preceptor") continue;
    if (!config.enforcePreceptorPairs && rel.enabled === false) continue;
    const nA = nurseMap.get(rel.nurseA);
    const nB = nurseMap.get(rel.nurseB);
    if (!nA || !nB) continue;
    const targetShifts: ShiftCode[] = rel.shifts?.length ? rel.shifts : ["E", "N"];

    for (let d = 1; d <= numDays; d++) {
      if (!isDayIncluded(d)) continue;
      const idx = d - 1;
      for (const s of targetShifts) {
        const varsA = getShiftVarsForNurseDay(s, nA.id, idx);
        const varsB = getShiftVarsForNurseDay(s, nB.id, idx);
        if (varsA.length === 0 || varsB.length === 0) continue;
        addTrackedConstraint(
          expr`${sum(varsA)} - ${sum(varsB)} <= 0`,
          {
            name: `preceptor_${nA.id}_${nB.id}_${s}_d${d}`,
            category: "skill",
            ruleKey: "enforcePreceptorPairs",
            labelJa: `${config.month}/${d} ${SHIFT_LABEL_JA[s as ActiveShiftCode] ?? s}: プリセプター同行配置（新人:${nA.name} ➔ 指導:${nB.name}）`,
            relatedNurseIds: [nA.id, nB.id],
            relatedDay: d,
            relaxSuggestion: `プリセプター同行ルールをOFFにするか、${nA.name}さん・${nB.name}さんの休日希望を調整してください。`,
            isHard: rel.isHard,
            softWeight: rel.penaltyWeight,
          }
        );
      }
    }
  }

  // 8. Hard Shift Preferences (有給休暇・確定希望)
  const nurseById = new Map(nurses.map((n) => [n.id, n]));
  if (config.enforceHardRequests) {
    for (const pref of preferences) {
      if (!pref.isHard) continue;
      if (pref.day < 1 || pref.day > numDays || !isDayIncluded(pref.day)) continue;
      const nurse = nurseById.get(pref.nurseId);
      if (!nurse) continue;
      const idx = pref.day - 1;

      if (pref.shift === "O") {
        addTrackedConstraint(
          expr`${sum(getNurseDayWorkVars(nurse.id, idx))} <= 0`,
          {
            name: `req_hard_off_${nurse.id}_d${pref.day}`,
            category: "request",
            ruleKey: "enforceHardRequests",
            labelJa: `${config.month}/${pref.day}: ${nurse.name}(${nurse.id}) の確定希望休 [理由: ${pref.reason}]`,
            relatedNurseIds: [nurse.id],
            relatedDay: pref.day,
            relaxSuggestion: `${nurse.name}さんの${config.month}/${pref.day}の希望休をソフト希望に変更するか、他スタッフと日程調整してください。`,
          }
        );
      } else {
        const prefVars = getShiftVarsForNurseDay(pref.shift, nurse.id, idx);
        if (prefVars.length > 0) {
          const meta = getShiftMeta(pref.shift, customShiftDefs);
          addTrackedConstraint(expr`${sum(prefVars)} >= 1`, {
            name: `req_hard_${pref.shift}_${nurse.id}_d${pref.day}`,
            category: "request",
            ruleKey: "enforceHardRequests",
            labelJa: `${config.month}/${pref.day}: ${nurse.name}(${nurse.id}) の${meta.label}確定指定 [理由: ${pref.reason}]`,
            relatedNurseIds: [nurse.id],
            relatedDay: pref.day,
          });
        }
      }
    }
  }

  // 9. Active Custom Rules (チャット・設定から追加された個別制約・シフト回数ノルマ・サブシフト配置基準)
  for (const rule of customRules) {
    if (!rule.enabled) continue;
    const addRuleConstraint = (
      c: Constraint | ReturnType<typeof expr>,
      meta: ConstraintMeta
    ) =>
      addTrackedConstraint(c, {
        ...meta,
        isHard: rule.isHard,
        softWeight: rule.penaltyWeight,
      });

    if (rule.kind === "pin_shift" && rule.nurseId && rule.day && rule.shift) {
      if (rule.day < 1 || rule.day > numDays || !isDayIncluded(rule.day)) continue;
      const nurse = nurseById.get(rule.nurseId);
      if (!nurse) continue;
      const idx = rule.day - 1;
      const cName = `custom_pin_${rule.id}_${nurse.id}_d${rule.day}_${rule.shift}`;

      if (rule.shift === "O") {
        addRuleConstraint(
          expr`${sum(getNurseDayWorkVars(nurse.id, idx))} <= 0`,
          {
            name: cName,
            category: "custom",
            labelJa: `${rule.description}`,
            relatedNurseIds: [nurse.id],
            relatedDay: rule.day,
            relaxSuggestion: `追加された個別ルール「${rule.description}」を解除または変更してください。`,
          }
        );
      } else {
        const pinVars = getShiftVarsForNurseDay(rule.shift, nurse.id, idx);
        if (pinVars.length > 0) {
          addRuleConstraint(expr`${sum(pinVars)} >= 1`, {
            name: cName,
            category: "custom",
            labelJa: `${rule.description}`,
            relatedNurseIds: [nurse.id],
            relatedDay: rule.day,
            relaxSuggestion: `追加された個別ルール「${rule.description}」を解除または変更してください。`,
          });
        }
      }
    } else if (
      rule.kind === "date_coverage" &&
      rule.isHard === false &&
      rule.day &&
      rule.shift &&
      rule.shift !== "O" &&
      typeof rule.minStaff === "number"
    ) {
      if (rule.day >= 1 && rule.day <= numDays && isDayIncluded(rule.day)) {
        const idx = rule.day - 1;
        const dayVars = nurses.flatMap((n) => getShiftVarsForNurseDay(rule.shift!, n.id, idx));
        if (dayVars.length > 0) {
          addRuleConstraint(expr`${sum(dayVars)} >= ${rule.minStaff}`, {
            name: `custom_date_cov_${rule.id}_d${rule.day}`,
            category: "coverage",
            labelJa: `${rule.description}`,
            relatedDay: rule.day,
            relaxSuggestion: `特定日人数ルール「${rule.description}」の必要人数を緩和してください。`,
          });
        }
      }
    } else if (rule.kind === "forbid_shift" && rule.nurseId && rule.day && rule.forbidShifts?.length) {
      if (rule.day < 1 || rule.day > numDays || !isDayIncluded(rule.day)) continue;
      const nurse = nurseById.get(rule.nurseId);
      if (!nurse) continue;
      const idx = rule.day - 1;
      const forbiddenVars: Var[] = [];
      for (const s of rule.forbidShifts) {
        forbiddenVars.push(...getShiftVarsForNurseDay(s, nurse.id, idx));
      }
      if (forbiddenVars.length > 0) {
        addRuleConstraint(expr`${sum(forbiddenVars)} <= 0`, {
          name: `custom_forbid_${rule.id}_${nurse.id}_d${rule.day}`,
          category: "custom",
          labelJa: `${rule.description}`,
          relatedNurseIds: [nurse.id],
          relatedDay: rule.day,
          relaxSuggestion: `追加された禁止ルール「${rule.description}」を解除してください。`,
        });
      }
    } else if (rule.kind === "ng_pair_custom" && rule.nurseId && rule.nurseBId) {
      const nA = nurseById.get(rule.nurseId);
      const nB = nurseById.get(rule.nurseBId);
      if (!nA || !nB) continue;
      const targetShifts: ShiftCode[] = rule.shifts?.length ? rule.shifts : ["E", "N"];
      for (let d = 1; d <= numDays; d++) {
        if (!isDayIncluded(d)) continue;
        const idx = d - 1;
        for (const s of targetShifts) {
          const varsA = getShiftVarsForNurseDay(s, nA.id, idx);
          const varsB = getShiftVarsForNurseDay(s, nB.id, idx);
          if (varsA.length === 0 || varsB.length === 0) continue;
          addRuleConstraint(
            expr`${sum(varsA)} + ${sum(varsB)} <= 1`,
            {
              name: `custom_ng_${rule.id}_${nA.id}_${nB.id}_${s}_d${d}`,
              category: "custom",
              labelJa: `${config.month}/${d} ${SHIFT_LABEL_JA[s as ActiveShiftCode] ?? s}: ${rule.description}`,
              relatedNurseIds: [nA.id, nB.id],
              relatedDay: d,
              relaxSuggestion: `追加された相性NGルール「${rule.description}」を解除してください。`,
            }
          );
        }
      }
    } else if (rule.kind === "staffing_rule" && rule.shifts?.length) {
      const attr = rule.attribute ?? "all";
      const matchingNurses = nurses.filter((n) =>
        doesNurseMatchAttribute(n, attr, activeSkillDefs)
      );
      const allowedDow = rule.allowedDaysOfWeek?.length
        ? new Set(rule.allowedDaysOfWeek)
        : null;
      for (let d = 1; d <= numDays; d++) {
        if (!isDayIncluded(d)) continue;
        if (typeof rule.startDay === "number" && d < rule.startDay) continue;
        if (typeof rule.endDay === "number" && d > rule.endDay) continue;
        const dow = getDayOfWeek(config.year, config.month, d);
        if (allowedDow && !allowedDow.has(dow)) continue;
        const idx = d - 1;
        for (const s of rule.shifts) {
          if (!isDayAllowedForShift(d, s)) continue;
          const vars = matchingNurses.flatMap((n) =>
            getShiftVarsForNurseDay(s, n.id, idx)
          );
          const sLabel =
            SHIFT_LABEL_JA[s as ActiveShiftCode] ??
            getShiftMeta(s, customShiftDefs, state.shiftAliases).label;
          if (typeof rule.minCount === "number" && rule.minCount > 0) {
            addRuleConstraint(expr`${sum(vars)} >= ${rule.minCount}`, {
              name: `staffing_min_${rule.id}_${s}_d${d}`,
              category: "skill",
              labelJa: `${config.month}/${d}: ${rule.description}（${sLabel} >= ${rule.minCount}名）`,
              relatedDay: d,
              relaxSuggestion: `配置ルール「${rule.description}」の必要人数（${rule.minCount}名）を緩和してください。`,
            });
          }
          if (vars.length > 0 && typeof rule.maxCount === "number" && rule.maxCount >= 0) {
            addRuleConstraint(expr`${sum(vars)} <= ${rule.maxCount}`, {
              name: `staffing_max_${rule.id}_${s}_d${d}`,
              category: "skill",
              labelJa: `${config.month}/${d}: ${rule.description}（${sLabel} <= ${rule.maxCount}名）`,
              relatedDay: d,
              relaxSuggestion: `配置ルール「${rule.description}」の上限人数（${rule.maxCount}名）を緩和してください。`,
            });
          }
        }
      }
    } else if (!onlyDays && rule.kind === "shift_count_quota" && rule.shift) {
      const targetNurses = nurses.filter((n) => isNurseTargetedByRule(n, rule, activeSkillDefs));
      const shiftMeta = getShiftMeta(rule.shift, customShiftDefs);

      for (const nurse of targetNurses) {
        const prevCount = rule.includePrevMonth
          ? getNursePrevCompletedShiftCount(nurse, rule.shift, customShiftDefs)
          : 0;
        const effectiveMin =
          typeof rule.minCount === "number" ? Math.max(0, rule.minCount - prevCount) : undefined;
        const effectiveMax =
          typeof rule.maxCount === "number" ? rule.maxCount - prevCount : undefined;

        if (rule.shift === "O") {
          const allWorkVars: Var[] = [];
          for (let idx = 0; idx < numDays; idx++) {
            allWorkVars.push(...getNurseDayWorkVars(nurse.id, idx));
          }
          if (typeof effectiveMin === "number" && effectiveMin > 0) {
            const maxWork = Math.max(0, numDays - effectiveMin);
            addRuleConstraint(expr`${sum(allWorkVars)} <= ${maxWork}`, {
              name: `quota_min_${rule.id}_${nurse.id}`,
              category: "custom",
              labelJa: `${rule.description}（${nurse.name}(${nurse.id}) の当月「${shiftMeta.label}」>= ${effectiveMin}日）`,
              relatedNurseIds: [nurse.id],
              relaxSuggestion: `追加ルール「${rule.description}」の必要日数を減らすか解除してください。`,
            });
          }
          if (typeof effectiveMax === "number") {
            const minWork = Math.max(0, numDays - effectiveMax);
            if (minWork > 0) {
              addRuleConstraint(expr`${sum(allWorkVars)} >= ${minWork}`, {
                name: `quota_max_${rule.id}_${nurse.id}`,
                category: "custom",
                labelJa: `${rule.description}（${nurse.name}(${nurse.id}) の当月「${shiftMeta.label}」<= ${effectiveMax}日）`,
                relatedNurseIds: [nurse.id],
                relaxSuggestion: `追加ルール「${rule.description}」の上限日数を緩和するか解除してください。`,
              });
            }
          }
          continue;
        }

        const shiftVars: Var[] = [];
        for (let idx = 0; idx < numDays; idx++) {
          shiftVars.push(...getShiftVarsForNurseDay(rule.shift, nurse.id, idx));
        }

        if (typeof effectiveMin === "number" && effectiveMin > 0) {
          addRuleConstraint(expr`${sum(shiftVars)} >= ${effectiveMin}`, {
            name: `quota_min_${rule.id}_${nurse.id}`,
            category: "custom",
            labelJa: `${rule.description}（${nurse.name}(${nurse.id}) の当月「${shiftMeta.label}」>= ${effectiveMin}回）`,
            relatedNurseIds: [nurse.id],
            relaxSuggestion: `追加ルール「${rule.description}」の必要回数を減らすか解除してください。`,
          });
        }
        if (typeof effectiveMax === "number" && (shiftVars.length > 0 || effectiveMax < 0)) {
          addRuleConstraint(expr`${sum(shiftVars)} <= ${effectiveMax}`, {
            name: `quota_max_${rule.id}_${nurse.id}`,
            category: "custom",
            labelJa: `${rule.description}（${nurse.name}(${nurse.id}) の当月「${shiftMeta.label}」<= ${effectiveMax}回）`,
            relatedNurseIds: [nurse.id],
            relaxSuggestion: `追加ルール「${rule.description}」の上限回数を緩和するか解除してください。`,
          });
        }
      }
    } else if (
      rule.kind === "daily_shift_cap" &&
      rule.shift &&
      (typeof rule.maxStaff === "number" || typeof rule.minStaff === "number")
    ) {
      const shiftMeta = getShiftMeta(rule.shift, customShiftDefs);
      const hasTargetFilter = Boolean(
        (rule.targetRole && rule.targetRole !== "all") ||
          (rule.attribute && rule.attribute !== "all") ||
          rule.nurseId ||
          (rule.nurseIds && rule.nurseIds.length > 0)
      );
      const targetNurses = hasTargetFilter
        ? nurses.filter((n) => isNurseTargetedByRule(n, rule, activeSkillDefs))
        : nurses;
      for (let d = 1; d <= numDays; d++) {
        if (!isDayIncluded(d)) continue;
        if (typeof rule.startDay === "number" && d < rule.startDay) continue;
        if (typeof rule.endDay === "number" && d > rule.endDay) continue;
        if (!isDayAllowedForShift(d, rule.shift)) continue;
        const idx = d - 1;
        const dayShiftVars = targetNurses.flatMap((n) =>
          getShiftVarsForNurseDay(rule.shift!, n.id, idx)
        );
        if (typeof rule.minStaff === "number" && rule.minStaff > 0) {
          addRuleConstraint(expr`${sum(dayShiftVars)} >= ${rule.minStaff}`, {
            name: `daily_min_${rule.id}_d${d}`,
            category: "custom",
            labelJa: `${config.month}/${d}: ${rule.description}（「${shiftMeta.label}」は1日最低${rule.minStaff}名以上）`,
            relatedDay: d,
            relaxSuggestion: `追加ルール「${rule.description}」の1日あたり必要人数を緩和するか解除してください。`,
          });
        }
        if (dayShiftVars.length > 0 && typeof rule.maxStaff === "number" && rule.maxStaff >= 0) {
          addRuleConstraint(expr`${sum(dayShiftVars)} <= ${rule.maxStaff}`, {
            name: `daily_cap_${rule.id}_d${d}`,
            category: "custom",
            labelJa: `${config.month}/${d}: ${rule.description}（「${shiftMeta.label}」は1日最大${rule.maxStaff}名まで）`,
            relatedDay: d,
            relaxSuggestion: `追加ルール「${rule.description}」の1日あたり上限人数を緩和するか解除してください。`,
          });
        }
      }
    } else if (
      rule.kind === "shift_day_restriction" &&
      rule.shift &&
      (rule.allowedDaysOfWeek?.length ||
        typeof rule.startDay === "number" ||
        typeof rule.endDay === "number")
    ) {
      const allowedSet = rule.allowedDaysOfWeek?.length ? new Set(rule.allowedDaysOfWeek) : null;
      const shiftMeta = getShiftMeta(rule.shift, customShiftDefs);
      for (let d = 1; d <= numDays; d++) {
        if (!isDayIncluded(d)) continue;
        const dow = getDayOfWeek(config.year, config.month, d);
        const okDow = !allowedSet || allowedSet.has(dow);
        const okStart = typeof rule.startDay !== "number" || d >= rule.startDay;
        const okEnd = typeof rule.endDay !== "number" || d <= rule.endDay;
        if (okDow && okStart && okEnd) continue;
        const idx = d - 1;
        const dayShiftVars = nurses.flatMap((n) =>
          getShiftVarsForNurseDay(rule.shift!, n.id, idx)
        );
        if (dayShiftVars.length > 0) {
          addRuleConstraint(expr`${sum(dayShiftVars)} <= 0`, {
            name: `day_restrict_${rule.id}_d${d}`,
            category: "custom",
            labelJa: `${config.month}/${d}(${WEEKDAY_NAMES_JA[dow]}): ${rule.description}（${shiftMeta.label}の配置不可）`,
            relatedDay: d,
            relaxSuggestion: `追加ルール「${rule.description}」を解除してください。`,
          });
        }
      }
    } else if (
      !onlyDays &&
      rule.kind === "shift_prerequisite" &&
      rule.prereqShift &&
      typeof rule.prereqMinCount === "number" &&
      rule.prereqMinCount > 0 &&
      rule.restrictedShifts?.length
    ) {
      const targetNurses = nurses.filter((n) => isNurseTargetedByRule(n, rule, activeSkillDefs));

      for (const nurse of targetNurses) {
        const prevCount = rule.includePrevMonth
          ? getNursePrevCompletedShiftCount(nurse, rule.prereqShift, customShiftDefs)
          : 0;
        const kReq = Math.max(0, rule.prereqMinCount - prevCount);
        if (kReq <= 0) {
          continue;
        }

        const prereqVarsByDay = Array.from({ length: numDays }, (_, idx) =>
          getShiftVarsForNurseDay(rule.prereqShift!, nurse.id, idx)
        );

        for (let d = 1; d <= numDays; d++) {
          const idx = d - 1;
          const rVars: Var[] = [];
          for (const rs of rule.restrictedShifts) {
            rVars.push(...getShiftVarsForNurseDay(rs, nurse.id, idx));
          }
          if (rVars.length === 0) continue;

          const earlierPrereqVars = prereqVarsByDay.slice(0, idx).flat();
          if (idx < kReq) {
            addRuleConstraint(expr`${sum(rVars)} <= 0`, {
              name: `prereq_${rule.id}_${nurse.id}_d${d}`,
              category: "custom",
              labelJa: `${config.month}/${d}: ${rule.description}（${nurse.name}(${nurse.id}) は前日までに必要回数を満たせないため配置不可）`,
              relatedNurseIds: [nurse.id],
              relatedDay: d,
              relaxSuggestion: `追加ルール「${rule.description}」を解除または緩和してください。`,
            });
          } else {
            addRuleConstraint(
              expr`${kReq} * ${sum(rVars)} - ${sum(earlierPrereqVars)} <= 0`,
              {
                name: `prereq_${rule.id}_${nurse.id}_d${d}`,
                category: "custom",
                labelJa: `${config.month}/${d}: ${rule.description}（${nurse.name}(${nurse.id})）`,
                relatedNurseIds: [nurse.id],
                relatedDay: d,
                relaxSuggestion: `追加ルール「${rule.description}」を解除または緩和してください。`,
              }
            );
          }
        }
      }
    }
  }

  // 10. Linear Objective Function
  if (elasticMode && elasticSlacks.length > 0) {
    m.objective(
      minimize(sum(elasticSlacks, (entry) => expr`${entry.weight} * ${entry.slackVar}`))
    );
  } else if (!onlyDays) {
    const objTerms: Array<LinExpr | Var | number> = [1000, ...softPenaltyTerms];

    for (const pref of preferences) {
      if (pref.isHard) continue;
      if (pref.day < 1 || pref.day > numDays) continue;
      const nurse = nurseById.get(pref.nurseId);
      if (!nurse) continue;
      const idx = pref.day - 1;

      if (pref.shift === "O") {
        const wOff =
          typeof pref.penaltyWeight === "number" && pref.penaltyWeight > 0
            ? pref.penaltyWeight
            : 20;
        objTerms.push(wOff);
        objTerms.push(expr`-${wOff} * ${sum(getNurseDayWorkVars(nurse.id, idx))}` as LinExpr);
      } else {
        const prefVars = getShiftVarsForNurseDay(pref.shift, nurse.id, idx);
        if (prefVars.length > 0) {
          const wShift =
            typeof pref.penaltyWeight === "number" && pref.penaltyWeight > 0
              ? pref.penaltyWeight
              : 15;
          objTerms.push(expr`${wShift} * ${sum(prefVars)}` as LinExpr);
        }
      }
    }

    const allAssignedVars: Var[] = [];
    for (const nurse of nurses) {
      for (let idx = 0; idx < numDays; idx++) {
        allAssignedVars.push(
          ...filterActiveVars([
            vD[nurse.id][idx],
            vE[nurse.id][idx],
            vN[nurse.id][idx],
            ...customShiftDefs.map((cs) => vCustom[cs.code][nurse.id][idx]),
          ])
        );
      }
    }
    objTerms.push(expr`-1 * ${sum(allAssignedVars)}` as LinExpr);

    const nightLevelRule = customRules.find(
      (r) => r.enabled && r.kind === "level_night_shifts"
    );
    if (nightLevelRule) {
      const groupBy = nightLevelRule.levelGroupBy ?? "role_and_skill";
      const eligibleNurses = nurses.filter((n) => n.nightOk);
      const getGroupKey = (n: NurseProfile): string => {
        const skillKey = [...n.skills].sort().join(",");
        if (groupBy === "all") return "all";
        if (groupBy === "role") return n.role;
        if (groupBy === "skill") return skillKey;
        return `${n.role}:${skillKey}`;
      };
      const groups = new Map<string, NurseProfile[]>();
      for (const n of eligibleNurses) {
        const k = getGroupKey(n);
        const list = groups.get(k) ?? [];
        list.push(n);
        groups.set(k, list);
      }
      const totalNightSlots = numDays * (config.eveningStaff + config.nightStaff);
      const getNurseNightCap = (n: NurseProfile): number => {
        const customMax = customRules.find(
          (r) =>
            r.enabled &&
            r.kind === "nurse_max_night" &&
            r.nurseId === n.id &&
            typeof r.maxNight === "number"
        );
        return customMax?.maxNight ?? n.maxMonthlyNightShifts ?? config.maxMonthlyNightShifts;
      };
      const totalCap = Math.max(
        1,
        eligibleNurses.reduce((acc, n) => acc + getNurseNightCap(n), 0)
      );

      for (const groupNurses of groups.values()) {
        const groupCap = groupNurses.reduce((acc, n) => acc + getNurseNightCap(n), 0);
        const expectedGroupTotal = (totalNightSlots * groupCap) / totalCap;
        const targetGroupNight = Math.floor(expectedGroupTotal / Math.max(1, groupNurses.length));

        for (const nurse of groupNurses) {
          const over1 = m.continuous(`lvl_over1_${nurse.id}`, {
            lb: 0,
          });
          const over2 = m.continuous(`lvl_over2_${nurse.id}`, {
            lb: 0,
          });
          const nurseNightVars = Array.from({ length: numDays }, (_, idx) =>
            getNurseNighttimeVars(nurse.id, idx)
          ).flat();

          m.constraint(
            expr`${sum(nurseNightVars)} - ${over1} <= ${targetGroupNight}`,
            `lvl_ub1_${nurse.id}`
          );
          m.constraint(
            expr`${sum(nurseNightVars)} - ${over2} <= ${targetGroupNight + 1}`,
            `lvl_ub2_${nurse.id}`
          );

          objTerms.push(expr`-40 * ${over1} - 80 * ${over2}` as LinExpr);
        }
      }
    }

    // Minimal Perturbation (既存シフト維持 / 変更最小化モード):
    const refSched =
      config.preserveCurrentSchedule !== false ? options?.referenceSchedule : null;
    if (refSched) {
      const pinnedCellKeys = new Set<string>();
      for (const r of customRules) {
        if (
          r.enabled &&
          (r.kind === "pin_shift" || r.kind === "forbid_shift") &&
          r.nurseId &&
          typeof r.day === "number"
        ) {
          pinnedCellKeys.add(`${r.nurseId}_${r.day}`);
        }
      }

      const prevOffWorkVars: Var[] = [];
      const prevMatchedVars: Var[] = [];
      const prevWorkAllVars: Var[] = [];
      let prevWorkCellCount = 0;

      for (const nurse of nurses) {
        const prevRow = refSched[nurse.id];
        if (!prevRow) continue;
        for (let idx = 0; idx < numDays; idx++) {
          const d = idx + 1;
          if (pinnedCellKeys.has(`${nurse.id}_${d}`)) continue;
          const prevShift = prevRow[idx];
          if (!prevShift) continue;

          const allDayVars: Var[] = filterActiveVars([
            vD[nurse.id][idx],
            vE[nurse.id][idx],
            vN[nurse.id][idx],
            ...customShiftDefs.map((cs) => vCustom[cs.code][nurse.id][idx]),
          ]);

          if (prevShift === "O") {
            prevOffWorkVars.push(...allDayVars);
          } else {
            const matchedShiftVars = getShiftVarsForNurseDay(prevShift, nurse.id, idx);
            if (matchedShiftVars.length > 0) {
              prevWorkCellCount++;
              prevMatchedVars.push(...matchedShiftVars);
              prevWorkAllVars.push(...allDayVars);
            }
          }
        }
      }

      if (prevOffWorkVars.length > 0) {
        objTerms.push(expr`-8 * ${sum(prevOffWorkVars)}` as LinExpr);
      }
      if (prevWorkCellCount > 0) {
        objTerms.push(-8 * prevWorkCellCount);
        objTerms.push(expr`6 * ${sum(prevMatchedVars)} + 2 * ${sum(prevWorkAllVars)}` as LinExpr);
      }
    }

    m.objective(maximize(sum(objTerms)));
  }

  return { model: m, vD, vE, vN, vCustom, constraintMeta, elasticSlacks };
}

/**
 * Independently evaluates a monthly schedule against all active nurse scheduling rules.
 */
export function evaluateNurseSchedule(
  state: NurseSchedulingState,
  schedule: MonthlyScheduleMap
): ScheduleEvaluationReport {
  const { config, nurses, relations, preferences, customRules } = state;
  const customShiftDefs = state.customShiftDefs ?? [];
  const numDays = config.numDays;
  const violations: ScheduleViolationItem[] = [];
  const dailySummaries: DailySlotSummary[] = [];
  const nurseSummaries: Record<string, NurseMonthlySummary> = {};

  const nurseById = new Map(nurses.map((n) => [n.id, n]));
  const activeSkillDefs = state.skillDefs ?? createDefaultSkillDefs();
  const transMatrix = getShiftTransitionMatrix(config);

  const pushViolation = (
    item: ScheduleViolationItem,
    options?: { ruleKey?: string; customRule?: CustomConstraintRule }
  ) => {
    if (item.isSoft === undefined) {
      if (options?.customRule?.isHard === false) {
        item.isSoft = true;
      } else if (options?.ruleKey && (config.softRuleWeights?.[options.ruleKey] ?? 0) > 0) {
        item.isSoft = true;
      }
    }
    violations.push(item);
  };

  // 1. Daily coverage & skill checks
  for (let d = 1; d <= numDays; d++) {
    const idx = d - 1;
    const dow = getDayOfWeek(config.year, config.month, d);
    const isWeekend = dow === 0 || dow === 6;
    const required = getRequiredDailyCoverage(state, d);

    const counts: Record<string, number> = { D: 0, E: 0, N: 0, O: 0 };
    for (const cs of customShiftDefs) {
      counts[cs.code] = 0;
    }
    const leaders: Record<ActiveShiftCode, number> = { D: 0, E: 0, N: 0 };
    const icuSkills: Record<ActiveShiftCode, number> = { D: 0, E: 0, N: 0 };
    const newcomers: Record<ActiveShiftCode, number> = { D: 0, E: 0, N: 0 };

    for (const nurse of nurses) {
      const shift = schedule[nurse.id]?.[idx] ?? "O";
      counts[shift] = (counts[shift] ?? 0) + 1;
      const matchesDayGroup = doesShiftMatchGroup(
        shift,
        "D",
        customShiftDefs,
        state.shiftAliases
      );
      if (shift !== "D" && matchesDayGroup) {
        counts.D = (counts.D ?? 0) + 1;
      }
      if (matchesDayGroup) {
        if (doesNurseSatisfySkill(nurse, "leader_cap", activeSkillDefs)) {
          leaders.D++;
        }
        if (doesNurseSatisfySkill(nurse, "icu_er", activeSkillDefs)) {
          icuSkills.D++;
        }
        if (nurse.role === "newcomer") {
          newcomers.D++;
        }
      } else if (shift === "E" || shift === "N") {
        const nightSub = shift as "E" | "N";
        if (doesNurseSatisfySkill(nurse, "leader_cap", activeSkillDefs)) leaders[nightSub]++;
        if (doesNurseSatisfySkill(nurse, "icu_er", activeSkillDefs)) icuSkills[nightSub]++;
        if (nurse.role === "newcomer") newcomers[nightSub]++;
      }
    }

    dailySummaries.push({
      day: d,
      dayOfWeek: dow,
      isWeekend,
      counts,
      required,
      leaders,
      icuSkills,
      newcomers,
    });

    for (const s of ["D", "E", "N"] as const) {
      if (counts[s] < required[s]) {
        const sMeta = getShiftMeta(s, customShiftDefs);
        pushViolation(
          {
            id: `cov_${s}_d${d}`,
            category: "coverage",
            day: d,
            message: `${config.month}/${d} ${sMeta.label}の人数不足（配置:${counts[s]}名 / 必要:${required[s]}名）`,
          },
          { ruleKey: "coverage" }
        );
      }
    }

    if (config.enforceSkillCoverage) {
      for (const sd of activeSkillDefs) {
        const hasMin = sd.minDay > 0 || sd.minEvening > 0 || sd.minNight > 0;
        const hasMax =
          typeof sd.maxDay === "number" ||
          typeof sd.maxEvening === "number" ||
          typeof sd.maxNight === "number";
        if (!hasMin && !hasMax) continue;

        const skillCounts: Record<ActiveShiftCode, number> = { D: 0, E: 0, N: 0 };
        for (const nurse of nurses) {
          const shift = schedule[nurse.id]?.[idx] ?? "O";
          if (!doesNurseSatisfySkill(nurse, sd.code, activeSkillDefs)) continue;
          if (doesShiftMatchGroup(shift, "D", customShiftDefs, state.shiftAliases)) {
            skillCounts.D++;
          } else if (shift === "E" || shift === "N") {
            skillCounts[shift as "E" | "N"]++;
          }
        }

        const shiftBounds: Array<{
          s: ActiveShiftCode;
          sLabel: string;
          minVal: number;
          maxVal: number | undefined;
        }> = [
          { s: "D", sLabel: "日勤(D)", minVal: sd.minDay, maxVal: sd.maxDay },
          { s: "E", sLabel: "準夜勤(E)", minVal: sd.minEvening, maxVal: sd.maxEvening },
          { s: "N", sLabel: "深夜勤(N)", minVal: sd.minNight, maxVal: sd.maxNight },
        ];

        for (const { s, sLabel, minVal, maxVal } of shiftBounds) {
          const overriddenMin = customRules.some((r) => {
            if (!r.enabled || r.kind !== "staffing_rule" || r.attribute !== sd.code) return false;
            if (typeof r.minCount !== "number") return false;
            const rShifts = r.shifts?.length ? r.shifts : ["D"];
            if (!rShifts.includes(s)) return false;
            const okStart = typeof r.startDay !== "number" || d >= r.startDay;
            const okEnd = typeof r.endDay !== "number" || d <= r.endDay;
            const okDow = !r.allowedDaysOfWeek?.length || r.allowedDaysOfWeek.includes(dow);
            return okStart && okEnd && okDow;
          });
          if (minVal > 0 && !overriddenMin && skillCounts[s] < minVal) {
            pushViolation(
              {
                id: `skill_${sd.code}_${s}_d${d}`,
                category: "skill",
                day: d,
                message: `${config.month}/${d} ${sLabel}の「${sd.label}」不足（${skillCounts[s]}/${minVal}名）`,
              },
              { ruleKey: "enforceSkillCoverage" }
            );
          }

          const overriddenMax = customRules.some((r) => {
            if (!r.enabled || r.kind !== "staffing_rule" || r.attribute !== sd.code) return false;
            if (typeof r.maxCount !== "number") return false;
            const rShifts = r.shifts?.length ? r.shifts : ["D"];
            if (!rShifts.includes(s)) return false;
            const okStart = typeof r.startDay !== "number" || d >= r.startDay;
            const okEnd = typeof r.endDay !== "number" || d <= r.endDay;
            const okDow = !r.allowedDaysOfWeek?.length || r.allowedDaysOfWeek.includes(dow);
            return okStart && okEnd && okDow;
          });
          if (typeof maxVal === "number" && maxVal >= 0 && !overriddenMax && skillCounts[s] > maxVal) {
            pushViolation(
              {
                id: `skill_max_${sd.code}_${s}_d${d}`,
                category: "skill",
                day: d,
                message: `${config.month}/${d} ${sLabel}の「${sd.label}」上限超過（${skillCounts[s]}/${maxVal}名）`,
              },
              { ruleKey: "enforceSkillCoverage" }
            );
          }
        }
      }
    }

    for (const rule of customRules) {
      if (
        rule.enabled &&
        rule.kind === "daily_shift_cap" &&
        rule.shift &&
        (typeof rule.maxStaff === "number" || typeof rule.minStaff === "number")
      ) {
        const okStart = typeof rule.startDay !== "number" || d >= rule.startDay;
        const okEnd = typeof rule.endDay !== "number" || d <= rule.endDay;
        const restrictedByDayRule = customRules.some((r) => {
          if (!r.enabled || r.kind !== "shift_day_restriction" || r.shift !== rule.shift) return false;
          if (r.allowedDaysOfWeek?.length && !r.allowedDaysOfWeek.includes(dow)) return true;
          if (typeof r.startDay === "number" && d < r.startDay) return true;
          if (typeof r.endDay === "number" && d > r.endDay) return true;
          return false;
        });
        if (!okStart || !okEnd || restrictedByDayRule) continue;

        const hasTargetFilter = Boolean(
          (rule.targetRole && rule.targetRole !== "all") ||
            (rule.attribute && rule.attribute !== "all") ||
            rule.nurseId ||
            (rule.nurseIds && rule.nurseIds.length > 0)
        );
        const targetNurses = hasTargetFilter
          ? nurses.filter((n) => isNurseTargetedByRule(n, rule, activeSkillDefs))
          : nurses;
        const assignedCount = targetNurses.filter((n) => {
          const s = schedule[n.id]?.[idx] ?? "O";
          return doesShiftMatchGroup(s, rule.shift!, customShiftDefs, state.shiftAliases);
        }).length;
        const sMeta = getShiftMeta(rule.shift, customShiftDefs, state.shiftAliases);
        if (typeof rule.minStaff === "number" && assignedCount < rule.minStaff) {
          pushViolation(
            {
              id: `daily_min_${rule.id}_d${d}`,
              category: "custom",
              day: d,
              message: `${config.month}/${d} 「${sMeta.label}」の1日あたり人数不足（配置:${assignedCount}名 / 必要:${rule.minStaff}名以上）`,
            },
            { customRule: rule }
          );
        }
        if (typeof rule.maxStaff === "number" && assignedCount > rule.maxStaff) {
          pushViolation(
            {
              id: `daily_cap_${rule.id}_d${d}`,
              category: "custom",
              day: d,
              message: `${config.month}/${d} 「${sMeta.label}」の1日あたり上限超過（配置:${assignedCount}名 / 上限:${rule.maxStaff}名）`,
            },
            { customRule: rule }
          );
        }
      } else if (rule.enabled && rule.kind === "staffing_rule") {
        const okStart = typeof rule.startDay !== "number" || d >= rule.startDay;
        const okEnd = typeof rule.endDay !== "number" || d <= rule.endDay;
        const okDow = !rule.allowedDaysOfWeek?.length || rule.allowedDaysOfWeek.includes(dow);
        if (!okStart || !okEnd || !okDow) continue;
        const targetShifts: ShiftCode[] = rule.shifts?.length ? rule.shifts : ["D"];
        const attr = rule.attribute ?? "all";
        const matchedNurses = nurses.filter((n) =>
          doesNurseMatchAttribute(n, attr, activeSkillDefs)
        );
        for (const ts of targetShifts) {
          const restrictedByDayRule = customRules.some((r) => {
            if (!r.enabled || r.kind !== "shift_day_restriction" || r.shift !== ts) return false;
            if (r.allowedDaysOfWeek?.length && !r.allowedDaysOfWeek.includes(dow)) return true;
            if (typeof r.startDay === "number" && d < r.startDay) return true;
            if (typeof r.endDay === "number" && d > r.endDay) return true;
            return false;
          });
          if (restrictedByDayRule) continue;

          const countInShift = matchedNurses.filter((n) => {
            const s = schedule[n.id]?.[idx] ?? "O";
            return doesShiftMatchGroup(s, ts, customShiftDefs, state.shiftAliases);
          }).length;
          const sMeta = getShiftMeta(ts, customShiftDefs, state.shiftAliases);
          if (typeof rule.minCount === "number" && countInShift < rule.minCount) {
            pushViolation(
              {
                id: `staffing_min_${rule.id}_${ts}_d${d}`,
                category: "skill",
                day: d,
                message: `${config.month}/${d} ${sMeta.label}の「${attr}」人数不足（配置:${countInShift}名 / 下限:${rule.minCount}名）`,
              },
              { customRule: rule }
            );
          }
          if (typeof rule.maxCount === "number" && countInShift > rule.maxCount) {
            pushViolation(
              {
                id: `staffing_max_${rule.id}_${ts}_d${d}`,
                category: "skill",
                day: d,
                message: `${config.month}/${d} ${sMeta.label}の「${attr}」上限超過（配置:${countInShift}名 / 上限:${rule.maxCount}名）`,
              },
              { customRule: rule }
            );
          }
        }
      }
    }
  }

  // 2. Per-nurse workload, transition, carryover, 36協定, and request checks
  let hardMet = 0;
  let hardTotal = 0;
  let softMet = 0;
  let softTotal = 0;

  for (const nurse of nurses) {
    const row = schedule[nurse.id] ?? new Array(numDays).fill("O");
    const counts: Record<string, number> = { D: 0, E: 0, N: 0, O: 0 };
    for (const cs of customShiftDefs) {
      counts[cs.code] = 0;
    }
    const nurseViolations: string[] = [];
    let weekendDaysOff = 0;

    for (let d = 1; d <= numDays; d++) {
      const s = row[d - 1] ?? "O";
      counts[s] = (counts[s] ?? 0) + 1;
      const dow = getDayOfWeek(config.year, config.month, d);
      const baseOden = getBaseOdenShift(s, customShiftDefs);
      if ((dow === 0 || dow === 6) && baseOden === "O") {
        weekendDaysOff++;
      }
      if (!nurse.nightOk && (baseOden === "E" || baseOden === "N")) {
        const msg = `${config.month}/${d}: 日勤専従スタッフに夜勤(${s})が配置されています`;
        nurseViolations.push(msg);
        pushViolation({
          id: `day_only_${nurse.id}_d${d}`,
          category: "skill",
          nurseId: nurse.id,
          day: d,
          message: `${nurse.name}: ${msg}`,
        });
      }
      if (nurse.forbiddenShifts && nurse.forbiddenShifts.length > 0) {
        if (nurse.forbiddenShifts.includes("D") && baseOden === "D") {
          const msg = `${config.month}/${d}: 夜勤専従スタッフに日勤帯(${s})が配置されています`;
          nurseViolations.push(msg);
          pushViolation({
            id: `forbid_contract_D_${nurse.id}_d${d}`,
            category: "skill",
            nurseId: nurse.id,
            day: d,
            message: `${nurse.name}: ${msg}`,
          });
        }
        if (nurse.forbiddenShifts.includes("E") && baseOden === "E") {
          const msg = `${config.month}/${d}: 準夜勤免除スタッフに準夜勤(${s})が配置されています`;
          nurseViolations.push(msg);
          pushViolation({
            id: `forbid_contract_E_${nurse.id}_d${d}`,
            category: "skill",
            nurseId: nurse.id,
            day: d,
            message: `${nurse.name}: ${msg}`,
          });
        }
        if (nurse.forbiddenShifts.includes("N") && baseOden === "N") {
          const msg = `${config.month}/${d}: 深夜勤免除スタッフに深夜勤(${s})が配置されています`;
          nurseViolations.push(msg);
          pushViolation({
            id: `forbid_contract_N_${nurse.id}_d${d}`,
            category: "skill",
            nurseId: nurse.id,
            day: d,
            message: `${nurse.name}: ${msg}`,
          });
        }
      }
      if (nurse.weekdayOnly && (dow === 0 || dow === 6) && baseOden !== "O") {
        const msg = `${config.month}/${d}(${WEEKDAY_NAMES_JA[dow]}): 平日のみ勤務スタッフに土日勤務(${s})が配置されています`;
        nurseViolations.push(msg);
        pushViolation({
          id: `weekday_only_${nurse.id}_d${d}`,
          category: "monthly",
          nurseId: nurse.id,
          day: d,
          message: `${nurse.name}: ${msg}`,
        });
      }
      if (nurse.holidaysOff && baseOden !== "O") {
        const holidayName = getJapaneseHolidayName(config.year, config.month, d);
        if (holidayName) {
          const msg = `${config.month}/${d}(${holidayName}): 祝日休みスタッフに祝日勤務(${s})が配置されています`;
          nurseViolations.push(msg);
          pushViolation({
            id: `holidays_off_${nurse.id}_d${d}`,
            category: "monthly",
            nurseId: nurse.id,
            day: d,
            message: `${nurse.name}: ${msg}`,
          });
        }
      }
    }

    // Combined timeline: prevMonthShifts (if enforcePrevMonthCarryover) + current month
    const timeline: ShiftCode[] = config.enforcePrevMonthCarryover
      ? [...nurse.prevMonthShifts, ...row]
      : [...row];
    const offset = config.enforcePrevMonthCarryover ? nurse.prevMonthShifts.length : 0;

    const effectiveMaxConsec = nurse.maxConsecutiveWorkDays ?? config.maxConsecutiveWorkDays;
    let maxConsecutiveWork = 0;
    let currentStreak = 0;
    for (let t = 0; t < timeline.length; t++) {
      if (getBaseOdenShift(timeline[t]!, customShiftDefs) !== "O") {
        currentStreak++;
        if (t >= offset && currentStreak > maxConsecutiveWork) {
          maxConsecutiveWork = currentStreak;
        }
        if (currentStreak > effectiveMaxConsec && t >= offset) {
          const dayNum = t - offset + 1;
          const msg = `${config.month}/${dayNum}: ${currentStreak}連勤（上限${effectiveMaxConsec}連勤超過）`;
          nurseViolations.push(msg);
          pushViolation(
            {
              id: `consec_${nurse.id}_d${dayNum}`,
              category: t - effectiveMaxConsec < offset ? "carryover" : "consecutive",
              nurseId: nurse.id,
              day: dayNum,
              message: `${nurse.name}: ${msg}`,
            },
            { ruleKey: "consecutive" }
          );
        }
      } else {
        currentStreak = 0;
      }
    }

    // Check transitions across boundary and within month
    for (let d = 1; d <= numDays; d++) {
      const curr = row[d - 1] ?? "O";
      const prevShift: ShiftCode =
        d === 1
          ? config.enforcePrevMonthCarryover
            ? nurse.prevMonthShifts[nurse.prevMonthShifts.length - 1] ?? "O"
            : "O"
          : row[d - 2] ?? "O";

      const prevBase = getBaseOdenShift(prevShift, customShiftDefs);
      const currBase = getBaseOdenShift(curr, customShiftDefs);
      if (prevBase === "O") continue;
      const rowPolicies = transMatrix[prevBase];
      if (!rowPolicies) continue;

      const cat: ConstraintMeta["category"] = d === 1 ? "carryover" : "transition";
      if (rowPolicies.O === "require" && currBase !== "O") {
        const msg = `${config.month}/${d}: ${SHIFT_LABELS[prevBase]}明け公休違反（${prevShift} → ${curr}、公休O必須）`;
        nurseViolations.push(msg);
        pushViolation(
          {
            id: `trans_${prevBase}Off_${nurse.id}_d${d}`,
            category: cat,
            nurseId: nurse.id,
            day: d,
            message: `${nurse.name}: ${msg}`,
          },
          { ruleKey: `trans_${prevBase}_O` }
        );
      }

      if (currBase !== "O" && rowPolicies[currBase] === "forbid") {
        const msg = `${config.month}/${d}: 禁止シフト遷移（${SHIFT_LABELS[prevBase]}${prevShift} → ${SHIFT_LABELS[currBase]}${curr}）`;
        nurseViolations.push(msg);
        pushViolation(
          {
            id: `trans_${prevBase}${currBase}_${nurse.id}_d${d}`,
            category: cat,
            nurseId: nurse.id,
            day: d,
            message: `${nurse.name}: ${msg}`,
          },
          { ruleKey: `trans_${prevBase}_${currBase}` }
        );
      }
    }

    const customWorkDays = customShiftDefs.reduce(
      (acc, cs) =>
        acc + (getBaseOdenShift(cs.code, customShiftDefs) !== "O" ? counts[cs.code] ?? 0 : 0),
      0
    );
    const customOffDays = customShiftDefs.reduce(
      (acc, cs) =>
        acc + (getBaseOdenShift(cs.code, customShiftDefs) === "O" ? counts[cs.code] ?? 0 : 0),
      0
    );
    const customNightShifts = customShiftDefs.reduce((acc, cs) => {
      const b = getBaseOdenShift(cs.code, customShiftDefs);
      return acc + (b === "E" || b === "N" ? counts[cs.code] ?? 0 : 0);
    }, 0);
    const totalWorkDays = counts.D + counts.E + counts.N + customWorkDays;
    const totalOffDays = (counts.O ?? 0) + customOffDays;
    const totalNightShifts = counts.E + counts.N + customNightShifts;
    counts.W = totalWorkDays;
    counts.EN = totalNightShifts;

    const effectiveMinOff = nurse.minMonthlyDaysOff ?? config.minMonthlyDaysOff;
    if (totalOffDays < effectiveMinOff) {
      const msg = `月間公休不足（${totalOffDays}日 / 最低${effectiveMinOff}日）`;
      nurseViolations.push(msg);
      pushViolation(
        {
          id: `off_min_${nurse.id}`,
          category: "monthly",
          nurseId: nurse.id,
          message: `${nurse.name}: ${msg}`,
        },
        { ruleKey: "monthlyDaysOff" }
      );
    }

    if (typeof nurse.maxMonthlyWorkDays === "number" && totalWorkDays > nurse.maxMonthlyWorkDays) {
      const msg = `月間勤務日数超過（${totalWorkDays}日 / 上限${nurse.maxMonthlyWorkDays}日）`;
      nurseViolations.push(msg);
      pushViolation(
        {
          id: `work_max_${nurse.id}`,
          category: "monthly",
          nurseId: nurse.id,
          message: `${nurse.name}: ${msg}`,
        },
        { ruleKey: "monthlyDaysOff" }
      );
    }

    const effectiveMinWork = nurse.minMonthlyWorkDays ?? config.minMonthlyWorkDays;
    if (effectiveMinWork > 0 && totalWorkDays < effectiveMinWork) {
      const msg = `月間勤務日数不足（${totalWorkDays}日 / 最小${effectiveMinWork}日）`;
      nurseViolations.push(msg);
      pushViolation(
        {
          id: `work_min_${nurse.id}`,
          category: "monthly",
          nurseId: nurse.id,
          message: `${nurse.name}: ${msg}`,
        },
        { ruleKey: "monthlyDaysOff" }
      );
    }

    const customMaxNightRule = customRules.find(
      (r) =>
        r.enabled &&
        r.kind === "nurse_max_night" &&
        r.nurseId === nurse.id &&
        typeof r.maxNight === "number"
    );
    const effectiveMaxNight =
      customMaxNightRule?.maxNight ??
      nurse.maxMonthlyNightShifts ??
      config.maxMonthlyNightShifts;
    if (totalNightShifts > effectiveMaxNight) {
      const msg = `月間夜勤回数超過（${totalNightShifts}回 / 上限${effectiveMaxNight}回）`;
      nurseViolations.push(msg);
      pushViolation(
        {
          id: `night_max_${nurse.id}`,
          category: "monthly",
          nurseId: nurse.id,
          message: `${nurse.name}: ${msg}`,
        },
        { ruleKey: "monthlyNightCap", customRule: customMaxNightRule }
      );
    }

    // 36協定（時間外労働の月間・年間累計チェック）
    const estMonthOvertimeHours = computeNurseMonthOvertimeHours(counts, customShiftDefs);
    const prev11Hours = nurse.yearly36Stats?.prev11MonthsOvertimeHours ?? 180;
    const projectedAnnualOvertimeHours =
      Math.round((prev11Hours + estMonthOvertimeHours) * 10) / 10;
    const remainingAnnual36Hours =
      Math.round((config.maxAnnualOvertimeHours - projectedAnnualOvertimeHours) * 10) / 10;
    const is36Warning =
      prev11Hours >= config.maxAnnualOvertimeHours - 50 ||
      projectedAnnualOvertimeHours >= config.maxAnnualOvertimeHours - 15;

    if (config.enforce36Agreement) {
      if (estMonthOvertimeHours > config.maxMonthlyOvertimeHours + 1e-4) {
        const msg = `36協定 月間時間外超過（当月${estMonthOvertimeHours}h > 上限${config.maxMonthlyOvertimeHours}h）`;
        nurseViolations.push(msg);
        pushViolation(
          {
            id: `labor36_month_${nurse.id}`,
            category: "labor_36",
            nurseId: nurse.id,
            message: `${nurse.name}: ${msg}`,
          },
          { ruleKey: "enforce36Agreement" }
        );
      }
      if (projectedAnnualOvertimeHours > config.maxAnnualOvertimeHours + 1e-4) {
        const msg = `36協定 年間時間外超過（12ヶ月累計${projectedAnnualOvertimeHours}h > 年間上限${config.maxAnnualOvertimeHours}h）`;
        nurseViolations.push(msg);
        pushViolation(
          {
            id: `labor36_annual_${nurse.id}`,
            category: "labor_36",
            nurseId: nurse.id,
            message: `${nurse.name}: ${msg}`,
          },
          { ruleKey: "enforce36Agreement" }
        );
      }
    }

    // Check active shift_count_quota rules for this nurse
    for (const rule of customRules) {
      if (!rule.enabled || rule.kind !== "shift_count_quota" || !rule.shift) continue;
      if (!isNurseTargetedByRule(nurse, rule, activeSkillDefs)) continue;

      const actualCount = row.filter((s) =>
        doesShiftMatchGroup(s, rule.shift!, customShiftDefs, state.shiftAliases)
      ).length;
      const prevCount = rule.includePrevMonth
        ? getNursePrevCompletedShiftCount(nurse, rule.shift, customShiftDefs)
        : 0;
      const totalCount = actualCount + prevCount;
      const meta = getShiftMeta(rule.shift, customShiftDefs, state.shiftAliases);
      if (typeof rule.minCount === "number" && totalCount < rule.minCount) {
        const msg = `${meta.label}の回数不足（累計${totalCount}回 / 必要${rule.minCount}回以上）`;
        nurseViolations.push(msg);
        pushViolation(
          {
            id: `quota_min_${rule.id}_${nurse.id}`,
            category: "custom",
            nurseId: nurse.id,
            message: `${nurse.name}: ${msg}`,
          },
          { customRule: rule }
        );
      }
      if (typeof rule.maxCount === "number" && totalCount > rule.maxCount) {
        const msg = `${meta.label}の回数超過（累計${totalCount}回 / 上限${rule.maxCount}回）`;
        nurseViolations.push(msg);
        pushViolation(
          {
            id: `quota_max_${rule.id}_${nurse.id}`,
            category: "custom",
            nurseId: nurse.id,
            message: `${nurse.name}: ${msg}`,
          },
          { customRule: rule }
        );
      }
    }

    // Check pin_shift, forbid_shift, shift_day_restriction, and shift_prerequisite rules
    for (const rule of customRules) {
      if (!rule.enabled) continue;
      if (
        rule.kind === "pin_shift" &&
        rule.nurseId === nurse.id &&
        typeof rule.day === "number" &&
        rule.day >= 1 &&
        rule.day <= numDays &&
        rule.shift
      ) {
        const s = row[rule.day - 1] ?? "O";
        if (!doesShiftMatchGroup(s, rule.shift, customShiftDefs, state.shiftAliases)) {
          const shiftMeta = getShiftMeta(rule.shift, customShiftDefs, state.shiftAliases);
          const msg = `${config.month}/${rule.day}: 固定指定（${shiftMeta.label}）違反（実際: ${s}）`;
          nurseViolations.push(msg);
          pushViolation(
            {
              id: `custom_pin_${rule.id}_${nurse.id}_d${rule.day}`,
              category: "custom",
              nurseId: nurse.id,
              day: rule.day,
              message: `${nurse.name}: ${msg}`,
            },
            { customRule: rule }
          );
        }
      } else if (
        rule.kind === "forbid_shift" &&
        rule.nurseId === nurse.id &&
        typeof rule.day === "number" &&
        rule.day >= 1 &&
        rule.day <= numDays &&
        rule.forbidShifts?.length
      ) {
        const s = row[rule.day - 1] ?? "O";
        if (
          rule.forbidShifts.some((fs) =>
            doesShiftMatchGroup(s, fs, customShiftDefs, state.shiftAliases)
          )
        ) {
          const msg = `${config.month}/${rule.day}: 禁止指定（${rule.forbidShifts.join("・")}）違反（実際: ${s}）`;
          nurseViolations.push(msg);
          pushViolation(
            {
              id: `custom_forbid_${rule.id}_${nurse.id}_d${rule.day}`,
              category: "custom",
              nurseId: nurse.id,
              day: rule.day,
              message: `${nurse.name}: ${msg}`,
            },
            { customRule: rule }
          );
        }
      } else if (
        rule.kind === "shift_day_restriction" &&
        rule.shift &&
        (rule.allowedDaysOfWeek?.length ||
          typeof rule.startDay === "number" ||
          typeof rule.endDay === "number")
      ) {
        const allowedSet = rule.allowedDaysOfWeek?.length ? new Set(rule.allowedDaysOfWeek) : null;
        const shiftMeta = getShiftMeta(rule.shift, customShiftDefs, state.shiftAliases);
        for (let d = 1; d <= numDays; d++) {
          const s = row[d - 1] ?? "O";
          if (doesShiftMatchGroup(s, rule.shift, customShiftDefs, state.shiftAliases)) {
            const dow = getDayOfWeek(config.year, config.month, d);
            const okDow = !allowedSet || allowedSet.has(dow);
            const okStart = typeof rule.startDay !== "number" || d >= rule.startDay;
            const okEnd = typeof rule.endDay !== "number" || d <= rule.endDay;
            if (!okDow || !okStart || !okEnd) {
              const msg = `${config.month}/${d}(${WEEKDAY_NAMES_JA[dow]}): ${rule.description} 違反（${shiftMeta.label}）`;
              nurseViolations.push(msg);
              pushViolation(
                {
                  id: `day_restrict_${rule.id}_${nurse.id}_d${d}`,
                  category: "custom",
                  nurseId: nurse.id,
                  day: d,
                  message: `${nurse.name}: ${msg}`,
                },
                { customRule: rule }
              );
            }
          }
        }
      } else if (
        rule.kind === "shift_prerequisite" &&
        rule.prereqShift &&
        typeof rule.prereqMinCount === "number" &&
        rule.restrictedShifts?.length
      ) {
        if (!isNurseTargetedByRule(nurse, rule, activeSkillDefs)) continue;

        let completedPrereq = rule.includePrevMonth
          ? getNursePrevCompletedShiftCount(nurse, rule.prereqShift, customShiftDefs)
          : 0;
        const prereqMeta = getShiftMeta(rule.prereqShift, customShiftDefs, state.shiftAliases);
        for (let d = 1; d <= numDays; d++) {
          const s = row[d - 1] ?? "O";
          if (
            rule.restrictedShifts.some((rs) =>
              doesShiftMatchGroup(s, rs, customShiftDefs, state.shiftAliases)
            ) &&
            completedPrereq < rule.prereqMinCount
          ) {
            const sMeta = getShiftMeta(s, customShiftDefs, state.shiftAliases);
            const msg = `${config.month}/${d}: ${prereqMeta.label}を${rule.prereqMinCount}回受ける前に${sMeta.label}が配置されています（前日まで累計${completedPrereq}回）`;
            nurseViolations.push(msg);
            pushViolation(
              {
                id: `prereq_${rule.id}_${nurse.id}_d${d}`,
                category: "custom",
                nurseId: nurse.id,
                day: d,
                message: `${nurse.name}: ${msg}`,
              },
              { customRule: rule }
            );
          }
          if (doesShiftMatchGroup(s, rule.prereqShift, customShiftDefs, state.shiftAliases)) {
            completedPrereq++;
          }
        }
      }
    }

    const nPrefs = preferences.filter((p) => p.nurseId === nurse.id);
    let nHardMet = 0;
    let nHardTotal = 0;
    let nSoftMet = 0;
    let nSoftTotal = 0;

    for (const p of nPrefs) {
      if (p.day < 1 || p.day > numDays) continue;
      const actual = row[p.day - 1] ?? "O";
      const met = doesShiftMatchGroup(actual, p.shift, customShiftDefs, state.shiftAliases);
      if (p.isHard) {
        nHardTotal++;
        hardTotal++;
        if (met) {
          nHardMet++;
          hardMet++;
        } else if (config.enforceHardRequests) {
          const msg = `${config.month}/${p.day}: 確定希望（${p.shift}）未達成`;
          nurseViolations.push(msg);
          pushViolation(
            {
              id: `hard_pref_${nurse.id}_d${p.day}`,
              category: "request",
              nurseId: nurse.id,
              day: p.day,
              message: `${nurse.name}: ${msg}`,
            },
            { ruleKey: "enforceHardRequests" }
          );
        }
      } else {
        nSoftTotal++;
        softTotal++;
        if (met) {
          nSoftMet++;
          softMet++;
        }
      }
    }

    nurseSummaries[nurse.id] = {
      nurseId: nurse.id,
      counts,
      totalWorkDays,
      totalNightShifts,
      maxConsecutiveWork,
      prevMonthTailStreak: getPrevMonthTailWorkStreak(nurse.prevMonthShifts),
      weekendDaysOff,
      hardRequestsMet: nHardMet,
      hardRequestsTotal: nHardTotal,
      softRequestsMet: nSoftMet,
      softRequestsTotal: nSoftTotal,
      estMonthOvertimeHours,
      projectedAnnualOvertimeHours,
      remainingAnnual36Hours,
      is36Warning,
      violations: nurseViolations,
    };
  }

  // 3. NG Pair & Preceptor Pair check across target shifts
  if (config.enforceNgPairs) {
    for (const rel of relations) {
      if (rel.type !== "ng_pair") continue;
      const nA = nurseById.get(rel.nurseA);
      const nB = nurseById.get(rel.nurseB);
      if (!nA || !nB) continue;
      const targetShifts = rel.shifts?.length ? rel.shifts : ["E", "N"];
      for (let d = 1; d <= numDays; d++) {
        const sA = schedule[nA.id]?.[d - 1] ?? "O";
        const sB = schedule[nB.id]?.[d - 1] ?? "O";
        for (const ts of targetShifts) {
          if (
            doesShiftMatchGroup(sA, ts, customShiftDefs, state.shiftAliases) &&
            doesShiftMatchGroup(sB, ts, customShiftDefs, state.shiftAliases)
          ) {
            pushViolation(
              {
                id: `ng_${nA.id}_${nB.id}_${ts}_d${d}`,
                category: "ng_pair",
                day: d,
                message: `${config.month}/${d} ${ts}シフト: 相性NGペア（${nA.name} × ${nB.name}）が同時配置されています`,
                isSoft: rel.isHard === false ? true : undefined,
              },
              { ruleKey: "enforceNgPairs" }
            );
          }
        }
      }
    }
  }

  for (const rule of customRules) {
    if (!rule.enabled || rule.kind !== "ng_pair_custom" || !rule.nurseId || !rule.nurseBId) continue;
    const nA = nurseById.get(rule.nurseId);
    const nB = nurseById.get(rule.nurseBId);
    if (!nA || !nB) continue;
    const targetShifts = rule.shifts?.length ? rule.shifts : ["E", "N"];
    for (let d = 1; d <= numDays; d++) {
      const sA = schedule[nA.id]?.[d - 1] ?? "O";
      const sB = schedule[nB.id]?.[d - 1] ?? "O";
      for (const ts of targetShifts) {
        if (
          doesShiftMatchGroup(sA, ts, customShiftDefs, state.shiftAliases) &&
          doesShiftMatchGroup(sB, ts, customShiftDefs, state.shiftAliases)
        ) {
          pushViolation(
            {
              id: `custom_ng_${rule.id}_${nA.id}_${nB.id}_${ts}_d${d}`,
              category: "ng_pair",
              day: d,
              message: `${config.month}/${d} ${ts}シフト: 相性NGペア（${nA.name} × ${nB.name}）が同時配置されています`,
            },
            { customRule: rule, ruleKey: "enforceNgPairs" }
          );
        }
      }
    }
  }

  for (const rel of relations) {
    if (rel.type !== "preceptor") continue;
    if (!config.enforcePreceptorPairs && rel.enabled === false) continue;
    const nA = nurseById.get(rel.nurseA);
    const nB = nurseById.get(rel.nurseB);
    if (!nA || !nB) continue;
    const targetShifts = rel.shifts?.length ? rel.shifts : ["E", "N"];
    for (let d = 1; d <= numDays; d++) {
      const sA = schedule[nA.id]?.[d - 1] ?? "O";
      const sB = schedule[nB.id]?.[d - 1] ?? "O";
      for (const ts of targetShifts) {
        if (
          doesShiftMatchGroup(sA, ts, customShiftDefs, state.shiftAliases) &&
          !doesShiftMatchGroup(sB, ts, customShiftDefs, state.shiftAliases)
        ) {
          pushViolation(
            {
              id: `prec_${nA.id}_${nB.id}_${ts}_d${d}`,
              category: "skill",
              day: d,
              message: `${config.month}/${d} ${ts}シフト: プリセプター同行違反（新人:${nA.name} が配置されていますが指導:${nB.name} が別シフトです）`,
              isSoft: rel.isHard === false ? true : undefined,
            },
            { ruleKey: "enforcePreceptorPairs" }
          );
        }
      }
    }
  }

  const hardViolations = violations.filter((v) => !v.isSoft);

  return {
    valid: hardViolations.length === 0,
    violations,
    dailySummaries,
    nurseSummaries,
    hardRequestSatisfactionRate: hardTotal > 0 ? Math.round((hardMet / hardTotal) * 100) : 100,
    softRequestSatisfactionRate: softTotal > 0 ? Math.round((softMet / softTotal) * 100) : 100,
    objectiveScore: 1000 + softMet * 15 - hardViolations.length * 50 - (violations.length - hardViolations.length) * 15,
  };
}

/**
 * Generates a readable TypeScript code preview showing how the current nurse scheduling model
 * is formulated, solved, verified, and diagnosed using only HiGHS via @ohtaman/washi.
 */
export function generateWashiCodePreview(state: NurseSchedulingState): string {
  const { config, nurses, relations, preferences, customRules } = state;
  const activeSkillDefs = state.skillDefs ?? createDefaultSkillDefs();
  const skillSummary = activeSkillDefs
    .filter((sd) => sd.minDay > 0 || sd.minEvening > 0 || sd.minNight > 0)
    .map((sd) => `${sd.code}(D>=${sd.minDay},E>=${sd.minEvening},N>=${sd.minNight})`)
    .join(", ");
  const ngCount = relations.filter((r) => r.type === "ng_pair").length;
  const hardCount = preferences.filter((p) => p.isHard).length;
  const softCount = preferences.filter((p) => !p.isHard).length;
  const activeCustom = customRules.filter((r) => r.enabled);

  return `import { Model, expr, sum, maximize, minimize } from "@ohtaman/washi";

// 1-Month 3-Shift Nurse Scheduling Model (${config.year}年${config.month}月: ${config.numDays}日間 × 看護師${nurses.length}名)
const m = new Model("NurseMonthlySchedule_3Shift", { solver: "highs" });

// Decision variables: D (日勤), E (準夜勤), N (深夜勤) in {0, 1} (0 across all three = O 公休)
// + Previous month tail (${PREV_MONTH_DAYS} days carryover) enforced on boundary transitions & streaks
// Active parameters:
//   Weekday D >= ${config.weekdayDayStaff}, Weekend D >= ${config.weekendDayStaff}, E >= ${config.eveningStaff}, N >= ${config.nightStaff}
//   Skill/Attr Min: ${skillSummary || "none"}
//   Max Consecutive Work <= ${config.maxConsecutiveWorkDays} days | Min Days Off >= ${config.minMonthlyDaysOff} days | Max Night <= ${config.maxMonthlyNightShifts}
//   NG Pairs: ${ngCount} pairs | Hard Requests: ${hardCount} | Soft Preferences: ${softCount} | Custom Rules: ${activeCustom.length}

// Pre-solve integrity & CPLEX LP export
m.validateIntegrity();
const lpText = m.toLpString();

// Solve MIP with HiGHS WebAssembly (Web Worker)
const status = await m.solve({ timeLimit: 2.5, relGap: 0.01 });
if (status === "Optimal" || m.hasPrimalSolution) {
  // Independent mathematical verification
  const report = m.validateSolution();
  console.log("Valid:", report.valid, "Max violation:", report.maxViolation);
} else if (status === "Infeasible") {
  // Diagnose conflicting rules using HiGHS Elastic Constraint Relaxation (minimize weighted slacks)
  const diag = await diagnoseNurseScheduleWithHiGHS(state);
  console.log("HiGHS Elastic Conflict Diagnosis:", diag.conflicts);
}`;
}

/**
 * Builds a compact Aggregate Monthly & Consecutive Window HiGHS Elastic Model (~90 integer variables)
 * so HiGHS can diagnose monthly capacity / consecutive-work / night-cap infeasibilities in < 15ms.
 */
function buildAggregateMonthlyHiGHSModel(
  state: NurseSchedulingState,
  elasticMode: ElasticWeightMode
): {
  model: Model;
  constraintMeta: Map<string, ConstraintMeta>;
  elasticSlacks: ElasticSlackEntry[];
} {
  const { config, nurses } = state;
  const numDays = config.numDays;
  const m = new Model("NurseAggregateCapacity_HiGHS", { solver: "highs" });
  const constraintMeta = new Map<string, ConstraintMeta>();
  const elasticSlacks: ElasticSlackEntry[] = [];

  const addTracked = (
    rawConstraint: Constraint | ReturnType<typeof expr>,
    meta: ConstraintMeta
  ) => {
    const c = rawConstraint as Constraint;
    constraintMeta.set(meta.name, meta);
    const s = m.continuous(`slk_${meta.name}`, { lb: 0 });
    const weight = getElasticPenaltyWeight(meta, elasticMode);
    elasticSlacks.push({ slackVar: s, meta, weight });
    if (c.sense === "<=") {
      m.constraint(expr`${c.lhs} - ${s} <= ${c.rhs}`, meta.name);
    } else if (c.sense === ">=") {
      m.constraint(expr`${c.lhs} + ${s} >= ${c.rhs}`, meta.name);
    } else {
      const sNeg = m.continuous(`slkn_${meta.name}`, { lb: 0 });
      elasticSlacks.push({ slackVar: sNeg, meta, weight });
      m.constraint(expr`${c.lhs} + ${s} - ${sNeg} == ${c.rhs}`, meta.name);
    }
  };

  let totalReqD = 0;
  let totalReqE = 0;
  let totalReqN = 0;
  for (let d = 1; d <= numDays; d++) {
    const req = getRequiredDailyCoverage(state, d);
    totalReqD += req.D;
    totalReqE += req.E;
    totalReqN += req.N;
  }

  const aggD: Record<string, Var> = {};
  const aggE: Record<string, Var> = {};
  const aggN: Record<string, Var> = {};

  for (const nurse of nurses) {
    const forbidD = Boolean(nurse.forbiddenShifts?.includes("D"));
    const forbidE = !nurse.nightOk || Boolean(nurse.forbiddenShifts?.includes("E"));
    const forbidN = !nurse.nightOk || Boolean(nurse.forbiddenShifts?.includes("N"));
    aggD[nurse.id] = m.continuous(`aggD_${nurse.id}`, {
      lb: 0,
      ub: forbidD ? 0 : numDays,
    });
    aggE[nurse.id] = m.continuous(`aggE_${nurse.id}`, {
      lb: 0,
      ub: forbidE ? 0 : numDays,
    });
    aggN[nurse.id] = m.continuous(`aggN_${nurse.id}`, {
      lb: 0,
      ub: forbidN ? 0 : numDays,
    });

    const effectiveMinOff = nurse.minMonthlyDaysOff ?? config.minMonthlyDaysOff;
    const maxWorkByOff = Math.max(0, numDays - effectiveMinOff);
    addTracked(expr`${aggD[nurse.id]} + ${aggE[nurse.id]} + ${aggN[nurse.id]} <= ${maxWorkDaysCap(maxWorkByOff)}`, {
      name: `monthly_off_min_${nurse.id}`,
      category: "monthly",
      labelJa: `月間最低公休数(${effectiveMinOff}日以上): ${nurse.name}(${nurse.id}) の月間勤務日数は最大${maxWorkByOff}日まで`,
      relatedNurseIds: [nurse.id],
      relaxSuggestion: `月間最低公休日数（現在:${effectiveMinOff}日）を減らすか、日別の必要人数を緩和してください。`,
    });

    if (typeof nurse.maxMonthlyWorkDays === "number") {
      const maxContractWork = Math.max(0, nurse.maxMonthlyWorkDays);
      addTracked(
        expr`${aggD[nurse.id]} + ${aggE[nurse.id]} + ${aggN[nurse.id]} <= ${maxContractWork}`,
        {
          name: `monthly_work_max_${nurse.id}`,
          category: "monthly",
          labelJa: `月間最大勤務日数(${maxContractWork}日以下): ${nurse.name}(${nurse.id})`,
          relatedNurseIds: [nurse.id],
          relaxSuggestion: `${nurse.name}さん個人の月間最大勤務日数（現在:${maxContractWork}日）を引き上げてください。`,
        }
      );
    }

    if (forbidD) {
      addTracked(expr`${aggD[nurse.id]} <= 0`, {
        name: `forbid_contract_D_${nurse.id}`,
        category: "custom",
        labelJa: `個別契約(夜勤専従・日勤免除): ${nurse.name}(${nurse.id}) は日勤不可`,
        relatedNurseIds: [nurse.id],
        relaxSuggestion: `${nurse.name}さん個人の月間最低勤務日数を夜勤上限以下に引き下げるか、個人の月間夜勤上限を引き上げてください。`,
      });
    }
    const effectiveMinWork = nurse.minMonthlyWorkDays ?? config.minMonthlyWorkDays;
    const pinnedOffDays = Array.from(
      new Set(
        state.customRules
          .filter(
            (r) =>
              r.enabled &&
              r.kind === "pin_shift" &&
              r.nurseId === nurse.id &&
              r.shift === "O" &&
              typeof r.day === "number"
          )
          .map((r) => r.day!)
      )
    ).sort((a, b) => a - b);
    if (pinnedOffDays.length > 0) {
      const maxWorkAfterPinnedOff = Math.max(0, numDays - pinnedOffDays.length);
      addTracked(
        expr`${aggD[nurse.id]} + ${aggE[nurse.id]} + ${aggN[nurse.id]} <= ${maxWorkAfterPinnedOff}`,
        {
          name: `custom_pin_off_cap_${nurse.id}`,
          category: "custom",
          labelJa: `${nurse.name}(${nurse.id}) の公休(O)固定 (${pinnedOffDays.length}日間) により当月勤務可能日数は最大${maxWorkAfterPinnedOff}日`,
          relatedNurseIds: [nurse.id],
          relaxSuggestion: `${nurse.name}さんの公休固定日数（${pinnedOffDays.length}日間）を減らすか、${nurse.name}さん個人の月間最低勤務日数（現在:${effectiveMinWork}日）を引き下げてください。`,
        }
      );
    }

    const pinnedWorkDays = Array.from(
      new Set(
        state.customRules
          .filter(
            (r) =>
              r.enabled &&
              r.kind === "pin_shift" &&
              r.nurseId === nurse.id &&
              Boolean(r.shift && r.shift !== "O") &&
              typeof r.day === "number"
          )
          .map((r) => r.day!)
      )
    ).sort((a, b) => a - b);
    if (pinnedWorkDays.length > 0) {
      addTracked(
        expr`${aggD[nurse.id]} + ${aggE[nurse.id]} + ${aggN[nurse.id]} >= ${pinnedWorkDays.length}`,
        {
          name: `custom_pin_work_min_${nurse.id}`,
          category: "custom",
          labelJa: `${nurse.name}(${nurse.id}) の出勤固定 (${pinnedWorkDays.length}日間) により当月勤務日数は最低${pinnedWorkDays.length}日以上必要`,
          relatedNurseIds: [nurse.id],
          relaxSuggestion: `${nurse.name}さんの出勤固定日数（${pinnedWorkDays.length}日間）を減らすか、月間最大勤務日数・公休条件を見直してください。`,
        }
      );
    }

    if (effectiveMinWork > 0) {
      addTracked(
        expr`${aggD[nurse.id]} + ${aggE[nurse.id]} + ${aggN[nurse.id]} >= ${effectiveMinWork}`,
        {
          name: `monthly_work_min_${nurse.id}`,
          category: "monthly",
          labelJa: `月間最低勤務日数(${effectiveMinWork}日以上): ${nurse.name}(${nurse.id})`,
          relatedNurseIds: [nurse.id],
          relaxSuggestion: `${nurse.name}さん個人の月間最低勤務日数（現在:${effectiveMinWork}日）を引き下げるか、公休固定の日数を減らしてください。`,
        }
      );
    }

    const effectiveMaxConsec = nurse.maxConsecutiveWorkDays ?? config.maxConsecutiveWorkDays;
    const tailStreak = config.enforcePrevMonthCarryover
      ? getPrevMonthTailWorkStreak(nurse.prevMonthShifts)
      : 0;
    const minOffByConsec = Math.floor(
      (numDays + Math.min(tailStreak, effectiveMaxConsec)) / (effectiveMaxConsec + 1)
    );
    const maxWorkByConsec = Math.max(0, numDays - minOffByConsec);
    addTracked(
      expr`${aggD[nurse.id]} + ${aggE[nurse.id]} + ${aggN[nurse.id]} <= ${maxWorkByConsec}`,
      {
        name: `consec_monthly_cap_${nurse.id}`,
        category: "consecutive",
        labelJa: `最大${effectiveMaxConsec}連勤制限による月間稼働上限: ${nurse.name}(${nurse.id}) は最低${minOffByConsec}日の公休が必要（最大${maxWorkByConsec}日勤務）`,
        relatedNurseIds: [nurse.id],
        relaxSuggestion: `最大連続勤務日数（現在:${effectiveMaxConsec}連勤）を緩和してください。`,
      }
    );

    if (nurse.nightOk) {
      const customMaxNightRule = state.customRules.find(
        (r) =>
          r.enabled &&
          r.kind === "nurse_max_night" &&
          r.nurseId === nurse.id &&
          typeof r.maxNight === "number"
      );
      const effectiveMaxNight =
        customMaxNightRule?.maxNight ??
        nurse.maxMonthlyNightShifts ??
        config.maxMonthlyNightShifts;
      addTracked(
        expr`${aggE[nurse.id]} + ${aggN[nurse.id]} <= ${effectiveMaxNight}`,
        {
          name: `night_max_${nurse.id}`,
          category: "monthly",
          labelJa: `月間夜勤上限(${effectiveMaxNight}回以下): ${nurse.name}(${nurse.id}) の準夜＋深夜合計 <= ${effectiveMaxNight}回`,
          relatedNurseIds: [nurse.id],
          relaxSuggestion: `月間夜勤上限回数（現在:${effectiveMaxNight}回）を1〜2回引き上げてください。`,
        }
      );
    }

    if (config.enforce36Agreement) {
      const prev11Hours = nurse.yearly36Stats?.prev11MonthsOvertimeHours ?? 180;
      const remainingAnnualHours = Math.max(0, config.maxAnnualOvertimeHours - prev11Hours);
      const effectiveOvertimeCap = Math.min(config.maxMonthlyOvertimeHours, remainingAnnualHours);
      const aggExcess = m.continuous(`aggEx_${nurse.id}`, { lb: 0 });
      m.constraint(
        expr`${aggD[nurse.id]} + ${aggE[nurse.id]} + ${aggN[nurse.id]} - ${aggExcess} <= 20`,
        `aggEx_def_${nurse.id}`
      );
      addTracked(
        expr`1.0 * ${aggD[nurse.id]} + 1.5 * ${aggE[nurse.id]} + 2.0 * ${aggN[nurse.id]} + 8.0 * ${aggExcess} <= ${effectiveOvertimeCap}`,
        {
          name: `labor36_overtime_${nurse.id}`,
          category: "labor_36",
          labelJa: `36協定 時間外労働上限: ${nurse.name}(${nurse.id}) の当月時間外 <= ${effectiveOvertimeCap}h（過去11ヶ月累計:${prev11Hours}h / 年間上限:${config.maxAnnualOvertimeHours}h・月上限:${config.maxMonthlyOvertimeHours}h）`,
          relatedNurseIds: [nurse.id],
          relaxSuggestion: `36協定の年間時間外上限（現在:${config.maxAnnualOvertimeHours}h）または月間上限（現在:${config.maxMonthlyOvertimeHours}h）を調整してください。`,
        }
      );
    }
  }

  addTracked(expr`${sum(nurses.map((n) => aggD[n.id]))} >= ${totalReqD}`, {
    name: "monthly_total_cov_D",
    category: "coverage",
    labelJa: `月間の日勤(D)総必要枠: 1ヶ月計 ${totalReqD}シフト以上が必要（平日${config.weekdayDayStaff}名・土日${config.weekendDayStaff}名）`,
    relaxSuggestion: "平日または土日の日勤必要人数を減らしてください。",
  });

  addTracked(expr`${sum(nurses.map((n) => aggE[n.id]))} >= ${totalReqE}`, {
    name: "monthly_total_cov_E",
    category: "coverage",
    labelJa: `月間の準夜勤(E)総必要枠: 1ヶ月計 ${totalReqE}シフト以上が必要（毎日${config.eveningStaff}名）`,
    relaxSuggestion: "準夜勤の必要人数を減らすか、月間夜勤上限を引き上げてください。",
  });

  addTracked(expr`${sum(nurses.map((n) => aggN[n.id]))} >= ${totalReqN}`, {
    name: "monthly_total_cov_N",
    category: "coverage",
    labelJa: `月間の深夜勤(N)総必要枠: 1ヶ月計 ${totalReqN}シフト以上が必要（毎日${config.nightStaff}名）`,
    relaxSuggestion: "深夜勤の必要人数を減らすか、月間夜勤上限を引き上げてください。",
  });

  if (config.enforceSkillCoverage) {
    const activeSkillDefs = state.skillDefs ?? createDefaultSkillDefs();
    for (const sd of activeSkillDefs) {
      if (typeof sd.maxEvening !== "number" && typeof sd.maxNight !== "number") continue;
      const nonMatched = nurses.filter(
        (n) => !doesNurseSatisfySkill(n, sd.code, activeSkillDefs) && n.nightOk
      );
      const reqNonMatchedE =
        typeof sd.maxEvening === "number"
          ? numDays * Math.max(0, config.eveningStaff - sd.maxEvening)
          : 0;
      const reqNonMatchedN =
        typeof sd.maxNight === "number"
          ? numDays * Math.max(0, config.nightStaff - sd.maxNight)
          : 0;
      if (nonMatched.length > 0 && (reqNonMatchedE > 0 || reqNonMatchedN > 0)) {
        addTracked(
          expr`${sum(nonMatched.map((n) => aggE[n.id]))} + ${sum(nonMatched.map((n) => aggN[n.id]))} >= ${
            reqNonMatchedE + reqNonMatchedN
          }`,
          {
            name: `monthly_non_${sd.code}_night_cov`,
            category: "skill",
            labelJa: `夜勤の「${sd.label}」上限（準夜${sd.maxEvening ?? "制限なし"}名・深夜${sd.maxNight ?? "制限なし"}名まで）により、他スタッフ(${nonMatched.length}名)で月間計${
              reqNonMatchedE + reqNonMatchedN
            }枠以上の夜勤カバーが必要`,
            relaxSuggestion: `月間夜勤上限（現在:${config.maxMonthlyNightShifts}回）を引き上げるか、「${sd.label}」の夜勤上限を緩和してください。`,
          }
        );
      }
    }
  }

  m.objective(
    minimize(sum(elasticSlacks, (entry) => expr`${entry.weight} * ${entry.slackVar}`))
  );

  return { model: m, constraintMeta, elasticSlacks };
}

function maxWorkDaysCap(v: number): number {
  return Math.max(0, Math.round(v));
}

function collectViolatedSlacks(
  elasticSlacks: readonly ElasticSlackEntry[],
  targetMap: Map<string, ConstraintMeta>
): void {
  for (const entry of elasticSlacks) {
    const val = entry.slackVar.value ?? 0;
    if (val > 1e-4) {
      targetMap.set(entry.meta.name, entry.meta);
    }
  }
}

/**
 * Diagnoses conflicting constraints using ONLY HiGHS (`@ohtaman/washi`) via two-pass
 * Elastic Constraint Relaxation (Slack Penalty Minimization).
 *
 * Requires zero Z3 / `SharedArrayBuffer` / COOP-COEP headers, runs in < 30ms, and works
 * out-of-the-box on GitHub Pages.
 */
export async function diagnoseNurseScheduleWithHiGHS(
  state: NurseSchedulingState,
  options?: { assumeInfeasibleFromMip?: boolean; signal?: AbortSignal }
): Promise<{ status: string; conflicts: ConstraintMeta[]; rawNames: string[] }> {
  // Determine candidate active days (boundary days + days with custom rules + adjacent days + days with multiple hard requests)
  const candidateDays = new Set<number>([1, 2, 3]);
  for (const r of state.customRules) {
    if (r.enabled && r.day) {
      candidateDays.add(r.day);
      if (r.day > 1) candidateDays.add(r.day - 1);
      if (r.day < state.config.numDays) candidateDays.add(r.day + 1);
    }
  }
  const hardCountByDay = new Map<number, number>();
  for (const p of state.preferences) {
    if (p.isHard) {
      hardCountByDay.set(p.day, (hardCountByDay.get(p.day) ?? 0) + 1);
    }
  }
  for (const [d, cnt] of hardCountByDay.entries()) {
    if (cnt >= 2) candidateDays.add(d);
  }

  // Stage 1: Fast HiGHS Elastic check on Aggregate Monthly & Consecutive Capacity (~90 continuous vars, < 10ms)
  const pass1Agg = buildAggregateMonthlyHiGHSModel(state, "prefer_structural");
  await pass1Agg.model.solve({ timeLimit: 1.0, signal: options?.signal });
  if ((pass1Agg.model.objectiveValue ?? 0) > 1e-4) {
    const found = new Map<string, ConstraintMeta>();
    collectViolatedSlacks(pass1Agg.elasticSlacks, found);

    const pass2Agg = buildAggregateMonthlyHiGHSModel(state, "prefer_user");
    await pass2Agg.model.solve({ timeLimit: 1.0, signal: options?.signal });
    collectViolatedSlacks(pass2Agg.elasticSlacks, found);

    const conflicts = Array.from(found.values());
    if (conflicts.length > 0) {
      return {
        status: "Unsat",
        conflicts,
        rawNames: conflicts.map((c) => c.name),
      };
    }
  }

  // Stage 2: Fast HiGHS Elastic check on the focused daily/boundary constraint subset
  const pass1Daily = buildNurseWashiModel(state, {
    solver: "highs",
    onlyDays: candidateDays,
    elasticWeightMode: "prefer_structural",
  });
  await pass1Daily.model.solve({ timeLimit: 1.0, signal: options?.signal });
  if ((pass1Daily.model.objectiveValue ?? 0) > 1e-4) {
    const found = new Map<string, ConstraintMeta>();
    collectViolatedSlacks(pass1Daily.elasticSlacks, found);

    // Run Pass 2 ("prefer_user") to also capture the structural/carryover/skill/coverage rules that clashed with the user rules
    const pass2Daily = buildNurseWashiModel(state, {
      solver: "highs",
      onlyDays: candidateDays,
      elasticWeightMode: "prefer_user",
    });
    await pass2Daily.model.solve({ timeLimit: 1.0, signal: options?.signal });
    collectViolatedSlacks(pass2Daily.elasticSlacks, found);

    const conflicts = Array.from(found.values());
    if (conflicts.length > 0) {
      return {
        status: "Unsat",
        conflicts,
        rawNames: conflicts.map((c) => c.name),
      };
    }
  }

  // If MIP already proved the full 30-day model is Infeasible due to multi-week transition/consecutive coupling:
  if (options?.assumeInfeasibleFromMip) {
    const c = state.config;
    const synthConflicts: ConstraintMeta[] = [
      {
        name: "coupled_consec_and_transitions",
        category: "consecutive",
        labelJa: `最大${c.maxConsecutiveWorkDays}連勤制限 × 3交代シフト遷移禁止（準夜・深夜明けのインターバル公休）× 月間公休${c.minMonthlyDaysOff}日以上の組み合わせによる人員不足`,
        relaxSuggestion: `最大連続勤務日数（現在:${c.maxConsecutiveWorkDays}日）を1日増やすか、月間夜勤上限（現在:${c.maxMonthlyNightShifts}回）または日勤必要人数を調整してください。`,
      },
    ];
    for (const rule of state.customRules.filter((r) => r.enabled)) {
      synthConflicts.push({
        name: `custom_${rule.id}`,
        category: "custom",
        labelJa: `追加ルール: ${rule.description}`,
      });
    }
    return {
      status: "Unsat",
      conflicts: synthConflicts,
      rawNames: synthConflicts.map((x) => x.name),
    };
  }

  return {
    status: "Sat",
    conflicts: [],
    rawNames: [],
  };
}

/** Backward-compatible alias for diagnoseNurseScheduleWithHiGHS */
export const diagnoseNurseScheduleWithZ3 = diagnoseNurseScheduleWithHiGHS;

/**
 * Computes a cell-by-cell diff summary between a previous schedule and a newly solved schedule.
 */
export function computeScheduleDiff(
  state: NurseSchedulingState,
  prevSchedule: MonthlyScheduleMap | null | undefined,
  nextSchedule: MonthlyScheduleMap | null | undefined
): ScheduleDiffSummary | null {
  if (!prevSchedule || !nextSchedule) return null;
  const changes: ScheduleCellChange[] = [];
  const affectedNurses = new Set<string>();
  let totalCells = 0;

  for (const nurse of state.nurses) {
    const prevRow = prevSchedule[nurse.id];
    const nextRow = nextSchedule[nurse.id];
    if (!prevRow || !nextRow) continue;
    for (let idx = 0; idx < state.config.numDays; idx++) {
      totalCells++;
      const prevShift = prevRow[idx] ?? "O";
      const nextShift = nextRow[idx] ?? "O";
      if (prevShift !== nextShift) {
        affectedNurses.add(nurse.id);
        changes.push({
          nurseId: nurse.id,
          nurseName: nurse.name,
          day: idx + 1,
          prevShift,
          nextShift,
        });
      }
    }
  }

  if (totalCells === 0) return null;
  const changedCellsCount = changes.length;
  const unchangedCellsCount = totalCells - changedCellsCount;
  const retentionRatePct = Math.round((unchangedCellsCount / totalCells) * 1000) / 10;

  return {
    totalCells,
    changedCellsCount,
    unchangedCellsCount,
    retentionRatePct,
    affectedNursesCount: affectedNurses.size,
    changes,
  };
}

/**
 * Solves the 1-month nurse scheduling problem using WaSHI (HiGHS), verifies with `validateSolution()`,
 * and automatically diagnoses conflicts using HiGHS Elastic Constraint Relaxation if `Infeasible`.
 */
export async function solveNurseScheduleWithWashi(
  state: NurseSchedulingState,
  options?: {
    signal?: AbortSignal;
    timeLimit?: number;
    referenceSchedule?: MonthlyScheduleMap | null;
  }
): Promise<WashiSolveOutcome> {
  const t0 = performance.now();
  const useRefSchedule =
    state.config.preserveCurrentSchedule !== false && Boolean(options?.referenceSchedule);
  const { model, vD, vE, vN, vCustom, constraintMeta } = buildNurseWashiModel(state, {
    solver: "highs",
    referenceSchedule: useRefSchedule ? options?.referenceSchedule : null,
  });
  const customShiftDefs = state.customShiftDefs ?? [];

  model.validateIntegrity();
  const lpFull = model.toLpString();
  const lpLines = lpFull.split("\n");
  const lpPreview =
    lpLines.length > 140
      ? lpLines.slice(0, 120).join("\n") +
        `\n... (${lpLines.length - 140} lines omitted) ...\n` +
        lpLines.slice(-20).join("\n")
      : lpFull;

  const buildTimeMs = Math.max(1, Math.round(performance.now() - t0));
  const numVariables = model.variables.length;
  const numConstraints = model.constraints.length;
  const modelCodePreview = generateWashiCodePreview(state);

  const tSolve0 = performance.now();
  let status: string;
  try {
    status = await model.solve({
      timeLimit: options?.timeLimit ?? 4.0,
      signal: options?.signal,
    });
  } catch (err: any) {
    return {
      status: "Error",
      solverUsed: "HiGHS (WASM)",
      buildTimeMs,
      solveTimeMs: Math.round(performance.now() - tSolve0),
      numVariables,
      numConstraints,
      objectiveValue: null,
      validatedByWashi: false,
      maxViolation: 0,
      schedule: null,
      evaluation: null,
      lpPreview,
      modelCodePreview,
      conflicts: [],
      rawConflictNames: [],
      errorMessage: err?.message ?? String(err),
    };
  }
  const solveTimeMs = Math.max(1, Math.round(performance.now() - tSolve0));

  if (status === "Optimal" || model.hasPrimalSolution) {
    const schedule: MonthlyScheduleMap = {};
    for (const nurse of state.nurses) {
      const row: ShiftCode[] = [];
      for (let idx = 0; idx < state.config.numDays; idx++) {
        const isD = Math.round(vD[nurse.id][idx]?.value ?? 0) === 1;
        const isE = Math.round(vE[nurse.id][idx].value ?? 0) === 1;
        const isN = Math.round(vN[nurse.id][idx].value ?? 0) === 1;
        let assigned: ShiftCode = isD ? "D" : isE ? "E" : isN ? "N" : "O";
        if (assigned === "O" && customShiftDefs.length > 0) {
          for (const cs of customShiftDefs) {
            if (Math.round(vCustom[cs.code]?.[nurse.id]?.[idx]?.value ?? 0) === 1) {
              assigned = cs.code;
              break;
            }
          }
        }
        row.push(assigned);
      }
      schedule[nurse.id] = row;
    }

    // Mandatory WaSHI self-verification
    const report = model.validateSolution();
    const evaluation = evaluateNurseSchedule(state, schedule);
    const diffFromPrevious = options?.referenceSchedule
      ? computeScheduleDiff(state, options.referenceSchedule, schedule)
      : null;

    return {
      status: status === "Optimal" ? "Optimal" : "Feasible",
      solverUsed: "HiGHS (WASM)",
      buildTimeMs,
      solveTimeMs,
      numVariables,
      numConstraints,
      objectiveValue:
        model.objectiveValue !== null && model.objectiveValue !== undefined
          ? Math.round(model.objectiveValue * 10) / 10
          : null,
      validatedByWashi: report.valid,
      maxViolation: report.maxViolation,
      schedule,
      evaluation,
      diffFromPrevious,
      lpPreview,
      modelCodePreview,
      conflicts: [],
      rawConflictNames: [],
    };
  }

  // If Infeasible, diagnose conflicts with HiGHS Elastic Relaxation
  if (status === "Infeasible") {
    try {
      const highsDiag = await diagnoseNurseScheduleWithHiGHS(state, {
        assumeInfeasibleFromMip: true,
        signal: options?.signal,
      });
      return {
        status: "Infeasible",
        solverUsed: "HiGHS (WASM)",
        buildTimeMs,
        solveTimeMs: Math.max(1, Math.round(performance.now() - tSolve0)),
        numVariables,
        numConstraints,
        objectiveValue: null,
        validatedByWashi: false,
        maxViolation: 0,
        schedule: null,
        evaluation: null,
        lpPreview,
        modelCodePreview,
        conflicts: highsDiag.conflicts,
        rawConflictNames: highsDiag.rawNames,
      };
    } catch (diagErr: any) {
      return {
        status: "Infeasible",
        solverUsed: "HiGHS (WASM)",
        buildTimeMs,
        solveTimeMs,
        numVariables,
        numConstraints,
        objectiveValue: null,
        validatedByWashi: false,
        maxViolation: 0,
        schedule: null,
        evaluation: null,
        lpPreview,
        modelCodePreview,
        conflicts: Array.from(constraintMeta.values()).slice(0, 5),
        rawConflictNames: [],
        errorMessage: diagErr?.message,
      };
    }
  }

  return {
    status: "Error",
    solverUsed: "HiGHS (WASM)",
    buildTimeMs,
    solveTimeMs,
    numVariables,
    numConstraints,
    objectiveValue: null,
    validatedByWashi: false,
    maxViolation: 0,
    schedule: null,
    evaluation: null,
    lpPreview,
    modelCodePreview,
    conflicts: [],
    rawConflictNames: [],
    errorMessage: `Solver returned status: ${status}`,
  };
}

