import { describe, it, expect } from "vitest";
import {
  createBlankTimetableState,
  generateTimetableState,
  injectTimetableConflictScenario,
} from "../examples/web-demo/apps/ai-timetable/generator.js";
import {
  buildTimetableWashiModel,
  computeTimetableDiff,
  diagnoseTimetableWithHiGHS,
  solveTimetableWithWashi,
} from "../examples/web-demo/apps/ai-timetable/solver.js";
import {
  applyTimetableChatOperationsToState,
  buildCompactStateCatalogPrompt,
  buildUltraCompactCatalogPrompt,
  checkGeminiNanoAvailability,
  convertToolCallToTimetableOperation,
  createTimetableGeminiNanoManager,
  repairTruncatedJson,
  resolveCourseFromText,
  resolveProfessorFromText,
  resolveRoomFromText,
} from "../examples/web-demo/apps/ai-timetable/nano-client.js";
import {
  COURSE_PROFILE_I18N,
  PROFESSOR_PROFILE_I18N,
  ROOM_PROFILE_I18N,
  UI_TEXT_I18N,
  detectBrowserTimetableLang,
  formatConstraintMetaI18n,
  formatCustomRuleI18n,
  formatDiffReasonI18n,
  getTimetableLang,
} from "../examples/web-demo/apps/ai-timetable/i18n.js";
import {
  resolveDayToken,
  resolvePeriodNumbers,
} from "../examples/web-demo/apps/ai-timetable/types.js";
import {
  isGeminiNanoVisibleStatus,
  setAiDrawerOpen,
  updateNanoStatusUI,
} from "../examples/web-demo/apps/ai-timetable/main.js";

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

    // Verify student cohort curriculum no-overlap:
    // No cohort should have more than 1 course session in the same slot (day, period)
    const cohortSlots: Record<string, Set<string>> = { Y1: new Set(), Y2: new Set(), Y3: new Set(), Y4: new Set() };
    for (const session of res.timetable!.sessions) {
      const course = state.courses.find((c) => c.id === session.courseId)!;
      for (const cohortId of course.cohorts) {
        const slotKey = `${session.day}_P${session.period}`;
        expect(cohortSlots[cohortId].has(slotKey)).toBe(false);
        cohortSlots[cohortId].add(slotKey);
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
            course: "\u30BD\u30D5\u30C8\u30A6\u30A7\u30A2\u8A2D\u8A08\u6F14\u7FD2",
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

    // 2. Verify C12 (Software Design Lab) has 2 sessions on the same day in consecutive periods
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
    const satDiag = await diagnoseTimetableWithHiGHS(baseState);
    expect(satDiag.status).toBe("Sat");
    expect(satDiag.conflicts).toEqual([]);

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
    expect(formatCustomRuleI18n(rule, state, "ja")).toBe(
      "\u30AB\u30EA\u30AD\u30E5\u30E9\u30E0\u9806\u5E8F: \u300C\u30D7\u30ED\u5165\u9580A (C05)\u300D\u3092\u300C\u30D7\u30ED\u5165\u9580B (C06)\u300D\u3068\u540C\u3058\u66DC\u65E5\u307E\u305F\u306F\u3088\u308A\u524D\u306E\u66DC\u65E5\u306B\u958B\u8B1B"
    );

    const { updatedState } = injectTimetableConflictScenario(state, "prof_impossible_day");
    const diag = await diagnoseTimetableWithHiGHS(updatedState);
    expect(diag.conflicts.length).toBeGreaterThan(0);
    for (const lang of ["ja", "en", "zh"] as const) {
      expect(UI_TEXT_I18N[lang].promptChips.length).toBe(8);
      expect(UI_TEXT_I18N[lang].btnApplyConfigSave.length).toBeGreaterThan(0);
      expect(UI_TEXT_I18N[lang].cfgCohortNoOverlapHtml.length).toBeGreaterThan(0);
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
    expect(resolveCourseFromText("\u6570\u7406\u6700\u9069\u5316\u30BC\u30DF", state.courses)?.id).toBe("C23");
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

  it("handles room-type forbids, collision-free rule IDs, soft professor unavailability, reverse consecutive pairs, and slot-based diff matching", async () => {
    const baseState = generateTimetableState();

    // 1. Multiple custom rules created in the same synchronous call receive unique IDs and pass validateIntegrity()
    const { updatedState: multiRuleState } = applyTimetableChatOperationsToState(baseState, [
      { op: "forbid_course_slot", courseId: "C16", days: ["Mon"], periods: [1], isHard: true },
      { op: "forbid_course_slot", courseId: "C16", days: ["Fri"], periods: [5], isHard: true },
      { op: "set_course_room_rule", courseId: "C15", mode: "forbid", roomType: "seminar_room", isHard: true },
      { op: "set_course_room_rule", courseId: "C15", mode: "forbid", roomType: "pc_lab", isHard: true },
    ]);
    const ruleIds = multiRuleState.customRules.map((r) => r.id);
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
    const builtMulti = buildTimetableWashiModel(multiRuleState);
    expect(() => builtMulti.model.validateIntegrity()).not.toThrow();

    // 2. Room-type forbid (`forbid_room` with `roomType` only) is enforced by the solver
    // C23 (Optimization Seminar, preferredRoomIds: ["R401"] which is seminar_room) is moved out of seminar_room when forbidden
    const { updatedState: forbidTypeState } = applyTimetableChatOperationsToState(baseState, [
      { op: "set_course_room_rule", courseId: "C23", mode: "forbid", roomType: "seminar_room", isHard: true },
    ]);
    const forbidTypeRes = await solveTimetableWithWashi(forbidTypeState);
    expect(forbidTypeRes.status).toBe("Optimal");
    const c23Sessions = forbidTypeRes.timetable!.byCourse["C23"];
    expect(c23Sessions.length).toBe(1);
    const assignedRoom = forbidTypeState.rooms.find((r) => r.id === c23Sessions[0].roomId)!;
    expect(assignedRoom.roomType).not.toBe("seminar_room");

    // 3. Soft professor unavailability (`isHard: false`) adds soft custom rule(s) instead of hard unavailableDays
    const { updatedState: softProfState } = applyTimetableChatOperationsToState(baseState, [
      {
        op: "set_professor_unavailability",
        professorId: "P01",
        days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
        periods: [1, 2, 3, 4, 5],
        exclusiveAvailable: false,
        isHard: false,
      },
    ]);
    const p01After = softProfState.professors.find((p) => p.id === "P01")!;
    const p01Before = baseState.professors.find((p) => p.id === "P01")!;
    expect(p01After.unavailableDays).toEqual(p01Before.unavailableDays);
    expect(p01After.unavailableSlots).toEqual(p01Before.unavailableSlots);
    expect(
      softProfState.customRules.some(
        (r) => r.kind === "forbid_slot" && r.professorId === "P01" && r.isHard === false
      )
    ).toBe(true);
    const softProfRes = await solveTimetableWithWashi(softProfState);
    expect(softProfRes.status).toBe("Optimal");

    // 4. Two-course `course_consecutive` accepts either orientation (Course B at P2 followed by Course A at P3)
    const { updatedState: revConsecState } = applyTimetableChatOperationsToState(baseState, [
      { op: "pin_course_slot", courseId: "C16", days: ["Wed"], periods: [2], isHard: true },
      { op: "pin_course_slot", courseId: "C15", days: ["Wed"], periods: [3], isHard: true },
      {
        op: "add_course_relation_rule",
        kind: "course_consecutive",
        courseId: "C15",
        secondCourseId: "C16",
        isHard: true,
      },
    ]);
    const revConsecRes = await solveTimetableWithWashi(revConsecState);
    expect(revConsecRes.status).toBe("Optimal");
    expect(
      revConsecRes.timetable!.byCourse["C16"].some((s) => s.day === "Wed" && s.period === 2)
    ).toBe(true);
    expect(
      revConsecRes.timetable!.byCourse["C15"].some((s) => s.day === "Wed" && s.period === 3)
    ).toBe(true);

    // 5. `computeTimetableDiff` matches retained sessions by slot rather than list index
    const baseSol = forbidTypeRes.timetable!;
    const c12Prev = baseSol.byCourse["C12"];
    expect(c12Prev.length).toBe(2);
    // Construct two artificial solutions for C12: [Mon P1 R101, Tue P2 R101] -> [Tue P2 R101, Wed P3 R101]
    const prevSol = {
      ...baseSol,
      byCourse: {
        ...baseSol.byCourse,
        C12: [
          { courseId: "C12", sessionIndex: 0, day: "Mon" as const, period: 1 as const, roomId: "R101" },
          { courseId: "C12", sessionIndex: 1, day: "Tue" as const, period: 2 as const, roomId: "R101" },
        ],
      },
    };
    const nextSol = {
      ...baseSol,
      byCourse: {
        ...baseSol.byCourse,
        C12: [
          { courseId: "C12", sessionIndex: 0, day: "Tue" as const, period: 2 as const, roomId: "R101" },
          { courseId: "C12", sessionIndex: 1, day: "Wed" as const, period: 3 as const, roomId: "R101" },
        ],
      },
    };
    const diff = computeTimetableDiff(baseState, prevSol, nextSol)!;
    const c12Changes = diff.changes.filter((ch) => ch.courseId === "C12");
    expect(c12Changes.length).toBe(1);
    expect(c12Changes[0].prevDay).toBe("Mon");
    expect(c12Changes[0].prevPeriod).toBe(1);
    expect(c12Changes[0].nextDay).toBe("Wed");
    expect(c12Changes[0].nextPeriod).toBe(3);

    // 6. Multi-session `course_precedence` requires every scheduled session of C12 to precede or match C15's day
    const { updatedState: badPrecState } = applyTimetableChatOperationsToState(baseState, [
      { op: "pin_course_slot", courseId: "C12", days: ["Mon", "Fri"], periods: [2], isHard: true },
      { op: "pin_course_slot", courseId: "C15", days: ["Thu"], periods: [2], isHard: true },
      {
        op: "add_course_relation_rule",
        kind: "course_precedence",
        courseId: "C12",
        secondCourseId: "C15",
        isHard: true,
      },
    ]);
    const badPrecRes = await solveTimetableWithWashi(badPrecState);
    expect(badPrecRes.status).toBe("Infeasible");
    expect(badPrecRes.rawConflictNames.some((n) => n.startsWith("custom_prec_"))).toBe(true);

    // 7. `streamConsultationReply` produces localized output in `en` and `zh`
    const mgr = createTimetableGeminiNanoManager();
    let enText = "";
    for await (const chunk of mgr.streamConsultationReply(
      "Optimize",
      ["Pinned C15"],
      baseState,
      forbidTypeRes,
      undefined,
      "en"
    )) {
      enText += chunk;
    }
    expect(enText).toContain("[Solve Result]");
    let zhText = "";
    for await (const chunk of mgr.streamConsultationReply(
      "优化",
      ["已固定 C15"],
      baseState,
      forbidTypeRes,
      undefined,
      "zh"
    )) {
      zhText += chunk;
    }
    expect(zhText).toContain("【求解结果】");

    // 8. Hard `set_professor_unavailability` is enforced even when `config.enforceProfessorAvailability` is disabled
    const noProfPolicyState = {
      ...baseState,
      config: {
        ...baseState.config,
        enforceProfessorAvailability: false,
        enforceAdjunctDayRestrictions: false,
      },
    };
    const { updatedState: hardProfState, appliedLogs: enLogs } =
      applyTimetableChatOperationsToState(
        noProfPolicyState,
        [
          {
            op: "set_professor_unavailability",
            professorId: "P01",
            days: ["Mon", "Tue", "Wed", "Thu"],
            periods: [1, 2, 3, 4, 5],
            exclusiveAvailable: false,
            isHard: true,
          },
          {
            op: "pin_course_slot",
            courseId: "C15",
            days: ["Mon"],
            periods: [2],
            isHard: true,
          },
        ],
        "en"
      );
    expect(enLogs[0]).toContain("Marked Mon/Tue/Wed/Thu (All Day) as unavailable (NG)");
    expect(enLogs[1]).toContain('Pin "Mathematical Optimization (C15)" to Mon P2');
    const hardProfRes = await solveTimetableWithWashi(hardProfState);
    expect(hardProfRes.status).toBe("Infeasible");

    // Disabling or removing the custom unavailability rule restores feasibility without stale profile mutations
    const clearedProfState = {
      ...hardProfState,
      customRules: hardProfState.customRules.filter((r) => r.professorId !== "P01"),
    };
    const clearedProfRes = await solveTimetableWithWashi(clearedProfState);
    expect(clearedProfRes.status).toBe("Optimal");

    const { appliedLogs: zhLogs } = applyTimetableChatOperationsToState(
      baseState,
      [{ op: "pin_course_slot", courseId: "C15", days: ["Tue"], periods: [2], isHard: true }],
      "zh"
    );
    expect(zhLogs[0]).toContain("将《数学规划与优化 (C15)》固定在 周二第2节");
  }, 30_000);

  it("supports Chrome 148+ LanguageModel API with supported languages only ([de, en, es, fr, ja]) and requires output language", async () => {
    const prevLM = (globalThis as any).LanguageModel;
    const CHROME_SUPPORTED_LANGUAGES = ["de", "en", "es", "fr", "ja"];

    try {
      const receivedAvailOpts: any[] = [];
      const receivedCreateOpts: any[] = [];
      (globalThis as any).LanguageModel = {
        async availability(opts?: any) {
          receivedAvailOpts.push(opts);
          if (!opts?.expectedOutputs || opts.expectedOutputs.length === 0) {
            throw new Error(
              "No output language was specified in a LanguageModel API request. An output language should be specified to ensure optimal output quality and properly attest to output safety. Please specify a supported output language code: [de, en, es, fr, ja]"
            );
          }
          for (const item of [...(opts.expectedInputs ?? []), ...opts.expectedOutputs]) {
            for (const lang of item.languages ?? []) {
              if (!CHROME_SUPPORTED_LANGUAGES.includes(lang)) {
                throw new Error(
                  `Unsupported LanguageModel API languages were specified (${lang}), and the request was aborted. API calls must only specify supported languages: [de, en, es, fr, ja]`
                );
              }
            }
          }
          return "available";
        },
        async create(opts?: any) {
          if (!opts?.expectedOutputs || opts.expectedOutputs.length === 0) {
            throw new Error(
              "No output language was specified in a LanguageModel API request. An output language should be specified to ensure optimal output quality and properly attest to output safety. Please specify a supported output language code: [de, en, es, fr, ja]"
            );
          }
          for (const item of [...(opts.expectedInputs ?? []), ...opts.expectedOutputs]) {
            for (const lang of item.languages ?? []) {
              if (!CHROME_SUPPORTED_LANGUAGES.includes(lang)) {
                throw new Error(
                  `Unsupported LanguageModel API languages were specified (${lang}), and the request was aborted. API calls must only specify supported languages: [de, en, es, fr, ja]`
                );
              }
            }
          }
          receivedCreateOpts.push(opts);
          return {
            async clone() {
              return this;
            },
            async prompt() {
              return "{}";
            },
            destroy() {},
          };
        },
      };

      // 1. Japanese initialization
      const mgrJa = createTimetableGeminiNanoManager();
      const stJa = await mgrJa.initialize(undefined, "ja");
      expect(stJa).toBe("available");
      expect(receivedCreateOpts.length).toBe(2);
      // Extractor declares Japanese in expectedOutputs to attest replyJa/schema outputs
      expect(receivedCreateOpts[0].expectedOutputs).toEqual([{ type: "text", languages: ["ja", "en"] }]);
      expect(receivedCreateOpts[0].expectedInputs).toEqual([{ type: "text", languages: ["en", "ja"] }]);
      // Consultation session targets Japanese
      expect(receivedCreateOpts[1].expectedOutputs).toEqual([{ type: "text", languages: ["ja"] }]);

      // Language switch: re-initializing with English recreates consult session with English outputs
      const stSwitched = await mgrJa.initialize(undefined, "en");
      expect(stSwitched).toBe("available");
      expect(receivedCreateOpts.length).toBe(3);
      expect(receivedCreateOpts[2].expectedOutputs).toEqual([{ type: "text", languages: ["en"] }]);
      mgrJa.destroy();

      // Retains existing sessions until replacement creation succeeds, but rejects stale sessions for wrong language
      let shouldFailCreate = false;
      let sessionDestroyCount = 0;
      let promptCallCount = 0;
      const mgrRetain = createTimetableGeminiNanoManager();
      const origCreate = (globalThis as any).LanguageModel.create;
      (globalThis as any).LanguageModel.create = async (opts: any) => {
        if (shouldFailCreate) {
          throw new Error("Simulated creation failure during language switch");
        }
        const s = await origCreate(opts);
        const origDestroy = s.destroy;
        const origPrompt = s.prompt;
        s.destroy = () => {
          sessionDestroyCount += 1;
          origDestroy?.call(s);
        };
        s.prompt = async (...args: any[]) => {
          promptCallCount += 1;
          return origPrompt ? origPrompt.apply(s, args) : "{}";
        };
        return s;
      };

      await mgrRetain.initialize(undefined, "ja");
      expect(sessionDestroyCount).toBe(0);

      // Simulate failure on language switch to English
      shouldFailCreate = true;
      const failStatus = await mgrRetain.initialize(undefined, "en");
      expect(failStatus).toBe("unavailable");
      // Old sessions must not be destroyed when creation of replacement rejects
      expect(sessionDestroyCount).toBe(0);

      // Operations in the failed language ("en") must reject or bypass without calling the stale Japanese session
      const sampleState = generateTimetableState();
      await expect(
        mgrRetain.extractPlan("Fix course C01", sampleState, undefined, undefined, "en")
      ).rejects.toThrow();
      expect(promptCallCount).toBe(0);

      // Consultation in the failed language must yield summary without prompting the stale session
      const consultChunks: string[] = [];
      for await (const chunk of mgrRetain.streamConsultationReply(
        "Fix course C01",
        sampleState,
        null,
        undefined,
        "en"
      )) {
        consultChunks.push(chunk);
      }
      expect(promptCallCount).toBe(0);

      (globalThis as any).LanguageModel.create = origCreate;
      mgrRetain.destroy();
      expect(sessionDestroyCount).toBe(2);

      // 2. English initialization
      receivedAvailOpts.length = 0;
      receivedCreateOpts.length = 0;
      const mgrEn = createTimetableGeminiNanoManager();
      const stEn = await mgrEn.initialize(undefined, "en");
      expect(stEn).toBe("available");
      expect(receivedCreateOpts.length).toBe(2);
      expect(receivedCreateOpts[0].expectedOutputs).toEqual([{ type: "text", languages: ["ja", "en"] }]);
      expect(receivedCreateOpts[1].expectedOutputs).toEqual([{ type: "text", languages: ["en"] }]);
      mgrEn.destroy();

      // 3. Languages unsupported by Chrome (e.g. "zh") are honestly reported as unavailable without fake options
      receivedCreateOpts.length = 0;
      const availZh = await checkGeminiNanoAvailability("zh");
      expect(availZh).toBe("unavailable");
      const mgrZh = createTimetableGeminiNanoManager();
      const stZh = await mgrZh.initialize(undefined, "zh");
      expect(stZh).toBe("unavailable");
      expect(receivedCreateOpts.length).toBe(0);
      mgrZh.destroy();

      // 4. Serializes overlapping language-model initialization cleanly
      receivedCreateOpts.length = 0;
      const mgrRace = createTimetableGeminiNanoManager();
      const [raceSt1, raceSt2] = await Promise.all([
        mgrRace.initialize(undefined, "ja"),
        mgrRace.initialize(undefined, "en"),
      ]);
      expect(raceSt2).toBe("available");
      // The final active sessions should be English ("en")
      expect(receivedCreateOpts[receivedCreateOpts.length - 1].expectedOutputs).toEqual([
        { type: "text", languages: ["en"] },
      ]);
      mgrRace.destroy();

      // 5. Does not fall through to optionless availability() when language-specific availability is unavailable
      let optionlessAvailCalled = false;
      const prevAvail = (globalThis as any).LanguageModel.availability;
      (globalThis as any).LanguageModel.availability = async (opts?: any) => {
        if (!opts) {
          optionlessAvailCalled = true;
          return "available";
        }
        return "unavailable";
      };
      const unavailEn = await checkGeminiNanoAvailability("en");
      expect(unavailEn).toBe("unavailable");
      expect(optionlessAvailCalled).toBe(false);
      (globalThis as any).LanguageModel.availability = prevAvail;
    } finally {
      (globalThis as any).LanguageModel = prevLM;
    }
  });

  it("detects default timetable language from browser settings without defaulting to ja", () => {
    // 1. Japanese browser settings -> "ja"
    expect(detectBrowserTimetableLang({ language: "ja-JP" })).toBe("ja");
    expect(detectBrowserTimetableLang({ languages: ["ja", "en-US"] })).toBe("ja");

    // 2. Chinese browser settings -> "zh"
    expect(detectBrowserTimetableLang({ language: "zh-CN" })).toBe("zh");
    expect(detectBrowserTimetableLang({ languages: ["zh-TW", "en"] })).toBe("zh");

    // 3. English or other languages -> defaults to "en", never "ja"
    expect(detectBrowserTimetableLang({ language: "en-US" })).toBe("en");
    expect(detectBrowserTimetableLang({ languages: ["en", "ja"] })).toBe("en");
    expect(detectBrowserTimetableLang({ language: "de-DE" })).toBe("en");
    expect(detectBrowserTimetableLang({ language: "fr-FR" })).toBe("en");
    expect(detectBrowserTimetableLang({ languages: [] })).toBe("en");
    expect(detectBrowserTimetableLang({})).toBe("en");
  });

  it("recovers gracefully from LLM output limits truncation and repairs truncated JSON", async () => {
    // 1. repairTruncatedJson handles valid JSON untouched
    expect(repairTruncatedJson('{"intentType":"modify_and_solve","toolCalls":[]}')).toBe(
      '{"intentType":"modify_and_solve","toolCalls":[]}'
    );
    expect(repairTruncatedJson("")).toBe("{}");
    expect(repairTruncatedJson("   ")).toBe("{}");

    // 2. repairTruncatedJson repairs unclosed string inside object
    const unclosedStr = '{"thought":"Prof Sato Mon';
    const repStr = repairTruncatedJson(unclosedStr);
    expect(() => JSON.parse(repStr)).not.toThrow();
    expect(JSON.parse(repStr).thought).toBe("Prof Sato Mon");

    // 3. repairTruncatedJson repairs truncated nested arrays and objects
    const truncatedNested =
      '{"intentType":"modify_and_solve","toolCalls":[{"tool_name":"set_professor_unavailability","args":{"professor":"P01","days":["Mon"]';
    const repNested = repairTruncatedJson(truncatedNested);
    expect(() => JSON.parse(repNested)).not.toThrow();
    const parsedNested = JSON.parse(repNested);
    expect(parsedNested.intentType).toBe("modify_and_solve");
    expect(parsedNested.toolCalls[0].tool_name).toBe("set_professor_unavailability");
    expect(parsedNested.toolCalls[0].args.professor).toBe("P01");
    expect(parsedNested.toolCalls[0].args.days).toEqual(["Mon"]);

    // 4. repairTruncatedJson repairs trailing comma and trailing colon
    expect(() => JSON.parse(repairTruncatedJson('{"tool_name":'))).not.toThrow();
    expect(() => JSON.parse(repairTruncatedJson('{"intentType":"consult_only",'))).not.toThrow();

    // 5. buildCompactStateCatalogPrompt and buildUltraCompactCatalogPrompt
    const state = generateTimetableState();
    const compactPrompt = buildCompactStateCatalogPrompt(state);
    expect(compactPrompt).toContain("C01:Intro to Computer Science");
    expect(compactPrompt).not.toContain("enrollment"); // Pruned to save tokens
    expect(compactPrompt).toContain("P01:Kenichi Sato");
    expect(compactPrompt).toContain("R101:101 Large Lecture Hall");

    const ultraCompactPrompt = buildUltraCompactCatalogPrompt(state);
    expect(ultraCompactPrompt).toContain("C01:Intro to Computer Science(P07)");
    expect(ultraCompactPrompt).not.toContain("Current Configuration"); // Omitted in ultra-compact retry

    // Empty state (blank slate) produces clean placeholders
    const blankState = { ...state, courses: [], professors: [], rooms: [] };
    expect(buildCompactStateCatalogPrompt(blankState)).toContain("[Courses] (None)");
    expect(buildUltraCompactCatalogPrompt(blankState)).toContain("[Courses] (None)");

    // 6. extractPlan recovers when prompt() throws output limits exceeded error
    const prevLM = (globalThis as any).LanguageModel;
    try {
      let promptCallCount = 0;
      const promptsReceived: string[] = [];
      (globalThis as any).LanguageModel = {
        async availability() {
          return "available";
        },
        async create() {
          return {
            async clone() {
              return {
                async prompt(promptText: string) {
                  promptCallCount += 1;
                  promptsReceived.push(promptText);
                  if (promptCallCount === 1) {
                    throw new Error("The response exceeded output limits and was truncated.");
                  }
                  return JSON.stringify({
                    intentType: "modify_and_solve",
                    toolCalls: [
                      {
                        tool_name: "set_professor_unavailability",
                        args: {
                          professor: "P01",
                          days: ["Mon"],
                          periods: [1, 2, 3, 4, 5],
                          exclusiveAvailable: false,
                          isHard: true,
                        },
                      },
                    ],
                  });
                },
                destroy() {},
              };
            },
            destroy() {},
          };
        },
      };

      const mgr = createTimetableGeminiNanoManager();
      await mgr.initialize(undefined, "en");
      const plan = await mgr.extractPlan("Prof Sato unavailable Mon", state, undefined, undefined, "en");

      // Verify that retry occurred with ultra-compact prompt
      expect(promptCallCount).toBe(2);
      expect(promptsReceived[0]).toContain("Prof:P07"); // Initial compact prompt
      expect(promptsReceived[1]).toContain("C01:Intro to Computer Science(P07)"); // Ultra-compact retry prompt
      expect(plan.operations.length).toBe(1);
      expect(plan.operations[0].op).toBe("set_professor_unavailability");
      mgr.destroy();
    } finally {
      (globalThis as any).LanguageModel = prevLM;
    }
  });

  test("supports multi-step onboarding workflow: blank state -> master data inspection -> solve -> AI refinement", async () => {
    const {
      getAppState,
      getCurrentTimetable,
      handleClearToBlank,
      handleGenerateSample,
      readConfigFromForm,
      triggerSolve,
      updateToolbarButtonsState,
      switchTab,
    } = await import("../examples/web-demo/apps/ai-timetable/main.js");

    // Setup lightweight mock DOM document to drive UI buttons and form synchronization
    const elements = new Map<string, any>();
    const createMockElement = (id = "", initialProps: Record<string, any> = {}) => {
      const listeners: Record<string, ((e?: any) => void)[]> = {};
      return {
        id,
        disabled: false,
        hidden: false,
        value: "",
        checked: false,
        textContent: "",
        title: "",
        className: "",
        innerHTML: "",
        style: {} as Record<string, string>,
        children: [],
        options: [],
        listeners,
        click() {
          listeners["click"]?.forEach((fn) => fn());
        },
        addEventListener(evt: string, fn: (e?: any) => void) {
          listeners[evt] = listeners[evt] || [];
          listeners[evt].push(fn);
        },
        setAttribute: () => {},
        getAttribute: () => null,
        appendChild: () => {},
        append: () => {},
        prepend: () => {},
        remove: () => {},
        replaceChildren: () => {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
        dataset: {},
        ...initialProps,
      };
    };
    const registerMock = (id: string, initialProps: Record<string, any> = {}) => {
      const el = createMockElement(id, initialProps);
      elements.set(id, el);
      return el;
    };

    const btnSolve = registerMock("btn-solve-washi");
    const btnCheck = registerMock("btn-check-current");
    const btnExport = registerMock("btn-export-csvs");
    const btnClear = registerMock("btn-clear-blank");
    const btnReset = registerMock("btn-reset-clean");
    const tutBanner = registerMock("tutorial-banner");
    registerMock("kpi-status-badge");
    registerMock("kpi-summary-text");
    registerMock("kpi-solve-time");
    registerMock("conflict-alert");
    registerMock("btn-abort-solve");
    registerMock("timetable-empty-state");
    registerMock("btn-tut-step1");
    registerMock("btn-tut-step2");
    registerMock("btn-tut-step3");

    // Form inputs for Step 2
    const cfgCapacity = registerMock("cfg-enforceRoomCapacity", { checked: true });
    const cfgEquipment = registerMock("cfg-enforceRoomEquipment", { checked: true });
    registerMock("cfg-enforceCohortNoOverlap", { checked: true });
    registerMock("cfg-forbidSameCourseSameDay", { checked: true });
    registerMock("cfg-enforceAdjunctDayRestrictions", { checked: true });
    registerMock("cfg-enforceProfessorAvailability", { checked: true });
    registerMock("cfg-enforceMaxConsecutivePeriods", { checked: true });
    registerMock("cfg-maxProfessorConsecutivePeriods", { value: "2" });
    const cfgSessionsPerDay = registerMock("cfg-maxProfessorSessionsPerDay", { value: "3" });
    registerMock("cfg-maxCohortCompulsoryPerDay", { value: "4" });
    registerMock("cfg-weightCohortIdleGaps", { value: "25" });

    const prevDoc = (globalThis as any).document;
    (globalThis as any).document = {
      getElementById: (id: string) => {
        if (!elements.has(id)) {
          registerMock(id);
        }
        return elements.get(id);
      },
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: (tag: string) => createMockElement(`tag_${tag}`),
      createTextNode: (text: string) => createMockElement("text", { textContent: text }),
    };

    try {
      // 1. Initial blank slate: start fresh via UI handler
      handleClearToBlank(true);
      const blank = getAppState();
      expect(blank.courses).toHaveLength(0);
      expect(blank.professors).toHaveLength(0);
      expect(blank.rooms).toHaveLength(0);
      expect(getCurrentTimetable()).toBeNull();

      // Master data catalog on blank state: red prominent button and empty counts
      const catGenBtn = elements.get("btn-cat-generate-sample");
      expect(catGenBtn.className).toBe("btn-solve-primary");
      expect(catGenBtn.textContent).toContain("Sample Data");
      expect(elements.get("btn-cat-clear-blank").hidden).toBe(true);
      expect(elements.get("tutorial-banner").hidden).toBe(false);
      expect(elements.get("cat-prof-title").textContent).toContain("0");

      updateToolbarButtonsState();
      expect(btnSolve.disabled).toBe(true);
      expect(btnCheck.disabled).toBe(true);
      expect(btnClear.disabled).toBe(true);

      // 2. Step 1: Loading sample data via handler populates master data WITHOUT auto-solving
      handleGenerateSample(false);
      const loaded = getAppState();
      expect(loaded.professors).toHaveLength(10);
      expect(loaded.rooms).toHaveLength(7);
      expect(loaded.courses).toHaveLength(25);
      const totalSessions = loaded.courses.reduce((sum, c) => sum + c.sessionsPerWeek, 0);
      expect(totalSessions).toBe(30);

      // Catalog view updates after sample generation: normal outline button, clear button shown, 10 professors
      expect(catGenBtn.className).toBe("btn-toolbar-outline");
      expect(catGenBtn.textContent).toContain("Regenerate");
      expect(elements.get("btn-cat-clear-blank").hidden).toBe(false);
      expect(elements.get("tutorial-banner").hidden).toBe(false);
      expect(elements.get("cat-prof-title").textContent).toContain("10");

      // Verify that sample generation does NOT auto-solve: timetable must remain unscheduled (null)
      expect(getCurrentTimetable()).toBeNull();

      // Verify switchTab correctly activates the "catalog" tab and hides other panels
      switchTab("catalog");
      expect(elements.get("tab-panel-catalog").hidden).toBe(false);
      expect(elements.get("tab-panel-timetable").hidden).toBe(true);
      expect(elements.get("tab-panel-constraints").hidden).toBe(true);

      updateToolbarButtonsState();
      expect(btnSolve.disabled).toBe(false);
      expect(btnCheck.disabled).toBe(false);

      // 3. Step 2: Modifying configuration inputs and verifying readConfigFromForm() synchronization
      cfgEquipment.checked = false;
      cfgSessionsPerDay.value = "2";
      readConfigFromForm();
      expect(getAppState().config.enforceRoomEquipment).toBe(false);
      expect(getAppState().config.maxProfessorSessionsPerDay).toBe(2);

      // Restore setting for optimal solve
      cfgEquipment.checked = true;
      readConfigFromForm();
      expect(getAppState().config.enforceRoomEquipment).toBe(true);

      // 4. Multi-language UI text integrity for catalog management and step progression
      for (const lang of ["ja", "en", "zh"] as const) {
        const ui = UI_TEXT_I18N[lang];
        expect(ui.catEmptyTitle.length).toBeGreaterThan(0);
        expect(ui.catEmptyDesc.length).toBeGreaterThan(0);
        expect(ui.catEmptyGenMain.length).toBeGreaterThan(0);
        expect(ui.catEmptyGenSub.length).toBeGreaterThan(0);
        expect(ui.catEmptyImportMain.length).toBeGreaterThan(0);
        expect(ui.catEmptyImportSub.length).toBeGreaterThan(0);
        expect(ui.catEmptySamplesBtn.length).toBeGreaterThan(0);
        expect(ui.step1Badge).toBe("STEP 1");
        expect(ui.step2Badge).toBe("STEP 2");
        expect(ui.step3Badge).toBe("STEP 3");
        expect(ui.catMgmtTitle.length).toBeGreaterThan(0);
        expect(ui.catMgmtDesc.length).toBeGreaterThan(0);
        expect(ui.btnCatGenerate.length).toBeGreaterThan(0);
        expect(ui.btnCatImportCsv.length).toBeGreaterThan(0);
        expect(ui.chatWelcomeMarkdown.length).toBeGreaterThan(0);
      }
      expect(UI_TEXT_I18N.ja.chatWelcomeMarkdown).not.toContain("\u6642\u9593\u5272\u3092\u521D\u671F\u7DE8\u6210\u3057\u307E\u3059");
      expect(UI_TEXT_I18N.ja.chatWelcomeMarkdown).toContain("\u6642\u9593\u5272\u30DC\u30FC\u30C9");

      // 5. Step 3: Triggering solve transitions state from unscheduled (null) to scheduled (Optimal)
      const outcome = await triggerSolve();
      expect(outcome).not.toBeNull();
      expect(outcome?.status).toBe("Optimal");
      expect(getCurrentTimetable()).not.toBeNull();
      expect(getCurrentTimetable()?.sessions).toHaveLength(30);
      expect(outcome?.conflicts).toHaveLength(0);

      // 6. Confirmation safety: click events and non-boolean arguments must NOT bypass confirm dialog
      let confirmResult = false;
      let confirmCallCount = 0;
      (globalThis as any).confirm = (_msg: string) => {
        confirmCallCount++;
        return confirmResult;
      };

      // Verify state currently has courses loaded
      expect(getAppState().courses.length).toBeGreaterThan(0);

      // When called with MouseEvent-like object (as passed by addEventListener directly), confirm must be prompted
      handleClearToBlank({ type: "click" } as any);
      expect(confirmCallCount).toBe(1);
      expect(getAppState().courses.length).toBeGreaterThan(0); // not cleared because confirm returned false

      // When called without arguments, confirm must also be prompted
      handleClearToBlank();
      expect(confirmCallCount).toBe(2);
      expect(getAppState().courses.length).toBeGreaterThan(0);

      // When confirm returns true, clear proceeds
      confirmResult = true;
      handleClearToBlank();
      expect(confirmCallCount).toBe(3);
      expect(getAppState().courses).toHaveLength(0);
    } finally {
      if (prevDoc === undefined) delete (globalThis as any).document;
      else (globalThis as any).document = prevDoc;
      delete (globalThis as any).confirm;
    }
  });

  test("supports drag-and-drop pinning and re-optimization across timetable slots", async () => {
    const {
      getAppState,
      getCurrentTimetable,
      handleGenerateSample,
      applyDropMove,
      triggerSolve,
    } = await import("../examples/web-demo/apps/ai-timetable/main.js");

    const elements = new Map<string, any>();
    const createMockElement = (id = "", initialProps: Record<string, any> = {}) => {
      const listeners: Record<string, ((e?: any) => void)[]> = {};
      return {
        id,
        disabled: false,
        hidden: false,
        value: "",
        checked: false,
        textContent: "",
        title: "",
        className: "",
        innerHTML: "",
        style: {} as Record<string, string>,
        children: [],
        options: [],
        listeners,
        click() {
          listeners["click"]?.forEach((fn) => fn());
        },
        addEventListener(evt: string, fn: (e?: any) => void) {
          listeners[evt] = listeners[evt] || [];
          listeners[evt].push(fn);
        },
        setAttribute: () => {},
        getAttribute: () => null,
        appendChild: () => {},
        append: () => {},
        prepend: () => {},
        remove: () => {},
        replaceChildren: () => {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
        dataset: {},
        ...initialProps,
      };
    };
    const registerMock = (id: string, initialProps: Record<string, any> = {}) => {
      const el = createMockElement(id, initialProps);
      elements.set(id, el);
      return el;
    };

    registerMock("kpi-status-badge");
    registerMock("kpi-summary-text");
    registerMock("kpi-solve-time");
    registerMock("conflict-alert");
    registerMock("btn-abort-solve");
    registerMock("chat-messages");
    registerMock("view-cohorts-grid");
    registerMock("view-matrix-wrap");
    registerMock("chk-highlight-diff", { checked: false });
    registerMock("matrix-25-thead");
    registerMock("matrix-25-tbody");
    registerMock("matrix-25-tfoot");

    const prevDoc = (globalThis as any).document;
    (globalThis as any).document = {
      getElementById: (id: string) => {
        if (!elements.has(id)) {
          registerMock(id);
        }
        return elements.get(id);
      },
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: (tag: string) => createMockElement(`tag_${tag}`),
      createTextNode: (text: string) => createMockElement("text", { textContent: text }),
    };

    try {
      // 1. Generate sample and solve initial timetable
      handleGenerateSample(false);
      const initialOutcome = await triggerSolve();
      expect(initialOutcome?.status).toBe("Optimal");
      const tt1 = getCurrentTimetable()!;
      expect(tt1).not.toBeNull();

      // Pick a single-session course (e.g. C01)
      const c01Session = tt1.sessions.find((s) => s.courseId === "C01")!;
      expect(c01Session).toBeDefined();
      const origDay = c01Session.day;
      const origPeriod = c01Session.period;

      // Choose a different target slot
      const targetDay: typeof origDay = origDay === "Mon" ? "Wed" : "Mon";
      const targetPeriod: typeof origPeriod = origPeriod === 1 ? 3 : 1;

      // 2. Perform drag-and-drop move
      await applyDropMove(
        {
          courseId: "C01",
          sessionIndex: c01Session.sessionIndex,
          fromDay: origDay,
          fromPeriod: origPeriod,
          fromRoomId: c01Session.roomId,
          fromProfId: "P07",
          sourceView: "cohorts_4",
        },
        targetDay,
        targetPeriod
      );

      // Verify custom rule was added
      const stateAfterMove1 = getAppState();
      const pinRule1 = stateAfterMove1.customRules.find(
        (r) => r.kind === "pin_slot" && r.courseId === "C01"
      );
      expect(pinRule1).toBeDefined();
      expect(pinRule1?.days).toEqual([targetDay]);
      expect(pinRule1?.periods).toEqual([targetPeriod]);

      // Verify timetable was re-optimized and C01 is at the target slot
      const tt2 = getCurrentTimetable()!;
      expect(tt2).not.toBeNull();
      const movedC01 = tt2.sessions.find((s) => s.courseId === "C01")!;
      expect(movedC01.day).toBe(targetDay);
      expect(movedC01.period).toBe(targetPeriod);

      // 3. Move it again to a third slot: verify old pin is replaced rather than causing double-pin conflicts
      const thirdDay: typeof origDay = "Fri";
      const thirdPeriod: typeof origPeriod = 4;
      await applyDropMove(
        {
          courseId: "C01",
          sessionIndex: movedC01.sessionIndex,
          fromDay: targetDay,
          fromPeriod: targetPeriod,
          fromRoomId: movedC01.roomId,
          fromProfId: "P07",
          sourceView: "cohorts_4",
        },
        thirdDay,
        thirdPeriod
      );

      const stateAfterMove2 = getAppState();
      const c01Pins = stateAfterMove2.customRules.filter(
        (r) => r.kind === "pin_slot" && r.courseId === "C01"
      );
      expect(c01Pins).toHaveLength(1);
      expect(c01Pins[0].days).toEqual([thirdDay]);
      expect(c01Pins[0].periods).toEqual([thirdPeriod]);

      const tt3 = getCurrentTimetable()!;
      const thirdC01 = tt3.sessions.find((s) => s.courseId === "C01")!;
      expect(thirdC01.day).toBe(thirdDay);
      expect(thirdC01.period).toBe(thirdPeriod);

      // 4. Room matrix drag-and-drop: move to specific room R101 (large hall) and slot
      const r101RoomId = "R101";
      await applyDropMove(
        {
          courseId: "C01",
          sessionIndex: thirdC01.sessionIndex,
          fromDay: thirdDay,
          fromPeriod: thirdPeriod,
          fromRoomId: thirdC01.roomId,
          fromProfId: "P07",
          sourceView: "rooms_matrix",
        },
        "Mon",
        2,
        r101RoomId
      );

      const stateAfterMove3 = getAppState();
      const roomPin = stateAfterMove3.customRules.find(
        (r) => r.kind === "pin_slot" && r.courseId === "C01"
      );
      expect(roomPin).toBeDefined();
      expect(roomPin?.roomId).toBe(r101RoomId);
      expect(roomPin?.days).toEqual(["Mon"]);
      expect(roomPin?.periods).toEqual([2]);

      const tt4 = getCurrentTimetable()!;
      const r101C01 = tt4.sessions.find((s) => s.courseId === "C01")!;
      expect(r101C01.day).toBe("Mon");
      expect(r101C01.period).toBe(2);
      expect(r101C01.roomId).toBe(r101RoomId);

      // 5. Multi-session course: move 1 session of C02 (sessionsPerWeek = 2) without removing the other
      const c02Sessions = tt4.sessions.filter((s) => s.courseId === "C02");
      expect(c02Sessions).toHaveLength(2);
      const sessionToMove = c02Sessions[0];
      const otherSession = c02Sessions[1];

      // Pick target day not colliding with otherSession's day
      const targetDaysAvailable = (["Tue", "Wed", "Thu", "Fri"] as const).filter(
        (d) => d !== otherSession.day && d !== sessionToMove.day
      );
      const c02TargetDay = targetDaysAvailable[0];

      await applyDropMove(
        {
          courseId: "C02",
          sessionIndex: sessionToMove.sessionIndex,
          fromDay: sessionToMove.day,
          fromPeriod: sessionToMove.period,
          fromRoomId: sessionToMove.roomId,
          fromProfId: "P01",
          sourceView: "cohorts_4",
        },
        c02TargetDay,
        3
      );

      const tt5 = getCurrentTimetable()!;
      const c02SessionsAfter = tt5.sessions.filter((s) => s.courseId === "C02");
      expect(c02SessionsAfter).toHaveLength(2);
      const hasSessionOnTargetDay = c02SessionsAfter.some(
        (s) => s.day === c02TargetDay && s.period === 3
      );
      expect(hasSessionOnTargetDay).toBe(true);

      // 6. When enforceProfessorAvailability is disabled, professor unavailable slots are not blocked
      const stateForRelaxedAvail = getAppState();
      stateForRelaxedAvail.config.enforceProfessorAvailability = false;

      // P01 has Wed P5 as unavailable slot in master profile
      const p01Session = tt5.sessions.find((s) => s.courseId === "C02" && s.day === c02TargetDay)!;
      await applyDropMove(
        {
          courseId: "C02",
          sessionIndex: p01Session.sessionIndex,
          fromDay: p01Session.day,
          fromPeriod: p01Session.period,
          fromRoomId: p01Session.roomId,
          fromProfId: "P01",
          sourceView: "professors_matrix",
        },
        "Wed",
        5
      );

      const tt6 = getCurrentTimetable()!;
      const c02AtWedP5 = tt6.sessions.find((s) => s.courseId === "C02" && s.day === "Wed" && s.period === 5);
      expect(c02AtWedP5).toBeDefined();

      // 7. Composite multi-day pin rule decomposition & unpinning
      // Create a composite rule pinning C02 to both Tue and Thu at period 2
      const compositeRuleId = "composite_pin_c02_tue_thu";
      getAppState().customRules = getAppState().customRules.filter((r) => r.courseId !== "C02");
      getAppState().customRules.push({
        id: compositeRuleId,
        kind: "pin_slot",
        enabled: true,
        isHard: true,
        courseId: "C02",
        days: ["Tue", "Thu"],
        periods: [2],
        description: "Composite pin C02 on Tue/Thu P2",
      });

      // Move the Tuesday session of C02 to Fri P2
      await applyDropMove(
        {
          courseId: "C02",
          sessionIndex: 0,
          fromDay: "Tue",
          fromPeriod: 2,
          fromRoomId: "R101",
          fromProfId: "P01",
          sourceView: "cohorts_4",
        },
        "Fri",
        2
      );

      const rulesAfterCompositeMove = getAppState().customRules.filter((r) => r.courseId === "C02");
      // The composite rule should now have only ["Thu"] remaining
      const retainedCompositeRule = rulesAfterCompositeMove.find((r) => r.id === compositeRuleId);
      expect(retainedCompositeRule).toBeDefined();
      expect(retainedCompositeRule?.days).toEqual(["Thu"]);
      expect(retainedCompositeRule?.periods).toEqual([2]);

      // A new pin rule should exist for Fri P2
      const newFriPinRule = rulesAfterCompositeMove.find(
        (r) => r.days?.includes("Fri") && r.periods?.includes(2)
      );
      expect(newFriPinRule).toBeDefined();

      // 8. Prevent duplicate pin rule accumulation when dropping on the same target slot
      const initialFriRulesCount = rulesAfterCompositeMove.filter(
        (r) => r.days?.includes("Fri") && r.periods?.includes(2)
      ).length;
      expect(initialFriRulesCount).toBe(1);

      // Trigger another drop to Fri P2 from Thu P2 (with different room or re-application)
      await applyDropMove(
        {
          courseId: "C02",
          sessionIndex: 0,
          fromDay: "Thu",
          fromPeriod: 2,
          fromRoomId: "R101",
          fromProfId: "P01",
          sourceView: "cohorts_4",
        },
        "Fri",
        2
      );
      const friRulesAfterReapply = getAppState().customRules.filter(
        (r) => r.courseId === "C02" && r.days?.includes("Fri") && r.periods?.includes(2)
      );
      expect(friRulesAfterReapply).toHaveLength(1);

      // 9. Infeasible DnD Move: Attempt to move adjunct professor's course to an unavailable day
      // P09 (Takumi Kobayashi, Adjunct) is unavailable on Mon, Wed, Fri.
      getAppState().config.enforceAdjunctDayRestrictions = true;
      const rulesBeforeInfeasibleMove = [...getAppState().customRules];
      const ttBeforeInfeasibleMove = getCurrentTimetable()!;
      const c18Before = ttBeforeInfeasibleMove.sessions.find((s) => s.courseId === "C18")!;

      await applyDropMove(
        {
          courseId: "C18",
          sessionIndex: c18Before.sessionIndex,
          fromDay: c18Before.day,
          fromPeriod: c18Before.period,
          fromRoomId: c18Before.roomId,
          fromProfId: "P09",
          sourceView: "cohorts_4",
        },
        "Mon",
        3
      );

      // Verify timetable was reverted to previous state
      const ttAfterInfeasibleMove = getCurrentTimetable()!;
      const c18After = ttAfterInfeasibleMove.sessions.find((s) => s.courseId === "C18")!;
      expect(c18After.day).toBe(c18Before.day);
      expect(c18After.period).toBe(c18Before.period);

      // Verify the added "pin to Mon P3" rule was removed / rolled back
      const rulesAfterInfeasibleMove = getAppState().customRules;
      const monPinRule = rulesAfterInfeasibleMove.find(
        (r) => r.kind === "pin_slot" && r.courseId === "C18" && r.days?.includes("Mon")
      );
      expect(monPinRule).toBeUndefined();
      expect(rulesAfterInfeasibleMove.length).toBe(rulesBeforeInfeasibleMove.length);
    } finally {
      if (prevDoc === undefined) delete (globalThis as any).document;
      else (globalThis as any).document = prevDoc;
    }
  }, 30_000);

  test("starts with default master data, empty timetable on first view, and solves via triggerSolve (nurse shift demo parity)", async () => {
    const {
      getAppState,
      getCurrentTimetable,
      triggerSolve,
      handleGenerateSample,
    } = await import("../examples/web-demo/apps/ai-timetable/main.js");

    const elements = new Map<string, any>();
    const createMockElement = (id = "", initialProps: Record<string, any> = {}) => {
      const listeners: Record<string, ((e?: any) => void)[]> = {};
      return {
        id,
        disabled: false,
        hidden: false,
        value: "",
        checked: false,
        textContent: "",
        title: "",
        className: "",
        innerHTML: "",
        style: {} as Record<string, string>,
        children: [],
        options: [],
        listeners,
        click() {
          listeners["click"]?.forEach((fn) => fn());
        },
        addEventListener(evt: string, fn: (e?: any) => void) {
          listeners[evt] = listeners[evt] || [];
          listeners[evt].push(fn);
        },
        setAttribute: () => {},
        getAttribute: () => null,
        appendChild: () => {},
        append: () => {},
        prepend: () => {},
        remove: () => {},
        replaceChildren: () => {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
        dataset: {},
        ...initialProps,
      };
    };

    const registerMock = (id: string, initialProps: Record<string, any> = {}) => {
      const el = createMockElement(id, initialProps);
      elements.set(id, el);
      return el;
    };

    const btnSolve = registerMock("btn-solve-washi");
    registerMock("btn-check-current");
    registerMock("btn-reset-clean");
    registerMock("btn-tut-step1");
    registerMock("btn-tut-step2");
    registerMock("btn-tut-step3");
    registerMock("btn-tut-step4");
    registerMock("kpi-status-badge");
    registerMock("kpi-summary-text");
    registerMock("kpi-solve-time");
    registerMock("conflict-alert");
    registerMock("btn-abort-solve");
    registerMock("chat-messages");
    registerMock("view-cohorts-grid");
    registerMock("view-matrix-wrap");
    registerMock("chk-highlight-diff", { checked: false });
    registerMock("empty-timetable-state", { hidden: true });

    const prevDoc = (globalThis as any).document;
    (globalThis as any).document = {
      getElementById: (id: string) => {
        if (!elements.has(id)) {
          registerMock(id);
        }
        return elements.get(id);
      },
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: (tag: string) => createMockElement(`tag_${tag}`),
      createTextNode: (text: string) => createMockElement("text", { textContent: text }),
    };

    try {
      // Reset to default initial state (generateTimetableState) with null timetable
      handleGenerateSample(false);

      const state = getAppState();
      // 1. Default data is present on first view
      expect(state.professors.length).toBeGreaterThan(0);
      expect(state.rooms.length).toBeGreaterThan(0);
      expect(state.courses.length).toBeGreaterThan(0);

      // 2. Timetable solution is empty (null) on first view
      expect(getCurrentTimetable()).toBeNull();

      // empty-timetable-state welcome banner is hidden because baseline data is loaded
      const emptyEl = elements.get("empty-timetable-state");
      expect(emptyEl.hidden).toBe(true);

      // Solve button text indicates initial scheduling on unscheduled board
      const btnSolveEl = elements.get("btn-solve-washi");
      expect(btnSolveEl.textContent).toMatch(/自動編成|Auto-Schedule|自动编排/);

      // 3. Clicking solve button triggers optimization and generates timetable
      const outcome = await triggerSolve();
      expect(outcome?.status).toBe("Optimal");
      expect(getCurrentTimetable()).not.toBeNull();
      expect(getCurrentTimetable()?.sessions.length).toBeGreaterThan(0);

      // 4. After solve, button text transitions to re-optimization
      expect(btnSolveEl.textContent).toMatch(/再編成|Re-Optimize|重新优化/);
    } finally {
      if (prevDoc === undefined) delete (globalThis as any).document;
      else (globalThis as any).document = prevDoc;
    }
  }, 30_000);

  it("enforces user-specified weight hierarchy: slot displacement (10) dominates idle gaps (2), and diagnoses diff reasons", async () => {
    const state = generateTimetableState();
    // 1. Verify default weight hierarchy
    expect(state.config.weightAvoidPeriod1).toBe(1);
    expect(state.config.weightAvoidPeriod5).toBe(1);
    expect(state.config.weightRoomFit).toBe(1);
    expect(state.config.weightCohortIdleGaps).toBe(2);
    expect(state.config.weightPerturbationSlot).toBe(10);
    expect(state.config.weightPerturbationRoom).toBe(3);

    // Initial baseline solve
    const baseOutcome = await solveTimetableWithWashi(state);
    expect(baseOutcome.status).toBe("Optimal");
    const baseTt = baseOutcome.timetable!;

    const c02Base = baseTt.byCourse["C02"][0];
    const c07Base = baseTt.byCourse["C07"][0];
    const c21Base = baseTt.byCourse["C21"][0];

    // C07 and C21 are both taught by adjunct Professor P10
    const c07 = state.courses.find((c) => c.id === "C07")!;
    const c21 = state.courses.find((c) => c.id === "C21")!;
    expect(c07.professorId).toBe("P10");
    expect(c21.professorId).toBe("P10");

    // Pin C07 to the slot currently occupied by C21
    // This creates a hard professor conflict because P10 cannot teach both simultaneously
    const pinRule = {
      id: "rule_pin_c07_to_c21_slot",
      kind: "pin_slot" as const,
      enabled: true,
      isHard: true,
      courseId: "C07",
      days: [c21Base.day],
      periods: [c21Base.period],
      description: `Pin C07 to ${c21Base.day} P${c21Base.period}`,
    };
    const fineTuneState = {
      ...state,
      customRules: [...state.customRules, pinRule],
    };

    const reSolveOutcome = await solveTimetableWithWashi(fineTuneState, {
      referenceTimetable: baseTt,
    });
    expect(reSolveOutcome.status).toBe("Optimal");
    const nextTt = reSolveOutcome.timetable!;
    const diff = reSolveOutcome.diffFromPrevious!;
    expect(diff).toBeDefined();

    // With new weights (slot displacement 10 > idle gap 2), unrelated courses like C02
    // MUST remain rock solid at their previous slot!
    const c02Next = nextTt.byCourse["C02"][0];
    expect(c02Next.day).toBe(c02Base.day);
    expect(c02Next.period).toBe(c02Base.period);

    // C07 moved to the pinned slot
    const c07Next = nextTt.byCourse["C07"][0];
    expect(c07Next.day).toBe(c21Base.day);
    expect(c07Next.period).toBe(c21Base.period);

    // C21 was forced to move away from its previous slot due to professor conflict with P10
    const c21Next = nextTt.byCourse["C21"][0];
    expect(
      c21Next.day !== c21Base.day || c21Next.period !== c21Base.period
    ).toBe(true);

    // Check diff changes and diagnostic reasons
    const c07Diff = diff.changes.find((ch) => ch.courseId === "C07");
    expect(c07Diff).toBeDefined();
    expect(c07Diff?.reason?.kind).toBe("user_pin");

    const c21Diff = diff.changes.find((ch) => ch.courseId === "C21");
    expect(c21Diff).toBeDefined();
    expect(c21Diff?.reason?.kind).toBe("prof_conflict");
    expect(c21Diff?.reason?.relatedProfessorId).toBe("P10");
    expect(c21Diff?.reason?.relatedCourseId).toBe("C07");

    // Verify formatDiffReasonI18n output in en and ja
    const reasonEn = formatDiffReasonI18n(c21Diff?.reason, fineTuneState, "en");
    expect(reasonEn).toContain("Yuna Kato");
    expect(reasonEn).toContain("Info Ethics");

    const reasonJa = formatDiffReasonI18n(c21Diff?.reason, fineTuneState, "ja");
    expect(reasonJa).toContain("\u52A0\u85E4"); // Kato
    expect(reasonJa).toContain("\u6559\u54E1\u91CD\u8907\u56DE\u907F"); // Faculty conflict avoidance
  }, 30_000);

  it("diagnoses room_only, room_conflict, and cohort_conflict change reasons accurately", () => {
    const mockState = generateTimetableState();
    const prevMock = {
      sessions: [
        { courseId: "C01", sessionIndex: 0, day: "Mon" as const, period: 1 as const, roomId: "R101" },
        { courseId: "C02", sessionIndex: 0, day: "Mon" as const, period: 1 as const, roomId: "R102" },
      ],
      byCourse: {
        C01: [{ courseId: "C01", sessionIndex: 0, day: "Mon" as const, period: 1 as const, roomId: "R101" }],
        C02: [{ courseId: "C02", sessionIndex: 0, day: "Mon" as const, period: 1 as const, roomId: "R102" }],
      },
    };

    // 1. Room only change
    const nextRoomOnly = {
      sessions: [
        { courseId: "C01", sessionIndex: 0, day: "Mon" as const, period: 1 as const, roomId: "R103" },
        { courseId: "C02", sessionIndex: 0, day: "Mon" as const, period: 1 as const, roomId: "R102" },
      ],
      byCourse: {
        C01: [{ courseId: "C01", sessionIndex: 0, day: "Mon" as const, period: 1 as const, roomId: "R103" }],
        C02: [{ courseId: "C02", sessionIndex: 0, day: "Mon" as const, period: 1 as const, roomId: "R102" }],
      },
    };
    const diffRoomOnly = computeTimetableDiff(mockState, prevMock, nextRoomOnly);
    expect(diffRoomOnly?.changes[0].reason?.kind).toBe("room_only");
    expect(diffRoomOnly?.changes[0].reason?.relatedRoomId).toBe("R103");

    // 2. Room conflict
    const prevRoomConflict = {
      sessions: [
        { courseId: "C01", sessionIndex: 0, day: "Mon" as const, period: 1 as const, roomId: "R101" },
        { courseId: "C03", sessionIndex: 0, day: "Mon" as const, period: 2 as const, roomId: "R101" },
      ],
      byCourse: {
        C01: [{ courseId: "C01", sessionIndex: 0, day: "Mon" as const, period: 1 as const, roomId: "R101" }],
        C03: [{ courseId: "C03", sessionIndex: 0, day: "Mon" as const, period: 2 as const, roomId: "R101" }],
      },
    };
    const nextRoomConflict = {
      sessions: [
        { courseId: "C01", sessionIndex: 0, day: "Mon" as const, period: 3 as const, roomId: "R101" },
        { courseId: "C03", sessionIndex: 0, day: "Mon" as const, period: 1 as const, roomId: "R101" },
      ],
      byCourse: {
        C01: [{ courseId: "C01", sessionIndex: 0, day: "Mon" as const, period: 3 as const, roomId: "R101" }],
        C03: [{ courseId: "C03", sessionIndex: 0, day: "Mon" as const, period: 1 as const, roomId: "R101" }],
      },
    };
    const diffRoomConflict = computeTimetableDiff(mockState, prevRoomConflict, nextRoomConflict);
    const c01Ch = diffRoomConflict?.changes.find((c) => c.courseId === "C01");
    expect(c01Ch?.reason?.kind).toBe("room_conflict");
    expect(c01Ch?.reason?.relatedRoomId).toBe("R101");
    expect(c01Ch?.reason?.relatedCourseId).toBe("C03");

    // 3. Cohort conflict
    const prevCohortConflict = {
      sessions: [
        { courseId: "C01", sessionIndex: 0, day: "Mon" as const, period: 1 as const, roomId: "R101" },
        { courseId: "C02", sessionIndex: 0, day: "Mon" as const, period: 2 as const, roomId: "R102" },
      ],
      byCourse: {
        C01: [{ courseId: "C01", sessionIndex: 0, day: "Mon" as const, period: 1 as const, roomId: "R101" }],
        C02: [{ courseId: "C02", sessionIndex: 0, day: "Mon" as const, period: 2 as const, roomId: "R102" }],
      },
    };
    const nextCohortConflict = {
      sessions: [
        { courseId: "C01", sessionIndex: 0, day: "Mon" as const, period: 3 as const, roomId: "R101" },
        { courseId: "C02", sessionIndex: 0, day: "Mon" as const, period: 1 as const, roomId: "R102" },
      ],
      byCourse: {
        C01: [{ courseId: "C01", sessionIndex: 0, day: "Mon" as const, period: 3 as const, roomId: "R101" }],
        C02: [{ courseId: "C02", sessionIndex: 0, day: "Mon" as const, period: 1 as const, roomId: "R102" }],
      },
    };
    // 3. Cohort conflict (when enforceCohortNoOverlap is enabled)
    const diffCohortConflict = computeTimetableDiff(mockState, prevCohortConflict, nextCohortConflict);
    const c01CohortCh = diffCohortConflict?.changes.find((c) => c.courseId === "C01");
    expect(c01CohortCh?.reason?.kind).toBe("cohort_conflict");
    expect(c01CohortCh?.reason?.relatedCohortId).toBe("Y1");
    expect(c01CohortCh?.reason?.relatedCourseId).toBe("C02");

    // 4. When enforceCohortNoOverlap is disabled, cohort overlap is not a constraint, so reason falls back to rebalance
    const relaxedState = {
      ...mockState,
      config: { ...mockState.config, enforceCohortNoOverlap: false },
    };
    const diffRelaxedCohort = computeTimetableDiff(relaxedState, prevCohortConflict, nextCohortConflict);
    const c01RelaxedCh = diffRelaxedCohort?.changes.find((c) => c.courseId === "C01");
    expect(c01RelaxedCh?.reason?.kind).toBe("rebalance");
  });

  it("hides AI chat pane when Gemini Nano is checking/unavailable and shows it when usable, plus decouples timetable notifications from chat", async () => {
    expect(isGeminiNanoVisibleStatus("unavailable")).toBe(false);
    expect(isGeminiNanoVisibleStatus("checking")).toBe(false);
    expect(isGeminiNanoVisibleStatus("available")).toBe(true);
    expect(isGeminiNanoVisibleStatus("downloadable")).toBe(true);
    expect(isGeminiNanoVisibleStatus("downloading")).toBe(true);

    const {
      getAppState,
      handleGenerateSample,
      triggerSolve,
      applyDropMove,
    } = await import("../examples/web-demo/apps/ai-timetable/main.js");

    const elements = new Map<string, any>();
    const chatAppends: any[] = [];
    const toastAppends: any[] = [];
    const makeEl = (id: string, extra: Record<string, any> = {}): any => {
      const children: any[] = [];
      return {
        id,
        children,
        options: [],
        textContent: "",
        innerHTML: "",
        value: "",
        disabled: false,
        checked: false,
        hidden: false,
        className: "",
        title: "",
        style: {},
        dataset: {} as Record<string, string>,
        attributes: new Map<string, string>(),
        setAttribute: function (k: string, v: string) {
          this.attributes.set(k, v);
        },
        getAttribute: function (k: string) {
          return this.attributes.get(k) ?? null;
        },
        addEventListener: () => {},
        click: () => {},
        appendChild: (node: any) => {
          children.push(node);
          if (id === "chat-messages") chatAppends.push(node);
          if (id === "workspace-toast-region") toastAppends.push(node);
          return node;
        },
        append: (...nodes: any[]) => {
          children.push(...nodes);
        },
        prepend: (node: any) => children.unshift(node),
        remove: () => {},
        replaceChildren: () => {
          children.length = 0;
        },
        classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
        ...extra,
      };
    };

    const register = (id: string, extra: Record<string, any> = {}) => {
      const el = makeEl(id, extra);
      elements.set(id, el);
      return el;
    };

    const workspace = register("ai-timetable-workspace");
    const chatPane = register("chat-pane-aside", { hidden: true });
    const toggleAiBtn = register("btn-toggle-ai-drawer", { hidden: true });
    const askAiConflict = register("btn-ask-nano-conflict", { hidden: true });
    const tutStep4 = register("btn-tut-step4", { hidden: true });
    const heroState = register("unscheduled-hero-state", { hidden: true });
    const emptyState = register("empty-timetable-state", { hidden: true });
    const controlsBar = register("schedule-controls-bar", { hidden: false });
    const crossBar = register("cross-highlight-bar", { hidden: false });
    const viewsContainer = register("timetable-views-container", { hidden: false });
    register("workspace-action-banner", { hidden: true });
    register("workspace-action-body");
    register("workspace-toast-region");
    register("chat-messages");
    register("chk-highlight-diff", { checked: false });
    register("view-cohorts-grid");
    register("view-matrix-wrap");
    register("nano-status-badge");
    register("nano-unavailable-banner", { hidden: true });
    register("nano-download-bar-wrap", { hidden: true });
    register("nano-download-bar");
    register("nano-download-label");

    const prevDoc = (globalThis as any).document;
    (globalThis as any).document = {
      getElementById: (id: string) => {
        if (!elements.has(id)) register(id);
        return elements.get(id);
      },
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: (tag: string) => makeEl(`tag_${tag}`),
      createTextNode: (t: string) => makeEl("text", { textContent: t }),
    };

    try {
      // 1. Checking & Unavailable must hide all AI UI affordances and close mobile drawer
      setAiDrawerOpen(true);
      expect(workspace.dataset.aiDrawerOpen).toBe("true");
      updateNanoStatusUI("checking");
      expect(workspace.dataset.aiAvailable).toBe("false");
      expect(workspace.dataset.aiDrawerOpen).toBe("false");
      expect(chatPane.hidden).toBe(true);
      expect(toggleAiBtn.hidden).toBe(true);
      expect(askAiConflict.hidden).toBe(true);
      expect(tutStep4.hidden).toBe(true);

      updateNanoStatusUI("unavailable");
      expect(workspace.dataset.aiAvailable).toBe("false");
      expect(chatPane.hidden).toBe(true);
      expect(toggleAiBtn.hidden).toBe(true);

      // 2. Downloadable, Downloading, and Available must reveal AI chat & toggle
      for (const usableStatus of ["downloadable", "downloading", "available"] as const) {
        updateNanoStatusUI(usableStatus, 45);
        expect(workspace.dataset.aiAvailable).toBe("true");
        expect(chatPane.hidden).toBe(false);
        expect(toggleAiBtn.hidden).toBe(false);
        expect(askAiConflict.hidden).toBe(false);
        expect(tutStep4.hidden).toBe(false);
      }

      // 3. First view with default data shows unscheduled hero CTA and hides empty grid & filter strips
      handleGenerateSample(false);
      expect(heroState.hidden).toBe(false);
      expect(emptyState.hidden).toBe(true);
      expect(controlsBar.hidden).toBe(true);
      expect(crossBar.hidden).toBe(true);
      expect(viewsContainer.hidden).toBe(true);

      // 4. Solving reveals the grid & hides hero, and notifies workspace toast rather than #chat-messages
      chatAppends.length = 0;
      toastAppends.length = 0;
      const solved = await triggerSolve();
      expect(solved?.status).toBe("Optimal");
      expect(heroState.hidden).toBe(true);
      expect(controlsBar.hidden).toBe(false);
      expect(crossBar.hidden).toBe(false);
      expect(viewsContainer.hidden).toBe(false);
      expect(chatAppends.length).toBe(0);
      expect(toastAppends.length).toBeGreaterThan(0);

      // 5. Drag-and-drop move also avoids dumping logs into #chat-messages
      chatAppends.length = 0;
      toastAppends.length = 0;
      const sess = solved!.timetable!.sessions[0];
      const targetCourse = getAppState().courses.find((c) => c.id === sess.courseId)!;
      await applyDropMove(
        { courseId: targetCourse.id, fromDay: sess.day, fromPeriod: sess.period },
        sess.day === "Fri" ? "Thu" : "Fri",
        sess.period
      );
      expect(chatAppends.length).toBe(0);
      expect(toastAppends.length).toBeGreaterThan(0);
    } finally {
      if (prevDoc === undefined) delete (globalThis as any).document;
      else (globalThis as any).document = prevDoc;
    }
  }, 30_000);

  it("avoids developer jargon in UI strings and Gemini progress labels across ja/en/zh", async () => {
    for (const lang of ["ja", "en", "zh"] as const) {
      const ui = UI_TEXT_I18N[lang];
      expect(ui.promptCatalogIntro).not.toMatch(/構造化|toolCalls|JSON tool calls/);
      expect(ui.heroEyebrow.length).toBeGreaterThan(0);
      expect(ui.heroTitle.length).toBeGreaterThan(0);
      expect(ui.heroDesc.length).toBeGreaterThan(0);
      expect(ui.heroPrimaryBtn.length).toBeGreaterThan(0);
      expect(ui.heroDataBtn.length).toBeGreaterThan(0);
      expect(ui.heroRulesBtn.length).toBeGreaterThan(0);
      expect(ui.btnToggleAiDrawer.length).toBeGreaterThan(0);
      expect(ui.btnCloseAiDrawer.length).toBeGreaterThan(0);
      expect(ui.btnMobileMenu.length).toBeGreaterThan(0);
      expect(ui.btnControlsToggle.length).toBeGreaterThan(0);
      expect(ui.btnLegendToggle.length).toBeGreaterThan(0);
      expect(ui.toastCloseLabel.length).toBeGreaterThan(0);
    }

    // Verify extractPlan emits natural user-facing progress labels without "構造化" / "Structuring"
    const labels: string[] = [];
    const prevLm = (globalThis as any).LanguageModel;
    (globalThis as any).LanguageModel = {
      availability: async () => "available",
      create: async () => ({
        prompt: async () => JSON.stringify({ intentType: "update", toolCalls: [] }),
        destroy: () => {},
      }),
    };
    try {
      const mgr = createTimetableGeminiNanoManager();
      await mgr.initialize();
      const state = generateTimetableState();
      await mgr.extractPlan("Make Monday off for Prof. Sato", state, undefined, (ev) => labels.push(ev.activeLabel), "ja");
      expect(labels.length).toBeGreaterThan(0);
      for (const lbl of labels) {
        expect(lbl).not.toMatch(/構造化|Structuring|结构化|toolCall/);
      }
    } finally {
      if (prevLm === undefined) delete (globalThis as any).LanguageModel;
      else (globalThis as any).LanguageModel = prevLm;
    }
  });

  it("localizes all structural conflict constraints and surfaces revert reasons, cascade adjustments, optimization provenance, and board interaction guide", async () => {
    const state = generateTimetableState();
    const {
      formatConstraintMetaI18n,
    } = await import("../examples/web-demo/apps/ai-timetable/i18n.js");

    // 1. Verify all structural constraint types have localized ja/en/zh output (not English meta.labelJa fallback)
    const sampleMetas = [
      {
        name: "course_diff_day_C12_Thu",
        category: "workload" as const,
        labelJa: "Raw English diff-day fallback",
        relatedCourseIds: ["C12"],
      },
      {
        name: "prof_unavail_slot_P04_Fri_P5",
        category: "prof_avail" as const,
        labelJa: "Raw English slot fallback",
        relatedProfessorIds: ["P04"],
      },
      {
        name: "prof_daily_max_P01_Mon",
        category: "workload" as const,
        labelJa: "Raw English daily max fallback",
        relatedProfessorIds: ["P01"],
      },
      {
        name: "prof_consec_P04_Thu_P1_P3",
        category: "workload" as const,
        labelJa: "Raw English consec fallback",
        relatedProfessorIds: ["P04"],
      },
      {
        name: "cohort_daily_max_Y2_Thu",
        category: "workload" as const,
        labelJa: "Raw English cohort max fallback",
      },
      {
        name: "room_compat_C12",
        category: "capacity_equip" as const,
        labelJa: "Raw English room compat fallback",
        relatedCourseIds: ["C12"],
      },
    ];

    for (const meta of sampleMetas) {
      for (const lang of ["en", "ja", "zh"] as const) {
        const res = formatConstraintMetaI18n(meta, state, lang);
        expect(res.label).not.toBe(meta.labelJa);
        expect(res.label.length).toBeGreaterThan(5);
      }
      expect(formatConstraintMetaI18n(sampleMetas[0], state, "ja").label).not.toBe(
        formatConstraintMetaI18n(sampleMetas[0], state, "en").label
      );
    }

    // 2. Test UI flow: provenance, board interaction guide, cascaded move notice, and revert reason inside toast & banner
    const {
      getAppState,
      handleGenerateSample,
      triggerSolve,
      applyDropMove,
      applyTimetableLang,
    } = await import("../examples/web-demo/apps/ai-timetable/main.js");

    const elements = new Map<string, any>();
    const toastAppends: any[] = [];
    const makeEl = (id: string, extra: Record<string, any> = {}): any => {
      const children: any[] = [];
      return {
        id,
        children,
        options: [],
        dataset: {},
        style: {},
        hidden: false,
        disabled: false,
        value: "",
        textContent: "",
        innerHTML: "",
        checked: true,
        className: "",
        classList: {
          add: (...cls: string[]) => cls,
          remove: (...cls: string[]) => cls,
          toggle: () => false,
          contains: () => false,
        },
        setAttribute: () => {},
        addEventListener: () => {},
        click: () => {},
        appendChild: (node: any) => {
          children.push(node);
          if (id === "workspace-toast-region") toastAppends.push(node);
          return node;
        },
        append: (...nodes: any[]) => {
          for (const node of nodes) {
            children.push(node);
            if (id === "workspace-toast-region") toastAppends.push(node);
          }
        },
        replaceChildren: (...nodes: any[]) => {
          children.length = 0;
          children.push(...nodes);
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        remove: () => {},
        ...extra,
      };
    };

    const register = (id: string, extra: Record<string, any> = {}) => {
      const el = makeEl(id, extra);
      elements.set(id, el);
      return el;
    };

    register("ai-timetable-workspace", { dataset: {} });
    register("kpi-status-badge");
    const summaryEl = register("kpi-summary-text");
    register("kpi-solve-time");
    register("btn-solve-washi");
    register("btn-hero-solve");
    register("btn-abort-solve", { hidden: true });
    register("btn-check-current");
    register("btn-export-csvs");
    register("btn-clear-blank");
    register("btn-reset-clean");
    register("conflict-alert", { hidden: true });
    register("conflict-list");
    register("lp-stats-badge");
    register("washi-code-preview");
    register("washi-lp-preview");
    register("unscheduled-hero-state", { hidden: false });
    register("empty-timetable-state", { hidden: true });
    register("schedule-controls-bar", { hidden: false });
    register("cross-highlight-bar", { hidden: false });
    const guideBar = register("board-interaction-guide", { hidden: true });
    register("timetable-views-container", { hidden: false });
    register("view-cohorts-grid", { hidden: false });
    register("view-matrix-wrap", { hidden: true });
    register("custom-rules-list");
    register("custom-rules-count");
    register("tbl-profs-body");
    register("tbl-rooms-body");
    register("tbl-courses-body");
    register("tab-btn-timetable");
    register("trajectory-json-preview");
    register("badge-trajectory-count", { hidden: true });
    const banner = register("workspace-action-banner", { hidden: true });
    const bannerBody = register("workspace-action-body");
    const toastRegion = register("workspace-toast-region", {
      showPopover: () => {},
      hidePopover: () => {},
    });
    register("sel-rule-course-1");
    register("sel-rule-course-2");
    register("sel-rule-room");
    register("dialog-select-course");
    register("dialog-select-room");

    const collectTextNodes = (node: any): string[] => {
      const out: string[] = [];
      if (!node) return out;
      if (typeof node.textContent === "string" && node.textContent.trim()) {
        out.push(node.textContent.trim());
      }
      if (Array.isArray(node.children)) {
        for (const ch of node.children) {
          out.push(...collectTextNodes(ch));
        }
      }
      return out;
    };

    const prevDoc = (globalThis as any).document;
    (globalThis as any).document = {
      getElementById: (id: string) => elements.get(id) ?? register(id),
      createElement: (_tag: string) => makeEl(`anon_${Math.random()}`),
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      documentElement: { lang: "en" },
    };

    try {
      applyTimetableLang("en");
      handleGenerateSample(false);
      // Before solving, board interaction guide must remain hidden
      expect(guideBar.hidden).toBe(true);

      const solved = await triggerSolve();
      expect(solved?.status).toBe("Optimal");
      // After solving: guide bar visible & summary shows variable count proving live optimization
      expect(guideBar.hidden).toBe(false);
      expect(summaryEl.textContent).toContain(String(solved!.numVariables));

      // Attempt infeasible move: C18 (Adjunct Prof Kobayashi, Tue/Thu only) -> Mon P3
      toastAppends.length = 0;
      banner.hidden = true;
      bannerBody.children.length = 0;
      const c18Sess = solved!.timetable!.sessions.find((s) => s.courseId === "C18")!;
      await applyDropMove(
        {
          courseId: "C18",
          sessionIndex: c18Sess.sessionIndex,
          fromDay: c18Sess.day,
          fromPeriod: c18Sess.period,
          fromRoomId: c18Sess.roomId,
          fromProfId: "P09",
          sourceView: "cohorts_4",
        },
        "Mon",
        3
      );

      // Verify revert banner AND toast both contain opposing conflict reason (Kobayashi / Monday), NOT empty!
      expect(banner.hidden).toBe(false);
      const bannerTexts = collectTextNodes(bannerBody).join(" | ");
      expect(bannerTexts).toMatch(/Kobayashi|Monday|Mon|Unavailable/i);

      expect(toastAppends.length).toBeGreaterThan(0);
      const latestToast = toastAppends[toastAppends.length - 1];
      const detailEl = (latestToast.children?.[0]?.children ?? []).find(
        (c: any) => typeof c.className === "string" && c.className.includes("workspace-toast-detail")
      );
      expect(detailEl).toBeDefined();
      expect(detailEl.textContent).toMatch(/Kobayashi|Monday|Mon|Unavailable/i);
      expect(toastRegion.children.length).toBeGreaterThan(0);

      // Verify cascaded auto-rebalance notice: move a 1-session Y1 course onto another Y1 course's occupied slot
      const y1Courses = solved!.timetable!.sessions.filter((s) => {
        const c = getAppState().courses.find((x) => x.id === s.courseId);
        return c && c.cohorts.includes("Y1") && c.sessionsPerWeek === 1 && c.professorId !== "P09" && c.professorId !== "P10";
      });
      expect(y1Courses.length).toBeGreaterThanOrEqual(2);
      const srcY1 = y1Courses[0];
      const occupiedY1 = y1Courses[1];
      toastAppends.length = 0;
      banner.hidden = true;
      bannerBody.children.length = 0;
      await applyDropMove(
        {
          courseId: srcY1.courseId,
          sessionIndex: srcY1.sessionIndex,
          fromDay: srcY1.day,
          fromPeriod: srcY1.period,
          fromRoomId: srcY1.roomId,
          fromProfId: getAppState().courses.find((c) => c.id === srcY1.courseId)!.professorId,
          sourceView: "cohorts_4",
        },
        occupiedY1.day,
        occupiedY1.period
      );
      expect(banner.hidden).toBe(false);
      const cascadeBannerText = collectTextNodes(bannerBody).join(" | ");
      expect(cascadeBannerText).toMatch(/Pinned .* Auto-adjusted \d+ other session/i);
      const occupiedTitle = getAppState().courses.find((c) => c.id === occupiedY1.courseId)!.title;
      expect(cascadeBannerText).toContain(occupiedTitle);
      const cascadeToastDetail = (
        toastAppends[toastAppends.length - 1].children?.[0]?.children ?? []
      ).find((c: any) => typeof c.className === "string" && c.className.includes("workspace-toast-detail"));
      expect(cascadeToastDetail?.textContent).toContain(occupiedTitle);

      // Pin one session of C12 at its current slot, then try placing C12's other session on the SAME day -> must revert with forbidSameCourseSameDay reason
      const currentOutcome = await triggerSolve();
      const c12Now = currentOutcome!.timetable!.byCourse["C12"];
      expect(c12Now).toHaveLength(2);
      const pinS1 = c12Now[1];
      const pinS0 = c12Now[0];
      getAppState().customRules.push({
        id: "pin_c12_s1_for_sameday_test",
        kind: "pin_slot",
        enabled: true,
        isHard: true,
        courseId: "C12",
        days: [pinS1.day],
        periods: [pinS1.period],
        description: "Pin C12 session 2",
      });
      toastAppends.length = 0;
      banner.hidden = true;
      bannerBody.children.length = 0;
      const sameDayPeriod = pinS1.period === 3 ? 2 : 3;
      await applyDropMove(
        {
          courseId: "C12",
          sessionIndex: pinS0.sessionIndex,
          fromDay: pinS0.day,
          fromPeriod: pinS0.period,
          fromRoomId: pinS0.roomId,
          fromProfId: "P04",
          sourceView: "cohorts_4",
        },
        pinS1.day,
        sameDayPeriod
      );
      expect(banner.hidden).toBe(false);
      const c12RevertTexts = collectTextNodes(bannerBody).join(" | ");
      expect(c12RevertTexts).toMatch(/Move reverted/i);
      expect(c12RevertTexts).toMatch(/Forbid Same-Day Sessions.*cannot meet multiple times on/i);
      expect(c12RevertTexts).toContain("Pin \"Software Design Lab (C12)\" to Thu P2");
    } finally {
      if (prevDoc === undefined) delete (globalThis as any).document;
      else (globalThis as any).document = prevDoc;
    }
  }, 30_000);
});
