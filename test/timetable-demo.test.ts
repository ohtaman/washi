import { describe, it, expect } from "vitest";
import {
  generateTimetableState,
  injectTimetableConflictScenario,
} from "../examples/web-demo/apps/ai-timetable/generator.js";
import {
  diagnoseTimetableWithHiGHS,
  solveTimetableWithWashi,
} from "../examples/web-demo/apps/ai-timetable/solver.js";
import {
  applyTimetableChatOperationsToState,
  convertToolCallToTimetableOperation,
  resolveCourseFromText,
  resolveProfessorFromText,
  resolveRoomFromText,
} from "../examples/web-demo/apps/ai-timetable/nano-client.js";
import {
  COURSE_PROFILE_I18N,
  PROFESSOR_PROFILE_I18N,
  ROOM_PROFILE_I18N,
  UI_TEXT_I18N,
  formatConstraintMetaI18n,
  formatCustomRuleI18n,
} from "../examples/web-demo/apps/ai-timetable/i18n.js";
import {
  resolveDayToken,
  resolvePeriodNumbers,
} from "../examples/web-demo/apps/ai-timetable/types.js";

describe("University Course Timetabling AI Copilot Demo (UCTP, HiGHS)", () => {
  it("solves the default 25-course (30-session) 7-room 10-professor timetable to Optimal and passes validateSolution()", async () => {
    const state = generateTimetableState();
    expect(state.courses.length).toBe(25);
    expect(state.rooms.length).toBe(7);
    expect(state.professors.length).toBe(10);

    const t0 = performance.now();
    const res = await solveTimetableWithWashi(state);
    const elapsed = Math.round(performance.now() - t0);

    console.log(
      `[UCTP Default] status=${res.status}, vars=${res.numVariables}, constrs=${res.numConstraints}, build=${res.buildTimeMs}ms, solve=${res.solveTimeMs}ms, total=${elapsed}ms, obj=${res.objectiveValue}`
    );

    expect(res.status).toBe("Optimal");
    expect(res.validatedByWashi).toBe(true);
    expect(res.maxViolation).toBeLessThanOrEqual(1e-6);
    expect(res.evaluation?.valid).toBe(true);
    expect(res.evaluation?.hardViolationCount).toBe(0);
    expect(res.timetable?.sessions.length).toBe(30);

    // Verify adjunct professors only teach on their contracted days:
    // P09 (小林 拓海): only Tue or Thu
    for (const c of state.courses.filter((x) => x.professorId === "P09")) {
      const assigned = res.timetable!.byCourse[c.id];
      for (const s of assigned) {
        expect(["Tue", "Thu"]).toContain(s.day);
      }
    }
    // P10 (加藤 優奈): only Wed or Fri
    for (const c of state.courses.filter((x) => x.professorId === "P10")) {
      const assigned = res.timetable!.byCourse[c.id];
      for (const s of assigned) {
        expect(["Wed", "Fri"]).toContain(s.day);
      }
    }

    // Verify PC lab courses (C05, C06, C12, C19, C20) are strictly assigned to PC labs (R301 or R302)
    for (const cId of ["C05", "C06", "C12", "C19", "C20"]) {
      const assigned = res.timetable!.byCourse[cId];
      expect(assigned.length).toBeGreaterThan(0);
      for (const s of assigned) {
        expect(["R301", "R302"]).toContain(s.roomId);
      }
    }
  }, 30_000);

  it("applies natural-language tool operations (pin slot, consecutive sessions, no-overlap, adjunct afternoon-only) and re-optimizes", async () => {
    const baseState = generateTimetableState();
    const ops = [
      convertToolCallToTimetableOperation(
        {
          tool_name: "pin_course_slot",
          args: { course: "数理最適化", days: ["Tue", "Thu"], periods: [2], room: "101大講義室", isHard: true },
        },
        baseState
      )!,
      convertToolCallToTimetableOperation(
        {
          tool_name: "add_course_relation_rule",
          args: {
            relationKind: "course_consecutive",
            course: "ソフトウェア設計演習",
            isHard: true,
          },
        },
        baseState
      )!,
      convertToolCallToTimetableOperation(
        {
          tool_name: "add_course_relation_rule",
          args: {
            relationKind: "course_no_overlap",
            course: "機械学習",
            secondCourse: "自然言語処理",
            isHard: true,
          },
        },
        baseState
      )!,
      convertToolCallToTimetableOperation(
        {
          tool_name: "set_professor_unavailability",
          args: {
            professor: "小林 拓海",
            days: ["Tue", "Thu"],
            periods: [3, 4, 5],
            exclusiveAvailable: true,
            isHard: true,
          },
        },
        baseState
      )!,
    ];

    const { updatedState, appliedLogs } = applyTimetableChatOperationsToState(baseState, ops);
    expect(appliedLogs.length).toBe(4);

    const res = await solveTimetableWithWashi(updatedState);
    expect(res.status).toBe("Optimal");
    expect(res.validatedByWashi).toBe(true);

    // 1. Verify C15 (数理最適化, 2 sessions/wk) has sessions at both Tue Period 2 and Thu Period 2 in R101
    const c15Sessions = res.timetable!.byCourse["C15"];
    expect(
      c15Sessions.some((s) => s.day === "Tue" && s.period === 2 && s.roomId === "R101")
    ).toBe(true);
    expect(
      c15Sessions.some((s) => s.day === "Thu" && s.period === 2 && s.roomId === "R101")
    ).toBe(true);

    // 2. Verify C12 (ソフトウェア設計演習) has 2 sessions on the same day in consecutive periods
    const c12Sessions = res.timetable!.byCourse["C12"];
    expect(c12Sessions.length).toBe(2);
    expect(c12Sessions[0].day).toBe(c12Sessions[1].day);
    expect(Math.abs(c12Sessions[0].period - c12Sessions[1].period)).toBe(1);

    // 3. Verify P09 (小林) only teaches on Tue/Thu in periods 3, 4, or 5
    for (const cId of ["C18", "C22"]) {
      for (const s of res.timetable!.byCourse[cId]) {
        expect(["Tue", "Thu"]).toContain(s.day);
        expect([3, 4, 5]).toContain(s.period);
      }
    }
  }, 30_000);

  it("diagnoses all 3 conflict scenarios (prof_impossible_day, room_double_book, pc_lab_overload) with HiGHS Elastic Relaxation", async () => {
    const baseState = generateTimetableState();

    for (const scenario of [
      "prof_impossible_day",
      "room_double_book",
      "pc_lab_overload",
    ] as const) {
      const { updatedState } = injectTimetableConflictScenario(baseState, scenario);
      const res = await solveTimetableWithWashi(updatedState);
      expect(res.status).toBe("Infeasible");
      expect(res.conflicts.length).toBeGreaterThan(0);

      const diag = await diagnoseTimetableWithHiGHS(updatedState);
      expect(diag.status).toBe("Unsat");
      expect(diag.conflicts.length).toBeGreaterThan(0);
    }
  }, 30_000);

  it("enforces strict argument fidelity, zero cross-domain side-effects, and honest infeasibility", async () => {
    const baseState = generateTimetableState();
    const snapshotRooms = JSON.stringify(baseState.rooms);
    const snapshotCourses = JSON.stringify(baseState.courses);
    const snapshotProfessors = JSON.stringify(baseState.professors);
    const snapshotConfig = JSON.stringify(baseState.config);

    // 1. Adding custom rules must NEVER mutate rooms, courses, professors, or config
    const ruleOps = [
      convertToolCallToTimetableOperation(
        {
          tool_name: "pin_course_slot",
          args: { course: "C01", days: ["Mon"], periods: [3], room: "R401", isHard: true },
        },
        baseState
      )!,
      convertToolCallToTimetableOperation(
        {
          tool_name: "set_course_room_rule",
          args: { course: "C05", room: "R101", mode: "forbid", isHard: false },
        },
        baseState
      )!,
      convertToolCallToTimetableOperation(
        {
          tool_name: "add_room_closure",
          args: { room: "R202", days: ["Fri"], periods: [4, 5], reason: "機器点検" },
        },
        baseState
      )!,
    ];

    expect(ruleOps[0]).toEqual({
      op: "pin_course_slot",
      courseId: "C01",
      days: ["Mon"],
      periods: [3],
      roomId: "R401",
      isHard: true,
    });
    expect(ruleOps[1]).toEqual({
      op: "set_course_room_rule",
      courseId: "C05",
      roomId: "R101",
      roomType: undefined,
      mode: "forbid",
      isHard: false,
    });

    const { updatedState } = applyTimetableChatOperationsToState(baseState, ruleOps);
    expect(JSON.stringify(updatedState.rooms)).toBe(snapshotRooms);
    expect(JSON.stringify(updatedState.courses)).toBe(snapshotCourses);
    expect(JSON.stringify(updatedState.professors)).toBe(snapshotProfessors);
    expect(JSON.stringify(updatedState.config)).toBe(snapshotConfig);
    // Existing default custom rule is preserved alongside the 3 newly added rules
    expect(updatedState.customRules.length).toBe(baseState.customRules.length + 3);

    // 2. Honest Infeasibility: C01 has 135 students, pinned to R401 (capacity 40) -> Solver must report Infeasible rather than mutating room capacity
    const resInfeasible = await solveTimetableWithWashi(updatedState);
    expect(resInfeasible.status).toBe("Infeasible");
    expect(resInfeasible.conflicts.some((c) => c.name.includes("C01"))).toBe(true);

    // 3. Updating a professor's preference must ONLY mutate that single professor and nothing else
    const profOp = convertToolCallToTimetableOperation(
      {
        tool_name: "set_professor_preference",
        args: { professor: "P03", avoidPeriod1: true, maxSessionsPerDay: 1 },
      },
      baseState
    )!;
    const afterProf = applyTimetableChatOperationsToState(baseState, [profOp]).updatedState;
    expect(JSON.stringify(afterProf.rooms)).toBe(snapshotRooms);
    expect(JSON.stringify(afterProf.courses)).toBe(snapshotCourses);
    expect(JSON.stringify(afterProf.config)).toBe(snapshotConfig);
    expect(afterProf.customRules).toEqual(baseState.customRules);
    for (const p of afterProf.professors) {
      const orig = baseState.professors.find((x) => x.id === p.id)!;
      if (p.id === "P03") {
        expect(p.avoidPeriod1).toBe(true);
        expect(p.maxSessionsPerDay).toBe(1);
        expect(p.unavailableDays).toEqual(orig.unavailableDays);
        expect(p.unavailableSlots).toEqual(orig.unavailableSlots);
      } else {
        expect(p).toEqual(orig);
      }
    }
  }, 30_000);

  it("supports full Japanese, English, and Chinese (ja / en / zh) localization and entity resolution", async () => {
    const state = generateTimetableState();

    // 1. Every course, professor, and room has ja, en, and zh translations
    for (const c of state.courses) {
      expect(COURSE_PROFILE_I18N[c.id]?.ja.title.length).toBeGreaterThan(0);
      expect(COURSE_PROFILE_I18N[c.id]?.en.title.length).toBeGreaterThan(0);
      expect(COURSE_PROFILE_I18N[c.id]?.zh.title.length).toBeGreaterThan(0);
    }
    for (const p of state.professors) {
      expect(PROFESSOR_PROFILE_I18N[p.id]?.ja.name.length).toBeGreaterThan(0);
      expect(PROFESSOR_PROFILE_I18N[p.id]?.en.name.length).toBeGreaterThan(0);
      expect(PROFESSOR_PROFILE_I18N[p.id]?.zh.name.length).toBeGreaterThan(0);
    }
    for (const r of state.rooms) {
      expect(ROOM_PROFILE_I18N[r.id]?.ja.name.length).toBeGreaterThan(0);
      expect(ROOM_PROFILE_I18N[r.id]?.en.name.length).toBeGreaterThan(0);
      expect(ROOM_PROFILE_I18N[r.id]?.zh.name.length).toBeGreaterThan(0);
    }

    // 2. Natural-language entity resolution works in ja, en, and zh
    expect(resolveCourseFromText("Mathematical Optimization", state.courses)?.id).toBe("C15");
    expect(resolveCourseFromText("数学规划与优化", state.courses)?.id).toBe("C15");
    expect(resolveProfessorFromText("Kobayashi", state.professors)?.id).toBe("P09");
    expect(resolveProfessorFromText("铃木", state.professors)?.id).toBe("P02");
    expect(resolveRoomFromText("Hall 101 (Large)", state.rooms)?.id).toBe("R101");
    expect(resolveRoomFromText("301 PC机房A", state.rooms)?.id).toBe("R301");

    expect(
      convertToolCallToTimetableOperation(
        {
          tool_name: "pin_course_slot",
          args: {
            course: "Mathematical Optimization",
            days: ["Tuesday"],
            periods: [2],
            room: "Hall 101 (Large)",
            isHard: true,
          },
        },
        state
      )
    ).toEqual({
      op: "pin_course_slot",
      courseId: "C15",
      days: ["Tue"],
      periods: [2],
      roomId: "R101",
      isHard: true,
    });

    expect(
      convertToolCallToTimetableOperation(
        {
          tool_name: "pin_course_slot",
          args: {
            course: "数学规划与优化",
            days: ["周二"],
            periods: [2],
            room: "101大阶梯教室",
            isHard: true,
          },
        },
        state
      )
    ).toEqual({
      op: "pin_course_slot",
      courseId: "C15",
      days: ["Tue"],
      periods: [2],
      roomId: "R101",
      isHard: true,
    });

    expect(resolveDayToken("Tuesday")).toBe("Tue");
    expect(resolveDayToken("周四")).toBe("Thu");
    expect(resolvePeriodNumbers([5, 3, 4])).toEqual([3, 4, 5]);

    // 3. Rule and conflict formatters localize into ja, en, and zh
    const rule = state.customRules[0];
    expect(rule.kind).toBe("course_precedence");
    expect(formatCustomRuleI18n(rule, state, "en")).toBe(
      'Curriculum Order: Schedule "Prog Lab A (C05)" on the same day or an earlier day than "Prog Lab B (C06)"'
    );
    expect(formatCustomRuleI18n(rule, state, "zh")).toBe(
      "教学顺序约束: 《编程实验A (C05)》必须排在《编程实验B (C06)》之前（或同一天）"
    );
    expect(formatCustomRuleI18n(rule, state, "ja")).toBe(rule.description);

    const { updatedState } = injectTimetableConflictScenario(state, "prof_impossible_day");
    const diag = await diagnoseTimetableWithHiGHS(updatedState);
    expect(diag.conflicts.length).toBeGreaterThan(0);
    for (const lang of ["ja", "en", "zh"] as const) {
      expect(UI_TEXT_I18N[lang].promptChips.length).toBe(8);
      const formatted = formatConstraintMetaI18n(diag.conflicts[0], updatedState, lang);
      expect(formatted.label.length).toBeGreaterThan(0);
    }
  });

  it("rejects out-of-contract tool calls instead of silently substituting defaults (no ad-hoc fallbacks)", () => {
    const state = generateTimetableState();
    const convert = (tool_name: string, args: Record<string, unknown>) =>
      convertToolCallToTimetableOperation({ tool_name, args }, state);

    // Periods / days: no fallback to "all" or "first element"
    expect(resolvePeriodNumbers(undefined)).toBeNull();
    expect(resolvePeriodNumbers([])).toBeNull();
    expect(resolvePeriodNumbers(["P2"])).toBeNull();
    expect(resolvePeriodNumbers([2, 9])).toBeNull();
    expect(resolvePeriodNumbers("afternoon")).toBeNull();
    expect(convert("pin_course_slot", { course: "C15", days: ["Tue"], periods: ["P2"] })).toBeNull();
    expect(convert("pin_course_slot", { course: "C15", days: ["Tue"] })).toBeNull();
    expect(convert("pin_course_slot", { course: "C15", days: ["Someday"], periods: [2] })).toBeNull();
    // Multi-day or multi-period pin is accepted and preserves all specified days/periods
    expect(convert("pin_course_slot", { course: "C15", days: ["Tue", "Thu"], periods: [2] })).toEqual({
      op: "pin_course_slot",
      courseId: "C15",
      days: ["Tue", "Thu"],
      periods: [2],
      roomId: undefined,
      isHard: true,
    });
    expect(convert("pin_course_slot", { course: "C12", days: ["Wed"], periods: [3, 4] })).toEqual({
      op: "pin_course_slot",
      courseId: "C12",
      days: ["Wed"],
      periods: [3, 4],
      roomId: undefined,
      isHard: true,
    });
    expect(convert("forbid_course_slot", { course: "C16", periods: [1] })).toBeNull();
    expect(convert("forbid_course_slot", { course: "C16", days: ["Mon"] })).toBeNull();
    expect(convert("set_professor_unavailability", { professor: "P01", days: ["Fri"] })).toBeNull();
    expect(convert("add_room_closure", { room: "R301", periods: [3] })).toBeNull();

    // Unresolvable optional arguments are not silently dropped
    expect(
      convert("pin_course_slot", { course: "C15", days: ["Tue"], periods: [2], room: "Nowhere Hall" })
    ).toBeNull();

    // Enums: no substitute values
    expect(convert("add_course_relation_rule", { course: "C16", secondCourse: "C17" })).toBeNull();
    expect(
      convert("add_course_relation_rule", { course: "C16", relationKind: "course_no_overlap" })
    ).toBeNull();
    expect(convert("inject_conflict_demo", {})).toBeNull();
    expect(convert("inject_conflict_demo", { scenario: "unknown" })).toBeNull();
    expect(convert("set_course_room_rule", { course: "C05", room: "R301" })).toBeNull();
    expect(
      convert("set_config_param", { paramName: "enforceRoomCapacity", paramValueNumber: 0 })
    ).toBeNull();
    expect(
      convert("set_config_param", { paramName: "maxProfessorSessionsPerDay", paramValueBoolean: true })
    ).toBeNull();
    expect(convert("set_config_param", { paramName: "seed", paramValueNumber: 3 })).toBeNull();
    expect(convert("pin_course_slot", { course: "C15", days: ["Tue"], periods: [2], isHard: "yes" })).toBeNull();

    // Entity resolution: exact match only — a longer name must not resolve to a shorter one
    expect(resolveCourseFromText("数理最適化ゼミ", state.courses)?.id).toBe("C23");
    expect(resolveCourseFromText("数理最適化", state.courses)?.id).toBe("C15");
    expect(resolveCourseFromText("数理最適", state.courses)).toBeNull();
    expect(resolveRoomFromText("Hall 101", state.rooms)).toBeNull();
    expect(resolveProfessorFromText("小林先生", state.professors)?.id).toBe("P09");

    // Valid calls are applied exactly as given
    expect(
      convert("forbid_course_slot", { course: "C16", days: ["Mon", "Fri"], periods: [1, 5], isHard: false })
    ).toEqual({
      op: "forbid_course_slot",
      courseId: "C16",
      days: ["Mon", "Fri"],
      periods: [1, 5],
      isHard: false,
    });
    expect(
      convert("add_room_closure", { room: "R301", days: ["Thu"], periods: [3, 4, 5] })
    ).toEqual({ op: "add_room_closure", roomId: "R301", days: ["Thu"], periods: [3, 4, 5], reason: undefined });
  });

  it("tags custom-rule conflicts with the exact originating rule id", async () => {
    const { updatedState } = injectTimetableConflictScenario(
      generateTimetableState(),
      "room_double_book"
    );
    const res = await solveTimetableWithWashi(updatedState);
    expect(res.status).toBe("Infeasible");
    const ruleIds = new Set(updatedState.customRules.map((r) => r.id));
    for (const c of res.conflicts) {
      if (c.category === "custom") {
        expect(c.relatedRuleId).toBeDefined();
        expect(ruleIds.has(c.relatedRuleId!)).toBe(true);
      }
    }
  }, 30_000);
});
