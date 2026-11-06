import {
  Model,
  expr,
  sum,
  minimize,
  type Var,
  type LinExpr,
} from "../../../../src/index.js";
import {
  DAYS_OF_WEEK,
  DAY_FULL_LABELS_JA,
  DAY_LABELS_JA,
  EQUIPMENT_LABELS,
  PERIODS,
  ROOM_TYPE_LABELS,
  STUDENT_COHORTS,
  formatSlotEn,
  formatSlotJa,
  type AssignedSession,
  type CohortId,
  type CohortWeeklySummary,
  type ConstraintMeta,
  type CourseProfile,
  type ProfessorProfile,
  type ProfessorWeeklySummary,
  type RoomProfile,
  type TimetableCellDiff,
  type TimetableDay,
  type TimetableDiffReason,
  type TimetableDiffSummary,
  type TimetableEvaluationReport,
  type TimetablePeriod,
  type TimetableState,
  type TimetableViolationItem,
  type WashiTimetableSolveOutcome,
  type WeeklyTimetableSolution,
} from "./types.js";

const DAY_FULL_LABELS_EN: Record<TimetableDay, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
};

export type ElasticWeightMode = "prefer_structural" | "prefer_user";

export interface ElasticSlackEntry {
  slackVar: Var;
  meta: ConstraintMeta;
  weight: number;
}

export interface BuiltTimetableWashiModel {
  model: Model;
  /** x[courseId][day][period][roomId] -> Binary Var */
  vAssign: Record<string, Record<TimetableDay, Record<TimetablePeriod, Record<string, Var>>>>;
  /** u[courseId][day][period] -> Binary helper expression or sum over rooms */
  slotVarsByCourse: (courseId: string, day: TimetableDay, period: TimetablePeriod) => Var[];
  constraintMeta: Map<string, ConstraintMeta>;
  elasticSlacks: ElasticSlackEntry[];
}

function getElasticPenaltyWeight(meta: ConstraintMeta, mode: ElasticWeightMode): number {
  if (mode === "prefer_structural") {
    switch (meta.category) {
      case "custom":
        return 1;
      case "workload":
        return 4;
      case "prof_avail":
        return 8;
      case "capacity_equip":
        return 15;
      case "cohort_conflict":
      case "prof_conflict":
      case "room_conflict":
        return 25;
      case "assignment":
      default:
        return 60;
    }
  } else {
    switch (meta.category) {
      case "workload":
        return 1;
      case "prof_avail":
        return 2;
      case "capacity_equip":
        return 3;
      case "cohort_conflict":
      case "prof_conflict":
      case "room_conflict":
        return 5;
      case "assignment":
        return 20;
      case "custom":
      default:
        return 80;
    }
  }
}

export function isRoomCompatibleWithCourse(
  room: RoomProfile,
  course: CourseProfile,
  config: { enforceRoomCapacity: boolean; enforceRoomEquipment: boolean }
): { compatible: boolean; reasonJa?: string } {
  if (config.enforceRoomCapacity && room.capacity < course.enrollment) {
    return {
      compatible: false,
      reasonJa: `定員不足(${room.shortName}:定員${room.capacity}名 < 履修${course.enrollment}名)`,
    };
  }
  if (config.enforceRoomEquipment) {
    if (course.requiredRoomType && room.roomType !== course.requiredRoomType) {
      return {
        compatible: false,
        reasonJa: `Room type mismatch (${ROOM_TYPE_LABELS[course.requiredRoomType]} required)`,
      };
    }
    for (const eq of course.requiredEquipment) {
      if (!room.equipment.includes(eq)) {
        return {
          compatible: false,
          reasonJa: `Equipment missing (${EQUIPMENT_LABELS[eq]} required)`,
        };
      }
    }
  }
  return { compatible: true };
}

/**
 * Builds the algebraic WaSHI Model (MILP with HiGHS) for the University Course Timetabling Problem (UCTP).
 */
export function buildTimetableWashiModel(
  state: TimetableState,
  options?: {
    elasticWeightMode?: ElasticWeightMode;
    referenceTimetable?: WeeklyTimetableSolution | null;
  }
): BuiltTimetableWashiModel {
  const { config, rooms, professors, courses, customRules } = state;
  const elasticMode = options?.elasticWeightMode;

  const m = new Model("UniversityCourseTimetabling_UCTP", {
    solver: "highs",
  });

  const vAssign: Record<
    string,
    Record<TimetableDay, Record<TimetablePeriod, Record<string, Var>>>
  > = {};

  for (const c of courses) {
    vAssign[c.id] = {} as Record<TimetableDay, Record<TimetablePeriod, Record<string, Var>>>;
    for (const d of DAYS_OF_WEEK) {
      vAssign[c.id][d] = {} as Record<TimetablePeriod, Record<string, Var>>;
      for (const p of PERIODS) {
        vAssign[c.id][d][p] = {};
        for (const r of rooms) {
          vAssign[c.id][d][p][r.id] = m.binary(`x_${c.id}_${d}_P${p}_${r.id}`);
        }
      }
    }
  }

  const slotVarsByCourse = (
    courseId: string,
    day: TimetableDay,
    period: TimetablePeriod
  ): Var[] => {
    const byRoom = vAssign[courseId]?.[day]?.[period];
    if (!byRoom) return [];
    return rooms.map((r) => byRoom[r.id]);
  };

  const constraintMeta = new Map<string, ConstraintMeta>();
  const elasticSlacks: ElasticSlackEntry[] = [];
  const softPenaltyTerms: LinExpr[] = [];

  const registerConstraint = (
    lhsExpr: LinExpr,
    op: "==" | "<=" | ">=",
    rhsVal: number,
    meta: ConstraintMeta
  ) => {
    constraintMeta.set(meta.name, meta);
    if (!elasticMode) {
      if (op === "==") {
        m.constraint(expr`${lhsExpr} == ${rhsVal}`, meta.name);
      } else if (op === "<=") {
        m.constraint(expr`${lhsExpr} <= ${rhsVal}`, meta.name);
      } else {
        m.constraint(expr`${lhsExpr} >= ${rhsVal}`, meta.name);
      }
      return;
    }

    const weight = getElasticPenaltyWeight(meta, elasticMode);
    if (op === "<=") {
      const sPos = m.continuous(`slk_${meta.name}`, { lb: 0 });
      m.constraint(expr`${lhsExpr} - ${sPos} <= ${rhsVal}`, meta.name);
      elasticSlacks.push({ slackVar: sPos, meta, weight });
    } else if (op === ">=") {
      const sNeg = m.continuous(`slk_${meta.name}`, { lb: 0 });
      m.constraint(expr`${lhsExpr} + ${sNeg} >= ${rhsVal}`, meta.name);
      elasticSlacks.push({ slackVar: sNeg, meta, weight });
    } else {
      const sPos = m.continuous(`slkP_${meta.name}`, { lb: 0 });
      const sNeg = m.continuous(`slkN_${meta.name}`, { lb: 0 });
      m.constraint(expr`${lhsExpr} - ${sPos} + ${sNeg} == ${rhsVal}`, meta.name);
      elasticSlacks.push({ slackVar: sPos, meta, weight });
      elasticSlacks.push({ slackVar: sNeg, meta, weight });
    }
  };

  const registerSoftOrHard = (
    lhsExpr: LinExpr,
    op: "==" | "<=" | ">=",
    rhsVal: number,
    meta: ConstraintMeta,
    isHard: boolean,
    softWeight = 60
  ) => {
    if (isHard) {
      registerConstraint(lhsExpr, op, rhsVal, meta);
      return;
    }
    if (elasticMode) return;
    if (op === "<=") {
      const s = m.continuous(`soft_${meta.name}`, { lb: 0 });
      m.constraint(expr`${lhsExpr} - ${s} <= ${rhsVal}`, meta.name);
      softPenaltyTerms.push(s.mul(softWeight));
    } else if (op === ">=") {
      const s = m.continuous(`soft_${meta.name}`, { lb: 0 });
      m.constraint(expr`${lhsExpr} + ${s} >= ${rhsVal}`, meta.name);
      softPenaltyTerms.push(s.mul(softWeight));
    } else {
      const sP = m.continuous(`softP_${meta.name}`, { lb: 0 });
      const sN = m.continuous(`softN_${meta.name}`, { lb: 0 });
      m.constraint(expr`${lhsExpr} - ${sP} + ${sN} == ${rhsVal}`, meta.name);
      softPenaltyTerms.push(sP.mul(softWeight).add(sN.mul(softWeight)));
    }
  };

  const profMap = new Map<string, ProfessorProfile>(professors.map((p) => [p.id, p]));
  const courseMap = new Map<string, CourseProfile>(courses.map((c) => [c.id, c]));
  const roomMap = new Map<string, RoomProfile>(rooms.map((r) => [r.id, r]));

  // 1. Weekly Required Sessions per Course & At Most 1 Room per Slot
  for (const c of courses) {
    const allCourseVars: Var[] = [];
    for (const d of DAYS_OF_WEEK) {
      for (const p of PERIODS) {
        const slotVars = slotVarsByCourse(c.id, d, p);
        allCourseVars.push(...slotVars);
        // At most 1 room in a single (day, period) for a course
        m.constraint(expr`${sum(slotVars)} <= 1`, `single_room_${c.id}_${d}_P${p}`);
      }
    }

    registerConstraint(sum(allCourseVars), "==", c.sessionsPerWeek, {
      name: `course_sessions_${c.id}`,
      category: "assignment",
      labelJa: `Weekly sessions quota: "${c.title}" (${c.id}) requires ${c.sessionsPerWeek} session(s) per week`,
      relatedCourseIds: [c.id],
      relaxSuggestion: `Review pinned/forbidden slots, available rooms, or faculty availability (${profMap.get(c.professorId)?.name ?? c.professorId}) for "${c.title}".`,
    });
  }

  // 2. Room Capacity & Equipment Compatibility
  for (const c of courses) {
    const incompatibleRooms: RoomProfile[] = [];
    for (const r of rooms) {
      const check = isRoomCompatibleWithCourse(r, c, config);
      if (!check.compatible) {
        incompatibleRooms.push(r);
      }
    }
    if (incompatibleRooms.length > 0) {
      const incompatVars: Var[] = [];
      for (const d of DAYS_OF_WEEK) {
        for (const p of PERIODS) {
          for (const r of incompatibleRooms) {
            incompatVars.push(vAssign[c.id][d][p][r.id]);
          }
        }
      }
      const compatNames = rooms
        .filter((r) => !incompatibleRooms.some((ir) => ir.id === r.id))
        .map((r) => `${r.shortName}(定員${r.capacity})`)
        .join(", ");

      registerConstraint(sum(incompatVars), "<=", 0, {
        name: `room_compat_${c.id}`,
        category: "capacity_equip",
        labelJa: `Capacity & equipment match: "${c.title}" (${c.id}, ${c.enrollment} students) must be assigned to an eligible room (${compatNames || "None"})`,
        relatedCourseIds: [c.id],
        relaxSuggestion: `Review room assignments or capacity/equipment constraints for "${c.title}".`,
      });
    }
  }

  // 3. Room Exclusivity: At most 1 course per (room, day, period)
  for (const r of rooms) {
    for (const d of DAYS_OF_WEEK) {
      for (const p of PERIODS) {
        const roomSlotVars = courses.map((c) => vAssign[c.id][d][p][r.id]);
        registerConstraint(sum(roomSlotVars), "<=", 1, {
          name: `room_excl_${r.id}_${d}_P${p}`,
          category: "room_conflict",
          labelJa: `Room double-booking forbidden: Room ${r.name} (${r.id}) at ${d} P${p} can host at most one course`,
          relatedRoomIds: [r.id],
          relaxSuggestion: `Ensure multiple courses are not pinned to ${r.name} at ${d} P${p}.`,
        });
      }
    }
  }

  // 4. Professor No-Overlap: A professor can teach at most 1 course in any (day, period)
  for (const prof of professors) {
    const profCourses = courses.filter((c) => c.professorId === prof.id);
    if (profCourses.length === 0) continue;

    for (const d of DAYS_OF_WEEK) {
      for (const p of PERIODS) {
        const profSlotVars = profCourses.flatMap((c) => slotVarsByCourse(c.id, d, p));
        registerConstraint(sum(profSlotVars), "<=", 1, {
          name: `prof_excl_${prof.id}_${d}_P${p}`,
          category: "prof_conflict",
          labelJa: `Faculty overlap forbidden: ${prof.name} (${prof.id}) cannot teach multiple courses at ${d} P${p}`,
          relatedProfessorIds: [prof.id],
          relatedCourseIds: profCourses.map((c) => c.id),
          relaxSuggestion: `Ensure courses taught by ${prof.name} (${profCourses.map((c) => c.shortTitle).join(", ")}) do not overlap at the same slot.`,
        });
      }
    }
  }

  // 5. Student Cohort Curriculum No-Overlap
  if (config.enforceCohortNoOverlap) {
    for (const cohort of STUDENT_COHORTS) {
      // Courses for this cohort must not overlap in the same slot!
      const cohortCourses = courses.filter((c) => c.cohorts.includes(cohort.id));
      if (cohortCourses.length <= 1) continue;

      for (const d of DAYS_OF_WEEK) {
        for (const p of PERIODS) {
          const cohortSlotVars = cohortCourses.flatMap((c) => slotVarsByCourse(c.id, d, p));
          registerConstraint(sum(cohortSlotVars), "<=", 1, {
            name: `cohort_excl_${cohort.id}_${d}_P${p}`,
            category: "cohort_conflict",
            labelJa: `Cohort curriculum overlap forbidden: Courses for ${cohort.label} cannot overlap at ${d} P${p}`,
            relatedCourseIds: cohortCourses.map((c) => c.id),
            relaxSuggestion: `Ensure multiple courses for ${cohort.shortLabel} are not pinned to ${d} P${p}.`,
          });
        }
      }
    }
  }

  // 6. Professor Unavailable Days & Unavailable Slots
  for (const prof of professors) {
    const profCourses = courses.filter((c) => c.professorId === prof.id);
    if (profCourses.length === 0) continue;

    // Unavailable days (Adjunct day restrictions or full-day unavailability)
    const enforceDays =
      prof.employment === "adjunct"
        ? config.enforceAdjunctDayRestrictions
        : config.enforceProfessorAvailability;

    if (enforceDays && prof.unavailableDays.length > 0) {
      for (const d of prof.unavailableDays) {
        const dayVars: Var[] = [];
        for (const p of PERIODS) {
          for (const c of profCourses) {
            dayVars.push(...slotVarsByCourse(c.id, d, p));
          }
        }
        const availDays = DAYS_OF_WEEK.filter((day) => !prof.unavailableDays.includes(day))
          .map((day) => DAY_LABELS_JA[day])
          .join(", ");
        registerConstraint(sum(dayVars), "<=", 0, {
          name: `prof_unavail_day_${prof.id}_${d}`,
          category: "prof_avail",
          labelJa: `Faculty unavailable day: ${prof.name} (${prof.title}) cannot teach on ${DAY_FULL_LABELS_EN[d]} (Available: ${availDays})`,
          relatedProfessorIds: [prof.id],
          relatedCourseIds: profCourses.map((c) => c.id),
          relaxSuggestion: `Schedule courses taught by ${prof.name} (${profCourses.map((c) => c.shortTitle).join(", ")}) on ${availDays}, or update available days.`,
        });
      }
    }

    // Specific unavailable slots
    if (config.enforceProfessorAvailability) {
      for (const slot of prof.unavailableSlots) {
        const slotVars = profCourses.flatMap((c) =>
          slotVarsByCourse(c.id, slot.day, slot.period)
        );
        if (slotVars.length === 0) continue;
        registerConstraint(sum(slotVars), "<=", 0, {
          name: `prof_unavail_slot_${prof.id}_${slot.day}_P${slot.period}`,
          category: "prof_avail",
          labelJa: `Faculty unavailable slot: ${prof.name} (${prof.id}) is unavailable at ${formatSlotEn(slot.day, slot.period)}${slot.reason ? ` (Reason: ${slot.reason})` : ""}`,
          relatedProfessorIds: [prof.id],
          relatedCourseIds: profCourses.map((c) => c.id),
          relaxSuggestion: `Relax ${prof.name}'s unavailable slot at ${formatSlotEn(slot.day, slot.period)}, or reschedule their course.`,
        });
      }
    }
  }

  // 7. Multi-Session Courses (2 sessions/week): At most 1 session per day unless overridden by a `course_same_day` or `course_consecutive` rule
  if (config.forbidSameCourseSameDay) {
    for (const c of courses) {
      if (c.sessionsPerWeek <= 1) continue;
      const hasSameDayOverride = customRules.some(
        (r) =>
          r.enabled &&
          (r.kind === "course_same_day" || r.kind === "course_consecutive") &&
          r.courseId === c.id &&
          (!r.secondCourseId || r.secondCourseId === c.id)
      );
      if (hasSameDayOverride) continue;

      for (const d of DAYS_OF_WEEK) {
        const dayVars = PERIODS.flatMap((p) => slotVarsByCourse(c.id, d, p));
        registerConstraint(sum(dayVars), "<=", 1, {
          name: `course_diff_day_${c.id}_${d}`,
          category: "workload",
          labelJa: `Forbid same-day sessions: "${c.title}" (${c.id}) cannot have multiple sessions on ${DAY_FULL_LABELS_EN[d]}`,
          relatedCourseIds: [c.id],
          relaxSuggestion: `Schedule the 2 sessions of "${c.title}" on different days, or enable same-day consecutive rules.`,
        });
      }
    }
  }

  // 8. Professor Daily Session Cap & Max Consecutive Periods
  for (const prof of professors) {
    const profCourses = courses.filter((c) => c.professorId === prof.id);
    if (profCourses.length === 0) continue;

    // Check if there is a custom override for prof_max_daily
    const customMaxRule = customRules.find(
      (r) => r.enabled && r.kind === "prof_max_daily" && r.professorId === prof.id
    );
    const maxDaily =
      customMaxRule?.maxDailySessions ??
      Math.min(prof.maxSessionsPerDay, config.maxProfessorSessionsPerDay);

    for (const d of DAYS_OF_WEEK) {
      const dayVars = PERIODS.flatMap((p) =>
        profCourses.flatMap((c) => slotVarsByCourse(c.id, d, p))
      );
      registerConstraint(sum(dayVars), "<=", maxDaily, {
        name: `prof_daily_max_${prof.id}_${d}`,
        category: "workload",
        labelJa: `Max daily sessions for faculty: ${prof.name} (${prof.id}) is capped at ${maxDaily} session(s) on ${DAY_FULL_LABELS_EN[d]}`,
        relatedProfessorIds: [prof.id],
        relaxSuggestion: `Increase the daily session limit for ${prof.name} (currently ${maxDaily}).`,
      });

      // Consecutive period limit (sliding window of size maxConsec + 1)
      if (config.enforceMaxConsecutivePeriods) {
        const maxConsec = config.maxProfessorConsecutivePeriods;
        const winSize = maxConsec + 1;
        if (winSize >= 2 && winSize <= PERIODS.length) {
          for (let startIdx = 0; startIdx <= PERIODS.length - winSize; startIdx++) {
            const winPeriods = PERIODS.slice(startIdx, startIdx + winSize);
            const winVars = winPeriods.flatMap((p) =>
              profCourses.flatMap((c) => slotVarsByCourse(c.id, d, p))
            );
            registerConstraint(sum(winVars), "<=", maxConsec, {
              name: `prof_consec_${prof.id}_${d}_P${winPeriods[0]}_P${winPeriods[winPeriods.length - 1]}`,
              category: "workload",
              labelJa: `Max consecutive periods for faculty (${maxConsec} max): ${prof.name} (${prof.id}) on ${DAY_FULL_LABELS_EN[d]} P${winPeriods[0]}-P${winPeriods[winPeriods.length - 1]}`,
              relatedProfessorIds: [prof.id],
              relaxSuggestion: `Relax the consecutive period limit for faculty (currently ${maxConsec}).`,
            });
          }
        }
      }
    }
  }

  // 9. Cohort Daily Compulsory Cap
  for (const cohort of STUDENT_COHORTS) {
    const coreCourses = courses.filter(
      (c) =>
        c.cohorts.includes(cohort.id) &&
        (c.category === "compulsory" || c.category === "elective_core")
    );
    if (coreCourses.length === 0) continue;
    for (const d of DAYS_OF_WEEK) {
      const dayVars = PERIODS.flatMap((p) =>
        coreCourses.flatMap((c) => slotVarsByCourse(c.id, d, p))
      );
      registerConstraint(sum(dayVars), "<=", config.maxCohortCompulsoryPerDay, {
        name: `cohort_daily_max_${cohort.id}_${d}`,
        category: "workload",
        labelJa: `Max daily compulsory for ${cohort.shortLabel} (${config.maxCohortCompulsoryPerDay} max): ${DAY_FULL_LABELS_EN[d]}`,
        relaxSuggestion: `Relax the daily cohort compulsory limit (currently ${config.maxCohortCompulsoryPerDay}).`,
      });
    }
  }

  // 10. Custom Rules (User-added or AI-added constraints)
  for (const rule of customRules) {
    if (!rule.enabled) continue;
    const isHard = rule.isHard !== false;
    const weight = rule.weight ?? 60;

    if (rule.kind === "pin_slot" && rule.courseId) {
      const c = courseMap.get(rule.courseId);
      const pinDays = rule.days ?? [];
      const pinPeriods = rule.periods ?? [];
      if (!c || pinDays.length === 0 || pinPeriods.length === 0) continue;

      for (const d of pinDays) {
        for (const p of pinPeriods) {
          const suffix =
            pinDays.length > 1 || pinPeriods.length > 1 ? `_${d}_P${p}` : "";
          if (rule.roomId && roomMap.has(rule.roomId)) {
            const targetVar = vAssign[c.id][d][p][rule.roomId];
            registerSoftOrHard(
              sum([targetVar]),
              ">=",
              1,
              {
                name: `custom_pin_${rule.id}${suffix}`,
                relatedRuleId: rule.id,
                category: "custom",
                labelJa: `Custom Rule (Pin Slot & Room): ${rule.description}`,
                relatedCourseIds: [c.id],
                relatedRoomIds: [rule.roomId],
                relaxSuggestion: `Remove or modify pin rule "${rule.description}".`,
              },
              isHard,
              weight
            );
          } else {
            const slotVars = slotVarsByCourse(c.id, d, p);
            registerSoftOrHard(
              sum(slotVars),
              ">=",
              1,
              {
                name: `custom_pin_${rule.id}${suffix}`,
                relatedRuleId: rule.id,
                category: "custom",
                labelJa: `Custom Rule (Pin Slot): ${rule.description}`,
                relatedCourseIds: [c.id],
                relaxSuggestion: `Remove or modify pin rule "${rule.description}".`,
              },
              isHard,
              weight
            );
          }
        }
      }
    } else if (rule.kind === "forbid_slot") {
      const targetDays = rule.days && rule.days.length > 0 ? rule.days : [...DAYS_OF_WEEK];
      const targetPeriods = rule.periods && rule.periods.length > 0 ? rule.periods : [...PERIODS];

      const targetCourses: CourseProfile[] = [];
      if (rule.courseId && courseMap.has(rule.courseId)) {
        targetCourses.push(courseMap.get(rule.courseId)!);
      } else if (rule.professorId) {
        targetCourses.push(...courses.filter((c) => c.professorId === rule.professorId));
      }

      if (targetCourses.length > 0) {
        const forbiddenVars: Var[] = [];
        for (const c of targetCourses) {
          for (const d of targetDays) {
            for (const p of targetPeriods) {
              forbiddenVars.push(...slotVarsByCourse(c.id, d, p));
            }
          }
        }
        if (forbiddenVars.length > 0) {
          registerSoftOrHard(
            sum(forbiddenVars),
            "<=",
            0,
            {
              name: `custom_forbid_${rule.id}`,
              relatedRuleId: rule.id,
              category: "custom",
              labelJa: `Custom Rule (Forbid Slot): ${rule.description}`,
              relatedCourseIds: targetCourses.map((c) => c.id),
              relatedProfessorIds: rule.professorId ? [rule.professorId] : undefined,
              relaxSuggestion: `Relax or remove forbid rule "${rule.description}".`,
            },
            isHard,
            weight
          );
        }
      }
    } else if (rule.kind === "require_room" && rule.courseId) {
      const c = courseMap.get(rule.courseId);
      if (!c) continue;
      const allowedRooms = rooms.filter((r) => {
        if (rule.roomId) return r.id === rule.roomId;
        if (rule.roomType) return r.roomType === rule.roomType;
        return true;
      });
      const disallowedRooms = rooms.filter((r) => !allowedRooms.some((ar) => ar.id === r.id));
      if (disallowedRooms.length > 0) {
        const disVars: Var[] = [];
        for (const d of DAYS_OF_WEEK) {
          for (const p of PERIODS) {
            for (const r of disallowedRooms) {
              disVars.push(vAssign[c.id][d][p][r.id]);
            }
          }
        }
        registerSoftOrHard(
          sum(disVars),
          "<=",
          0,
          {
            name: `custom_req_room_${rule.id}`,
            relatedRuleId: rule.id,
            category: "custom",
            labelJa: `Custom Rule (Require Room): ${rule.description}`,
            relatedCourseIds: [c.id],
            relatedRoomIds: rule.roomId ? [rule.roomId] : undefined,
            relaxSuggestion: `Remove room requirement rule "${rule.description}".`,
          },
          isHard,
          weight
        );
      }
    } else if (
      rule.kind === "forbid_room" &&
      rule.courseId &&
      (rule.roomId || rule.roomType)
    ) {
      const c = courseMap.get(rule.courseId);
      if (!c) continue;
      const forbiddenRooms = rooms.filter((r) => {
        if (rule.roomId) return r.id === rule.roomId;
        if (rule.roomType) return r.roomType === rule.roomType;
        return false;
      });
      if (forbiddenRooms.length > 0) {
        const disVars: Var[] = [];
        for (const d of DAYS_OF_WEEK) {
          for (const p of PERIODS) {
            for (const r of forbiddenRooms) {
              disVars.push(vAssign[c.id][d][p][r.id]);
            }
          }
        }
        registerSoftOrHard(
          sum(disVars),
          "<=",
          0,
          {
            name: `custom_forbid_room_${rule.id}`,
            relatedRuleId: rule.id,
            category: "custom",
            labelJa: `Custom Rule (Forbid Room): ${rule.description}`,
            relatedCourseIds: [c.id],
            relatedRoomIds: forbiddenRooms.map((r) => r.id),
            relaxSuggestion: `Remove room forbid rule "${rule.description}".`,
          },
          isHard,
          weight
        );
      }
    } else if (
      rule.kind === "course_no_overlap" &&
      rule.courseId &&
      rule.secondCourseId &&
      rule.courseId !== rule.secondCourseId
    ) {
      const c1 = courseMap.get(rule.courseId);
      const c2 = courseMap.get(rule.secondCourseId);
      if (!c1 || !c2) continue;
      for (const d of DAYS_OF_WEEK) {
        for (const p of PERIODS) {
          const bothVars = [
            ...slotVarsByCourse(c1.id, d, p),
            ...slotVarsByCourse(c2.id, d, p),
          ];
          registerSoftOrHard(
            sum(bothVars),
            "<=",
            1,
            {
              name: `custom_no_overlap_${rule.id}_${d}_P${p}`,
              relatedRuleId: rule.id,
              category: "custom",
              labelJa: `Custom Rule (No Overlap): "${c1.shortTitle}" and "${c2.shortTitle}" cannot overlap at ${formatSlotEn(d, p)}`,
              relatedCourseIds: [c1.id, c2.id],
              relaxSuggestion: `Remove overlap restriction rule "${rule.description}".`,
            },
            isHard,
            weight
          );
        }
      }
    } else if (rule.kind === "course_consecutive" && rule.courseId) {
      const c1 = courseMap.get(rule.courseId);
      const c2 = rule.secondCourseId ? courseMap.get(rule.secondCourseId) : c1;
      if (!c1 || !c2) continue;

      // Require that on whichever day c1 and c2 are scheduled consecutively, they occupy adjacent periods (p, p+1) in either order.
      const pairIndicators: Var[] = [];
      for (const d of DAYS_OF_WEEK) {
        for (let pIdx = 0; pIdx < PERIODS.length - 1; pIdx++) {
          const pA = PERIODS[pIdx];
          const pB = PERIODS[pIdx + 1];
          if (c1.id === c2.id) {
            const z = m.binary(`consec_${rule.id}_${d}_P${pA}`);
            pairIndicators.push(z);
            const varsA = slotVarsByCourse(c1.id, d, pA);
            const varsB = slotVarsByCourse(c1.id, d, pB);
            m.constraint(expr`${z} - ${sum(varsA)} <= 0`, `consec_ubA_${rule.id}_${d}_P${pA}`);
            m.constraint(expr`${z} - ${sum(varsB)} <= 0`, `consec_ubB_${rule.id}_${d}_P${pA}`);
          } else {
            const zFwd = m.binary(`consec_fwd_${rule.id}_${d}_P${pA}`);
            const zRev = m.binary(`consec_rev_${rule.id}_${d}_P${pA}`);
            pairIndicators.push(zFwd, zRev);
            const vars1A = slotVarsByCourse(c1.id, d, pA);
            const vars2B = slotVarsByCourse(c2.id, d, pB);
            m.constraint(expr`${zFwd} - ${sum(vars1A)} <= 0`, `consec_ub1F_${rule.id}_${d}_P${pA}`);
            m.constraint(expr`${zFwd} - ${sum(vars2B)} <= 0`, `consec_ub2F_${rule.id}_${d}_P${pA}`);
            const vars2A = slotVarsByCourse(c2.id, d, pA);
            const vars1B = slotVarsByCourse(c1.id, d, pB);
            m.constraint(expr`${zRev} - ${sum(vars2A)} <= 0`, `consec_ub2R_${rule.id}_${d}_P${pA}`);
            m.constraint(expr`${zRev} - ${sum(vars1B)} <= 0`, `consec_ub1R_${rule.id}_${d}_P${pA}`);
          }
        }
      }
      registerSoftOrHard(
        sum(pairIndicators),
        ">=",
        1,
        {
          name: `custom_consec_${rule.id}`,
          relatedRuleId: rule.id,
          category: "custom",
          labelJa: `Custom Rule (Consecutive Sessions): ${rule.description}`,
          relatedCourseIds: c1.id === c2.id ? [c1.id] : [c1.id, c2.id],
          relaxSuggestion: `Remove consecutive session rule "${rule.description}".`,
        },
        isHard,
        weight
      );
    } else if (rule.kind === "course_same_day" && rule.courseId) {
      const c1 = courseMap.get(rule.courseId);
      const c2 = rule.secondCourseId ? courseMap.get(rule.secondCourseId) : c1;
      if (!c1 || !c2) continue;

      const dayIndicators: Var[] = [];
      for (const d of DAYS_OF_WEEK) {
        const z = m.binary(`sameday_${rule.id}_${d}`);
        dayIndicators.push(z);
        if (c1.id === c2.id) {
          const dVars = PERIODS.flatMap((p) => slotVarsByCourse(c1.id, d, p));
          m.constraint(expr`2 * ${z} - ${sum(dVars)} <= 0`, `sameday_ub_${rule.id}_${d}`);
        } else {
          const dVars1 = PERIODS.flatMap((p) => slotVarsByCourse(c1.id, d, p));
          const dVars2 = PERIODS.flatMap((p) => slotVarsByCourse(c2.id, d, p));
          m.constraint(expr`${z} - ${sum(dVars1)} <= 0`, `sameday_ub1_${rule.id}_${d}`);
          m.constraint(expr`${z} - ${sum(dVars2)} <= 0`, `sameday_ub2_${rule.id}_${d}`);
        }
      }
      registerSoftOrHard(
        sum(dayIndicators),
        ">=",
        1,
        {
          name: `custom_sameday_${rule.id}`,
          relatedRuleId: rule.id,
          category: "custom",
          labelJa: `Custom Rule (Same Day Sessions): ${rule.description}`,
          relatedCourseIds: c1.id === c2.id ? [c1.id] : [c1.id, c2.id],
          relaxSuggestion: `Remove same-day rule "${rule.description}".`,
        },
        isHard,
        weight
      );
    } else if (
      rule.kind === "course_precedence" &&
      rule.courseId &&
      rule.secondCourseId &&
      rule.courseId !== rule.secondCourseId
    ) {
      const c1 = courseMap.get(rule.courseId);
      const c2 = courseMap.get(rule.secondCourseId);
      if (!c1 || !c2) continue;

      // Enforce latest scheduled day index of c1 <= earliest scheduled day index of c2 (0=Mon .. 4=Fri)
      const maxDayC1 = m.continuous(`prec_max_${rule.id}`, { lb: 0, ub: 4 });
      const minDayC2 = m.continuous(`prec_min_${rule.id}`, { lb: 0, ub: 4 });
      DAYS_OF_WEEK.forEach((d, dayIdx) => {
        for (const p of PERIODS) {
          const slotVars1 = slotVarsByCourse(c1.id, d, p);
          if (slotVars1.length > 0 && dayIdx > 0) {
            m.constraint(
              expr`${dayIdx} * ${sum(slotVars1)} - ${maxDayC1} <= 0`,
              `prec_lb1_${rule.id}_${d}_P${p}`
            );
          }
          const slotVars2 = slotVarsByCourse(c2.id, d, p);
          if (slotVars2.length > 0 && dayIdx < 4) {
            m.constraint(
              expr`${minDayC2} + ${4 - dayIdx} * ${sum(slotVars2)} <= 4`,
              `prec_ub2_${rule.id}_${d}_P${p}`
            );
          }
        }
      });
      registerSoftOrHard(
        maxDayC1.sub(minDayC2),
        "<=",
        0,
        {
          name: `custom_prec_${rule.id}`,
          relatedRuleId: rule.id,
          category: "custom",
          labelJa: `Custom Rule (Curriculum Order): ${rule.description}`,
          relatedCourseIds: [c1.id, c2.id],
          relaxSuggestion: `Relax or remove order rule "${rule.description}".`,
        },
        isHard,
        weight
      );
    } else if (rule.kind === "room_closure" && rule.roomId && roomMap.has(rule.roomId)) {
      const targetDays = rule.days && rule.days.length > 0 ? rule.days : [...DAYS_OF_WEEK];
      const targetPeriods = rule.periods && rule.periods.length > 0 ? rule.periods : [...PERIODS];
      const closedVars: Var[] = [];
      for (const d of targetDays) {
        for (const p of targetPeriods) {
          for (const c of courses) {
            closedVars.push(vAssign[c.id][d][p][rule.roomId]);
          }
        }
      }
      if (closedVars.length > 0) {
        registerSoftOrHard(
          sum(closedVars),
          "<=",
          0,
          {
            name: `custom_room_closure_${rule.id}`,
            relatedRuleId: rule.id,
            category: "custom",
            labelJa: `Custom Rule (Room Maintenance Closure): ${rule.description}`,
            relatedRoomIds: [rule.roomId],
            relaxSuggestion: `Remove room closure rule "${rule.description}".`,
          },
          isHard,
          weight
        );
      }
    }
  }

  // ==================== OBJECTIVE FUNCTION ====================
  if (elasticMode) {
    m.objective(
      minimize(sum(elasticSlacks, (entry) => entry.slackVar.mul(entry.weight)))
    );
  } else {
    const objTerms: LinExpr[] = [...softPenaltyTerms];

    // 1. Professor Period 1 / Period 5 avoidance preferences
    for (const c of courses) {
      const prof = profMap.get(c.professorId);
      if (!prof) continue;

      if (prof.avoidPeriod1 && config.weightAvoidPeriod1 > 0) {
        for (const d of DAYS_OF_WEEK) {
          for (const v of slotVarsByCourse(c.id, d, 1)) {
            objTerms.push(v.mul(config.weightAvoidPeriod1));
          }
        }
      }
      if (prof.avoidPeriod5 && config.weightAvoidPeriod5 > 0) {
        for (const d of DAYS_OF_WEEK) {
          for (const v of slotVarsByCourse(c.id, d, 5)) {
            objTerms.push(v.mul(config.weightAvoidPeriod5));
          }
        }
      }
    }

    // 2. Room Fit & Preferred Room Penalty (avoid putting a 25-student seminar in a 150-seat hall if seminar room is free)
    if (config.weightRoomFit > 0) {
      for (const c of courses) {
        for (const r of rooms) {
          let roomCost = 0;
          if (c.preferredRoomIds && c.preferredRoomIds.length > 0) {
            if (!c.preferredRoomIds.includes(r.id)) {
              roomCost += config.weightRoomFit;
            }
          }
          const excessRatio = (r.capacity - c.enrollment) / 100;
          if (excessRatio > 0.45) {
            roomCost += config.weightRoomFit;
          }
          if (roomCost > 0) {
            for (const d of DAYS_OF_WEEK) {
              for (const p of PERIODS) {
                objTerms.push(vAssign[c.id][d][p][r.id].mul(roomCost));
              }
            }
          }
        }
      }
    }

    // 3. Cohort Compactness (Penalize single-period hollow gaps between compulsory/core classes on the same day)
    if (config.weightCohortIdleGaps > 0) {
      for (const cohort of STUDENT_COHORTS) {
        const coreCourses = courses.filter(
          (c) =>
            c.cohorts.includes(cohort.id) &&
            (c.category === "compulsory" || c.category === "elective_core")
        );
        if (coreCourses.length <= 1) continue;

        for (const d of DAYS_OF_WEEK) {
          // Penalize pattern: active at p, empty at p+1, active at p+2 (for p = 1, 2, 3)
          for (const p of [1, 2, 3] as const) {
            const pMid = (p + 1) as TimetablePeriod;
            const pAfter = (p + 2) as TimetablePeriod;
            const varsBefore = coreCourses.flatMap((c) => slotVarsByCourse(c.id, d, p));
            const varsMid = coreCourses.flatMap((c) => slotVarsByCourse(c.id, d, pMid));
            const varsAfter = coreCourses.flatMap((c) => slotVarsByCourse(c.id, d, pAfter));

            const gapVar = m.continuous(`gap_${cohort.id}_${d}_P${pMid}`, { lb: 0 });
            // gapVar >= sum(varsBefore) + sum(varsAfter) - sum(varsMid) - 1
            m.constraint(
              expr`${sum(varsBefore)} + ${sum(varsAfter)} - ${sum(varsMid)} - ${gapVar} <= 1`,
              `gap_def_${cohort.id}_${d}_P${pMid}`
            );
            objTerms.push(gapVar.mul(config.weightCohortIdleGaps));
          }
        }
      }
    }

    // 4. Minimal Perturbation Mode (Preserve current timetable assignments when re-optimizing)
    if (config.preserveCurrentTimetable && options?.referenceTimetable) {
      const ref = options.referenceTimetable;
      const wSlot = config.weightPerturbationSlot ?? 10;
      const wRoom = config.weightPerturbationRoom ?? 3;

      for (const session of ref.sessions) {
        const vSameRoom =
          vAssign[session.courseId]?.[session.day]?.[session.period]?.[session.roomId];
        if (vSameRoom) {
          // Bonus for preserving same room (-wRoom in minimization)
          objTerms.push(vSameRoom.mul(-wRoom));
        }
        const slotVars = slotVarsByCourse(session.courseId, session.day, session.period);
        for (const sv of slotVars) {
          // Bonus for preserving same slot (-(wSlot - wRoom)), so moving slot incurs net penalty wSlot
          objTerms.push(sv.mul(wRoom - wSlot));
        }
      }
    }

    if (objTerms.length > 0) {
      m.objective(minimize(sum(objTerms)));
    } else {
      m.objective(minimize(expr`0`));
    }
  }

  return {
    model: m,
    vAssign,
    slotVarsByCourse,
    constraintMeta,
    elasticSlacks,
  };
}

/**
 * Evaluates a weekly timetable solution against all structural and custom rules.
 */
export function evaluateTimetableSolution(
  state: TimetableState,
  solution: WeeklyTimetableSolution
): TimetableEvaluationReport {
  const { config, rooms, professors, courses } = state;
  const violations: TimetableViolationItem[] = [];

  // 1. Check course session counts & room compatibility
  for (const c of courses) {
    const assigned = solution.byCourse[c.id] ?? [];
    if (assigned.length !== c.sessionsPerWeek) {
      violations.push({
        category: "assignment",
        severity: "hard",
        courseId: c.id,
        messageJa: `Session quota mismatch for "${c.title}" (Assigned: ${assigned.length} / Required: ${c.sessionsPerWeek})`,
      });
    }
    for (const s of assigned) {
      const r = rooms.find((rm) => rm.id === s.roomId);
      if (r) {
        const compat = isRoomCompatibleWithCourse(r, c, config);
        if (!compat.compatible) {
          violations.push({
            category: "capacity_equip",
            severity: "hard",
            courseId: c.id,
            roomId: r.id,
            day: s.day,
            period: s.period,
            messageJa: `${formatSlotEn(s.day, s.period)}「${c.shortTitle}」(${r.shortName}): ${compat.reasonJa}`,
          });
        }
      }
    }
  }

  // 2. Professor summaries & violations
  const professorSummaries: Record<string, ProfessorWeeklySummary> = {};
  for (const prof of professors) {
    const profCourses = new Set(
      courses.filter((c) => c.professorId === prof.id).map((c) => c.id)
    );
    const profSessions = solution.sessions.filter((s) => profCourses.has(s.courseId));

    const activeDays = new Set<TimetableDay>();
    let maxDailyCount = 0;
    let maxConsecutiveCount = 0;
    let period1Count = 0;
    let period5Count = 0;

    for (const d of DAYS_OF_WEEK) {
      const daySessions = profSessions.filter((s) => s.day === d);
      if (daySessions.length > 0) activeDays.add(d);
      if (daySessions.length > maxDailyCount) maxDailyCount = daySessions.length;

      let curStreak = 0;
      for (const p of PERIODS) {
        const inSlot = daySessions.filter((s) => s.period === p);
        if (inSlot.length > 1) {
          violations.push({
            category: "prof_conflict",
            severity: "hard",
            professorId: prof.id,
            day: d,
            period: p,
            messageJa: `${prof.name} is scheduled to teach multiple courses simultaneously at ${d} P${p}`,
          });
        }
        if (inSlot.length >= 1) {
          curStreak++;
          if (curStreak > maxConsecutiveCount) maxConsecutiveCount = curStreak;
          if (p === 1) period1Count++;
          if (p === 5) period5Count++;
        } else {
          curStreak = 0;
        }
      }
    }

    professorSummaries[prof.id] = {
      professorId: prof.id,
      assignedSessions: profSessions.length,
      activeDaysCount: activeDays.size,
      maxDailyCount,
      maxConsecutiveCount,
      period1Count,
      period5Count,
    };
  }

  // 3. Cohort summaries & hollow gap count
  const cohortSummaries = {} as Record<CohortId, CohortWeeklySummary>;
  for (const cohort of STUDENT_COHORTS) {
    const cohortCourseIds = new Set(
      courses.filter((c) => c.cohorts.includes(cohort.id)).map((c) => c.id)
    );
    const coreCourseIds = new Set(
      courses
        .filter(
          (c) =>
            c.cohorts.includes(cohort.id) &&
            (c.category === "compulsory" || c.category === "elective_core")
        )
        .map((c) => c.id)
    );

    const totalSessions = solution.sessions.filter((s) => cohortCourseIds.has(s.courseId)).length;
    const compulsorySessions = solution.sessions.filter((s) =>
      coreCourseIds.has(s.courseId)
    ).length;

    let hollowGapsCount = 0;
    for (const d of DAYS_OF_WEEK) {
      const activePeriods = PERIODS.filter((p) =>
        solution.sessions.some(
          (s) => s.day === d && s.period === p && coreCourseIds.has(s.courseId)
        )
      );
      if (activePeriods.length >= 2) {
        const firstP = activePeriods[0];
        const lastP = activePeriods[activePeriods.length - 1];
        for (let p = firstP + 1; p < lastP; p++) {
          if (!activePeriods.includes(p as TimetablePeriod)) {
            hollowGapsCount++;
          }
        }
      }
    }

    cohortSummaries[cohort.id] = {
      cohortId: cohort.id,
      totalSessions,
      compulsorySessions,
      hollowGapsCount,
    };
  }

  // 4. Room utilization
  const roomUtilizationPct: Record<string, number> = {};
  const totalSlots = DAYS_OF_WEEK.length * PERIODS.length; // 25
  for (const r of rooms) {
    const used = solution.sessions.filter((s) => s.roomId === r.id).length;
    roomUtilizationPct[r.id] = Math.round((used / totalSlots) * 100);
  }

  const hardViolationCount = violations.filter((v) => v.severity === "hard").length;
  const softPenaltyCount = Object.values(cohortSummaries).reduce(
    (acc, c) => acc + c.hollowGapsCount,
    0
  );

  return {
    valid: hardViolationCount === 0,
    hardViolationCount,
    softPenaltyCount,
    violations,
    professorSummaries,
    cohortSummaries,
    roomUtilizationPct,
  };
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
 * Diagnoses conflicting constraints in an infeasible timetable using WaSHI (HiGHS)
 * two-pass Elastic Constraint Relaxation (Slack Penalty Minimization).
 */
export async function diagnoseTimetableWithHiGHS(
  state: TimetableState,
  options?: { signal?: AbortSignal; timeLimit?: number }
): Promise<{ status: "Sat" | "Unsat" | "Unknown"; conflicts: ConstraintMeta[]; rawNames: string[] }> {
  const found = new Map<string, ConstraintMeta>();
  const timeLimit = options?.timeLimit ?? 1.5;

  const pass1 = buildTimetableWashiModel(state, {
    elasticWeightMode: "prefer_structural",
  });
  const status1 = await pass1.model.solve({ timeLimit, signal: options?.signal });
  const obj1 = pass1.model.objectiveValue;

  if (status1 === "Optimal" && obj1 !== null && obj1 !== undefined && obj1 <= 1e-4) {
    return {
      status: "Sat",
      conflicts: [],
      rawNames: [],
    };
  }

  if (status1 === "Optimal" && obj1 !== null && obj1 !== undefined && obj1 > 1e-4) {
    collectViolatedSlacks(pass1.elasticSlacks, found);

    const pass2 = buildTimetableWashiModel(state, {
      elasticWeightMode: "prefer_user",
    });
    const status2 = await pass2.model.solve({ timeLimit, signal: options?.signal });
    const obj2 = pass2.model.objectiveValue;
    if (status2 === "Optimal" && obj2 !== null && obj2 !== undefined && obj2 > 1e-4) {
      collectViolatedSlacks(pass2.elasticSlacks, found);
    }

    const conflicts = Array.from(found.values());
    return {
      status: "Unsat",
      conflicts,
      rawNames: conflicts.map((c) => c.name),
    };
  }

  return {
    status: "Unknown",
    conflicts: [],
    rawNames: [],
  };
}

function diagnoseChangeReason(
  ch: TimetableCellDiff,
  state: TimetableState,
  next: WeeklyTimetableSolution
): TimetableDiffReason {
  const course = state.courses.find((c) => c.id === ch.courseId);
  if (!course) return { kind: "rebalance" };

  // 1. Explicit user pin at next slot
  const isPinnedAtNext = state.customRules.some(
    (r) =>
      r.enabled &&
      r.kind === "pin_slot" &&
      r.courseId === ch.courseId &&
      r.days?.includes(ch.nextDay) &&
      r.periods?.includes(ch.nextPeriod)
  );
  if (isPinnedAtNext) {
    return { kind: "user_pin" };
  }

  // 2. Same slot, room only
  if (ch.prevDay === ch.nextDay && ch.prevPeriod === ch.nextPeriod) {
    return { kind: "room_only", relatedRoomId: ch.nextRoomId };
  }

  // 3. Why couldn't it stay in prevDay, prevPeriod, prevRoomId?
  const prevSlotSessions =
    next.bySlot?.[`${ch.prevDay}_${ch.prevPeriod}`] ??
    next.sessions.filter((s) => s.day === ch.prevDay && s.period === ch.prevPeriod);

  // Check 3A: Room conflict (Did another course in next take prevRoomId at prevDay, prevPeriod?)
  const roomOccupant = prevSlotSessions.find(
    (s) => s.roomId === ch.prevRoomId && s.courseId !== ch.courseId
  );
  if (roomOccupant) {
    return {
      kind: "room_conflict",
      relatedCourseId: roomOccupant.courseId,
      relatedRoomId: ch.prevRoomId,
    };
  }

  // Check 3B: Professor conflict (Is course's professor teaching another course at prevDay, prevPeriod in next?)
  const profOccupant = prevSlotSessions.find((s) => {
    if (s.courseId === ch.courseId) return false;
    const otherCourse = state.courses.find((c) => c.id === s.courseId);
    return otherCourse && otherCourse.professorId === course.professorId;
  });
  if (profOccupant) {
    return {
      kind: "prof_conflict",
      relatedCourseId: profOccupant.courseId,
      relatedProfessorId: course.professorId,
    };
  }

  // Check 3C: Cohort conflict (Does any cohort of this course have another course at prevDay, prevPeriod in next?)
  if (state.config.enforceCohortNoOverlap) {
    const cohortOccupant = prevSlotSessions.find((s) => {
      if (s.courseId === ch.courseId) return false;
      const otherCourse = state.courses.find((c) => c.id === s.courseId);
      return otherCourse && otherCourse.cohorts.some((k) => course.cohorts.includes(k));
    });
    if (cohortOccupant) {
      const otherCourse = state.courses.find((c) => c.id === cohortOccupant.courseId);
      const sharedCohort = otherCourse
        ? course.cohorts.find((k) => otherCourse.cohorts.includes(k))
        : undefined;
      return {
        kind: "cohort_conflict",
        relatedCourseId: cohortOccupant.courseId,
        relatedCohortId: sharedCohort,
      };
    }
  }

  return { kind: "rebalance" };
}

export function computeTimetableDiff(
  state: TimetableState,
  prev: WeeklyTimetableSolution | null | undefined,
  next: WeeklyTimetableSolution | null | undefined
): TimetableDiffSummary | null {
  if (!prev || !next) return null;
  const courseMap = new Map(state.courses.map((c) => [c.id, c]));
  const changes: TimetableCellDiff[] = [];
  let totalSessions = 0;

  const sortBySlot = (a: AssignedSession, b: AssignedSession): number => {
    const slotDiff =
      DAYS_OF_WEEK.indexOf(a.day) * 10 +
      a.period -
      (DAYS_OF_WEEK.indexOf(b.day) * 10 + b.period);
    if (slotDiff !== 0) return slotDiff;
    return a.roomId.localeCompare(b.roomId);
  };

  for (const c of state.courses) {
    const unmatchedPrev = [...(prev.byCourse[c.id] ?? [])].sort(sortBySlot);
    const unmatchedNext = [...(next.byCourse[c.id] ?? [])].sort(sortBySlot);

    // 1. First match exact (day, period, roomId) retentions so unchanged sessions of multi-session courses are never miscounted as moved
    for (let i = unmatchedPrev.length - 1; i >= 0; i--) {
      const pS = unmatchedPrev[i];
      const exactIdx = unmatchedNext.findIndex(
        (nS) => nS.day === pS.day && nS.period === pS.period && nS.roomId === pS.roomId
      );
      if (exactIdx !== -1) {
        unmatchedPrev.splice(i, 1);
        unmatchedNext.splice(exactIdx, 1);
        totalSessions++;
      }
    }

    // 2. Next match same-(day, period) room-only changes
    let diffSeq = 0;
    for (let i = unmatchedPrev.length - 1; i >= 0; i--) {
      const pS = unmatchedPrev[i];
      const sameSlotIdx = unmatchedNext.findIndex(
        (nS) => nS.day === pS.day && nS.period === pS.period
      );
      if (sameSlotIdx !== -1) {
        const [nS] = unmatchedNext.splice(sameSlotIdx, 1);
        unmatchedPrev.splice(i, 1);
        totalSessions++;
        changes.push({
          courseId: c.id,
          courseTitle: courseMap.get(c.id)?.shortTitle ?? c.id,
          sessionIndex: diffSeq++,
          prevDay: pS.day,
          prevPeriod: pS.period,
          prevRoomId: pS.roomId,
          nextDay: nS.day,
          nextPeriod: nS.period,
          nextRoomId: nS.roomId,
        });
      }
    }

    // 3. Pair any remaining unmatched sessions in chronological order
    unmatchedPrev.sort(sortBySlot);
    unmatchedNext.sort(sortBySlot);
    const count = Math.max(unmatchedPrev.length, unmatchedNext.length);
    for (let i = 0; i < count; i++) {
      totalSessions++;
      const pS = unmatchedPrev[i];
      const nS = unmatchedNext[i];
      if (!pS || !nS) continue;
      changes.push({
        courseId: c.id,
        courseTitle: courseMap.get(c.id)?.shortTitle ?? c.id,
        sessionIndex: diffSeq++,
        prevDay: pS.day,
        prevPeriod: pS.period,
        prevRoomId: pS.roomId,
        nextDay: nS.day,
        nextPeriod: nS.period,
        nextRoomId: nS.roomId,
      });
    }
  }

  if (totalSessions === 0) return null;

  for (const ch of changes) {
    ch.reason = diagnoseChangeReason(ch, state, next);
  }

  const changedSessionsCount = changes.length;
  const unchangedSessionsCount = totalSessions - changedSessionsCount;
  const retentionRatePct = Math.round((unchangedSessionsCount / totalSessions) * 1000) / 10;

  return {
    totalSessions,
    changedSessionsCount,
    unchangedSessionsCount,
    retentionRatePct,
    changes,
  };
}

export function generateTimetableWashiCodePreview(state: TimetableState): string {
  const { config, rooms, professors, courses, customRules } = state;
  const activeRules = customRules.filter((r) => r.enabled);
  return `import { Model, expr, sum, minimize } from "@ohtaman/washi";

// 大学時間割編成問題 (University Course Timetabling Problem: UCTP)
// 科目数: ${courses.length}科目 / 教室数: ${rooms.length}室 / 教員数: ${professors.length}名 / 週25枠(月〜金×1〜5限)
const m = new Model("UniversityCourseTimetabling_UCTP", { solver: "highs" });

// Binary decision variable: x[c][d][p][r] = 1 if course c is assigned to day d, period p, room r
const x = {};
for (const c of courses) {
  x[c.id] = {};
  for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri"]) {
    x[c.id][d] = {};
    for (const p of [1, 2, 3, 4, 5]) {
      x[c.id][d][p] = {};
      for (const r of rooms) {
        x[c.id][d][p][r.id] = m.binary(\`x_\${c.id}_\${d}_P\${p}_\${r.id}\`);
      }
    }
  }
}

// 1. Weekly session quota for each course (1 or 2) & classroom capacity / equipment eligibility
// 2. Classroom mutual exclusion (at most 1 course per room per slot)
// 3. Faculty mutual exclusion & unavailable slots compliance (${config.enforceProfessorAvailability ? "ON" : "OFF"})
// 4. Cohort compulsory curriculum no-overlap (${config.enforceCohortNoOverlap ? "ON" : "OFF"})
// 5. Faculty max consecutive teaching periods limit (max ${config.maxProfessorConsecutivePeriods} consecutive) & max ${config.maxProfessorSessionsPerDay} sessions/day
// 6. Custom rules: ${activeRules.length} active
`;
}

/**
 * Solves the University Course Timetabling Problem using WaSHI (HiGHS), verifies with `validateSolution()`,
 * and automatically diagnoses conflicts using HiGHS Elastic Constraint Relaxation if `Infeasible`.
 */
export async function solveTimetableWithWashi(
  state: TimetableState,
  options?: {
    signal?: AbortSignal;
    timeLimit?: number;
    referenceTimetable?: WeeklyTimetableSolution | null;
  }
): Promise<WashiTimetableSolveOutcome> {
  const t0 = performance.now();
  const useRef =
    state.config.preserveCurrentTimetable !== false && Boolean(options?.referenceTimetable);

  if (state.courses.length === 0 || state.rooms.length === 0) {
    const emptySolution: WeeklyTimetableSolution = {
      bySlot: {},
      byCourse: {},
      sessions: [],
    };
    return {
      status: "Optimal",
      objectiveValue: 0,
      buildTimeMs: 0,
      solveTimeMs: 0,
      totalTimeMs: 0,
      numVariables: 0,
      numConstraints: 0,
      validatedByWashi: true,
      maxViolation: 0,
      timetable: emptySolution,
      evaluation: evaluateTimetableSolution(
        state,
        emptySolution,
        useRef ? options?.referenceTimetable : null
      ),
      lpStringPreview: "// Empty timetable (no courses or rooms registered)",
      washiCodeSnippet: "// Empty timetable",
    };
  }

  const { model, vAssign, constraintMeta } = buildTimetableWashiModel(state, {
    referenceTimetable: useRef ? options?.referenceTimetable : null,
  });

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
  const modelCodePreview = generateTimetableWashiCodePreview(state);

  const tSolve0 = performance.now();
  let status: string;
  try {
    status = await model.solve({
      timeLimit: options?.timeLimit ?? 4.0,
      relGap: 0.001,
      signal: options?.signal,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
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
      timetable: null,
      evaluation: null,
      lpPreview,
      modelCodePreview,
      conflicts: [],
      rawConflictNames: [],
      errorMessage: msg,
    };
  }
  const solveTimeMs = Math.max(1, Math.round(performance.now() - tSolve0));

  if (status === "Optimal" || model.hasPrimalSolution) {
    const sessions: AssignedSession[] = [];
    const bySlot: Record<string, AssignedSession[]> = {};
    const bySlotAndRoom: Record<string, AssignedSession> = {};
    const byCourse: Record<string, AssignedSession[]> = {};

    for (const c of state.courses) {
      byCourse[c.id] = [];
      let sessionIndex = 0;
      for (const d of DAYS_OF_WEEK) {
        for (const p of PERIODS) {
          for (const r of state.rooms) {
            const val = Math.round(vAssign[c.id][d][p][r.id]?.value ?? 0);
            if (val === 1) {
              const entry: AssignedSession = {
                courseId: c.id,
                sessionIndex,
                day: d,
                period: p,
                roomId: r.id,
              };
              sessionIndex++;
              sessions.push(entry);
              byCourse[c.id].push(entry);
              const slotKey = `${d}_${p}`;
              if (!bySlot[slotKey]) bySlot[slotKey] = [];
              bySlot[slotKey].push(entry);
              bySlotAndRoom[`${d}_${p}_${r.id}`] = entry;
            }
          }
        }
      }
    }

    const timetable: WeeklyTimetableSolution = {
      sessions,
      bySlot,
      bySlotAndRoom,
      byCourse,
    };

    const report = model.validateSolution();
    const evaluation = evaluateTimetableSolution(state, timetable);
    const diffFromPrevious = options?.referenceTimetable
      ? computeTimetableDiff(state, options.referenceTimetable, timetable)
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
      timetable,
      evaluation,
      diffFromPrevious,
      lpPreview,
      modelCodePreview,
      conflicts: [],
      rawConflictNames: [],
    };
  }

  if (status === "Infeasible") {
    try {
      const diag = await diagnoseTimetableWithHiGHS(state, { signal: options?.signal });
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
        timetable: null,
        evaluation: null,
        lpPreview,
        modelCodePreview,
        conflicts: diag.conflicts,
        rawConflictNames: diag.rawNames,
        errorMessage:
          diag.status === "Unknown"
            ? "Conflict diagnosis did not reach optimality within the time limit."
            : undefined,
      };
    } catch (diagErr: unknown) {
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
        timetable: null,
        evaluation: null,
        lpPreview,
        modelCodePreview,
        conflicts: [],
        rawConflictNames: [],
        errorMessage: diagErr instanceof Error ? diagErr.message : String(diagErr),
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
    timetable: null,
    evaluation: null,
    lpPreview,
    modelCodePreview,
    conflicts: [],
    rawConflictNames: [],
    errorMessage: `Solver returned status: ${status}`,
  };
}
