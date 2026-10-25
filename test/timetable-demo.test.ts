import { describe, it, expect } from "vitest";
import {
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
  getTimetableLang,
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
    const unclosedStr = '{"thought":"佐藤先生の月曜';
    const repStr = repairTruncatedJson(unclosedStr);
    expect(() => JSON.parse(repStr)).not.toThrow();
    expect(JSON.parse(repStr).thought).toBe("佐藤先生の月曜");

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
    expect(compactPrompt).toContain("C01:情報科学概論(週1,担当:P07)");
    expect(compactPrompt).not.toContain("履修135名"); // Pruned to save tokens
    expect(compactPrompt).toContain("P01:佐藤 健一");
    expect(compactPrompt).toContain("R101:101大講義室");

    const ultraCompactPrompt = buildUltraCompactCatalogPrompt(state);
    expect(ultraCompactPrompt).toContain("C01:情報科学概論(P07)");
    expect(ultraCompactPrompt).not.toContain("現在の全体設定"); // Omitted in ultra-compact retry

    // Empty state (blank slate) produces clean placeholders
    const blankState = { ...state, courses: [], professors: [], rooms: [] };
    expect(buildCompactStateCatalogPrompt(blankState)).toContain("【登録科目一覧】(なし)");
    expect(buildUltraCompactCatalogPrompt(blankState)).toContain("【登録科目一覧】(なし)");

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
      await mgr.initialize(undefined, "ja");
      const plan = await mgr.extractPlan("佐藤先生は月曜休み", state, undefined, undefined, "ja");

      // Verify that retry occurred with ultra-compact prompt
      expect(promptCallCount).toBe(2);
      expect(promptsReceived[0]).toContain("週1,担当:P07"); // Initial compact prompt
      expect(promptsReceived[1]).toContain("C01:情報科学概論(P07)"); // Ultra-compact retry prompt
      expect(plan.operations.length).toBe(1);
      expect(plan.operations[0].op).toBe("set_professor_unavailability");
      mgr.destroy();
    } finally {
      (globalThis as any).LanguageModel = prevLM;
    }
  });
});
