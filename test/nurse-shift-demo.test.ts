import { describe, it, expect } from "vitest";
import {
  generateNurseSchedulingState,
  getDayOfWeek,
  injectConflictScenario,
} from "../examples/web-demo/apps/ai-shift/generator.js";
import {
  buildNurseWashiModel,
  evaluateNurseSchedule,
  getPrevMonthTailWorkStreak,
  getRequiredDailyCoverage,
  isStaffingRuleApplicableOnDay,
  solveNurseScheduleWithWashi,
  diagnoseNurseScheduleWithHiGHS,
} from "../examples/web-demo/apps/ai-shift/solver.js";
import {
  clearNurseContractFromState,
  createDefaultShiftAliases,
  doesNurseMatchAttribute,
  getEffectiveIncludedAliases,
  getJapaneseHolidayName,
  removeCustomShiftFromState,
  resolveShiftSelector,
  resolveDaysBySelector,
  CONTRACT_PRESETS,
  applyContractPresetToNurse,
  getShiftTransitionMatrix,
  applyShiftTransitionToConfig,
} from "../examples/web-demo/apps/ai-shift/types.js";
import {
  applyChatOperationsToState,
  checkGeminiNanoAvailability,
  convertStage2ToolToOperation,
  createGeminiNanoManager,
  STAGE1_ROUTER_SCHEMA,
  STAGE1_ROUTER_SYSTEM_PROMPT,
  CUSTOM_SHIFT_TOOLS_SCHEMA,
  CUSTOM_SHIFT_STAGE2_PROMPT,
  SKILL_AND_PAIR_TOOLS_SCHEMA,
  STAFF_CALENDAR_TOOLS_SCHEMA,
  STAFF_CONTRACT_TOOLS_SCHEMA,
  WARD_COVERAGE_AND_PARAM_TOOLS_SCHEMA,
  WARD_TRANSITION_AND_RULE_TOOLS_SCHEMA,
  SYSTEM_ACTION_TOOLS_SCHEMA,
  buildCategoryDynamicDictionary,
  verifyExecutionAgainstRequest,
} from "../examples/web-demo/apps/ai-shift/nano-client.js";

describe("1-Month 3-Shift Nurse Scheduling Demo (30 Nurses, Carryover, HiGHS)", () => {
  it("solves default 30-nurse 30-day schedule to Optimal with HiGHS and passes validateSolution()", async () => {
    const state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });
    expect(state.nurses.length).toBe(30);
    expect(state.config.numDays).toBe(30);

    const t0 = performance.now();
    const res = await solveNurseScheduleWithWashi(state);
    const elapsed = performance.now() - t0;

    console.log(
      `[30 Nurses x 30 Days] status=${res.status}, vars=${res.numVariables}, constrs=${res.numConstraints}, build=${res.buildTimeMs}ms, solve=${res.solveTimeMs}ms, total=${Math.round(elapsed)}ms, obj=${res.objectiveValue}`
    );

    expect(res.status).toBe("Optimal");
    expect(res.validatedByWashi).toBe(true);
    expect(res.maxViolation).toBeLessThanOrEqual(1e-6);
    expect(res.evaluation?.valid).toBe(true);
    expect(res.evaluation?.violations).toEqual([]);

    // Verify previous month carryover:
    // N01 ends prev month with "N", so Day 1 cannot be "D" or "E"
    const n01Day1 = res.schedule!["N01"][0];
    expect(["N", "O"]).toContain(n01Day1);

    // N02 ends prev month with "E", so Day 1 cannot be "D" or "N"
    const n02Day1 = res.schedule!["N02"][0];
    expect(["E", "O"]).toContain(n02Day1);

    // N03 ends prev month on a 4-day work streak, so within Days 1..2 (maxConsec=5 -> 5+1-4=2 days), at most 1 day can be worked!
    const n03Day1 = res.schedule!["N03"][0];
    const n03Day2 = res.schedule!["N03"][1];
    const workedInFirst2 = (n03Day1 !== "O" ? 1 : 0) + (n03Day2 !== "O" ? 1 : 0);
    expect(workedInFirst2).toBeLessThanOrEqual(1);
  }, 30_000);

  it("diagnoses carryover conflict with HiGHS when Day 1 is pinned to D after prev month N", async () => {
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });
    const { updatedState } = injectConflictScenario(baseState, "carryover_clash");

    const t0 = performance.now();
    const res = await solveNurseScheduleWithWashi(updatedState);
    const elapsed = performance.now() - t0;

    console.log(
      `[Carryover Conflict HiGHS] status=${res.status}, conflicts=${res.rawConflictNames.join(", ")}, total=${Math.round(elapsed)}ms`
    );

    expect(res.status).toBe("Infeasible");
    expect(res.conflicts.length).toBeGreaterThan(0);
    expect(res.rawConflictNames.some((c) => c.includes("carryover_N_to_D_N01_d1"))).toBe(true);
  }, 30_000);

  it("diagnoses leader shortage conflict with HiGHS", async () => {
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });
    const { updatedState } = injectConflictScenario(baseState, "leader_shortage");

    const t0 = performance.now();
    const res = await solveNurseScheduleWithWashi(updatedState);
    const elapsed = performance.now() - t0;

    console.log(
      `[Leader Shortage Conflict HiGHS] status=${res.status}, conflicts=${res.rawConflictNames.join(", ")}, total=${Math.round(elapsed)}ms`
    );

    expect(res.status).toBe("Infeasible");
    expect(res.conflicts.length).toBeGreaterThan(0);
    expect(res.rawConflictNames.some((c) => c.includes("skill_leader_") || c.includes("conflict_leader_off"))).toBe(
      true
    );
  }, 30_000);

  it("applies chat constraint operations (pin off, consecutive limit, NG pair) and re-optimizes with WaSHI", async () => {
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });
    const operations = [
      convertStage2ToolToOperation(
        {
          tool_name: "add_request",
          args: { nurseNameOrId: "佐藤 美咲", startDay: 12, endDay: 12, shift: "O", isHard: true },
        },
        baseState
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "set_param",
          args: { paramName: "maxConsecutiveWorkDays", paramValue: 4 },
        },
        baseState
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "add_ng_pair",
          args: { nurseA: "N04", nurseB: "N06" },
        },
        baseState
      )!,
    ];

    const { updatedState, appliedLogs } = applyChatOperationsToState(baseState, operations);
    expect(appliedLogs.length).toBe(3);
    expect(updatedState.config.maxConsecutiveWorkDays).toBe(4);

    const res = await solveNurseScheduleWithWashi(updatedState);
    expect(res.status).toBe("Optimal");
    expect(res.validatedByWashi).toBe(true);
    expect(res.schedule!["N01"][11]).toBe("O"); // Day 12 is 0-indexed 11
    // Verify N04 and N06 never share E or N on the same day
    for (let dIdx = 0; dIdx < 30; dIdx++) {
      const s4 = res.schedule!["N04"][dIdx];
      const s6 = res.schedule!["N06"][dIdx];
      expect(s4 === "E" && s6 === "E").toBe(false);
      expect(s4 === "N" && s6 === "N").toBe(false);
    }
  }, 30_000);

  it("never freezes when diagnosing a feasible schedule or monthly night-cap infeasibility with HiGHS", async () => {
    const feasibleState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });
    const t0 = performance.now();
    const diagSat = await diagnoseNurseScheduleWithHiGHS(feasibleState);
    const satMs = Math.round(performance.now() - t0);
    console.log(`[Feasible HiGHS Check] status=${diagSat.status}, time=${satMs}ms`);
    expect(diagSat.status).toBe("Sat");
    expect(satMs).toBeLessThan(2000);

    // Monthly night shift cap = 5 (28 night-eligible nurses * 5 = 140 < 180 required night shifts)
    const nightCapInfeasibleState = {
      ...feasibleState,
      config: {
        ...feasibleState.config,
        maxMonthlyNightShifts: 5,
      },
    };
    const t1 = performance.now();
    const resNight = await solveNurseScheduleWithWashi(nightCapInfeasibleState);
    const nightMs = Math.round(performance.now() - t1);
    console.log(
      `[Monthly Night Cap=5 HiGHS] status=${resNight.status}, conflicts=${resNight.rawConflictNames.slice(0, 6).join(", ")}, time=${nightMs}ms`
    );
    expect(resNight.status).toBe("Infeasible");
    expect(resNight.conflicts.length).toBeGreaterThan(0);
    expect(nightMs).toBeLessThan(3000);
  }, 30_000);

  it("supports Chrome 148+ window.LanguageModel API with expectedInputs/expectedOutputs for Japanese", async () => {
    const prevLM = (globalThis as any).LanguageModel;
    try {
      const receivedCreateOpts: any[] = [];
      (globalThis as any).LanguageModel = {
        async availability(opts?: any) {
          // Simulate Chrome 148+ requiring expectedOutputs with language specified
          if (!opts?.expectedOutputs?.[0]?.languages?.includes("ja")) {
            throw new Error("No output language was specified in a LanguageModel API request");
          }
          return "available";
        },
        async create(opts?: any) {
          if (!opts?.expectedOutputs?.[0]?.languages?.includes("ja")) {
            throw new Error("No output language was specified in a LanguageModel API request");
          }
          receivedCreateOpts.push(opts);
          return {
            async clone() {
              return this;
            },
            async prompt() {
              return JSON.stringify({
                intentType: "consult_only",
                operations: [],
                summaryJa: "\u30c6\u30b9\u30c8",
              });
            },
            destroy() {},
          };
        },
      };

      const status = await checkGeminiNanoAvailability();
      expect(status).toBe("available");

      const mgr = createGeminiNanoManager();
      const initStatus = await mgr.initialize();
      expect(initStatus).toBe("available");
      expect(receivedCreateOpts.length).toBe(2);
      expect(receivedCreateOpts[0].expectedOutputs).toEqual([{ type: "text", languages: ["ja"] }]);
    } finally {
      (globalThis as any).LanguageModel = prevLM;
    }
  });

  it("genuinely adds custom shift '新人研修' (T) and assigns it exactly 2 times to every newcomer nurse", async () => {
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });
    const operations = [
      convertStage2ToolToOperation(
        { tool_name: "add_custom_shift", args: { shiftName: "新人研修", shortLabel: "研" } },
        baseState
      )!,
      convertStage2ToolToOperation(
        { tool_name: "add_shift_quota", args: { shiftName: "新人研修", attribute: "newcomer", count: 2 } },
        baseState
      )!,
    ];

    const { updatedState, appliedLogs } = applyChatOperationsToState(baseState, operations);
    expect(appliedLogs.length).toBe(2);
    expect(updatedState.customShiftDefs.length).toBe(1);
    const tCode = updatedState.customShiftDefs[0]?.code!;
    expect(tCode).toBe("CS1");
    expect(updatedState.customShiftDefs[0]?.shortLabel).toBe("研");
    expect(updatedState.customShiftDefs[0]?.label).toBe("新人研修");

    const res = await solveNurseScheduleWithWashi(updatedState);
    expect(res.status).toBe("Optimal");
    expect(res.validatedByWashi).toBe(true);
    expect(res.evaluation?.valid).toBe(true);
    expect(res.evaluation?.violations).toEqual([]);

    // Every newcomer must have exactly 2 custom training shifts per the newcomer quota rule
    const newcomers = updatedState.nurses.filter((n) => n.skills.includes("newcomer"));
    expect(newcomers.length).toBeGreaterThan(0);

    for (const nurse of newcomers) {
      const row = res.schedule![nurse.id]!;
      const tCount = row.filter((s) => s === tCode).length;
      expect(tCount).toBe(2);
    }

    // Conflict check must also agree it's feasible (Sat)
    const diag = await diagnoseNurseScheduleWithHiGHS(updatedState);
    expect(diag.status).toBe("Sat");
    expect(diag.conflicts).toEqual([]);
  }, 30_000);

  it("enforces 36協定 rolling 1-year (past 11 months + current month) overtime caps and diagnoses violations", async () => {
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });
    // Verify N04 has 318h in past 11 months, so remaining annual 36協定 budget under 360h cap is 42h
    const n04 = baseState.nurses.find((n) => n.id === "N04")!;
    expect(n04.yearly36Stats.prev11MonthsOvertimeHours).toBe(318);

    const res = await solveNurseScheduleWithWashi(baseState);
    expect(res.status).toBe("Optimal");
    const n04Summary = res.evaluation!.nurseSummaries["N04"]!;
    expect(n04Summary.projectedAnnualOvertimeHours).toBeLessThanOrEqual(
      baseState.config.maxAnnualOvertimeHours
    );
    expect(n04Summary.estMonthOvertimeHours).toBeLessThanOrEqual(
      baseState.config.maxMonthlyOvertimeHours
    );

    // Now set annual 36協定 cap to 325h (leaving only 7h for N04 in the current month, which is impossible with >=14 workdays)
    const tight36State = {
      ...baseState,
      config: {
        ...baseState.config,
        enforce36Agreement: true,
        maxAnnualOvertimeHours: 325,
      },
    };
    const resInfeasible = await solveNurseScheduleWithWashi(tight36State);
    expect(resInfeasible.status).toBe("Infeasible");
    expect(
      resInfeasible.rawConflictNames.some((name) => name.includes("labor36_overtime_N04"))
    ).toBe(true);
  }, 30_000);

  it("handles multi-turn training prerequisite ('requires 2 trainings before night shift') and weekday restriction ('weekdays only')", async () => {
    let state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });

    // Turn 1: Add newcomer training shift
    state = applyChatOperationsToState(state, [
      convertStage2ToolToOperation(
        { tool_name: "add_custom_shift", args: { shiftName: "新人研修", shortLabel: "研" } },
        state
      )!,
    ]).updatedState;
    const tDef = state.customShiftDefs.find((d) => d.label === "新人研修");
    expect(tDef).toBeDefined();
    const tCode = tDef!.code;

    // Turn 2: Newcomers cannot work night shift without 2 trainings
    state = applyChatOperationsToState(state, [
      convertStage2ToolToOperation(
        { tool_name: "add_shift_quota", args: { shiftName: "新人研修", attribute: "newcomer", count: 2 } },
        state
      )!,
      convertStage2ToolToOperation(
        { tool_name: "add_shift_prerequisite", args: { shiftName: "新人研修", attribute: "newcomer", count: 2 } },
        state
      )!,
    ]).updatedState;
    expect(state.skillDefs?.find((s) => s.code === "newcomer")?.maxNight).toBe(1);

    // Turn 3: Training is weekdays only
    state = applyChatOperationsToState(state, [
      convertStage2ToolToOperation(
        {
          tool_name: "add_shift_day_restriction",
          args: { shiftName: "新人研修", dayRestriction: "weekday_only" },
        },
        state
      )!,
    ]).updatedState;
    expect(state.skillDefs?.find((s) => s.code === "newcomer")?.maxEvening).toBe(1);
    expect(state.skillDefs?.find((s) => s.code === "newcomer")?.maxNight).toBe(1);

    // Solve with WaSHI (HiGHS) and verify all three domain rules hold in the schedule!
    const res = await solveNurseScheduleWithWashi(state);
    expect(res.status).toBe("Optimal");
    expect(res.validatedByWashi).toBe(true);
    expect(res.evaluation?.valid).toBe(true);
    expect(res.evaluation?.violations).toEqual([]);

    for (const nurse of state.nurses) {
      const row = res.schedule![nurse.id]!;
      let completedTraining = 0;
      for (let d = 1; d <= state.config.numDays; d++) {
        const s = row[d - 1]!;
        const dow = getDayOfWeek(state.config.year, state.config.month, d);
        if (s === tCode) {
          // Must be a weekday (Mon=1 .. Fri=5)
          expect([1, 2, 3, 4, 5]).toContain(dow);
          completedTraining++;
        }
        if (nurse.skills.includes("newcomer") && (s === "E" || s === "N")) {
          // Newcomer cannot work E or N until they have ALREADY completed 2 training shifts on earlier days
          expect(completedTraining).toBeGreaterThanOrEqual(2);
        }
      }
      if (nurse.skills.includes("newcomer")) {
        expect(completedTraining).toBe(2);
      }
    }
  }, 30_000);

  it("handles previous-month training credit, splitting newcomers into two groups, and daily shift cap ('max 2 per day')", async () => {
    let state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });

    // Turn 1: Add newcomer training shift. Newcomers must take 2 trainings before night shift.
    state = applyChatOperationsToState(state, [
      convertStage2ToolToOperation(
        { tool_name: "add_custom_shift", args: { shiftName: "新人研修", shortLabel: "研" } },
        state
      )!,
      convertStage2ToolToOperation(
        { tool_name: "add_shift_quota", args: { shiftName: "新人研修", attribute: "newcomer", count: 2 } },
        state
      )!,
      convertStage2ToolToOperation(
        { tool_name: "add_shift_prerequisite", args: { shiftName: "新人研修", attribute: "newcomer", count: 2 } },
        state
      )!,
    ]).updatedState;
    const tDef = state.customShiftDefs.find((d) => d.label === "新人研修");
    expect(tDef).toBeDefined();
    const tCode = tDef!.code;

    // Turn 2: Can training from previous month count?
    const applied2 = applyChatOperationsToState(state, [
      convertStage2ToolToOperation(
        { tool_name: "allow_prev_month_shift", args: { shiftName: "新人研修" } },
        state
      )!,
    ]);
    state = applied2.updatedState;
    expect(applied2.appliedLogs.length).toBeGreaterThan(0);
    expect(state.customRules.some((r) => r.includePrevMonth === true)).toBe(true);

    // Suppose half of the newcomers have not yet taken training in previous months, and half already completed 2 shifts in previous months:
    const newcomers = state.nurses.filter((n) => n.skills.includes("newcomer"));
    const group1Ids = new Set(newcomers.slice(0, 3).map((n) => n.id));
    const group2Ids = new Set(newcomers.slice(3).map((n) => n.id));
    state = {
      ...state,
      nurses: state.nurses.map((n) =>
        group2Ids.has(n.id)
          ? { ...n, prevCompletedShifts: { ...(n.prevCompletedShifts ?? {}), [tCode]: 2 } }
          : group1Ids.has(n.id)
            ? { ...n, prevCompletedShifts: { ...(n.prevCompletedShifts ?? {}), [tCode]: 0 } }
            : n
      ),
    };
    const group1Nurses = state.nurses.filter((n) => group1Ids.has(n.id));
    const group2Nurses = state.nurses.filter((n) => group2Ids.has(n.id));
    expect(group1Nurses.length).toBe(3);
    expect(group2Nurses.length).toBe(3);

    // Turn 4: Training limited to at most 2 people per day.
    const applied4 = applyChatOperationsToState(state, [
      convertStage2ToolToOperation(
        { tool_name: "add_daily_shift_cap", args: { shiftName: "新人研修", maxStaffPerDay: 2 } },
        state
      )!,
    ]);
    state = applied4.updatedState;

    // Solve with WaSHI (HiGHS) and verify all group & daily cap constraints hold
    const res = await solveNurseScheduleWithWashi(state);
    expect(res.status).toBe("Optimal");
    expect(res.validatedByWashi).toBe(true);
    expect(res.evaluation?.valid).toBe(true);
    expect(res.evaluation?.violations).toEqual([]);

    // 1. Check daily cap: at most 2 training shifts on any day
    for (let d = 1; d <= state.config.numDays; d++) {
      let dailyT = 0;
      for (const nurse of state.nurses) {
        if (res.schedule![nurse.id]![d - 1] === tCode) {
          dailyT++;
        }
      }
      expect(dailyT).toBeLessThanOrEqual(2);
    }

    // 2. Check 新人1 (untrained): must take exactly 2 training shifts this month, and no E/N before completing 2
    for (const nurse of group1Nurses) {
      const row = res.schedule![nurse.id]!;
      let completedT = 0;
      for (let d = 1; d <= state.config.numDays; d++) {
        const s = row[d - 1]!;
        if (s === "E" || s === "N") {
          expect(completedT).toBeGreaterThanOrEqual(2);
        }
        if (s === tCode) {
          completedT++;
        }
      }
      expect(completedT).toBe(2);
    }

    // 3. Check 新人2 (already trained in previous month): must take 0 training shifts this month
    for (const nurse of group2Nurses) {
      const row = res.schedule![nurse.id]!;
      const completedTThisMonth = row.filter((s) => s === tCode).length;
      expect(completedTThisMonth).toBe(0);
    }
  }, 30_000);

  it("executes 2-turn hierarchical Gemini Nano routing (Turn 1 tool_type router -> Turn 2 category tool extractor) without regex fallback", async () => {
    const promptCalls: Array<{ promptText: string; schema: unknown }> = [];
    let currentTurn1Reply: unknown = {};
    let currentTurn2Reply: unknown = {};

    let currentTurn2ReplyBySchema = new Map<unknown, unknown>();

    const createMockSession = () => ({
      contextUsage: 120,
      contextWindow: 4096,
      async prompt(promptText: string, options?: { responseConstraint?: unknown }) {
        const schema = options?.responseConstraint;
        promptCalls.push({ promptText, schema });
        if (schema === STAGE1_ROUTER_SCHEMA) {
          return JSON.stringify(currentTurn1Reply);
        }
        if (schema && currentTurn2ReplyBySchema.has(schema)) {
          return JSON.stringify(currentTurn2ReplyBySchema.get(schema));
        }
        return JSON.stringify(currentTurn2Reply);
      },
      async *promptStreaming() {
        yield "完了\u3057\u307e\u3057\u305f。";
      },
      async clone() {
        return createMockSession();
      },
      destroy() {},
    });

    const prevLanguageModel = (globalThis as any).LanguageModel;
    (globalThis as any).LanguageModel = {
      async availability() {
        return "available";
      },
      async create() {
        return createMockSession();
      },
    };

    try {
      const manager = createGeminiNanoManager();
      let state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });

      // Step 1: Add custom shift "T" + quota + prerequisite via Turn 1 (routes: [{ tool_type: "custom_shift" }]) -> Turn 2
      currentTurn1Reply = {
        response: "新人研修\u30b7\u30d5\u30c8(研)\u3092追加\u3057、2回受講\u3059\u308b\u307e\u3067夜勤\u306b入\u308c\u306a\u3044\u30eb\u30fc\u30eb\u3092設定\u3057\u307e\u3059。",
        routes: [
          {
            tool_type: "custom_shift",
            instruction:
              "新人研修\u30b7\u30d5\u30c8\u3092追加\u3057\u3066。新人\u306f、\u3053\u306e研修\u3092必\u305a2回受\u3051\u306a\u3044\u3068、夜勤\u3084準夜勤\u306b\u306f\u3044\u308c\u306a\u3044。",
          },
        ],
      };
      currentTurn2Reply = {
        tools: [
          {
            tool_name: "add_custom_shift",
            args: {
              shiftName: "新人研修",
              shortLabel: "研",
            },
          },
          {
            tool_name: "add_shift_quota",
            args: {
              shiftName: "新人研修",
              attribute: "newcomer",
              count: 2,
            },
          },
          {
            tool_name: "add_shift_prerequisite",
            args: {
              shiftName: "新人研修",
              attribute: "newcomer",
              count: 2,
            },
          },
        ],
      };

      const plan1 = await manager.extractPlan(
        "新人研修\u30b7\u30d5\u30c8\u3092追加\u3057\u3066。新人\u306f、\u3053\u306e研修\u3092必\u305a2回受\u3051\u306a\u3044\u3068、夜勤\u3084準夜勤\u306b\u306f\u3044\u308c\u306a\u3044。",
        state
      );
      expect(plan1.intentType).toBe("modify_and_solve");
      expect(plan1.stage1Response).toContain("新人研修\u30b7\u30d5\u30c8");
      expect(plan1.routerTrace?.length).toBe(4);
      expect(promptCalls.length).toBe(2);
      expect(promptCalls[0]!.schema).toBe(STAGE1_ROUTER_SCHEMA);
      expect(promptCalls[1]!.schema).toBe(CUSTOM_SHIFT_TOOLS_SCHEMA);

      state = applyChatOperationsToState(state, plan1.operations).updatedState;
      expect(state.customRules.some((r) => r.kind === "shift_prerequisite")).toBe(true);
      expect(state.customRules.some((r) => r.kind === "shift_count_quota")).toBe(true);

      // Step 2: Allow previous month training credit via Turn 1 (routes: [{ tool_type: "custom_shift" }]) -> Turn 2 (CUSTOM_SHIFT_TOOLS_SCHEMA)
      promptCalls.length = 0;
      currentTurn1Reply = {
        response: "前月\u307e\u3067\u306e新人研修\u306e受講実績\u3082含\u3081\u308b\u3088\u3046\u306b設定\u3057\u307e\u3059。",
        routes: [
          {
            tool_type: "custom_shift",
            instruction: "新人研修\u306f、前\u306e月\u307e\u3067\u306e受講分\u3082含\u3081\u3066\u3088\u3044\u3053\u3068\u306b\u3057\u3066。",
          },
        ],
      };
      currentTurn2Reply = {
        tools: [
          {
            tool_name: "allow_prev_month_shift",
            args: { shiftName: "新人研修" },
          },
        ],
      };

      const plan2 = await manager.extractPlan(
        "新人研修\u306f、前\u306e月\u307e\u3067\u306e受講分\u3082含\u3081\u3066\u3088\u3044\u3053\u3068\u306b\u3057\u3066。",
        state
      );
      expect(plan2.intentType).toBe("modify_and_solve");
      expect(promptCalls.length).toBe(2);
      expect(promptCalls[0]!.schema).toBe(STAGE1_ROUTER_SCHEMA);
      expect(promptCalls[1]!.schema).toBe(CUSTOM_SHIFT_TOOLS_SCHEMA);
      state = applyChatOperationsToState(state, plan2.operations).updatedState;

      // Step 3: Weekday restriction + Daily cap ("max 2 per day") via Turn 1 (routes: [{ tool_type: "custom_shift" }]) -> Turn 2 (CUSTOM_SHIFT_TOOLS_SCHEMA)
      promptCalls.length = 0;
      currentTurn1Reply = {
        response: "新人研修\u3092平日\u306e\u307f\u30fb1日2名\u307e\u3067\u306b制限\u3057\u307e\u3059。",
        routes: [
          {
            tool_type: "custom_shift",
            instruction: "新人研修\u306f平日\u306e\u307f\u3067、1日\u306b2名\u307e\u3067\u3057\u304b受\u3051\u3089\u308c\u306a\u3044。",
          },
        ],
      };
      currentTurn2Reply = {
        tools: [
          {
            tool_name: "add_shift_day_restriction",
            args: { shiftName: "新人研修", dayRestriction: "weekday_only" },
          },
          {
            tool_name: "add_daily_shift_cap",
            args: { shiftName: "新人研修", maxStaffPerDay: 2 },
          },
        ],
      };

      const plan3 = await manager.extractPlan(
        "新人研修\u306f平日\u306e\u307f\u3067、1日\u306b2名\u307e\u3067\u3057\u304b受\u3051\u3089\u308c\u306a\u3044。",
        state
      );
      expect(plan3.intentType).toBe("modify_and_solve");
      expect(promptCalls.length).toBe(2);
      expect(promptCalls[1]!.schema).toBe(CUSTOM_SHIFT_TOOLS_SCHEMA);
      state = applyChatOperationsToState(state, plan3.operations).updatedState;

      // Step 4: Verify all 7 Stage 2 schemas have zero overlapping tools (1 tool = 1 category) + universal "none" escape hatch
      const seenToolsAcrossCategories = new Set<string>();
      for (const stage2Schema of [
        CUSTOM_SHIFT_TOOLS_SCHEMA,
        SKILL_AND_PAIR_TOOLS_SCHEMA,
        STAFF_CALENDAR_TOOLS_SCHEMA,
        STAFF_CONTRACT_TOOLS_SCHEMA,
        WARD_COVERAGE_AND_PARAM_TOOLS_SCHEMA,
        WARD_TRANSITION_AND_RULE_TOOLS_SCHEMA,
        SYSTEM_ACTION_TOOLS_SCHEMA,
      ]) {
        const branches = stage2Schema.properties.tools.items.anyOf;
        expect(Array.isArray(branches)).toBe(true);
        const noneBranch = branches.find((b: any) => b.properties.tool_name.enum[0] === "none");
        expect(noneBranch).toBeDefined();
        expect((noneBranch!.properties.args as any).required).toBeUndefined();

        for (const b of branches) {
          const tName = b.properties.tool_name.enum[0] as string;
          if (tName === "none") continue;
          expect(seenToolsAcrossCategories.has(tName)).toBe(false);
          seenToolsAcrossCategories.add(tName);
        }
      }
      // Verify that tools requiring shiftName still enforce it in their specific branch
      const addCustomShiftBranch = CUSTOM_SHIFT_TOOLS_SCHEMA.properties.tools.items.anyOf.find(
        (b: any) => b.properties.tool_name.enum[0] === "add_custom_shift"
      );
      expect((addCustomShiftBranch!.properties.args as any).required).toEqual(["shiftName"]);

      // Step 4b: Night shift leveling by skill/role ("level night shifts by skill" -> ward_coverage_and_param -> level_night_shifts)
      promptCalls.length = 0;
      currentTurn1Reply = {
        response: "\u30b9\u30ad\u30eb\u3054\u3068\u306b夜勤\u306e数\u3092平準化\u3059\u308b\u30eb\u30fc\u30eb\u3092設定\u3057\u307e\u3059。",
        routes: [
          {
            tool_type: "ward_coverage_and_param",
            instruction: "\u30b9\u30ad\u30eb毎\u306b、夜勤\u306e数\u3092平準化\u3057\u305f\u3044",
          },
        ],
      };
      currentTurn2Reply = {
        tools: [
          {
            tool_name: "level_night_shifts",
            args: { groupBy: "skill" },
          },
        ],
      };
      const planLevel = await manager.extractPlan("\u30b9\u30ad\u30eb毎\u306b、夜勤\u306e数\u3092平準化\u3057\u305f\u3044", state);
      expect(planLevel.intentType).toBe("modify_and_solve");
      expect(planLevel.operations.length).toBe(1);
      expect(planLevel.operations[0]!.op).toBe("level_night_shifts");
      expect(promptCalls[1]!.schema).toBe(WARD_COVERAGE_AND_PARAM_TOOLS_SCHEMA);
      state = applyChatOperationsToState(state, planLevel.operations).updatedState;
      expect(state.customRules.some((r) => r.kind === "level_night_shifts")).toBe(true);
      // Mid-career nurses must NOT be assigned newcomer training
      expect(
        state.customRules.some((r) => r.kind === "shift_count_quota" && r.attribute === "mid")
      ).toBe(false);

      // Verify STAGE1_ROUTER_SCHEMA generates "thought" BEFORE "routes" and "response"
      expect(STAGE1_ROUTER_SCHEMA.required).toEqual(["thought", "routes", "response"]);
      expect(Object.keys(STAGE1_ROUTER_SCHEMA.properties)).toEqual(["thought", "routes", "response"]);

      // Step 4c: Multi-category routing with per-category decomposed instruction (routes: [{ tool_type, instruction }]) + thought + onProgress
      promptCalls.length = 0;
      currentTurn1Reply = {
        thought: "佐藤\u3055\u3093\u306e12日休\u307f固定\u306fstaff_calendar、最大連勤4日\u3078\u306e変更\u306fward_coverage_and_param\u306b分解\u3059\u308b。",
        response: "佐藤\u3055\u3093\u306e12日\u3092公休\u306b固定\u3057、最大連勤日数\u30924日\u306b変更\u3057\u307e\u3059。",
        routes: [
          {
            tool_type: "staff_calendar",
            instruction: "佐藤 美咲\u3055\u3093\u306e12日\u3092確定\u306e休\u307f(O)\u306b\u3057\u3066",
          },
          {
            tool_type: "ward_coverage_and_param",
            instruction: "最大連勤\u30924日\u306b変更\u3057\u3066",
          },
        ],
      };
      currentTurn2ReplyBySchema.set(STAFF_CALENDAR_TOOLS_SCHEMA, {
        tools: [
          {
            tool_name: "add_request_day",
            args: { nurseNameOrId: "佐藤 美咲", day: 12, shift: "O", isHard: true },
          },
        ],
      });
      currentTurn2ReplyBySchema.set(WARD_COVERAGE_AND_PARAM_TOOLS_SCHEMA, {
        tools: [
          {
            tool_name: "set_param",
            args: { paramName: "maxConsecutiveWorkDays", paramValue: 4 },
          },
        ],
      });
      const progressPhases: string[] = [];
      const planMultiCat = await manager.extractPlan(
        "佐藤 美咲\u3055\u3093\u306e12日\u3092確定\u306e休\u307f(O)\u306b\u3057\u3066、最大連勤\u30924日\u306b変更\u3057\u3066",
        state,
        undefined,
        (ev) => progressPhases.push(ev.phase)
      );
      currentTurn2ReplyBySchema.clear();
      expect(planMultiCat.intentType).toBe("modify_and_solve");
      expect(planMultiCat.stage1Thought).toBe(
        "佐藤\u3055\u3093\u306e12日休\u307f固定\u306fstaff_calendar、最大連勤4日\u3078\u306e変更\u306fward_coverage_and_param\u306b分解\u3059\u308b。"
      );
      expect(progressPhases).toEqual([
        "turn1_start",
        "turn1_done",
        "turn2_start",
        "turn2_route_done",
        "turn2_start",
        "turn2_route_done",
        "verification_done",
      ]);
      expect(promptCalls.length).toBe(3); // Turn 1 + Turn 2 (staff_calendar) + Turn 2 (ward_coverage_and_param)
      expect(promptCalls[1]!.schema).toBe(STAFF_CALENDAR_TOOLS_SCHEMA);
      expect(promptCalls[1]!.promptText).toContain("佐藤 美咲\u3055\u3093\u306e12日\u3092確定\u306e休\u307f(O)\u306b\u3057\u3066");
      expect(promptCalls[1]!.promptText).not.toContain("最大連勤\u30924日\u306b変更\u3057\u3066");
      expect(promptCalls[2]!.schema).toBe(WARD_COVERAGE_AND_PARAM_TOOLS_SCHEMA);
      expect(promptCalls[2]!.promptText).toContain("最大連勤\u30924日\u306b変更\u3057\u3066");
      expect(promptCalls[2]!.promptText).not.toContain("佐藤 美咲\u3055\u3093\u306e12日\u3092確定\u306e休\u307f(O)\u306b\u3057\u3066");
      expect(planMultiCat.operations).toEqual([
        {
          op: "add_request",
          nurseNameOrId: "佐藤 美咲",
          day: 12,
          days: undefined,
          shift: "O",
          isHard: true,
        },
        {
          op: "set_param",
          paramName: "maxConsecutiveWorkDays",
          paramValue: 4,
        },
      ]);

      // Step 5a: Pure question ("question") only calls Turn 1 and does not call Turn 2,
      // and streamConsultationReply with outcome=null answers the question without solver status/solveTime
      promptCalls.length = 0;
      currentTurn1Reply = {
        response: "現在\u306e\u30eb\u30fc\u30eb設定\u3084対応機能\u3092\u3054説明\u3057\u307e\u3059。",
        routes: [{ tool_type: "question" }],
      };
      const plan4 = await manager.extractPlan("\u306a\u306b\u304c\u3067\u304d\u308b？", state);
      expect(plan4.intentType).toBe("consult_only");
      expect(plan4.nonToolReason).toBe("question");
      expect(plan4.operations).toEqual([]);
      expect(promptCalls.length).toBe(1);

      let consultReply = "";
      for await (const chunk of manager.streamConsultationReply("\u306a\u306b\u304c\u3067\u304d\u308b？", [], state, null)) {
        consultReply += chunk;
      }
      const consultTrace = manager.getLastConsultTrace();
      expect(consultTrace).toBeDefined();
      expect(consultTrace!.userPrompt).toContain("\u3053\u306eAI\u30a2\u30b7\u30b9\u30bf\u30f3\u30c8\u3067\u3067\u304d\u308b\u3053\u3068");
      expect(consultTrace!.userPrompt).toContain("\u30b9\u30ad\u30eb\u30fb資格\u306e追加\u30fb削除\u30fb\u30ea\u30fc\u30c0\u30fc代行設定");
      expect(consultTrace!.userPrompt).not.toContain("WaSHI (HiGHS) 最適化\u30fb検証結果");
      expect(consultTrace!.userPrompt).not.toContain("求解時間:");
      expect(consultTrace!.systemPrompt).not.toContain("変更\u30aa\u30da\u30ec\u30fc\u30b7\u30e7\u30f3\u306f実行\u3055\u308c\u307e\u305b\u3093\u3067\u3057\u305f");

      // Step 5b: Unsupported request ("unsupported") skips Turn 2 and instructs Turn 3 to explain out-of-scope + suggest alternatives
      promptCalls.length = 0;
      currentTurn1Reply = {
        response: "給与\u3084手当額\u306e計算\u30fb変更\u306b\u306f対応\u3057\u3066\u3044\u307e\u305b\u3093。",
        routes: [{ tool_type: "unsupported" }],
      };
      const planUnsupported = await manager.extractPlan("夜勤手当\u30921回5000円\u306b増\u3084\u3057\u3066", state);
      expect(planUnsupported.intentType).toBe("consult_only");
      expect(planUnsupported.nonToolReason).toBe("unsupported");
      expect(planUnsupported.operations).toEqual([]);
      expect(promptCalls.length).toBe(1);

      for await (const _ of manager.streamConsultationReply("夜勤手当\u30921回5000円\u306b増\u3084\u3057\u3066", [], state, null)) {
        // consume stream
      }
      const unsupportedTrace = manager.getLastConsultTrace();
      expect(unsupportedTrace!.userPrompt).toContain("【\u30b7\u30b9\u30c6\u30e0未対応\u306e要求\u306b対\u3059\u308b回答指示】");
      expect(unsupportedTrace!.userPrompt).toContain("給与\u3084手当額\u306e計算\u30fb変更\u306b\u306f対応\u3057\u3066\u3044\u307e\u305b\u3093。");

      // Step 5c: Ambiguous request ("clarify") skips Turn 2 and instructs Turn 3 to ask for missing specifics
      promptCalls.length = 0;
      currentTurn1Reply = {
        response: "\u3069\u306a\u305f\u306e\u30fb何月何日（\u307e\u305f\u306f何日〜何日）\u3092公休\u306b\u3059\u308b\u304b教\u3048\u3066\u3044\u305f\u3060\u3051\u307e\u3059\u304b？",
        routes: [{ tool_type: "clarify" }],
      };
      const planClarify = await manager.extractPlan("来週休\u307e\u305b\u3066", state);
      expect(planClarify.intentType).toBe("consult_only");
      expect(planClarify.nonToolReason).toBe("clarify");
      expect(planClarify.operations).toEqual([]);
      expect(promptCalls.length).toBe(1);

      for await (const _ of manager.streamConsultationReply("来週休\u307e\u305b\u3066", [], state, null)) {
        // consume stream
      }
      const clarifyTrace = manager.getLastConsultTrace();
      expect(clarifyTrace!.userPrompt).toContain("【情報不足\u30fb確認\u304c必要\u306a指示\u306b対\u3059\u308b回答指示】");
      expect(clarifyTrace!.userPrompt).not.toContain("\u3053\u306eAI\u30a2\u30b7\u30b9\u30bf\u30f3\u30c8\u3067\u3067\u304d\u308b\u3053\u3068");

      // Step 6: Skill addition ("Add assistant leader skill who can substitute for leader")
      // Routes to "skill_and_pair" -> add_skill_def, adds sub_leader with substitutesFor="leader_cap",
      // and does NOT create a custom shift CS1 or secretly modify nurse profiles without update_nurse_skill
      promptCalls.length = 0;
      currentTurn1Reply = {
        response: "\u30ea\u30fc\u30c0\u30fc\u306e代\u308f\u308a\u306b\u306a\u308c\u308b「副\u30ea\u30fc\u30c0\u30fc」\u30b9\u30ad\u30eb\u3092追加\u3057\u307e\u3059。",
        routes: [
          {
            tool_type: "skill_and_pair",
            instruction: "\u30b9\u30ad\u30eb\u3092追加\u3057\u305f\u3044。副\u30ea\u30fc\u30c0\u30fc。\u30ea\u30fc\u30c0\u30fc\u306e代\u308f\u308a\u306b\u306a\u308c\u308b。",
          },
        ],
      };
      currentTurn2Reply = {
        tools: [
          {
            tool_name: "add_skill_def",
            args: { skillName: "副\u30ea\u30fc\u30c0\u30fc", substitutesFor: "\u30ea\u30fc\u30c0\u30fc" },
          },
        ],
      };
      const planSkillAdd = await manager.extractPlan(
        "\u30b9\u30ad\u30eb\u3092追加\u3057\u305f\u3044。副\u30ea\u30fc\u30c0\u30fc。\u30ea\u30fc\u30c0\u30fc\u306e代\u308f\u308a\u306b\u306a\u308c\u308b。",
        state
      );
      expect(planSkillAdd.intentType).toBe("modify_and_solve");
      expect(promptCalls[1]!.schema).toBe(SKILL_AND_PAIR_TOOLS_SCHEMA);
      expect(planSkillAdd.operations).toEqual([
        {
          op: "add_skill_def",
          skillName: "副\u30ea\u30fc\u30c0\u30fc",
          substitutesFor: "leader_cap",
          skillMinDay: undefined,
          skillMinEvening: undefined,
          skillMinNight: undefined,
        },
      ]);
      state = applyChatOperationsToState(state, planSkillAdd.operations).updatedState;
      expect(state.customShiftDefs.some((d) => d.label === "副\u30ea\u30fc\u30c0\u30fc")).toBe(false);
      const subLeaderDef = state.skillDefs?.find(
        (s) => s.label === "副\u30ea\u30fc\u30c0\u30fc" && s.substitutesFor === "leader_cap"
      );
      expect(subLeaderDef).toBeDefined();
      const subLeaderCode = subLeaderDef!.code;
      // Defining a skill does not secretly auto-assign it until update_nurse_skill is called
      expect(state.nurses.some((n) => n.skills.includes(subLeaderCode))).toBe(false);

      // Explicitly assign sub_leader to mid-career nurses via update_nurse_skill
      state = applyChatOperationsToState(state, [
        convertStage2ToolToOperation(
          { tool_name: "update_nurse_skill", args: { target: "中堅", skillName: "副\u30ea\u30fc\u30c0\u30fc", action: "add" } },
          state
        )!,
      ]).updatedState;
      const subLeaderHolders = state.nurses.filter((n) =>
        n.skills.includes(subLeaderCode)
      );
      expect(subLeaderHolders.length).toBeGreaterThan(0);

      // Verify final solved schedule satisfies all constraints and levels night shifts per role
      const res = await solveNurseScheduleWithWashi(state);
      expect(res.status).toBe("Optimal");
      expect(res.validatedByWashi).toBe(true);
      expect(res.evaluation?.valid).toBe(true);

      const leaderNights = state.nurses
        .filter((n) => n.skills.includes("leader") && n.nightOk)
        .map((n) => res.evaluation!.nurseSummaries[n.id]!.totalNightShifts);
      const midNights = state.nurses
        .filter((n) => n.skills.includes("mid") && n.nightOk)
        .map((n) => res.evaluation!.nurseSummaries[n.id]!.totalNightShifts);
      expect(Math.max(...leaderNights) - Math.min(...leaderNights)).toBeLessThanOrEqual(2);
      expect(Math.max(...midNights) - Math.min(...midNights)).toBeLessThanOrEqual(2);
    } finally {
      if (prevLanguageModel === undefined) {
        delete (globalThis as any).LanguageModel;
      } else {
        (globalThis as any).LanguageModel = prevLanguageModel;
      }
    }
  }, 30_000);

  it("supports dynamic skill removal, night-to-off interval, team balance, and individual nurse contracts", async () => {
    let state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });

    // 1. Add substitute skill "sub-leader", remove "ventilator", require N->O transition + team_A/team_B staffing rules, and set N05 to day-only
    state = applyChatOperationsToState(state, [
      { op: "add_skill_def", skillName: "副\u30ea\u30fc\u30c0\u30fc", substitutesFor: "leader_cap" },
      { op: "set_shift_transition", fromShift: "N", toShift: "O", transitionPolicy: "require" },
      { op: "set_staffing_rule", targetShift: "D", shifts: ["D"], attribute: "team_A", minCount: 3 },
      { op: "set_staffing_rule", targetShift: "D", shifts: ["D"], attribute: "team_B", minCount: 3 },
      { op: "remove_skill_def", skillName: "人工呼吸器" },
      {
        op: "set_nurse_contract",
        nurseNameOrId: "N05",
        nightOk: false,
      },
      {
        op: "set_nurse_contract",
        nurseNameOrId: "N06",
        maxMonthlyNightShifts: 3,
      },
    ]).updatedState;

    expect(
      state.skillDefs?.some((s) => s.label === "副\u30ea\u30fc\u30c0\u30fc" && s.substitutesFor === "leader_cap")
    ).toBe(true);
    expect(state.skillDefs?.some((s) => s.code === "ventilator")).toBe(false);
    expect(state.nurses.some((n) => n.skills.includes("ventilator"))).toBe(false);
    expect(state.config.shiftTransitions.N.O).toBe("require");
    expect(state.nurses.find((n) => n.id === "N05")?.nightOk).toBe(false);
    expect(state.nurses.find((n) => n.id === "N06")?.maxMonthlyNightShifts).toBe(3);

    const res = await solveNurseScheduleWithWashi(state);
    expect(res.status).toBe("Optimal");
    expect(res.validatedByWashi).toBe(true);
    expect(res.evaluation?.valid).toBe(true);

    // Check N05 has 0 night shifts and N06 has <= 3 night shifts
    expect(res.evaluation!.nurseSummaries["N05"]!.totalNightShifts).toBe(0);
    expect(res.evaluation!.nurseSummaries["N06"]!.totalNightShifts).toBeLessThanOrEqual(3);

    // Check requireOffAfterNight: every N shift in days 1..29 must be followed by O on day d+1
    for (const nurse of state.nurses) {
      const row = res.schedule![nurse.id]!;
      for (let d = 1; d < state.config.numDays; d++) {
        if (row[d - 1] === "N") {
          expect(row[d]).toBe("O");
        }
      }
    }

    // Check enforceTeamBalance: at least minTeamMembersDay (3) from Team A and Team B on Day shift every day
    const teamANurses = state.nurses.filter((n) => n.skills.includes("team_A"));
    const teamBNurses = state.nurses.filter((n) => n.skills.includes("team_B"));
    for (let d = 1; d <= state.config.numDays; d++) {
      const aDayCount = teamANurses.filter((n) => res.schedule![n.id]![d - 1] === "D").length;
      const bDayCount = teamBNurses.filter((n) => res.schedule![n.id]![d - 1] === "D").length;
      expect(aDayCount).toBeGreaterThanOrEqual(3);
      expect(bDayCount).toBeGreaterThanOrEqual(3);
    }
  }, 30_000);

  it("separates single-day add_request_day(day) from multi-day add_request_range(startDay, endDay) in prefix-free natural order and honestly diagnoses Infeasible on 17 off days", async () => {
    const g = globalThis as any;
    const origLM = g.LanguageModel;
    try {
      // Verify schema separates single-day (`day`) and range (`startDay`, `endDay`) branches in natural order (single-day -> range)
      const srBranches = STAFF_CALENDAR_TOOLS_SCHEMA.properties.tools.items.anyOf;
      const singleIdx = srBranches.findIndex(
        (b: any) => b.properties.tool_name.enum[0] === "add_request_day"
      );
      const rangeIdx = srBranches.findIndex(
        (b: any) => b.properties.tool_name.enum[0] === "add_request_range"
      );
      expect(singleIdx).toBeGreaterThanOrEqual(0);
      expect(rangeIdx).toBeGreaterThan(singleIdx);
      const singleBranch = srBranches[singleIdx];
      const rangeBranch = srBranches[rangeIdx];
      expect((singleBranch!.properties.args as any).required).toEqual([
        "nurseNameOrId",
        "day",
        "shift",
        "isHard",
      ]);
      expect((rangeBranch!.properties.args as any).required).toEqual([
        "nurseNameOrId",
        "startDay",
        "endDay",
        "shift",
        "isHard",
      ]);

      g.LanguageModel = {
        availability: async () => "available",
        create: async () => ({
          prompt: async (input: string) => {
            if (input.includes("\u30e6\u30fc\u30b6\u30fc\u306e発話:")) {
              return JSON.stringify({
                response: "小林\u3055\u3093\u306e11月1日\u304b\u308911月17日\u307e\u3067\u306e\u30b7\u30d5\u30c8\u3092公休(O)\u306b固定\u3057\u307e\u3059。",
                routes: [
                  {
                    tool_type: "staff_calendar",
                    instruction: "小林\u3055\u3093\u304c怪我\u3092\u3057\u306611/17\u307e\u3067動\u3051\u306a\u3044\u3089\u3057\u3044。",
                  },
                ],
              });
            }
            return JSON.stringify({
              tools: [
                {
                  tool_name: "add_request_range",
                  args: {
                    nurseNameOrId: "小林",
                    endDay: 17,
                    shift: "O",
                    isHard: true,
                  },
                },
              ],
            });
          },
          clone: async function () {
            return this;
          },
          destroy: () => {},
        }),
      };

      const state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });
      const manager = createGeminiNanoManager();
      await manager.initialize();

      const plan = await manager.extractPlan(
        "小林\u3055\u3093\u304c怪我\u3092\u3057\u306611/17\u307e\u3067動\u3051\u306a\u3044\u3089\u3057\u3044。",
        state
      );
      expect(plan.intentType).toBe("modify_and_solve");
      expect(plan.operations.length).toBe(1);
      const firstOp = plan.operations[0];
      expect(firstOp?.op).toBe("add_request");
      if (firstOp?.op === "add_request") {
        expect(["N09", "小林"]).toContain(firstOp.nurseNameOrId);
        expect(firstOp.days).toEqual(
          Array.from({ length: 17 }, (_, i) => i + 1)
        );
      }

      const { updatedState, appliedLogs } = applyChatOperationsToState(state, plan.operations);
      // Should emit a single concise range summary instead of 17 individual lines
      expect(appliedLogs.length).toBe(1);
      expect(appliedLogs[0]).toContain("11/1〜11/17 (計17日間)");
      expect(appliedLogs[0]).toContain("小林 誠(N09)");

      // All 17 days (1..17) must be registered as pin_shift rules for N09
      const n09Pins = updatedState.customRules.filter(
        (r) => r.kind === "pin_shift" && r.nurseId === "N09" && r.shift === "O"
      );
      expect(n09Pins.length).toBe(17);

      // Because 17 days are pinned to O, only 13 days remain in a 30-day month,
      // which conflicts with minMonthlyWorkDays=14 (`monthly_work_min_N09`).
      // WaSHI must honestly report Infeasible and diagnose the conflict without silently mutating minMonthlyWorkDays.
      const outcome = await solveNurseScheduleWithWashi(updatedState);
      expect(outcome.status).toBe("Infeasible");
      expect(
        outcome.rawConflictNames.some(
          (name) => name.includes("monthly_work_min_N09") || name.includes("custom_pin_")
        )
      ).toBe(true);
    } finally {
      g.LanguageModel = origLM;
    }
  }, 30_000);

  it("minimizes cell perturbations (99%+ retention) when fine-tuning an existing schedule with referenceSchedule", async () => {
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });
    const initialOutcome = await solveNurseScheduleWithWashi(baseState);
    expect(initialOutcome.status).toBe("Optimal");
    const initialSchedule = initialOutcome.schedule!;

    // Pick a day where N01 (佐藤 美咲) is working (not "O") and pin that day to "O" (公休)
    const workDayIdx = initialSchedule["N01"]!.findIndex((s) => s !== "O");
    expect(workDayIdx).toBeGreaterThanOrEqual(0);
    const targetDay = workDayIdx + 1;

    const { updatedState } = applyChatOperationsToState(baseState, [
      {
        op: "add_request",
        nurseNameOrId: "N01",
        day: targetDay,
        shift: "O",
        isHard: true,
      },
    ]);

    const tweakedOutcome = await solveNurseScheduleWithWashi(updatedState, {
      referenceSchedule: initialSchedule,
    });
    expect(tweakedOutcome.status).toBe("Optimal");
    expect(tweakedOutcome.validatedByWashi).toBe(true);
    expect(tweakedOutcome.schedule!["N01"]![workDayIdx]).toBe("O");

    const diff = tweakedOutcome.diffFromPrevious!;
    expect(diff).toBeTruthy();
    expect(diff.totalCells).toBe(900);
    // Pinning a single cell should only perturb a tiny number of cells (<= 10 out of 900, i.e. >= 98.8% retention)
    console.log(
      `[Minimal Perturbation] changed=${diff.changedCellsCount}/${diff.totalCells} cells (retention=${diff.retentionRatePct}%, affectedNurses=${diff.affectedNursesCount})`
    );
    expect(diff.changedCellsCount).toBeGreaterThanOrEqual(1);
    expect(diff.changedCellsCount).toBeLessThanOrEqual(10);
    expect(diff.retentionRatePct).toBeGreaterThanOrEqual(98.8);
  }, 30_000);

  it("supports unified skill model (no special-cased leader), ODEN-tagged custom shifts, shift-parameterized NG pairs, forbidDayToNight, and per-nurse minWorkDays", async () => {
    // 1. Verify add_skill_def schema only requires ["skillName"]
    const skillBranches = SKILL_AND_PAIR_TOOLS_SCHEMA.properties.tools.items.anyOf;
    const addSkillBranch = skillBranches.find(
      (b: any) => b.properties.tool_name.enum[0] === "add_skill_def"
    );
    expect((addSkillBranch!.properties.args as any).required).toEqual(["skillName"]);

    let state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });

    // 2. Convert Stage 2 tool calls using the unified NSP schema
    const ops = [
      convertStage2ToolToOperation(
        { tool_name: "add_skill_def", args: { skillName: "認知症\u30b1\u30a2", minDay: 1 } },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "update_nurse_skill",
          args: { target: "中堅", skillName: "認知症\u30b1\u30a2", action: "add" },
        },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "add_ng_pair",
          args: { nurseA: "N01", nurseB: "N02", shifts: ["D", "E", "N"] },
        },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "set_shift_transition",
          args: { fromShift: "D", toShift: "N", policy: "forbid" },
        },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "add_request_range",
          args: { nurseNameOrId: "N09", endDay: 17, shift: "O", isHard: true },
        },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "set_nurse_contract",
          args: { nurseNameOrId: "N09", minWorkDays: 8 },
        },
        state
      )!,
    ];

    state = applyChatOperationsToState(state, ops).updatedState;
    expect(state.config.shiftTransitions.D.N).toBe("forbid");
    expect(state.nurses.find((n) => n.id === "N09")?.minMonthlyWorkDays).toBe(8);

    const outcome = await solveNurseScheduleWithWashi(state);
    expect(outcome.status).toBe("Optimal");
    expect(outcome.validatedByWashi).toBe(true);
    expect(outcome.evaluation?.valid).toBe(true);

    // Verify N01 and N02 are never assigned to the same D, E, or N shift on any day
    for (let d = 1; d <= state.config.numDays; d++) {
      const s1 = outcome.schedule!["N01"]![d - 1]!;
      const s2 = outcome.schedule!["N02"]![d - 1]!;
      if (s1 === "D" || s1 === "E" || s1 === "N") {
        expect(s2).not.toBe(s1);
      }
    }

    // Verify forbidDayToNight (no D -> N transition for any nurse)
    for (const nurse of state.nurses) {
      const row = outcome.schedule![nurse.id]!;
      for (let d = 1; d < state.config.numDays; d++) {
        if (row[d - 1] === "D") {
          expect(row[d]).not.toBe("N");
        }
      }
    }
  }, 30_000);

  it("supports set_staffing_rule (skill min/max, newcomer cap, and team constraints on shifts)", async () => {
    let state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });

    // Apply staffing rules on D and E:
    // - Day shift (D): ICU/ER skill >= 2 nurses
    // - Day shift (D): newcomer <= 2 nurses
    // - Day shift (D): Team A >= 3 nurses
    // - Evening shift (E): Team B >= 1 nurse
    const ops = [
      convertStage2ToolToOperation(
        {
          tool_name: "set_staffing_rule",
          args: { targetShift: "D", attribute: "救急\u30fbICU", minCount: 2 },
        },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "set_staffing_rule",
          args: { targetShift: "D", attribute: "新人", maxCount: 2 },
        },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "set_staffing_rule",
          args: { targetShift: "D", attribute: "A班", minCount: 3 },
        },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "set_staffing_rule",
          args: { targetShift: "E", attribute: "B班", minCount: 1 },
        },
        state
      )!,
    ];

    const { updatedState, appliedLogs } = applyChatOperationsToState(state, ops);
    expect(appliedLogs.length).toBe(4);
    state = updatedState;

    const res = await solveNurseScheduleWithWashi(state);
    expect(res.status).toBe("Optimal");
    expect(res.validatedByWashi).toBe(true);
    expect(res.evaluation?.valid).toBe(true);
    expect(res.evaluation?.violations).toEqual([]);

    for (let d = 1; d <= state.config.numDays; d++) {
      const idx = d - 1;
      const dNurses = state.nurses.filter((n) => res.schedule![n.id]![idx] === "D");
      const eNurses = state.nurses.filter((n) => res.schedule![n.id]![idx] === "E");

      // Rule 1: D has >= 2 nurses with icu_er skill
      const dIcuCount = dNurses.filter((n) => n.skills.includes("icu_er")).length;
      expect(dIcuCount).toBeGreaterThanOrEqual(2);

      // Rule 2: Newcomers <= 2 in D
      const dNewcomers = dNurses.filter((n) => n.skills.includes("newcomer")).length;
      expect(dNewcomers).toBeLessThanOrEqual(2);

      // Rule 3: Team A nurses in D >= 3
      const teamAInD = dNurses.filter((n) => n.skills.includes("team_A")).length;
      expect(teamAInD).toBeGreaterThanOrEqual(3);

      // Rule 4: Team B nurses in E >= 1
      const teamBInE = eNurses.filter((n) => n.skills.includes("team_B")).length;
      expect(teamBInE).toBeGreaterThanOrEqual(1);
    }
  }, 30_000);

  it("handles date-bounded custom shift with daily newcomer staffing ('Festival from Nov 16 for 3 days, assign 2 newcomers daily') and multi-turn history", async () => {
    let state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });

    // 1. Single-turn application of:
    // Add festival shift from Nov 16 for 3 days, assign 2 newcomers daily as day shift.
    const ops = [
      convertStage2ToolToOperation(
        { tool_name: "add_custom_shift", args: { shiftName: "祭\u308a", baseShift: "D" } },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "add_shift_day_restriction",
          args: { shiftName: "祭\u308a", startDay: 16, endDay: 18 },
        },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "add_daily_shift_cap",
          args: {
            shiftName: "祭\u308a",
            minStaffPerDay: 2,
            maxStaffPerDay: 2,
            attribute: "newcomer",
          },
        },
        state
      )!,
    ];

    const applied = applyChatOperationsToState(state, ops);
    expect(applied.appliedLogs.length).toBe(3);
    state = applied.updatedState;

    const matsuriDef = state.customShiftDefs.find((d) => d.label === "祭\u308a");
    expect(matsuriDef).toBeDefined();
    const csCode = matsuriDef!.code;

    const res = await solveNurseScheduleWithWashi(state);
    expect(res.status).toBe("Optimal");
    expect(res.validatedByWashi).toBe(true);
    expect(res.evaluation?.valid).toBe(true);
    expect(res.evaluation?.violations).toEqual([]);

    for (let d = 1; d <= state.config.numDays; d++) {
      const idx = d - 1;
      const assignedNurses = state.nurses.filter((n) => res.schedule![n.id]![idx] === csCode);
      if (d >= 16 && d <= 18) {
        // Exactly 2 newcomers assigned on Nov 16, 17, 18 per the newcomer daily cap rule
        const assignedNewcomers = assignedNurses.filter((n) => n.skills.includes("newcomer"));
        expect(assignedNewcomers.length).toBe(2);
      } else {
        // 0 assigned outside Nov 16..18 per the shift_day_restriction rule
        expect(assignedNurses.length).toBe(0);
      }
    }

    // 2. Pinning 山下 蓮(N27) to leave on Nov 1..18 (18 days off -> max 12 workdays) conflicts with ward-wide minMonthlyWorkDays (14)
    state = applyChatOperationsToState(state, [
      convertStage2ToolToOperation(
        {
          tool_name: "add_request_range",
          args: { nurseNameOrId: "山下", endDay: 18, shift: "O", isHard: true },
        },
        state
      )!,
    ]).updatedState;
    const resInfeasible = await solveNurseScheduleWithWashi(state);
    expect(resInfeasible.status).toBe("Infeasible");
    expect(resInfeasible.conflicts.some((c) => c.name === "monthly_work_min_N27")).toBe(true);

    // 3. Exempting 山下 蓮(N27) individually via set_nurse_contract(minWorkDays: 0) resolves the conflict while keeping ward-wide minMonthlyWorkDays=14 for everyone else
    state = applyChatOperationsToState(state, [
      convertStage2ToolToOperation(
        {
          tool_name: "set_nurse_contract",
          args: { nurseNameOrId: "山下", minWorkDays: 0 },
        },
        state
      )!,
    ]).updatedState;
    expect(state.nurses.find((n) => n.id === "N27")?.minMonthlyWorkDays).toBe(0);

    const resResolved = await solveNurseScheduleWithWashi(state);
    expect(resResolved.status).toBe("Optimal");
    expect(resResolved.validatedByWashi).toBe(true);
    expect(resResolved.evaluation?.valid).toBe(true);
    expect(resResolved.evaluation!.nurseSummaries["N27"]!.totalWorkDays).toBeLessThanOrEqual(12);
    for (const n of state.nurses) {
      if (n.id !== "N27") {
        expect(resResolved.evaluation!.nurseSummaries[n.id]!.totalWorkDays).toBeGreaterThanOrEqual(
          state.config.minMonthlyWorkDays
        );
      }
    }
  }, 30_000);

  it("supports composable contract & transition primitives (maxWorkDays, maxConsecutiveDays, nightShiftOnly/forbidLateNight/forbidEvening, weekdayOnly, and set_shift_transition)", async () => {
    let state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });

    // Apply all 4 composable axes via Stage 2 tool calls:
    // ① Monthly bounds & shift-type exemptions:
    //   - N25: Part-time contract (minWorkDays: 0, maxWorkDays: 10, weekdayOnly)
    //   - N15: 夜勤専従 (nightShiftOnly, minWorkDays: 8)
    //   - N16: 深夜勤免除 (forbidLateNight)
    //   - N17: 準夜勤免除 (forbidEvening)
    // ② Individual max consecutive days:
    //   - N18: Max 3 consecutive days (maxConsecutiveDays: 3)
    // ③ Generic 2-day shift transition rules:
    //   - set_shift_transition(fromShift: "E", toShift: "E", policy: "forbid")
    //   - set_shift_transition(fromShift: "D", toShift: "N", policy: "forbid")
    const ops = [
      convertStage2ToolToOperation(
        { tool_name: "set_nurse_contract", args: { nurseNameOrId: "N25", item: "minWorkDays", value: 0 } },
        state
      )!,
      convertStage2ToolToOperation(
        { tool_name: "set_nurse_contract", args: { nurseNameOrId: "N25", item: "maxWorkDays", value: 10 } },
        state
      )!,
      convertStage2ToolToOperation(
        { tool_name: "set_nurse_contract", args: { nurseNameOrId: "N25", item: "weekdayOnly" } },
        state
      )!,
      convertStage2ToolToOperation(
        { tool_name: "set_nurse_contract", args: { nurseNameOrId: "N15", item: "nightShiftOnly" } },
        state
      )!,
      convertStage2ToolToOperation(
        { tool_name: "set_nurse_contract", args: { nurseNameOrId: "N15", item: "minWorkDays", value: 8 } },
        state
      )!,
      convertStage2ToolToOperation(
        { tool_name: "set_nurse_contract", args: { nurseNameOrId: "N16", item: "forbidLateNight" } },
        state
      )!,
      convertStage2ToolToOperation(
        { tool_name: "set_nurse_contract", args: { nurseNameOrId: "N17", item: "forbidEvening" } },
        state
      )!,
      convertStage2ToolToOperation(
        { tool_name: "set_nurse_contract", args: { nurseNameOrId: "N18", item: "maxConsecutiveDays", value: 3 } },
        state
      )!,
      convertStage2ToolToOperation(
        { tool_name: "set_shift_transition", args: { fromShift: "E", toShift: "E", policy: "forbid" } },
        state
      )!,
      convertStage2ToolToOperation(
        { tool_name: "set_shift_transition", args: { fromShift: "D", toShift: "N", policy: "forbid" } },
        state
      )!,
    ];

    const applied = applyChatOperationsToState(state, ops);
    expect(applied.appliedLogs.length).toBe(10);
    state = applied.updatedState;

    expect(state.nurses.find((n) => n.id === "N25")?.maxMonthlyWorkDays).toBe(10);
    expect(state.nurses.find((n) => n.id === "N25")?.weekdayOnly).toBe(true);
    expect(state.nurses.find((n) => n.id === "N15")?.forbiddenShifts).toContain("D");
    expect(state.nurses.find((n) => n.id === "N16")?.forbiddenShifts).toContain("N");
    expect(state.nurses.find((n) => n.id === "N17")?.forbiddenShifts).toContain("E");
    expect(state.nurses.find((n) => n.id === "N18")?.maxConsecutiveWorkDays).toBe(3);
    expect(state.config.shiftTransitions.E.E).toBe("forbid");
    expect(state.config.shiftTransitions.D.N).toBe("forbid");

    const res = await solveNurseScheduleWithWashi(state);
    expect(res.status).toBe("Optimal");
    expect(res.validatedByWashi).toBe(true);
    expect(res.evaluation?.valid).toBe(true);
    expect(res.evaluation?.violations).toEqual([]);

    // Verify N25: <= 10 workdays and never works on Saturday (6) or Sunday (0)
    expect(res.evaluation!.nurseSummaries["N25"]!.totalWorkDays).toBeLessThanOrEqual(10);
    for (let d = 1; d <= state.config.numDays; d++) {
      const dow = getDayOfWeek(state.config.year, state.config.month, d);
      if (dow === 0 || dow === 6) {
        expect(res.schedule!["N25"]![d - 1]).toBe("O");
      }
    }

    // Verify N15 (nightShiftOnly): 0 Day shifts
    expect(res.evaluation!.nurseSummaries["N15"]!.counts.D ?? 0).toBe(0);
    // Verify N16 (forbidLateNight): 0 N shifts
    expect(res.evaluation!.nurseSummaries["N16"]!.counts.N ?? 0).toBe(0);
    // Verify N17 (forbidEvening): 0 E shifts
    expect(res.evaluation!.nurseSummaries["N17"]!.counts.E ?? 0).toBe(0);
    // Verify N18 (maxConsecutiveDays: 3): maxConsecutiveWork <= 3
    expect(res.evaluation!.nurseSummaries["N18"]!.maxConsecutiveWork).toBeLessThanOrEqual(3);

    // Verify transition E -> E is forbidden across all nurses
    for (const nurse of state.nurses) {
      const row = res.schedule![nurse.id]!;
      for (let d = 1; d < state.config.numDays; d++) {
        if (row[d - 1] === "E") {
          expect(row[d]).not.toBe("E");
        }
      }
    }
  }, 30_000);

  it("supports shift groups ('W' work / 'EN' night) and calendar-based weekday & holiday requests", async () => {
    let state = generateNurseSchedulingState({ year: 2026, month: 11, staffCount: 30, seed: 202611 });

    // 1. N26: Works ONLY on Wednesdays and Fridays ("W": any working shift), off on all other days
    // 2. N27: Off on weekends + Japanese holidays (11/3 Culture Day, 11/23 Labor Thanksgiving Day) via add_calendar_request
    // 3. N28: Off on weekends and holidays via set_nurse_contract preset
    // 4. N10: Pinned to "EN" (any night shift E or N) on 11/10, and "W" (any work shift) on 11/12
    const ops = [
      convertStage2ToolToOperation(
        {
          tool_name: "set_nurse_contract",
          args: {
            nurseNameOrId: "N26",
            item: "minWorkDays",
            value: 8,
          },
        },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "add_calendar_request",
          args: {
            nurseNameOrId: "N26",
            daysOfWeek: ["水", "金"],
            shift: "W",
            onlyMatchedDaysWork: true,
          },
        },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "add_calendar_request",
          args: {
            nurseNameOrId: "N27",
            daysOfWeek: ["日", "土"],
            holidays: "include",
            shift: "O",
          },
        },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "set_nurse_contract",
          args: {
            nurseNameOrId: "N28",
            item: "土日祝休\u307f",
          },
        },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "add_request",
          args: {
            nurseNameOrId: "N10",
            day: 10,
            shift: "EN",
            isHard: true,
          },
        },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "add_request",
          args: {
            nurseNameOrId: "N10",
            day: 12,
            shift: "W",
            isHard: true,
          },
        },
        state
      )!,
    ];

    const applied = applyChatOperationsToState(state, ops);
    expect(applied.appliedLogs.length).toBe(6);
    state = applied.updatedState;

    const res = await solveNurseScheduleWithWashi(state);
    expect(res.status).toBe("Optimal");
    expect(res.validatedByWashi).toBe(true);
    expect(res.evaluation?.valid).toBe(true);
    expect(res.evaluation?.violations).toEqual([]);

    // Verify N26 works on every Wednesday (dow=3) and Friday (dow=5), and is Off ("O") on all other days
    const rowN26 = res.schedule!["N26"]!;
    for (let d = 1; d <= state.config.numDays; d++) {
      const dow = getDayOfWeek(state.config.year, state.config.month, d);
      if (dow === 3 || dow === 5) {
        expect(rowN26[d - 1]).not.toBe("O");
      } else {
        expect(rowN26[d - 1]).toBe("O");
      }
    }
    expect(res.evaluation!.nurseSummaries["N26"]!.totalWorkDays).toBe(8);

    // Verify N27 and N28 are Off ("O") on all weekends AND Japanese holidays in Nov 2026 (11/3 and 11/23)
    for (const nId of ["N27", "N28"]) {
      const row = res.schedule![nId]!;
      expect(row[3 - 1]).toBe("O"); // 11/3 (Tue, Culture Day)
      expect(row[23 - 1]).toBe("O"); // 11/23 (Mon, Labor Thanksgiving Day)
      for (let d = 1; d <= state.config.numDays; d++) {
        const dow = getDayOfWeek(state.config.year, state.config.month, d);
        if (dow === 0 || dow === 6) {
          expect(row[d - 1]).toBe("O");
        }
      }
    }

    // Verify N10 has a night shift ("E" or "N") on 11/10 and a work shift (!== "O") on 11/12
    expect(["E", "N"]).toContain(res.schedule!["N10"]![10 - 1]);
    expect(res.schedule!["N10"]![12 - 1]).not.toBe("O");
  }, 30_000);

  it("Phase 1 TDD: unifies ShiftAliasDef + resolveShiftSelector, DaySelector holiday modes, Contract Presets + overrides, and ShiftTransitionMatrix", async () => {
    let state = generateNurseSchedulingState({ year: 2026, month: 11, staffCount: 30, seed: 202611 });

    // 1. ShiftAliasDef & resolveShiftSelector (built-in W, EN, D, O + custom shift + custom alias)
    const defaultAliases = createDefaultShiftAliases();
    expect(defaultAliases.map((a) => a.code)).toEqual(expect.arrayContaining(["W", "EN", "D"]));

    expect(resolveShiftSelector("W", state)).toEqual(expect.arrayContaining(["D", "E", "N"]));
    expect(resolveShiftSelector("W", state)).not.toContain("O");
    expect(resolveShiftSelector("EN", state)).toEqual(["E", "N"]);
    expect(resolveShiftSelector("D", state)).toEqual(["D"]);
    expect(resolveShiftSelector("O", state)).toEqual(["O"]);

    // Add a custom alias "DE" (day or evening shift, excluding N and O)
    state = {
      ...state,
      shiftAliases: [
        ...defaultAliases,
        {
          code: "DE",
          label: "日勤\u30fb準夜",
          shortLabel: "日準",
          shifts: ["D", "E"],
        },
      ],
    };
    expect(resolveShiftSelector("DE", state)).toEqual(expect.arrayContaining(["D", "E"]));
    expect(resolveShiftSelector("DE", state)).not.toContain("N");

    // 2. DaySelector & resolveDaysBySelector (Nov 2026: 11/3 Tue is Culture Day, 11/23 Mon is Labor Thanksgiving Day)
    expect(resolveDaysBySelector(2026, 11, 30, { kind: "days", days: [5, 18] })).toEqual([5, 18]);
    expect(resolveDaysBySelector(2026, 11, 30, { kind: "range", startDay: 10, endDay: 13 })).toEqual([
      10, 11, 12, 13,
    ]);
    // Weekends only (ignore holidays -> excludes 11/3 and 11/23)
    const wkIgnore = resolveDaysBySelector(2026, 11, 30, {
      kind: "pattern",
      daysOfWeek: [0, 6],
      holidays: "ignore",
    });
    expect(wkIgnore).not.toContain(3);
    expect(wkIgnore).not.toContain(23);
    // Weekends + holidays (include holidays -> includes 11/3 and 11/23)
    const wkInclude = resolveDaysBySelector(2026, 11, 30, {
      kind: "pattern",
      daysOfWeek: [0, 6],
      holidays: "include",
    });
    expect(wkInclude).toContain(3);
    expect(wkInclude).toContain(23);
    // Mon & Tue excluding holidays (excludes 11/3 Tue and 11/23 Mon!)
    const monTueExcludeHol = resolveDaysBySelector(2026, 11, 30, {
      kind: "pattern",
      daysOfWeek: [1, 2],
      holidays: "exclude",
    });
    expect(monTueExcludeHol).not.toContain(3);
    expect(monTueExcludeHol).not.toContain(23);
    expect(monTueExcludeHol).toContain(2); // 11/2 Mon (not a holiday)
    // Only holidays
    const onlyHol = resolveDaysBySelector(2026, 11, 30, {
      kind: "pattern",
      daysOfWeek: [],
      holidays: "only",
    });
    expect(onlyHol).toEqual([3, 23]);

    // 3. Contract Presets + Individual Overrides
    expect(CONTRACT_PRESETS.length).toBeGreaterThanOrEqual(6);
    const n20 = state.nurses.find((n) => n.id === "N20")!;
    const partTimeN20 = applyContractPresetToNurse(n20, "part_time", { maxMonthlyWorkDays: 11 });
    expect(partTimeN20.contractPreset).toBe("part_time");
    expect(partTimeN20.nightOk).toBe(false);
    expect(partTimeN20.minMonthlyWorkDays).toBe(0);
    expect(partTimeN20.maxMonthlyWorkDays).toBe(11);

    // 4. ShiftTransitionMatrix bidirectional sync
    const mat0 = getShiftTransitionMatrix(state.config);
    expect(mat0.N.D).toBe("forbid");
    expect(mat0.E.D).toBe("forbid");
    expect(mat0.D.D).toBe("allow");

    const cfgRequireOffAfterN = applyShiftTransitionToConfig(state.config, "N", "O", "require");
    expect(cfgRequireOffAfterN.shiftTransitions.N.O).toBe("require");
    const matAfterReq = getShiftTransitionMatrix(cfgRequireOffAfterN);
    expect(matAfterReq.N.O).toBe("require");
    expect(matAfterReq.N.D).toBe("forbid");
    expect(matAfterReq.N.E).toBe("forbid");
    expect(matAfterReq.N.N).toBe("forbid");

    // 5. Solve with custom alias "DE" pin, soft "EN" preference, and part_time preset
    state = {
      ...state,
      nurses: state.nurses.map((n) => (n.id === "N20" ? partTimeN20 : n)),
      preferences: [
        ...state.preferences,
        {
          id: "pref_soft_EN_N12_d14",
          nurseId: "N12",
          day: 14,
          shift: "EN",
          isHard: false,
          reason: "夜勤帯(準夜\u307e\u305f\u306f深夜)希望",
        },
      ],
      customRules: [
        ...state.customRules,
        {
          id: "pin_custom_alias_DE_N11_d10",
          kind: "pin_shift",
          enabled: true,
          nurseId: "N11",
          day: 10,
          shift: "DE",
          description: "11/10: N11 \u3092 日勤\u30fb準夜(DE) \u306b固定",
        },
      ],
    };

    const res = await solveNurseScheduleWithWashi(state);
    expect(res.status).toBe("Optimal");
    expect(res.validatedByWashi).toBe(true);
    expect(res.evaluation?.valid).toBe(true);
    expect(res.evaluation?.violations).toEqual([]);
    expect(["D", "E"]).toContain(res.schedule!["N11"]![10 - 1]);
    expect(res.evaluation!.nurseSummaries["N20"]!.totalWorkDays).toBeLessThanOrEqual(11);
    expect(res.evaluation!.nurseSummaries["N20"]!.totalNightShifts).toBe(0);
  }, 30_000);

  it("Phase 2 TDD: supports 7-category hierarchical tool catalogs, dynamic shift/alias dictionary injection, and post-Turn-2 execution verification & recovery", async () => {
    // 1. Check 7 focused Stage 2 schemas have zero overlapping tools and universal "none" escape hatch
    const seenTools7 = new Set<string>();
    for (const s2Schema of [
      STAFF_CALENDAR_TOOLS_SCHEMA,
      STAFF_CONTRACT_TOOLS_SCHEMA,
      WARD_COVERAGE_AND_PARAM_TOOLS_SCHEMA,
      WARD_TRANSITION_AND_RULE_TOOLS_SCHEMA,
      SKILL_AND_PAIR_TOOLS_SCHEMA,
      CUSTOM_SHIFT_TOOLS_SCHEMA,
      SYSTEM_ACTION_TOOLS_SCHEMA,
    ]) {
      expect(s2Schema).toBeDefined();
      const branches = s2Schema.properties.tools.items.anyOf;
      expect(Array.isArray(branches)).toBe(true);
      const noneBranch = branches.find((b: any) => b.properties.tool_name.enum[0] === "none");
      expect(noneBranch).toBeDefined();
      for (const b of branches) {
        const tName = b.properties.tool_name.enum[0] as string;
        if (tName === "none") continue;
        expect(seenTools7.has(tName)).toBe(false);
        seenTools7.add(tName);
      }
      // Verify all tool names within the schema are prefix-free (no tool_name is a strict prefix of another)
      const branchNames = branches.map((b: any) => b.properties.tool_name.enum[0] as string);
      for (const aName of branchNames) {
        for (const bName of branchNames) {
          if (aName !== bName) {
            expect(bName.startsWith(aName)).toBe(false);
          }
        }
      }
    }

    // Check STAGE1_ROUTER_SCHEMA enum includes the 7 focused categories
    const stage1Enum =
      STAGE1_ROUTER_SCHEMA.properties.routes.anyOf[0]!.items.properties.tool_type.enum;
    expect(stage1Enum).toContain("staff_calendar");
    expect(stage1Enum).toContain("staff_contract");
    expect(stage1Enum).toContain("ward_coverage_and_param");
    expect(stage1Enum).toContain("ward_transition_and_rule");
    expect(stage1Enum).toContain("skill_and_pair");
    expect(stage1Enum).toContain("custom_shift");
    expect(stage1Enum).toContain("system_action");

    // 2. Check dynamic dictionary injection for staff_calendar with custom shift & custom alias
    let state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });
    state = {
      ...state,
      customShiftDefs: [
        {
          code: "T",
          shortLabel: "研",
          label: "新人研修",
          baseShift: "D",
          timeRange: "09:00–17:00",
          colorClass: "shift-custom",
          countsAsWorkDay: true,
          overtimeHoursPerShift: 0.5,
        },
      ],
      shiftAliases: [
        ...createDefaultShiftAliases(),
        {
          code: "DE",
          shortLabel: "日準",
          label: "日勤\u30fb準夜(深夜除外)",
          shifts: ["D", "E"],
          builtIn: false,
        },
      ],
    };

    const dictCalendar = buildCategoryDynamicDictionary(
      "staff_calendar",
      state,
      "N01\u306e12日\u3092新人研修\u306b固定"
    );
    expect(dictCalendar).toContain("W");
    expect(dictCalendar).toContain("EN");
    expect(dictCalendar).toContain("新人研修");
    expect(dictCalendar).toContain("DE");
    expect(dictCalendar).toContain("N01");

    // 3. Check granular shift selection in add_request (custom shift name "新人研修" -> "T")
    const opCustomPin = convertStage2ToolToOperation(
      {
        tool_name: "add_request",
        args: { nurseNameOrId: "N01", day: 12, shift: "新人研修", isHard: true },
      },
      state
    );
    expect(opCustomPin).not.toBeNull();
    state = applyChatOperationsToState(state, [opCustomPin!]).updatedState;
    const pinnedRule = state.customRules.find(
      (r) => r.kind === "pin_shift" && r.nurseId === "N01" && r.day === 12
    );
    expect(pinnedRule?.shift).toBe("T");

    // 4. Check 5-step pipeline with post-Turn-2 execution verification & sibling-category auto-recovery
    const g = globalThis as any;
    const origLM = g.LanguageModel;
    try {
      const promptCalls: Array<{ input: string; schema: any }> = [];
      let turn1Reply: any = null;
      let turn2RepliesBySchema = new Map<any, any>();

      g.LanguageModel = {
        async availability() {
          return "available";
        },
        async create() {
          const makeSession = () => ({
            async prompt(input: string, opts?: any) {
              const schema = opts?.responseConstraint;
              promptCalls.push({ input, schema });
              if (schema === STAGE1_ROUTER_SCHEMA) {
                return JSON.stringify(turn1Reply);
              }
              const reply = turn2RepliesBySchema.get(schema) ?? {
                tools: [{ tool_name: "none", args: {} }],
              };
              return JSON.stringify(reply);
            },
            async clone() {
              return makeSession();
            },
            destroy() {},
          });
          return makeSession();
        },
      };

      const manager = createGeminiNanoManager();
      await manager.initialize();

      // Case A: 2 routes across focused categories (staff_calendar + ward_transition_and_rule)
      turn1Reply = {
        thought: "N02\u306e15日公休固定(staff_calendar)\u3068日深夜禁止(ward_transition_and_rule)\u306e2件。",
        routes: [
          { tool_type: "staff_calendar", instruction: "N02\u306e15日\u3092確定\u306e公休(O)\u306b固定\u3059\u308b" },
          { tool_type: "ward_transition_and_rule", instruction: "日勤→翌日深夜勤(日深夜)\u3092禁止\u3059\u308b" },
        ],
        response: "N02\u306e15日\u3092公休\u306b固定\u3057、日深夜\u3092禁止\u3057\u307e\u3059。",
      };
      turn2RepliesBySchema = new Map([
        [
          STAFF_CALENDAR_TOOLS_SCHEMA,
          {
            tools: [
              {
                tool_name: "add_request",
                args: { nurseNameOrId: "N02", day: 15, shift: "O", isHard: true },
              },
            ],
          },
        ],
        [
          WARD_TRANSITION_AND_RULE_TOOLS_SCHEMA,
          {
            tools: [
              {
                tool_name: "set_shift_transition",
                args: { fromShift: "D", toShift: "N", policy: "forbid" },
              },
            ],
          },
        ],
      ]);

      const planA = await manager.extractPlan(
        "N02\u306e15日\u3092確定\u306e休\u307f\u306b\u3057\u3066、日深夜\u3092禁止\u3057\u3066",
        state
      );
      expect(planA.intentType).toBe("modify_and_solve");
      expect(planA.operations.length).toBe(2);
      expect(planA.verificationResult).toBeDefined();
      expect(planA.verificationResult?.verified).toBe(true);
      expect(planA.verificationResult?.checkedRoutesCount).toBe(2);
      expect(planA.verificationResult?.appliedCount).toBe(2);
      expect(planA.verificationResult?.repairedRoutes).toEqual([]);

      // Case B: When Turn 2 returns "none", Step 3 verification honestly reports verified: false without guessing sibling categories
      promptCalls.length = 0;
      turn1Reply = {
        thought: "N05\u3092日勤専従\u306b\u3059\u308b変更。",
        routes: [{ tool_type: "staff_calendar", instruction: "N05\u3092日勤専従\u306b\u3059\u308b" }],
        response: "N05\u3092日勤専従\u306b設定\u3057\u307e\u3059。",
      };
      turn2RepliesBySchema = new Map([
        [
          STAFF_CALENDAR_TOOLS_SCHEMA,
          {
            tools: [{ tool_name: "none", args: {} }],
          },
        ],
      ]);

      const planB = await manager.extractPlan("N05\u3092日勤専従\u306b\u3057\u3066", state);
      expect(planB.intentType).toBe("consult_only");
      expect(planB.operations).toEqual([]);
      expect(planB.verificationResult?.verified).toBe(false);
      expect(planB.verificationResult?.missingRoutes.length).toBe(1);
      expect(planB.verificationResult?.repairedRoutes).toEqual([]);

      // Verify that static system prompts do not contain test-case-specific sentences or test nurse names
      const allSystemPrompts = [
        ...(planA.llmCalls ?? []).map((c) => c.systemPrompt),
        ...(planB.llmCalls ?? []).map((c) => c.systemPrompt),
      ];
      for (const sysPrompt of allSystemPrompts) {
        for (const forbiddenTestPhrase of [
          "黒田",
          "星野",
          "白石",
          "望月",
          "甲斐",
          "神谷",
          "\u30b9\u30ad\u30eb\u3092追加\u3057\u305f\u3044。副\u30ea\u30fc\u30c0\u30fc",
          "新人研修\u30b7\u30d5\u30c8\u3092追加\u3057\u3066。新人\u306f",
          "怪我\u3092\u3057\u306611/17\u307e\u3067",
          "\u30b9\u30ad\u30eb毎\u306b、夜勤\u306e数\u3092平準化\u3057\u305f\u3044",
        ]) {
          expect(sysPrompt).not.toContain(forbiddenTestPhrase);
        }
      }

      manager.destroy();
    } finally {
      g.LanguageModel = origLM;
    }
  }, 30_000);

  it("properly detects and conveys unsupported requests across all 4 failure modes (Turn 1 unsupported, Turn 2 none rejection, non-existent staff, and partial unsupported composite requests)", async () => {
    const state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });
    const g = globalThis as any;
    const origLM = g.LanguageModel;

    try {
      let turn1Reply: any = null;
      let turn2RepliesBySchema = new Map<any, any>();
      let consultReplyText =
        "\u3054指定\u306e操作\u306b\u306f対応\u3057\u3066\u3044\u307e\u305b\u3093。対応可能\u306a機能\u306b\u3064\u3044\u3066\u306f一覧\u3092\u3054確認\u304f\u3060\u3055\u3044。";

      g.LanguageModel = {
        async availability() {
          return "available";
        },
        async create() {
          const makeSession = () => ({
            async prompt(input: string, opts?: any) {
              const schema = opts?.responseConstraint;
              if (!schema) {
                return consultReplyText;
              }
              if (schema === STAGE1_ROUTER_SCHEMA) {
                return JSON.stringify(turn1Reply);
              }
              const reply = turn2RepliesBySchema.get(schema) ?? {
                tools: [{ tool_name: "none", args: {} }],
              };
              return JSON.stringify(reply);
            },
            async *promptStreaming() {
              yield consultReplyText;
            },
            async clone() {
              return makeSession();
            },
            destroy() {},
          });
          return makeSession();
        },
      };

      const manager = createGeminiNanoManager();
      await manager.initialize();

      // Mode 1: Turn 1 directly classifies out-of-scope request ("calculate overtime allowance and pay slip") as unsupported
      turn1Reply = {
        thought: "給与\u30fb夜勤手当\u306e計算\u306f\u30b7\u30b9\u30c6\u30e0未対応\u306e\u305f\u3081 unsupported \u3068\u3059\u308b。",
        routes: [{ tool_type: "unsupported" }],
        response: "夜勤手当\u3084給与\u306e計算\u306b\u306f対応\u3057\u3066\u3044\u307e\u305b\u3093。",
      };
      turn2RepliesBySchema = new Map();
      consultReplyText =
        "夜勤手当\u3084給与\u306e計算\u306f本\u30b7\u30b9\u30c6\u30e0\u306e対応範囲外\u306e\u305f\u3081実行\u3067\u304d\u307e\u305b\u3093。";

      const plan1 = await manager.extractPlan(
        "夜勤手当\u30921回1万5000円\u3067計算\u3057\u3066給与明細\u3092出\u3057\u3066",
        state
      );
      expect(plan1.intentType).toBe("consult_only");
      expect(plan1.nonToolReason).toBe("unsupported");
      expect(plan1.operations).toEqual([]);
      expect(plan1.summaryJa).toContain("対応\u3057\u3066\u3044\u307e\u305b\u3093");

      let reply1 = "";
      for await (const chunk of manager.streamConsultationReply(
        "夜勤手当\u30921回1万5000円\u3067計算\u3057\u3066給与明細\u3092出\u3057\u3066",
        [],
        state,
        null
      )) {
        reply1 += chunk;
      }
      expect(reply1).toContain("対応範囲外\u306e\u305f\u3081実行\u3067\u304d\u307e\u305b\u3093");
      const trace1 = manager.getLastConsultTrace();
      expect(trace1?.userPrompt).toContain("【\u30b7\u30b9\u30c6\u30e0未対応\u306e要求\u306b対\u3059\u308b回答指示】");
      expect(trace1?.userPrompt).toContain("夜勤手当\u3084給与\u306e計算\u306b\u306f対応\u3057\u3066\u3044\u307e\u305b\u3093。");

      // Mode 2: Turn 1 optimistically routes an unsupported request ("set nap break to 90 mins") to ward_coverage_and_param,
      // but Turn 2 (and sibling ward_transition_and_rule) both reject it with tool_name: "none".
      // Step 3 verification must catch it, override Turn 1's optimistic response, and convey that it is unsupported.
      turn1Reply = {
        thought: "夜勤\u306e仮眠休憩時間\u309290分\u306b\u3059\u308b設定変更。",
        routes: [
          {
            tool_type: "ward_coverage_and_param",
            instruction: "夜勤\u306e仮眠休憩\u309290分以上\u306b設定\u3059\u308b",
          },
        ],
        response: "夜勤\u306e仮眠休憩\u309290分以上\u306b設定\u3057\u307e\u3059。",
      };
      turn2RepliesBySchema = new Map([
        [WARD_COVERAGE_AND_PARAM_TOOLS_SCHEMA, { tools: [{ tool_name: "none", args: {} }] }],
        [WARD_TRANSITION_AND_RULE_TOOLS_SCHEMA, { tools: [{ tool_name: "none", args: {} }] }],
      ]);
      consultReplyText =
        "夜勤\u306e仮眠休憩時間\u306e設定\u306b\u306f対応\u3057\u3066\u3044\u306a\u3044\u305f\u3081、変更\u3067\u304d\u307e\u305b\u3093。";

      const plan2 = await manager.extractPlan("夜勤\u306e仮眠休憩\u309290分以上\u306b設定\u3057\u3066", state);
      expect(plan2.intentType).toBe("consult_only");
      expect(plan2.nonToolReason).toBe("unsupported");
      expect(plan2.operations).toEqual([]);
      expect(plan2.verificationResult?.verified).toBe(false);
      expect(plan2.verificationResult?.missingRoutes.length).toBe(1);
      // Turn 1's false-positive "will configure" must be replaced with an honest refusal
      expect(plan2.summaryJa).toContain("未対応");
      expect(plan2.summaryJa).not.toContain("設定\u3057\u307e\u3059。");

      let reply2 = "";
      for await (const chunk of manager.streamConsultationReply(
        "夜勤\u306e仮眠休憩\u309290分以上\u306b設定\u3057\u3066",
        [],
        state,
        null
      )) {
        reply2 += chunk;
      }
      expect(reply2).toContain("対応\u3057\u3066\u3044\u306a\u3044\u305f\u3081");
      const trace2 = manager.getLastConsultTrace();
      expect(trace2?.userPrompt).toContain("【\u30b7\u30b9\u30c6\u30e0未対応\u306e要求\u306b対\u3059\u308b回答指示】");
      expect(trace2?.userPrompt).toContain("未対応\u3067\u3059");
      expect(trace2?.userPrompt).not.toContain("夜勤\u306e仮眠休憩\u309290分以上\u306b設定\u3057\u307e\u3059。");

      // Mode 3: Request targets a staff member who does not exist in the ward roster ("give Tokugawa Ieyasu day off on the 12th")
      turn1Reply = {
        thought: "徳川家康\u3055\u3093\u306e12日\u3092公休\u306b固定\u3059\u308b。",
        routes: [
          {
            tool_type: "staff_calendar",
            instruction: "徳川家康\u3055\u3093\u306e12日\u3092確定\u306e公休(O)\u306b固定\u3059\u308b",
          },
        ],
        response: "徳川家康\u3055\u3093\u306e12日\u3092公休\u306b固定\u3057\u307e\u3059。",
      };
      turn2RepliesBySchema = new Map([
        [
          STAFF_CALENDAR_TOOLS_SCHEMA,
          {
            tools: [
              {
                tool_name: "add_request",
                args: { nurseNameOrId: "徳川家康", day: 12, shift: "O", isHard: true },
              },
            ],
          },
        ],
      ]);
      consultReplyText =
        "指定\u3055\u308c\u305f「徳川家康」\u3055\u3093\u306f病棟名簿\u306b存在\u3057\u306a\u3044\u305f\u3081、\u30b7\u30d5\u30c8\u3092設定\u3067\u304d\u307e\u305b\u3093。";

      const plan3 = await manager.extractPlan("徳川家康\u3055\u3093\u306e12日\u3092休\u307f\u306b\u3057\u3066", state);
      expect(plan3.intentType).toBe("consult_only");
      expect(plan3.nonToolReason).toBe("unsupported");
      expect(plan3.operations).toEqual([]);
      expect(plan3.verificationResult?.verified).toBe(false);
      expect(plan3.summaryJa).toContain("徳川家康");
      expect(plan3.summaryJa).toContain("病棟名簿\u306b存在\u3057\u306a\u3044\u305f\u3081");

      let reply3 = "";
      for await (const chunk of manager.streamConsultationReply(
        "徳川家康\u3055\u3093\u306e12日\u3092休\u307f\u306b\u3057\u3066",
        [],
        state,
        null
      )) {
        reply3 += chunk;
      }
      expect(reply3).toContain("存在\u3057\u306a\u3044\u305f\u3081");
      const trace3 = manager.getLastConsultTrace();
      expect(trace3?.userPrompt).toContain("病棟名簿\u306b存在\u3057\u306a\u3044\u305f\u3081");

      // Mode 4: Composite request with 1 supported operation + 1 unsupported operation
      // ("set N01 off on 12th, and set nap break to 90 min")
      turn1Reply = {
        thought: "N01\u306e12日公休固定\u3068、夜勤\u306e仮眠休憩90分設定\u306e複合指示。",
        routes: [
          {
            tool_type: "staff_calendar",
            instruction: "N01\u306e12日\u3092確定\u306e公休(O)\u306b固定\u3059\u308b",
          },
          {
            tool_type: "ward_coverage_and_param",
            instruction: "夜勤\u306e仮眠休憩\u309290分\u306b設定\u3059\u308b",
          },
        ],
        response: "N01\u306e12日\u3092公休\u306b固定\u3057、仮眠休憩\u3092設定\u3057\u307e\u3059。",
      };
      turn2RepliesBySchema = new Map([
        [
          STAFF_CALENDAR_TOOLS_SCHEMA,
          {
            tools: [
              {
                tool_name: "add_request",
                args: { nurseNameOrId: "N01", day: 12, shift: "O", isHard: true },
              },
            ],
          },
        ],
        [WARD_COVERAGE_AND_PARAM_TOOLS_SCHEMA, { tools: [{ tool_name: "none", args: {} }] }],
        [WARD_TRANSITION_AND_RULE_TOOLS_SCHEMA, { tools: [{ tool_name: "none", args: {} }] }],
      ]);
      consultReplyText =
        "\u30fb佐藤 美咲(N01)\u3055\u3093\u306e11/12\u3092公休(O)\u306b固定\u3057\u307e\u3057\u305f。\n\u30fb夜勤\u306e仮眠休憩時間\u306e設定\u306b\u306f対応\u3057\u3066\u3044\u306a\u3044\u305f\u3081適用\u3057\u3066\u3044\u307e\u305b\u3093。";

      const plan4 = await manager.extractPlan(
        "N01\u306e12日\u3092確定\u306e休\u307f\u306b\u3057\u3066、夜勤\u306e仮眠休憩\u309290分\u306b\u3057\u3066",
        state
      );
      expect(plan4.intentType).toBe("modify_and_solve");
      expect(plan4.operations.length).toBe(1);
      expect(plan4.verificationResult?.verified).toBe(false);
      expect(plan4.verificationResult?.appliedCount).toBe(1);
      expect(plan4.verificationResult?.missingRoutes).toEqual([
        'ward_coverage_and_param("夜勤\u306e仮眠休憩\u309290分\u306b設定\u3059\u308b")',
      ]);

      const applied4 = applyChatOperationsToState(state, plan4.operations);
      let reply4 = "";
      for await (const chunk of manager.streamConsultationReply(
        "N01\u306e12日\u3092確定\u306e休\u307f\u306b\u3057\u3066、夜勤\u306e仮眠休憩\u309290分\u306b\u3057\u3066",
        applied4.appliedLogs,
        applied4.updatedState,
        null
      )) {
        reply4 += chunk;
      }
      expect(reply4).toContain("対応\u3057\u3066\u3044\u306a\u3044\u305f\u3081");
      const trace4 = manager.getLastConsultTrace();
      expect(trace4?.userPrompt).toContain("【⚠️ 未対応\u306e\u305f\u3081適用\u3067\u304d\u306a\u304b\u3063\u305f指示】");
      expect(trace4?.userPrompt).toContain("夜勤\u306e仮眠休憩\u309290分\u306b設定\u3059\u308b");

      manager.destroy();
    } finally {
      g.LanguageModel = origLM;
    }
  }, 30_000);

  it("formats final consultation report strictly with nurse-relevant shift outcomes and without solver internal jargon", async () => {
    const state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11, seed: 42 });
    const baseSolve = await solveNurseScheduleWithWashi(state);
    expect(baseSolve.status).toBe("Optimal");

    const applied = applyChatOperationsToState(state, [
      { op: "add_request", nurseNameOrId: "N01", day: 12, shift: "O", isHard: true },
    ]);
    const nextSolve = await solveNurseScheduleWithWashi(applied.updatedState, {
      referenceSchedule: baseSolve.schedule,
    });
    expect(nextSolve.status).toBe("Optimal");

    const g = globalThis as any;
    const origLM = g.LanguageModel;
    g.LanguageModel = {
      async availability() {
        return "available";
      },
      async create() {
        return {
          async prompt() {
            return "\u30fb佐藤 美咲(N01)\u3055\u3093\u306e11/12\u3092公休(休)\u306b固定\u3057\u307e\u3057\u305f。\n\u30fb希望休\u306e充足率100%\u3067\u30b7\u30d5\u30c8表\u3092更新\u3057\u307e\u3057\u305f。";
          },
          async clone() {
            return this;
          },
          destroy() {},
        };
      },
    };

    try {
      const manager = createGeminiNanoManager();
      await manager.initialize();
      for await (const _ of manager.streamConsultationReply(
        "佐藤\u3055\u3093\u306e12日\u3092休\u307f\u306b\u3057\u3066",
        applied.appliedLogs,
        applied.updatedState,
        nextSolve
      )) {
        // consume stream
      }
      const trace = manager.getLastConsultTrace();
      expect(trace).toBeDefined();
      // Must include nurse-relevant information: applied change, request satisfaction, and schedule diff
      expect(trace!.userPrompt).toContain("11/12: 佐藤 美咲(N01) \u3092「公休(O)」\u306b固定");
      expect(trace!.userPrompt).toContain("希望達成状況:");
      expect(trace!.userPrompt).toContain("前回\u306e\u30b7\u30d5\u30c8\u304b\u3089\u306e変更:");
      // Must NOT include solver-internal jargon or metrics
      expect(trace!.userPrompt).not.toContain("validateSolution");
      expect(trace!.userPrompt).not.toContain("変数:");
      expect(trace!.userPrompt).not.toContain("制約:");
      expect(trace!.userPrompt).not.toContain("求解時間:");
      expect(trace!.userPrompt).not.toContain("HiGHS");
      expect(trace!.systemPrompt).not.toContain("WaSHI");

      manager.destroy();
    } finally {
      g.LanguageModel = origLM;
    }
  }, 30_000);

  it("Task 5.2 & 5.3 TDD: supports configurable custom shift alias inclusion (includedInAliases / baseShift) and skill headcount rules on custom shifts", async () => {
    let state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11, seed: 42 });

    // 1. Add an independent custom shift "C1" ("委員会") that is NOT auto-included in "W" (includedInAliases: [])
    //    and a daytime custom shift "G1" ("外来応援") that IS included in both "W" and "D" (includedInAliases: ["W", "D"])
    const applied1 = applyChatOperationsToState(state, [
      {
        op: "add_custom_shift",
        shiftName: "委員会",
        shortLabel: "委",
        baseShift: "D",
        includedInAliases: [],
      },
      {
        op: "add_custom_shift",
        shiftName: "外来応援",
        shortLabel: "外",
        baseShift: "D",
        includedInAliases: ["W", "D"],
      },
    ]);
    state = applied1.updatedState;

    const c1Def = state.customShiftDefs.find((d) => d.label === "委員会")!;
    const g1Def = state.customShiftDefs.find((d) => d.label === "外来応援")!;
    expect(c1Def).toBeDefined();
    expect(g1Def).toBeDefined();
    expect(c1Def.includedInAliases).toEqual([]);
    expect(g1Def.includedInAliases).toEqual(["W", "D"]);

    // Verify resolveShiftSelector respects includedInAliases
    const wResolved = resolveShiftSelector("W", state);
    const dResolved = resolveShiftSelector("D", state);
    expect(wResolved).not.toContain(c1Def.code);
    expect(wResolved).toContain(g1Def.code);
    expect(dResolved).not.toContain(c1Def.code);
    expect(dResolved).toContain(g1Def.code);

    // 2. Configure "委員会" on 11/10..11/12 with 2 staff/day AND require at least 1 ICU skill holder (icu_er) + 1 leader (leader_cap) on "委員会" via set_staffing_rule
    const opStaffingIcu = convertStage2ToolToOperation(
      {
        tool_name: "set_staffing_rule",
        args: {
          targetShift: "委員会",
          attribute: "救急\u30fbICU",
          minCount: 1,
        },
      },
      state
    );
    expect(opStaffingIcu?.op).toBe("set_staffing_rule");
    if (opStaffingIcu?.op === "set_staffing_rule") {
      expect(opStaffingIcu.shifts).toEqual([c1Def.code]);
    }

    const applied2 = applyChatOperationsToState(state, [
      {
        op: "add_shift_day_restriction",
        shiftName: "委員会",
        startDay: 10,
        endDay: 12,
      },
      {
        op: "add_daily_shift_cap",
        shiftName: "委員会",
        minStaff: 2,
        maxStaff: 2,
      },
      opStaffingIcu!,
      {
        op: "set_staffing_rule",
        targetShift: c1Def.code,
        shifts: [c1Def.code],
        attribute: "leader_cap",
        minCount: 1,
      },
    ]);
    state = applied2.updatedState;

    const res = await solveNurseScheduleWithWashi(state);
    expect(res.status).toBe("Optimal");
    expect(res.evaluation?.valid).toBe(true);

    // On days 10, 11, 12, exactly 2 nurses must be assigned to c1Def.code, and at least 1 must hold icu_er and at least 1 must hold leader_cap
    for (const d of [10, 11, 12]) {
      const assignedNurses = state.nurses.filter(
        (n) => res.schedule![n.id]![d - 1] === c1Def.code
      );
      expect(assignedNurses.length).toBe(2);
      expect(assignedNurses.some((n) => n.skills.includes("icu_er"))).toBe(true);
      expect(assignedNurses.some((n) => n.skills.includes("leader_cap"))).toBe(true);
    }
  }, 30_000);

  it("Task 5.4 TDD: supports unified soft vs. hard constraints and penalty weights across CustomConstraintRule, PairRelation, ShiftPreference, and NurseScheduleConfig", async () => {
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11, seed: 42 });

    // 1. Conflicting soft custom rules on the same nurse/day with different penaltyWeight:
    //    Rule A (soft, weight 15): Pin N01 on Day 14 to "D"
    //    Rule B (soft, weight 90): Pin N01 on Day 14 to "O"
    //    If both were hard, the model would be Infeasible. As soft rules, the solver must satisfy Rule B (weight 90) over Rule A (weight 15).
    const hardConflictState: typeof baseState = {
      ...baseState,
      customRules: [
        ...baseState.customRules,
        {
          id: "hard_a",
          kind: "pin_shift",
          enabled: true,
          isHard: true,
          nurseId: "N01",
          day: 14,
          shift: "D",
          description: "11/14 N01 日勤固定",
        },
        {
          id: "hard_b",
          kind: "pin_shift",
          enabled: true,
          isHard: true,
          nurseId: "N01",
          day: 14,
          shift: "O",
          description: "11/14 N01 公休固定",
        },
      ],
    };
    const hardRes = await solveNurseScheduleWithWashi(hardConflictState);
    expect(hardRes.status).toBe("Infeasible");

    const softWeightedState: typeof baseState = {
      ...baseState,
      customRules: [
        ...baseState.customRules,
        {
          id: "soft_a",
          kind: "pin_shift",
          enabled: true,
          isHard: false,
          penaltyWeight: 15,
          nurseId: "N01",
          day: 14,
          shift: "D",
          description: "11/14 N01 \u306a\u308b\u3079\u304f日勤 (重\u307f15)",
        },
        {
          id: "soft_b",
          kind: "pin_shift",
          enabled: true,
          isHard: false,
          penaltyWeight: 90,
          nurseId: "N01",
          day: 14,
          shift: "O",
          description: "11/14 N01 \u306a\u308b\u3079\u304f公休 (重\u307f90)",
        },
      ],
    };
    const softRes = await solveNurseScheduleWithWashi(softWeightedState);
    expect(softRes.status).toBe("Optimal");
    expect(softRes.schedule!["N01"]![13]).toBe("O");
    // Hard rules are all valid, while the compromised soft rule is recorded with isSoft: true
    expect(softRes.evaluation?.valid).toBe(true);
    expect(softRes.evaluation?.violations.some((v) => v.isSoft === true)).toBe(true);

    // 2. Basic ward rule in NurseScheduleConfig configured as Soft via softRuleWeights:
    //    Suppose all leaders are pinned to Off ("O") on Day 15 (hard), which conflicts with minLeadersDay=2 (enforceSkillCoverage).
    //    When enforceSkillCoverage is Hard (default), it is Infeasible.
    //    When config.softRuleWeights = { enforceSkillCoverage: 40 }, it solves to Optimal by compromising leader coverage on Day 15!
    const leaders = baseState.nurses.filter((n) => n.skills.includes("leader_cap"));
    const leaderOffRules = leaders.map((l, i) => ({
      id: `ldr_off_${i}`,
      kind: "pin_shift" as const,
      enabled: true,
      isHard: true,
      nurseId: l.id,
      day: 15,
      shift: "O" as const,
      description: `11/15 ${l.name} 公休固定`,
    }));

    const leaderHardState: typeof baseState = {
      ...baseState,
      customRules: [...baseState.customRules, ...leaderOffRules],
    };
    const ldrHardRes = await solveNurseScheduleWithWashi(leaderHardState);
    expect(ldrHardRes.status).toBe("Infeasible");

    const leaderSoftConfigState: typeof baseState = {
      ...baseState,
      config: {
        ...baseState.config,
        softRuleWeights: {
          skill_leader_cap: 40,
        },
      },
      customRules: [...baseState.customRules, ...leaderOffRules],
    };
    const ldrSoftRes = await solveNurseScheduleWithWashi(leaderSoftConfigState);
    expect(ldrSoftRes.status).toBe("Optimal");
    expect(ldrSoftRes.evaluation?.valid).toBe(true);
    expect(
      ldrSoftRes.evaluation?.violations.some(
        (v) => v.day === 15 && v.category === "skill" && v.isSoft === true
      )
    ).toBe(true);
  }, 30_000);

  it("Anti-Ad-Hoc Invariants: preserves exact tool arguments and never performs hidden cross-domain state mutations", () => {
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11, seed: 42 });

    // Invariant 0: Base solver variables and default aliases must only define D, E, N (no subgroup shifts)
    const defaultBuilt = buildNurseWashiModel(baseState);
    expect(defaultBuilt.vD["N01"]?.length).toBe(30);
    expect(resolveShiftSelector("D", baseState)).toEqual(["D"]);

    // Invariant 1: set_staffing_rule must NEVER flip targetShift or attribute (team_A <-> team_B)
    const opFlipCheck1 = convertStage2ToolToOperation(
      {
        tool_name: "set_staffing_rule",
        args: { targetShift: "D", attribute: "A班", maxCount: 0 },
      },
      baseState
    );
    expect(opFlipCheck1?.op).toBe("set_staffing_rule");
    if (opFlipCheck1?.op === "set_staffing_rule") {
      expect(opFlipCheck1.targetShift).toBe("D");
      expect(opFlipCheck1.shifts).toEqual(["D"]);
      expect(opFlipCheck1.attribute).toBe("team_A");
    }
    const stateAfterFlipCheck1 = applyChatOperationsToState(baseState, [opFlipCheck1!]).updatedState;
    const ruleFlip1 = stateAfterFlipCheck1.customRules.find((r) => r.kind === "staffing_rule")!;
    expect(ruleFlip1.shifts).toEqual(["D"]);
    expect(ruleFlip1.attribute).toBe("team_A");
    expect(ruleFlip1.maxCount).toBe(0);

    const opFlipCheck2 = convertStage2ToolToOperation(
      {
        tool_name: "set_staffing_rule",
        args: { targetShift: "E", attribute: "B班", maxCount: 1 },
      },
      baseState
    );
    expect(opFlipCheck2?.op).toBe("set_staffing_rule");
    if (opFlipCheck2?.op === "set_staffing_rule") {
      expect(opFlipCheck2.targetShift).toBe("E");
      expect(opFlipCheck2.shifts).toEqual(["E"]);
      expect(opFlipCheck2.attribute).toBe("team_B");
    }
    const stateAfterFlipCheck2 = applyChatOperationsToState(baseState, [opFlipCheck2!]).updatedState;
    const ruleFlip2 = stateAfterFlipCheck2.customRules.find((r) => r.kind === "staffing_rule")!;
    expect(ruleFlip2.shifts).toEqual(["E"]);
    expect(ruleFlip2.attribute).toBe("team_B");

    // Invariant 2: set_staffing_rule / update_nurse_skill / add_shift_quota must NEVER silently auto-create unknown skills or custom shifts
    const stateAfterUnknownSkill = applyChatOperationsToState(baseState, [
      {
        op: "set_staffing_rule",
        targetShift: "D",
        shifts: ["D"],
        attribute: "未登録\u30b9\u30ad\u30eb",
        minCount: 1,
      },
      {
        op: "update_nurse_skill",
        nurseNameOrId: "N01",
        skillName: "未登録\u30b9\u30ad\u30eb",
        skillAction: "add",
      },
      {
        op: "add_shift_quota",
        shiftName: "未登録\u30b7\u30d5\u30c8",
        attribute: "newcomer",
        minCount: 2,
        maxCount: 2,
      },
    ]).updatedState;
    expect(stateAfterUnknownSkill.skillDefs?.length).toBe(baseState.skillDefs?.length);
    expect(stateAfterUnknownSkill.customShiftDefs.length).toBe(0);
    expect(
      stateAfterUnknownSkill.customRules.filter((r) => r.kind === "shift_count_quota").length
    ).toBe(0);

    // Invariant 3: add_shift_day_restriction (even for <= 7 days) must NEVER delete shift_count_quota or create daily_shift_cap
    let customShiftState = applyChatOperationsToState(baseState, [
      { op: "add_custom_shift", shiftName: "祭\u308a", shortLabel: "祭", baseShift: "D" },
      { op: "add_shift_quota", shiftName: "祭\u308a", attribute: "all", minCount: 2, maxCount: 2 },
      { op: "add_shift_day_restriction", shiftName: "祭\u308a", startDay: 10, endDay: 12 },
    ]).updatedState;
    expect(customShiftState.customRules.some((r) => r.kind === "shift_count_quota")).toBe(true);
    expect(customShiftState.customRules.some((r) => r.kind === "daily_shift_cap")).toBe(false);

    // Invariant 4: add_daily_shift_cap with maxStaff only must NEVER coerce minStaff = maxStaff or delete shift_count_quota
    const capOnlyState = applyChatOperationsToState(customShiftState, [
      { op: "add_daily_shift_cap", shiftName: "祭\u308a", maxStaff: 3 },
    ]).updatedState;
    const capRule = capOnlyState.customRules.find((r) => r.kind === "daily_shift_cap")!;
    expect(capRule.maxStaff).toBe(3);
    expect(capRule.minStaff).toBeUndefined();
    expect(capOnlyState.customRules.some((r) => r.kind === "shift_count_quota")).toBe(true);

    // Invariant 5: split_newcomer_groups scenario-specific tool must not exist, and add_preceptor_pair must NOT mutate global config.enforcePreceptorPairs
    const splitOp = convertStage2ToolToOperation(
      { tool_name: "split_newcomer_groups" as any, args: { shiftName: "新人研修", count: 2 } },
      baseState
    );
    expect(splitOp).toBeNull();
    const stateAfterPreceptorPair = applyChatOperationsToState(baseState, [
      { op: "add_preceptor_pair", nurseNameOrId: "N25", nurseBNameOrId: "N01" },
    ]).updatedState;
    expect(stateAfterPreceptorPair.config.enforcePreceptorPairs).toBe(false);

    // Invariant 6: add_request / add_calendar_request must NEVER mutate nurse contract fields (minMonthlyWorkDays / maxMonthlyWorkDays)
    const calOp = convertStage2ToolToOperation(
      {
        tool_name: "add_calendar_request",
        args: {
          nurseNameOrId: "三浦",
          daysOfWeek: ["火", "金"],
          shift: "W",
          onlyMatchedDaysWork: true,
        },
      },
      baseState
    )!;
    const stateAfterCalReq = applyChatOperationsToState(baseState, [calOp]).updatedState;
    for (const nurse of stateAfterCalReq.nurses) {
      expect(nurse.minMonthlyWorkDays).toBeUndefined();
      expect(nurse.maxMonthlyWorkDays).toBeUndefined();
    }

    // Invariant 7: buildNurseWashiModel with shift_prerequisite must NOT inject ad-hoc early-month bonus Coefficients (e.g. 30 C_...) into objective
    const prereqState = applyChatOperationsToState(baseState, [
      { op: "add_custom_shift", shiftName: "\u30aa\u30ea\u30a8\u30f3\u30c6\u30fc\u30b7\u30e7\u30f3", shortLabel: "\u30aa\u30ea", baseShift: "D" },
      { op: "add_shift_prerequisite", shiftName: "\u30aa\u30ea\u30a8\u30f3\u30c6\u30fc\u30b7\u30e7\u30f3", attribute: "newcomer", prereqMinCount: 2, restrictedShifts: ["E", "N"] },
    ]).updatedState;
    const built = buildNurseWashiModel(prereqState);
    const lp = built.model.toLpString();
    const objSection = lp.split("Subject To")[0] ?? "";
    expect(objSection).not.toMatch(/\+\s*30\s+C_/);
  });

  it("enforces zero-holder skill/staffing minima, validates ICU coverage, resolves aliases in daily_shift_cap, and counts custom O-based shifts as days off", async () => {
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11, seed: 42 });

    // 1. Custom skill with minDay > 0 and 0 holders must be Infeasible when hard, and diagnosed in HiGHS
    const unheldSkillState = {
      ...baseState,
      skillDefs: [
        ...(baseState.skillDefs ?? []),
        {
          code: "ecmo_cert",
          label: "ECMO認定",
          shortLabel: "ECMO",
          minDay: 1,
          minEvening: 0,
          minNight: 0,
        },
      ],
    };
    const unheldHardOutcome = await solveNurseScheduleWithWashi(unheldSkillState);
    expect(unheldHardOutcome.status).toBe("Infeasible");
    expect(unheldHardOutcome.conflicts.some((c) => c.name.startsWith("skill_ecmo_cert_D_"))).toBe(true);

    // Same for staffing_rule with minCount > 0 and 0 holders: Infeasible when hard, Optimal with soft compromise when isHard: false
    const unheldStaffingHardState = applyChatOperationsToState(baseState, [
      {
        op: "set_staffing_rule",
        targetShift: "D",
        shifts: ["D"],
        attribute: "ecmo_cert",
        minCount: 1,
        isHard: true,
      },
    ]).updatedState;
    const staffingHardRes = await solveNurseScheduleWithWashi(unheldStaffingHardState);
    expect(staffingHardRes.status).toBe("Infeasible");

    const unheldStaffingSoftState = applyChatOperationsToState(baseState, [
      {
        op: "set_staffing_rule",
        targetShift: "D",
        shifts: ["D"],
        attribute: "ecmo_cert",
        minCount: 1,
        isHard: false,
        penaltyWeight: 40,
      },
    ]).updatedState;
    const staffingSoftRes = await solveNurseScheduleWithWashi(unheldStaffingSoftState);
    expect(staffingSoftRes.status).toBe("Optimal");
    expect(
      staffingSoftRes.evaluation?.violations.some(
        (v) => v.id.startsWith("staffing_min_") && v.isSoft === true
      )
    ).toBe(true);

    // 2. evaluateNurseSchedule validates ICU coverage uniformly via skill_icu_er_D/E/N_d1
    const emptySchedule: Record<string, string[]> = {};
    for (const n of baseState.nurses) {
      emptySchedule[n.id] = new Array(baseState.config.numDays).fill("O");
    }
    const icuEval = evaluateNurseSchedule(baseState, emptySchedule);
    expect(icuEval.violations.some((v) => v.id === "skill_icu_er_D_d1")).toBe(true);
    expect(icuEval.violations.some((v) => v.id === "skill_icu_er_E_d1")).toBe(true);
    expect(icuEval.violations.some((v) => v.id === "skill_icu_er_N_d1")).toBe(true);

    // 3. evaluateNurseSchedule resolves shift aliases in daily_shift_cap
    const baselineSolved = await solveNurseScheduleWithWashi(baseState);
    expect(baselineSolved.status).toBe("Optimal");
    const dayAliasCapState: typeof baseState = {
      ...baseState,
      customRules: [
        ...baseState.customRules,
        {
          id: "cap_alias_D",
          kind: "daily_shift_cap",
          shift: "D",
          minStaff: 6,
          maxStaff: 20,
          description: "日勤(D)\u306f1日6〜20名",
          enabled: true,
        },
      ],
    };
    const dayAliasEval = evaluateNurseSchedule(dayAliasCapState, baselineSolved.schedule!);
    expect(dayAliasEval.violations.some((v) => v.id.startsWith("daily_min_cap_alias_D"))).toBe(false);

    // 4. Custom O-based shift (baseShift: "O", countsAsWorkDay: false) counts toward monthly days off
    const paidLeaveState = applyChatOperationsToState(baseState, [
      {
        op: "add_custom_shift",
        shiftName: "有給休暇",
        shortLabel: "有",
        baseShift: "O",
        countsAsWorkDay: false,
      },
    ]).updatedState;
    const customOffCode = paidLeaveState.customShiftDefs![0]!.code;
    const schedWithPaidLeave: Record<string, string[]> = {};
    for (const n of paidLeaveState.nurses) {
      schedWithPaidLeave[n.id] = [...baselineSolved.schedule![n.id]!];
    }
    const targetNurseId = paidLeaveState.nurses[0]!.id;
    schedWithPaidLeave[targetNurseId] = schedWithPaidLeave[targetNurseId]!.map((s) =>
      s === "O" ? customOffCode : s
    );
    const paidLeaveEval = evaluateNurseSchedule(paidLeaveState, schedWithPaidLeave);
    expect(
      paidLeaveEval.violations.some((v) => v.id === `off_min_${targetNurseId}`)
    ).toBe(false);
  }, 30_000);

  it("treats roles, teams, and skills uniformly as staff attributes across custom_shift and skill_and_pair tools", async () => {
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11, seed: 42 });

    // 1. add_skill_def resolves substitutesFor even when formatted with shortLabel parens
    const skillSubOp = convertStage2ToolToOperation(
      {
        tool_name: "add_skill_def",
        args: { skillName: "副\u30ea\u30fc\u30c0\u30fc", substitutesFor: "\u30ea\u30fc\u30c0\u30fc業務可(\u30ea)" },
      },
      baseState
    );
    expect(skillSubOp?.op).toBe("add_skill_def");
    if (skillSubOp?.op === "add_skill_def") {
      expect(skillSubOp.substitutesFor).toBe("leader_cap");
      expect(skillSubOp.skillMinDay).toBeUndefined();
    }

    // 2. add_shift_quota / add_daily_shift_cap / update_nurse_skill accept team_A or skills uniformly
    const quotaTeamOp = convertStage2ToolToOperation(
      {
        tool_name: "add_shift_quota",
        args: { shiftName: "\u30ab\u30f3\u30d5\u30a1\u30ec\u30f3\u30b9", attribute: "A班", count: 1 },
      },
      baseState
    );
    expect(quotaTeamOp?.op).toBe("add_shift_quota");
    if (quotaTeamOp?.op === "add_shift_quota") {
      expect(quotaTeamOp.attribute).toBe("team_A");
    }

    const grantTeamSkillOp = convertStage2ToolToOperation(
      {
        tool_name: "update_nurse_skill",
        args: { target: "B班", skillName: "副\u30ea\u30fc\u30c0\u30fc", action: "add" },
      },
      baseState
    );
    expect(grantTeamSkillOp?.op).toBe("update_nurse_skill");
    if (grantTeamSkillOp?.op === "update_nurse_skill") {
      expect(grantTeamSkillOp.attribute).toBe("team_B");
    }

    const applied = applyChatOperationsToState(baseState, [
      skillSubOp!,
      grantTeamSkillOp!,
      { op: "add_custom_shift", shiftName: "\u30ab\u30f3\u30d5\u30a1\u30ec\u30f3\u30b9", baseShift: "D" },
      quotaTeamOp!,
    ]).updatedState;

    const subLeaderSkill = applied.skillDefs?.find((s) => s.label === "副\u30ea\u30fc\u30c0\u30fc");
    expect(subLeaderSkill).toBeDefined();
    expect(subLeaderSkill!.substitutesFor).toBe("leader_cap");

    // Every B班 (team_B) nurse should now hold subLeaderSkill.code, and no A班 nurse should have gained it
    for (const n of applied.nurses) {
      if (n.skills.includes("team_B")) {
        expect(n.skills.includes(subLeaderSkill!.code)).toBe(true);
      } else {
        expect(n.skills.includes(subLeaderSkill!.code)).toBe(false);
      }
    }

    // Solver should enforce quota on team_A nurses for conference
    const solved = await solveNurseScheduleWithWashi(applied);
    expect(solved.status).toBe("Optimal");
    expect(solved.evaluation?.valid).toBe(true);
    const confCode = applied.customShiftDefs![0]!.code;
    for (const n of applied.nurses.filter((nurse) => nurse.skills.includes("team_A"))) {
      const cnt = solved.schedule![n.id]!.filter((s) => s === confCode).length;
      expect(cnt).toBe(1);
    }
  }, 30_000);

  it("enforces custom night shift caps & transitions, holiday contract clearing, custom shift deletion cascade, and quota parity", async () => {
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11, seed: 42 });

    // 1. Custom night shift (baseShift: "N") counts toward monthly night caps and inherits N->D / N->O transition rules
    const nightCustomState = applyChatOperationsToState(baseState, [
      {
        op: "add_custom_shift",
        shiftName: "救急夜勤",
        shift: "N_ER",
        shortLabel: "救夜",
        baseShift: "N",
      },
      {
        op: "set_nurse_contract",
        nurseNameOrId: "N01",
        maxMonthlyNightShifts: 1,
      },
      {
        op: "add_request",
        nurseNameOrId: "N01",
        day: 5,
        shift: "N_ER",
        isHard: true,
      },
      {
        op: "add_request",
        nurseNameOrId: "N01",
        day: 12,
        shift: "N_ER",
        isHard: true,
      },
    ]).updatedState;
    const nightCapViolatedRes = await solveNurseScheduleWithWashi(nightCustomState);
    expect(nightCapViolatedRes.status).toBe("Infeasible");

    // Also verify N_ER -> D on consecutive days violates ShiftTransitionMatrix (N -> D is forbidden by default)
    const nightTransViolatedState = applyChatOperationsToState(baseState, [
      {
        op: "add_custom_shift",
        shiftName: "救急夜勤",
        shift: "N_ER",
        shortLabel: "救夜",
        baseShift: "N",
      },
      {
        op: "add_request",
        nurseNameOrId: "N01",
        day: 5,
        shift: "N_ER",
        isHard: true,
      },
      {
        op: "add_request",
        nurseNameOrId: "N01",
        day: 6,
        shift: "D",
        isHard: true,
      },
    ]).updatedState;
    const nightTransRes = await solveNurseScheduleWithWashi(nightTransViolatedState);
    expect(nightTransRes.status).toBe("Infeasible");

    // 2. holidaysOff contract enforcement in model & evaluator, and clearing via clearNurseContractFromState
    const holState = applyChatOperationsToState(baseState, [
      {
        op: "set_nurse_contract",
        nurseNameOrId: "N02",
        holidaysOff: true,
      },
    ]).updatedState;
    // Evaluator detects holiday work if N02 is manually placed on D on Nov 3 (Culture Day)
    const baselineSolved = await solveNurseScheduleWithWashi(baseState);
    expect(baselineSolved.status).toBe("Optimal");
    const manualHolWorkSchedule = {
      ...baselineSolved.schedule!,
      N02: baselineSolved.schedule!["N02"]!.map((s, idx) => (idx === 2 ? "D" : s)),
    };
    const holEval = evaluateNurseSchedule(holState, manualHolWorkSchedule);
    expect(holEval.violations.some((v) => v.id === "holidays_off_N02_d3")).toBe(true);

    // Clearing N02's contract removes holidaysOff on NurseProfile
    const clearedHolState = clearNurseContractFromState(holState, "N02");
    expect(clearedHolState.nurses.find((n) => n.id === "N02")?.holidaysOff).toBeUndefined();
    // Pinning N02 to work on Nov 3 now succeeds
    const workOnHolAfterClear = applyChatOperationsToState(clearedHolState, [
      { op: "add_request", nurseNameOrId: "N02", day: 3, shift: "D", isHard: true },
    ]).updatedState;
    const solvedAfterClear = await solveNurseScheduleWithWashi(workOnHolAfterClear);
    expect(solvedAfterClear.status).toBe("Optimal");
    expect(solvedAfterClear.schedule!["N02"]![2]).toBe("D");

    // 3. removeCustomShiftFromState cascades deletion across staffing_rule.shifts, prereqShift, restrictedShifts, forbidShifts, and preferences
    const cascadeBefore = applyChatOperationsToState(baseState, [
      {
        op: "add_custom_shift",
        shiftName: "外来日勤",
        shift: "OUT_D",
        shortLabel: "外",
        baseShift: "D",
      },
      {
        op: "set_staffing_rule",
        targetShift: "OUT_D",
        attribute: "all",
        shifts: ["OUT_D"],
        minCount: 1,
      },
      {
        op: "add_shift_prerequisite",
        shiftName: "OUT_D",
        attribute: "newcomer",
        prereqMinCount: 1,
        restrictedShifts: ["E", "N"],
      },
      {
        op: "forbid_shift",
        nurseNameOrId: "N03",
        day: 10,
        forbidShifts: ["OUT_D"],
      },
      {
        op: "add_request",
        nurseNameOrId: "N04",
        day: 12,
        shift: "OUT_D",
        isHard: false,
      },
    ]).updatedState;
    expect(cascadeBefore.customShiftDefs.some((d) => d.code === "OUT_D")).toBe(true);
    expect(cascadeBefore.customRules.length).toBeGreaterThanOrEqual(3);
    expect(cascadeBefore.preferences.some((p) => p.shift === "OUT_D")).toBe(true);

    const cascadeAfter = removeCustomShiftFromState(cascadeBefore, "OUT_D");
    expect(cascadeAfter.customShiftDefs.some((d) => d.code === "OUT_D")).toBe(false);
    expect(cascadeAfter.customRules.some((r) => r.shift === "OUT_D" || r.prereqShift === "OUT_D")).toBe(false);
    expect(cascadeAfter.customRules.some((r) => r.shifts?.includes("OUT_D"))).toBe(false);
    expect(cascadeAfter.customRules.some((r) => r.forbidShifts?.includes("OUT_D"))).toBe(false);
    expect(cascadeAfter.preferences.some((p) => p.shift === "OUT_D")).toBe(false);

    const solvedAfterCascade = await solveNurseScheduleWithWashi(cascadeAfter);
    expect(solvedAfterCascade.status).toBe("Optimal");
    expect(solvedAfterCascade.evaluation?.valid).toBe(true);

    // 4. Quota cumulative bound when includePrevMonth exceeds maxCount is infeasible in both model and evaluator
    const overPrevQuotaState = {
      ...baseState,
      nurses: baseState.nurses.map((n) =>
        n.id === "N05" ? { ...n, prevCompletedShifts: { E: 4 } } : n
      ),
      customRules: [
        ...baseState.customRules,
        {
          id: "quota_prev_exceeded",
          kind: "shift_count_quota" as const,
          enabled: true,
          nurseId: "N05",
          shift: "E",
          maxCount: 2,
          includePrevMonth: true,
          description: "N05 \u306e準夜勤\u306f前月累計込\u307f\u3067最大2回\u307e\u3067",
        },
      ],
    };
    const overPrevRes = await solveNurseScheduleWithWashi(overPrevQuotaState);
    expect(overPrevRes.status).toBe("Infeasible");
    const overPrevEval = evaluateNurseSchedule(overPrevQuotaState, baselineSolved.schedule!);
    expect(
      overPrevEval.violations.some((v) => v.id === "quota_max_quota_prev_exceeded_N05")
    ).toBe(true);
  }, 30_000);

  it("aligns UI softRuleWeights keys, E/N contract exemptions, statutory holidays, skill removal cascade, target-scoped daily caps, and soft date coverage / day restriction evaluation", async () => {
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11, seed: 42 });

    // 1. Statutory Japanese holidays: chained substitute holidays (2025-05-06, 2026-05-06) & citizens' holiday (2026-09-22)
    expect(getJapaneseHolidayName(2025, 5, 6)).toBe("振替休日");
    expect(getJapaneseHolidayName(2026, 5, 6)).toBe("振替休日");
    expect(getJapaneseHolidayName(2026, 9, 22)).toBe("国民\u306e休日");
    expect(resolveDaysBySelector(2026, 9, 30, { kind: "pattern", holidays: "only" })).toEqual([
      21, 22, 23,
    ]);

    // 2. Align dynamic softRuleWeights keys (consecutive, monthlyDaysOff, monthlyNightCap, trans_N_D, skill_leader_cap) with buildNurseWashiModel
    const uiSoftModel = buildNurseWashiModel({
      ...baseState,
      config: {
        ...baseState.config,
        softRuleWeights: {
          consecutive: 40,
          monthlyDaysOff: 40,
          monthlyNightCap: 40,
          trans_N_D: 40,
          skill_leader_cap: 40,
        },
      },
    });
    expect(uiSoftModel.constraintMeta.get("consec_work_N01_d1_to_d6")?.isHard).toBe(false);
    expect(uiSoftModel.constraintMeta.get("monthly_off_min_N01")?.isHard).toBe(false);
    expect(uiSoftModel.constraintMeta.get("monthly_night_max_N01")?.isHard).toBe(false);
    expect(uiSoftModel.constraintMeta.get("trans_N_to_D_N01_d1")?.isHard).toBe(false);
    expect(uiSoftModel.constraintMeta.get("carryover_N_to_D_N01_d1")?.isHard).toBe(false);
    expect(uiSoftModel.constraintMeta.get("skill_leader_cap_D_d1")?.isHard).toBe(false);

    // 3. Custom E/N-base shifts in E/N contract exemptions
    const customEnState = applyChatOperationsToState(baseState, [
      { op: "add_custom_shift", shiftName: "特別準夜", shift: "E_SP", shortLabel: "特準", baseShift: "E" },
      { op: "add_custom_shift", shiftName: "特別深夜", shift: "N_SP", shortLabel: "特深", baseShift: "N" },
      { op: "set_nurse_contract", nurseNameOrId: "N01", forbiddenShifts: ["E", "N"] },
    ]).updatedState;
    const builtCustomEn = buildNurseWashiModel(customEnState);
    const lpCustomEn = builtCustomEn.model.toLpString();
    expect(lpCustomEn).toMatch(/forbid_contract_E_N01_d1:.*C_E_SP_N01_d1/);
    expect(lpCustomEn).toMatch(/forbid_contract_N_N01_d1:.*C_N_SP_N01_d1/);

    const emptySched: Record<string, string[]> = {};
    for (const n of customEnState.nurses) {
      emptySched[n.id] = new Array(customEnState.config.numDays).fill("O");
    }

    // 4. Skill removal clears substitutesFor within skillDefs without cross-domain customRules deletion (honest infeasibility)
    const withCustomSkillState = applyChatOperationsToState(baseState, [
      { op: "add_skill_def", skillName: "透析管理" },
      { op: "add_skill_def", skillName: "透析\u30b5\u30d6", substitutesFor: "透析管理" },
      { op: "set_staffing_rule", targetShift: "D", shifts: ["D"], attribute: "透析管理", minCount: 1 },
    ]).updatedState;
    const dialysisCode = withCustomSkillState.skillDefs!.find((s) => s.label === "透析管理")!.code;
    expect(withCustomSkillState.customRules.some((r) => r.attribute === dialysisCode)).toBe(true);
    const afterSkillRemoved = applyChatOperationsToState(withCustomSkillState, [
      { op: "remove_skill_def", skillName: "透析管理" },
    ]).updatedState;
    expect(afterSkillRemoved.skillDefs!.some((s) => s.code === dialysisCode)).toBe(false);
    expect(afterSkillRemoved.customRules.some((r) => r.attribute === dialysisCode)).toBe(true);
    expect(
      afterSkillRemoved.skillDefs!.find((s) => s.label === "透析\u30b5\u30d6")?.substitutesFor
    ).toBeUndefined();
    const zeroHolderAfterRemove = await solveNurseScheduleWithWashi(afterSkillRemoved);
    expect(zeroHolderAfterRemove.status).toBe("Infeasible");

    // 5. Preserve daily_shift_cap rules across distinct target groups on the same shift
    const multiTargetCapState = applyChatOperationsToState(baseState, [
      { op: "add_custom_shift", shiftName: "合同研修", shift: "TR_ALL", shortLabel: "合", baseShift: "D" },
      { op: "add_daily_shift_cap", shiftName: "合同研修", attribute: "newcomer", maxStaff: 2 },
      { op: "add_daily_shift_cap", shiftName: "合同研修", attribute: "leader_cap", minStaff: 1 },
    ]).updatedState;
    const trCaps = multiTargetCapState.customRules.filter(
      (r) => r.kind === "daily_shift_cap" && r.shift === "TR_ALL"
    );
    expect(trCaps.length).toBe(2);
    expect(trCaps.some((r) => r.attribute === "newcomer" && r.maxStaff === 2)).toBe(true);
    expect(trCaps.some((r) => r.attribute === "leader_cap" && r.minStaff === 1)).toBe(true);

    // 6. Evaluate soft date_coverage violations and do not suppress hard daily_shift_cap minima with soft shift_day_restriction
    const softDateCovAndSoftRestrictState: typeof baseState = {
      ...multiTargetCapState,
      customRules: [
        ...multiTargetCapState.customRules,
        {
          id: "soft_date_cov_d5",
          kind: "date_coverage",
          enabled: true,
          isHard: false,
          penaltyWeight: 30,
          day: 5,
          shift: "D",
          minStaff: 25,
          description: "11/5 日勤25名目標(\u30bd\u30d5\u30c8)",
        },
        {
          id: "soft_restrict_tr",
          kind: "shift_day_restriction",
          enabled: true,
          isHard: false,
          penaltyWeight: 15,
          shift: "TR_ALL",
          startDay: 10,
          endDay: 12,
          description: "合同研修\u306f\u306a\u308b\u3079\u304f11/10〜12\u306e\u307f(\u30bd\u30d5\u30c8)",
        },
      ],
    };
    const evalSoftRules = evaluateNurseSchedule(softDateCovAndSoftRestrictState, emptySched);
    expect(
      evalSoftRules.violations.some((v) => v.id === "custom_date_cov_soft_date_cov_d5_d5" && v.isSoft === true)
    ).toBe(true);
    // Day 1 is outside soft_restrict_tr (10..12), but because soft_restrict_tr is soft (isHard: false),
    // the hard daily_shift_cap minimum (leader_cap >= 1 on TR_ALL) on Day 1 must still be evaluated!
    expect(
      evalSoftRules.violations.some((v) => v.id.startsWith("daily_min_") && v.day === 1 && !v.isSoft)
    ).toBe(true);
  });

  it("verifies Codex review fixes for custom shifts, clear_custom_rules, transition require policies, and ranged conflict diagnosis", async () => {
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });

    // 1. getEffectiveIncludedAliases returns ["W", "EN"] for E/N-based custom shifts (4359929261)
    expect(
      getEffectiveIncludedAliases({
        code: "E_SP",
        label: "特別準夜",
        shortLabel: "特準",
        baseShift: "E",
      })
    ).toEqual(["W", "EN"]);
    expect(
      getEffectiveIncludedAliases({
        code: "N_SP",
        label: "特別深夜",
        shortLabel: "特深",
        baseShift: "N",
      })
    ).toEqual(["W", "EN"]);
    expect(
      getEffectiveIncludedAliases({
        code: "D_SP",
        label: "特別日勤",
        shortLabel: "特日",
        baseShift: "D",
      })
    ).toEqual(["W"]);

    // 2. Reject unknown/unregistered shift names in add_request / add_calendar_request (4359929248)
    const unknownCalendarOp = convertStage2ToolToOperation(
      { action: "add_calendar_request", nurseName: "N01", day: 5, shift: "早番" },
      baseState
    );
    expect(unknownCalendarOp).toBeNull();
    const unknownRequestExec = applyChatOperationsToState(baseState, [
      { op: "add_request", nurseNameOrId: "N01", day: 5, shift: "早番" as unknown as "D" },
    ]);
    expect(
      unknownRequestExec.updatedState.preferences.some((r) => r.nurseId === "N01" && r.day === 5)
    ).toBe(false);
    expect(
      unknownRequestExec.updatedState.customRules.some(
        (r) => r.kind === "pin_shift" && r.nurseId === "N01" && r.day === 5
      )
    ).toBe(false);
    expect(unknownRequestExec.appliedLogs.length).toBe(0);

    // 3. Reject reserved shift codes and duplicate custom shift codes, and normalize baseShift metadata on reclassification (4358960706, 4358960698)
    const reservedShiftExec = applyChatOperationsToState(baseState, [
      { op: "add_custom_shift", shiftName: "偽日勤", shift: "D", shortLabel: "偽" },
      { op: "add_custom_shift", shiftName: "偽夜勤枠", shift: "EN", shortLabel: "偽夜" },
    ]);
    expect((reservedShiftExec.updatedState.customShiftDefs ?? []).length).toBe(0);
    expect(reservedShiftExec.appliedLogs.length).toBe(0);

    const addedOffCustom = applyChatOperationsToState(baseState, [
      { op: "add_custom_shift", shiftName: "学会出張", shift: "CONF", shortLabel: "学", baseShift: "O" },
    ]).updatedState;
    const offDef = addedOffCustom.customShiftDefs!.find((cs) => cs.code === "CONF")!;
    expect(offDef.baseShift).toBe("O");
    expect(offDef.countsAsWorkDay).toBe(false);
    expect(offDef.timeRange).toBe("終日 (休暇)");

    // Reject duplicate custom shift code used by another shift name
    const dupCodeExec = applyChatOperationsToState(addedOffCustom, [
      { op: "add_custom_shift", shiftName: "院内会議", shift: "CONF", shortLabel: "会" },
    ]);
    expect(dupCodeExec.updatedState.customShiftDefs!.length).toBe(1);
    expect(dupCodeExec.updatedState.customShiftDefs![0].label).toBe("学会出張");
    expect(dupCodeExec.appliedLogs.length).toBe(0);

    const reclassifiedToNight = applyChatOperationsToState(addedOffCustom, [
      { op: "add_custom_shift", shiftName: "学会出張", baseShift: "N" },
    ]).updatedState;
    const nightDef = reclassifiedToNight.customShiftDefs!.find((cs) => cs.code === "CONF")!;
    expect(nightDef.baseShift).toBe("N");
    expect(nightDef.countsAsWorkDay).toBe(true);
    expect(nightDef.timeRange).toBe("00:30–09:00");
    expect(nightDef.overtimeHoursPerShift).toBe(0.5);

    // 4. clear_custom_rules cascades custom-shift cleanup, removes chat_ng_*/chat_preceptor_* relations, and preserves nurse contracts (4357874570, 4358960690, 4359488756)
    const dirtyState = applyChatOperationsToState(reclassifiedToNight, [
      { op: "add_request", nurseNameOrId: "N01", day: 6, shift: "CONF" },
      { op: "set_nurse_contract", nurseNameOrId: "N02", maxMonthlyNightShifts: 2, forbiddenShifts: ["E"] },
      { op: "add_ng_pair", nurseNameOrId: "N01", nurseBNameOrId: "N02" },
      { op: "add_preceptor_pair", nurseNameOrId: "N03", nurseBNameOrId: "N04" },
      { op: "add_daily_shift_cap", shiftName: "CONF", maxStaff: 1 },
    ]).updatedState;
    expect(dirtyState.customRules.some((r) => r.kind === "pin_shift" && r.shift === "CONF")).toBe(true);
    expect(dirtyState.relations.some((r) => r.id.startsWith("chat_ng_"))).toBe(true);
    expect(dirtyState.relations.some((r) => r.id.startsWith("chat_preceptor_"))).toBe(true);

    const clearedRulesState = applyChatOperationsToState(dirtyState, [
      { op: "clear_custom_rules" },
    ]).updatedState;
    expect(clearedRulesState.customRules.length).toBe(0);
    expect((clearedRulesState.customShiftDefs ?? []).length).toBe(0);
    expect(clearedRulesState.preferences.some((r) => r.shift === "CONF")).toBe(false);
    expect(clearedRulesState.relations.some((r) => r.id.startsWith("chat_ng_"))).toBe(false);
    expect(clearedRulesState.relations.some((r) => r.id.startsWith("chat_preceptor_"))).toBe(false);
    const n02AfterClear = clearedRulesState.nurses.find((n) => n.id === "N02")!;
    expect(n02AfterClear.maxMonthlyNightShifts).toBe(2);
    expect(n02AfterClear.forbiddenShifts).toEqual(["E"]);

    // 5. clearNurseContractFromState resets nightOk and contractPreset (4359236107)
    const stateWithDayOnly: typeof baseState = {
      ...baseState,
      nurses: baseState.nurses.map((n) =>
        n.id === "N05" ? applyContractPresetToNurse(n, "day_only") : n
      ),
    };
    expect(stateWithDayOnly.nurses.find((n) => n.id === "N05")?.nightOk).toBe(false);
    expect(stateWithDayOnly.nurses.find((n) => n.id === "N05")?.contractPreset).toBe("day_only");
    const stateAfterContractReset = clearNurseContractFromState(stateWithDayOnly, "N05");
    const n05Reset = stateAfterContractReset.nurses.find((n) => n.id === "N05")!;
    expect(n05Reset.nightOk).toBe(true);
    expect(n05Reset.contractPreset).toBeUndefined();
    expect(n05Reset.forbiddenShifts).toBeUndefined();

    // 6. Preserve and enforce "require" transition policies on non-off shifts and unify require under a single ruleKey (4359236088, 4359236095)
    const configWithRequireEN = applyShiftTransitionToConfig(baseState.config, "E", "N", "require");
    const matrixEN = getShiftTransitionMatrix(configWithRequireEN);
    expect(matrixEN.E.N).toBe("require");
    expect(matrixEN.E.D).toBe("forbid");
    expect(matrixEN.E.O).toBe("forbid");

    const stateRequireEN = { ...baseState, config: configWithRequireEN };
    const builtRequireEN = buildNurseWashiModel(stateRequireEN);
    expect(builtRequireEN.constraintMeta.get("trans_E_to_Req_N_N01_d1")?.ruleKey).toBe("trans_E_N");
    expect(builtRequireEN.constraintMeta.has("trans_E_to_D_N01_d1")).toBe(false);

    // Softening trans_N_O softens the entire N->O required transition without leaving hard N->D/E/N forbid constraints
    const configWithRequireNO = applyShiftTransitionToConfig(baseState.config, "N", "O", "require");
    const stateSoftNO = {
      ...baseState,
      config: {
        ...configWithRequireNO,
        softRuleWeights: {
          ...(configWithRequireNO.softRuleWeights ?? {}),
          trans_N_O: 15,
        },
      },
    };
    const builtSoftNO = buildNurseWashiModel(stateSoftNO);
    expect(builtSoftNO.constraintMeta.get("trans_N_to_Req_O_N01_d1")?.isHard).toBe(false);
    expect(builtSoftNO.constraintMeta.get("trans_N_to_Req_O_N01_d1")?.ruleKey).toBe("trans_N_O");
    expect(builtSoftNO.constraintMeta.has("trans_N_to_D_N01_d1")).toBe(false);
    expect(builtSoftNO.constraintMeta.has("trans_N_to_E_N01_d1")).toBe(false);
    expect(builtSoftNO.constraintMeta.has("trans_N_to_N_N01_d1")).toBe(false);

    // 7. Diagnose ranged startDay/endDay conflicts and never fabricate conflicts for soft rules (4357874582, 4357874589)
    const rangedConflictState = applyChatOperationsToState(baseState, [
      { op: "add_custom_shift", shiftName: "集中研修", shift: "TR_R", shortLabel: "集", baseShift: "D" },
      { op: "add_shift_day_restriction", shiftName: "TR_R", startDay: 10, endDay: 15 },
      {
        op: "add_daily_shift_cap",
        shiftName: "TR_R",
        minStaff: 5,
        maxStaff: 2,
        startDay: 10,
        endDay: 12,
      },
      {
        op: "add_daily_shift_cap",
        shiftName: "D",
        minStaff: 12,
        isHard: false,
        penaltyWeight: 10,
      },
    ]).updatedState;
    const diagRanged = await diagnoseNurseScheduleWithHiGHS(rangedConflictState);
    expect(diagRanged.conflicts.length).toBeGreaterThan(0);
    expect(diagRanged.conflicts.some((c) => c.relatedDay === 10)).toBe(true);
    // Soft rule must never appear as a hard conflict in diagnosis
    const softRule = rangedConflictState.customRules.find((r) => r.isHard === false)!;
    expect(diagRanged.conflicts.some((c) => c.name.includes(softRule.id))).toBe(false);

    // 8. Check weekend-off violations in evaluateNurseSchedule (4362414343)
    const allWorkSched: Record<string, string[]> = {};
    for (const n of baseState.nurses) {
      allWorkSched[n.id] = new Array(baseState.config.numDays).fill("D");
    }
    const evalWeekendHard = evaluateNurseSchedule(baseState, allWorkSched);
    expect(
      evalWeekendHard.violations.some((v) => v.id === "weekend_off_N01" && !v.isSoft)
    ).toBe(true);
    const evalWeekendSoft = evaluateNurseSchedule(
      {
        ...baseState,
        config: {
          ...baseState.config,
          softRuleWeights: { requireWeekendOff: 20 },
        },
      },
      allWorkSched
    );
    expect(
      evalWeekendSoft.violations.some((v) => v.id === "weekend_off_N01" && v.isSoft === true)
    ).toBe(true);

    // 9. Diagnose monthly shift_count_quota infeasibility in explicit diagnosis (4362414355)
    const quotaInfeasibleState = applyChatOperationsToState(baseState, [
      {
        op: "add_shift_quota",
        shiftName: "D",
        nurseNameOrId: "N01",
        minCount: 31,
      },
    ]).updatedState;
    const diagQuota = await diagnoseNurseScheduleWithHiGHS(quotaInfeasibleState);
    expect(diagQuota.status).toBe("Unsat");
    expect(diagQuota.conflicts.some((c) => c.name.startsWith("quota_min_"))).toBe(true);

    // 10. O-based custom shifts in prevMonthShifts do not count toward carryover work streak (4362997688)
    const leaveCustomDefs = [
      { code: "CONF", label: "学会出張", shortLabel: "学", baseShift: "O" as const },
      { code: "NIGHT_TR", label: "夜勤研修", shortLabel: "夜研", baseShift: "N" as const },
    ];
    expect(getPrevMonthTailWorkStreak(["D", "D", "CONF"], leaveCustomDefs)).toBe(0);
    expect(getPrevMonthTailWorkStreak(["CONF", "D", "NIGHT_TR"], leaveCustomDefs)).toBe(2);

    const stateCarryoverLeave = {
      ...baseState,
      customShiftDefs: leaveCustomDefs,
      nurses: baseState.nurses.map((n) =>
        n.id === "N01" ? { ...n, prevMonthShifts: ["D", "D", "D", "D", "CONF"] } : n
      ),
    };
    const builtCarryoverLeave = buildNurseWashiModel(stateCarryoverLeave);
    expect(builtCarryoverLeave.constraintMeta.has("carryover_consec_N01")).toBe(false);

    // 11. NurseMonthlySummary populates totalOffDays and totalNightShifts including custom shifts (4362997695)
    const customSummarySched: Record<string, string[]> = {};
    for (const n of stateCarryoverLeave.nurses) {
      customSummarySched[n.id] = new Array(stateCarryoverLeave.config.numDays).fill("D");
    }
    // Assign N01: 2 standard O, 3 CONF (O-based), 2 standard E, 1 standard N, 2 NIGHT_TR (N-based), rest D (20 days)
    customSummarySched["N01"] = [
      "O",
      "O",
      "CONF",
      "CONF",
      "CONF",
      "E",
      "E",
      "N",
      "NIGHT_TR",
      "NIGHT_TR",
      ...new Array(20).fill("D"),
    ];
    const evalCustomSummary = evaluateNurseSchedule(stateCarryoverLeave, customSummarySched);
    const n01Summary = evalCustomSummary.nurseSummaries["N01"]!;
    expect(n01Summary.totalOffDays).toBe(5);
    expect(n01Summary.totalWorkDays).toBe(25);
    expect(n01Summary.totalNightShifts).toBe(5);

    // 12. Preserve and enforce forbidden transitions to off days (toShift: "O", policy: "forbid") (4363684476)
    const configForbidEO = applyShiftTransitionToConfig(baseState.config, "E", "O", "forbid");
    const matrixEO = getShiftTransitionMatrix(configForbidEO);
    expect(matrixEO.E.O).toBe("forbid");
    const stateForbidEO = { ...baseState, config: configForbidEO };
    const builtForbidEO = buildNurseWashiModel(stateForbidEO);
    expect(builtForbidEO.constraintMeta.get("trans_E_to_O_N01_d1")?.ruleKey).toBe("trans_E_O");
    const evalForbidEO = evaluateNurseSchedule(stateForbidEO, {
      ...allWorkSched,
      N01: ["E", "O", ...new Array(28).fill("D")],
    });
    expect(evalForbidEO.violations.some((v) => v.id === "trans_EO_N01_d2")).toBe(true);

    // 13. Enforce forbidding the implicit off assignment ("O") in forbid_shift rules (4363684483)
    const stateForbidOff = {
      ...baseState,
      customRules: [
        ...baseState.customRules,
        {
          id: "forbid_off_d1",
          kind: "forbid_shift" as const,
          description: "N01 11/1 公休禁止",
          nurseId: "N01",
          day: 1,
          forbidShifts: ["O"],
          enabled: true,
        },
      ],
    };
    const builtForbidOff = buildNurseWashiModel(stateForbidOff);
    expect(builtForbidOff.constraintMeta.has("custom_forbid_forbid_off_d1_N01_d1")).toBe(true);

    // 14. Reject duplicate add_skill_def without mutating existing skill requirements or category (4363684493)
    const dupSkillResult = applyChatOperationsToState(baseState, [
      { op: "add_skill_def", skillName: "\u30ea\u30fc\u30c0\u30fc業務可" },
      { op: "add_skill_def", skillName: "新人" },
    ]);
    expect(dupSkillResult.appliedLogs).toHaveLength(0);
    const leaderSkill = dupSkillResult.updatedState.skillDefs?.find((s) => s.code === "leader_cap");
    expect(leaderSkill?.minDay).toBe(2);
    expect(leaderSkill?.minEvening).toBe(1);
    expect(leaderSkill?.minNight).toBe(1);
    expect(leaderSkill?.builtIn).toBe(true);
    const newcomerSkill = dupSkillResult.updatedState.skillDefs?.find((s) => s.code === "newcomer");
    expect(newcomerSkill?.category).toBe("role");
    expect(newcomerSkill?.maxEvening).toBe(1);
    expect(newcomerSkill?.maxNight).toBe(1);

    // 15. Clear numeric limits when set_nurse_contract item is "制限解除" (4365514172)
    const stateWithCappedContract = applyChatOperationsToState(baseState, [
      convertStage2ToolToOperation(
        {
          tool_name: "set_nurse_contract",
          args: { nurseNameOrId: "N01", item: "maxWorkDays", value: 10 },
        },
        baseState
      )!,
    ]).updatedState;
    expect(stateWithCappedContract.nurses.find((n) => n.id === "N01")?.maxMonthlyWorkDays).toBe(10);
    const resetContractOp = convertStage2ToolToOperation(
      {
        tool_name: "set_nurse_contract",
        args: { nurseNameOrId: "N01", item: "制限解除" },
      },
      stateWithCappedContract
    )!;
    const afterContractReset = applyChatOperationsToState(
      stateWithCappedContract,
      [resetContractOp]
    ).updatedState;
    expect(afterContractReset.nurses.find((n) => n.id === "N01")?.maxMonthlyWorkDays).toBeUndefined();

    // 16. Preserve impossible minMonthlyDaysOff (> numDays) as infeasible (4365514178)
    const stateImpossibleOff = {
      ...baseState,
      nurses: baseState.nurses.map((n) =>
        n.id === "N01" ? { ...n, minMonthlyDaysOff: 31, minMonthlyWorkDays: 0 } : n
      ),
    };
    const diagImpossibleOff = await diagnoseNurseScheduleWithHiGHS(stateImpossibleOff);
    expect(diagImpossibleOff.status).toBe("Unsat");
    expect(diagImpossibleOff.rawNames).toContain("monthly_off_min_N01");

    // 17. Keep individual maxMonthlyWorkDays hard in evaluation when monthlyDaysOff is soft (4365514183)
    const stateSoftDaysOffWithCap = {
      ...baseState,
      config: {
        ...baseState.config,
        softRuleWeights: { monthlyDaysOff: 30 },
      },
      nurses: baseState.nurses.map((n) =>
        n.id === "N01" ? { ...n, maxMonthlyWorkDays: 10 } : n
      ),
    };
    const evalWorkMax = evaluateNurseSchedule(stateSoftDaysOffWithCap, allWorkSched);
    const workMaxViol = evalWorkMax.violations.find((v) => v.id === "work_max_N01");
    expect(workMaxViol).toBeDefined();
    expect(Boolean(workMaxViol?.isSoft)).toBe(false);

    // 18. Reconcile conflicting cell rules on chat add_request and forbid_shift (4366186922)
    const stateWithCellForbidAndHardPref = {
      ...baseState,
      customRules: [
        ...baseState.customRules,
        {
          id: "forbid_n01_d5",
          kind: "forbid_shift" as const,
          enabled: true,
          nurseId: "N01",
          day: 5,
          forbidShifts: ["D", "E"],
          description: "N01 day 5 forbid D/E",
        },
      ],
      preferences: [
        ...baseState.preferences,
        {
          id: "hard_pref_n01_d5_o",
          nurseId: "N01",
          day: 5,
          shift: "O",
          isHard: true,
          reason: "Hard off preference",
        },
      ],
    };
    const afterChatPinD = applyChatOperationsToState(stateWithCellForbidAndHardPref, [
      { op: "add_request", nurseNameOrId: "N01", day: 5, shift: "D", isHard: true },
    ]).updatedState;
    const remForbidD5 = afterChatPinD.customRules.find((r) => r.id === "forbid_n01_d5");
    expect(remForbidD5?.forbidShifts).toEqual(["E"]);
    expect(afterChatPinD.preferences.some((p) => p.id === "hard_pref_n01_d5_o")).toBe(false);

    const afterChatForbidD = applyChatOperationsToState(afterChatPinD, [
      { op: "forbid_shift", nurseNameOrId: "N01", day: 5, forbidShifts: ["D"] },
    ]).updatedState;
    expect(
      afterChatForbidD.customRules.some(
        (r) => r.kind === "pin_shift" && r.nurseId === "N01" && r.day === 5 && r.shift === "D"
      )
    ).toBe(false);

    // 19. Reject unresolved shifts in array-based tool operations (4366186925)
    expect(
      convertStage2ToolToOperation(
        {
          tool_name: "forbid_shift_day",
          args: { nurseNameOrId: "N01", day: 5, shifts: ["UNKNOWN_SHIFT"] },
        },
        baseState
      )
    ).toBeNull();
    expect(
      convertStage2ToolToOperation(
        {
          tool_name: "add_ng_pair",
          args: { nurseA: "N01", nurseB: "N02", shifts: ["D", "TYPO_SHIFT"] },
        },
        baseState
      )
    ).toBeNull();
    expect(
      convertStage2ToolToOperation(
        {
          tool_name: "add_preceptor_pair",
          args: { newcomerNurse: "N20", mentorNurse: "N01", shifts: ["TYPO_SHIFT"] },
        },
        baseState
      )
    ).toBeNull();
    expect(
      convertStage2ToolToOperation(
        {
          tool_name: "set_staffing_rule",
          args: { attribute: "leader", targetShift: "UNKNOWN_SHIFT", minCount: 1 },
        },
        baseState
      )
    ).toBeNull();
  });

  it("holds all tool execution when clarification is needed (Option A) and executes all held + answered operations in the next turn", async () => {
    const state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11, seed: 202611 });
    const g = globalThis as Record<string, unknown>;
    const origLM = g.LanguageModel;

    let turn1Reply: Record<string, unknown> | null = null;
    let turn1RawOutput: string | null = null;
    let turn2RepliesBySchema = new Map<unknown, unknown>();
    let consultReplyText = "";
    const capturedTurn1Prompts: string[] = [];
    const capturedTurn2Prompts: string[] = [];

    g.LanguageModel = {
      async availability() {
        return "available";
      },
      async create() {
        return {
          contextWindow: 9216,
          contextUsage: 1800,
          async prompt(input: string, opts?: { responseConstraint?: unknown }) {
            const schema = opts?.responseConstraint;
            if (!schema) {
              return consultReplyText;
            }
            if (schema === STAGE1_ROUTER_SCHEMA) {
              capturedTurn1Prompts.push(input);
              return turn1RawOutput ?? JSON.stringify(turn1Reply);
            }
            if (turn2RepliesBySchema.has(schema)) {
              capturedTurn2Prompts.push(input);
              return JSON.stringify(turn2RepliesBySchema.get(schema));
            }
            return JSON.stringify({ tools: [{ tool_name: "none", args: {} }] });
          },
          async clone() {
            return this;
          },
          destroy() {},
        };
      },
    };

    try {
      const manager = createGeminiNanoManager();
      await manager.initialize();

      // Turn 1: User asks to give nurse Tanaka time off from 9th to 15th and adjust minimum work days
      // Stage 1 routes to `clarify` because the target minimum workday count is missing, holding all tool execution.
      turn1Reply = {
        thought:
          "田中\u3055\u3093\u306e9日\u304b\u308915日\u307e\u3067\u306e公休指定\u3068、月間最低勤務日数\u306e調整。勤務下限\u306e具体的\u306a数値\u304c不明\u306a\u305f\u3081 clarify \u3067聞\u304d返\u3059。",
        routes: [{ tool_type: "clarify" }],
        response:
          "田中\u3055\u3093\u306e9日\u304b\u308915日\u307e\u3067\u306e公休\u3068\u3042\u308f\u305b\u3066設定\u3059\u308b\u305f\u3081、月間最低勤務日数\u3092何日\u306b調整\u3059\u308b\u304b教\u3048\u3066\u3044\u305f\u3060\u3051\u307e\u3059\u3067\u3057\u3087\u3046\u304b？",
      };
      consultReplyText =
        "田中\u3055\u3093\u306e9日〜15日\u306e公休\u3068\u3042\u308f\u305b\u3066一括設定\u3059\u308b\u305f\u3081、月間最低勤務日数\u3092何日\u306b調整\u3059\u308b\u304b教\u3048\u3066\u304f\u3060\u3055\u3044。";

      const planTurn1 = await manager.extractPlan(
        "田中\u3055\u3093\u306f、9日\u304b\u308915日\u307e\u3067休\u307e\u305b\u3066\u3042\u3052\u3066。勤務下限\u3082調整\u3057\u3066。",
        state
      );
      expect(planTurn1.intentType).toBe("consult_only");
      expect(planTurn1.nonToolReason).toBe("clarify");
      expect(planTurn1.operations).toEqual([]);
      // Turn 2 extractors must NOT have been called during the held turn
      expect(capturedTurn2Prompts.length).toBe(0);

      let consultOut1 = "";
      for await (const chunk of manager.streamConsultationReply(
        "田中\u3055\u3093\u306f、9日\u304b\u308915日\u307e\u3067休\u307e\u305b\u3066\u3042\u3052\u3066。勤務下限\u3082調整\u3057\u3066。",
        [],
        state,
        null
      )) {
        consultOut1 += chunk;
      }
      expect(consultOut1).toContain("何日\u306b調整\u3059\u308b\u304b教\u3048\u3066\u304f\u3060\u3055\u3044");
      const consultTrace1 = manager.getLastConsultTrace();
      expect(consultTrace1?.userPrompt).toContain("回答待\u3061\u306e\u305f\u3081一括保留");

      // Turn 2: User replies with another vague message ("decrease min work days slightly"), triggering a 2nd clarification round
      turn1Reply = {
        thought: "『少\u3057減\u3089\u3057\u3066』\u3067\u306f具体的\u306a日数\u304c不明\u306a\u305f\u3081再度聞\u304d返\u3059。",
        routes: [{ tool_type: "clarify" }],
        response: "月間最低勤務日数\u3092具体的\u306b何日\u306b\u3059\u308b\u304b教\u3048\u3066\u3044\u305f\u3060\u3051\u307e\u3059\u304b？",
      };
      const planTurn2Vague = await manager.extractPlan("勤務下限\u306f少\u3057減\u3089\u3057\u3066", state);
      expect(planTurn2Vague.intentType).toBe("consult_only");
      expect(planTurn2Vague.nonToolReason).toBe("clarify");
      expect(planTurn2Vague.operations).toEqual([]);

      // Turns 2b/2c: Two more clarification follow-ups. All accumulated messages are preserved in order.
      const planTurn2b = await manager.extractPlan("\u307e\u3060決\u3081\u3066\u3044\u306a\u3044", state);
      expect(planTurn2b.nonToolReason).toBe("clarify");
      const planTurn2c = await manager.extractPlan("\u3084\u3063\u3071\u308a少\u3057\u3060\u3051", state);
      expect(planTurn2c.nonToolReason).toBe("clarify");

      // Turn 2d: Stage 1 output cannot be parsed while the user is answering the held request. The synthetic
      // fallback `question` route must NOT be treated as an intent switch, so the pending entry is retained (4368219493).
      turn1RawOutput = "not a json response";
      const planTurn2dRouterFailure = await manager.extractPlan("勤務下限\u306f", state);
      expect(planTurn2dRouterFailure.operations).toEqual([]);
      turn1RawOutput = null;

      // Turn 4: User answers "min work days is 15" after repeated clarification rounds and a failed routing attempt
      // All accumulated clarification messages from Turn 1 onward must be retained in the pending entry!
      turn1Reply = {
        thought:
          "前回\u306e未適用\u30ea\u30af\u30a8\u30b9\u30c8（田中\u3055\u3093\u306e9日〜15日\u306e公休）\u3068今回\u306e回答（月間最低勤務日数\u309215日）\u3092統合\u3057\u3066実行\u3059\u308b。",
        routes: [
          {
            tool_type: "staff_calendar",
            instruction: "田中\u3055\u3093\u30929日\u304b\u308915日\u307e\u3067公休(O)\u306b\u3059\u308b",
          },
          {
            tool_type: "staff_contract",
            instruction: "田中\u3055\u3093\u306e月間最低勤務日数\u309215日\u306b設定\u3059\u308b",
          },
        ],
        response: "田中\u3055\u3093\u306e9日\u304b\u308915日\u307e\u3067\u3092公休\u306b\u3057、月間最低勤務日数\u309215日\u306b設定\u3057\u307e\u3059。",
      };
      turn2RepliesBySchema = new Map([
        [
          STAFF_CALENDAR_TOOLS_SCHEMA,
          {
            tools: [
              {
                tool_name: "add_request_range",
                args: {
                  nurseNameOrId: "田中",
                  startDay: 9,
                  endDay: 15,
                  shift: "O",
                  isHard: true,
                },
              },
            ],
          },
        ],
        [
          STAFF_CONTRACT_TOOLS_SCHEMA,
          {
            tools: [
              {
                tool_name: "set_nurse_contract",
                args: {
                  nurseNameOrId: "田中",
                  item: "minWorkDays",
                  value: 15,
                },
              },
            ],
          },
        ],
      ]);

      const planTurn4 = await manager.extractPlan("勤務下限\u306f15日", state);
      const turn4RouterPrompt = capturedTurn1Prompts[capturedTurn1Prompts.length - 1]!;
      expect(turn4RouterPrompt).toContain(
        "\u30fb前回(未適用\u30fb回答待\u3061):「田中\u3055\u3093\u306f、9日\u304b\u308915日\u307e\u3067休\u307e\u305b\u3066\u3042\u3052\u3066。勤務下限\u3082調整\u3057\u3066。 / 勤務下限\u306f少\u3057減\u3089\u3057\u3066 / \u307e\u3060決\u3081\u3066\u3044\u306a\u3044 / \u3084\u3063\u3071\u308a少\u3057\u3060\u3051」"
      );
      expect(planTurn4.intentType).toBe("modify_and_solve");
      // 1 ranged add_request operation (days 9..15) + 1 set_nurse_contract operation = 2 operations
      expect(planTurn4.operations.length).toBe(2);
      const appliedTurn4 = applyChatOperationsToState(state, planTurn4.operations);
      const tanaka = appliedTurn4.updatedState.nurses.find((n) => n.id === "N04")!;
      expect(tanaka.minMonthlyWorkDays).toBe(15);
      for (let d = 9; d <= 15; d++) {
        expect(
          appliedTurn4.updatedState.customRules.some(
            (r) => r.kind === "pin_shift" && r.nurseId === "N04" && r.day === d && r.shift === "O"
          )
        ).toBe(true);
      }

      // Turn 5: Stage 1 asks for clarification on a new request, recording a new pending clarification.
      turn1Reply = {
        thought: "佐藤\u3055\u3093\u306e10日公休\u306f具体的\u3060\u304c、夜勤上限\u306e調整回数\u304c不明\u306a\u305f\u3081聞\u304d返\u3059。",
        routes: [{ tool_type: "clarify" }],
        response: "佐藤\u3055\u3093\u306e10日\u306e公休\u3068\u3042\u308f\u305b\u3066設定\u3059\u308b\u305f\u3081、月間夜勤上限\u3092何回\u306b\u3059\u308b\u304b教\u3048\u3066\u3044\u305f\u3060\u3051\u307e\u3059\u304b？",
      };
      const planTurn5Clarify = await manager.extractPlan(
        "佐藤\u3055\u3093\u309210日休\u307f\u306b\u3057\u3066、夜勤上限\u3082調整\u3057\u3066",
        appliedTurn4.updatedState
      );
      expect(planTurn5Clarify.intentType).toBe("consult_only");
      expect(planTurn5Clarify.nonToolReason).toBe("clarify");
      expect(planTurn5Clarify.operations).toEqual([]);

      // Turn 5b: When accumulated clarification messages exceed Gemini Nano's remaining context budget,
      // older messages are dropped first (FIFO) so the newest follow-up stays within budget.
      const oversizedFollowUp = `補足${"\u3042".repeat(7000)}`;
      const planTurn5bOversized = await manager.extractPlan(
        oversizedFollowUp,
        appliedTurn4.updatedState
      );
      expect(planTurn5bOversized.nonToolReason).toBe("clarify");

      // Turn 6: User abandons the pending clarification by switching intent (asking a question, 4367105728).
      // Verify that Turn 6's Stage 1 prompt dropped the older Turn 5 message when budget was exceeded,
      // and that switching intent clears `pendingClarification` so Turn 7 does NOT resurrect it!
      turn1Reply = {
        thought: "現在\u306e設定\u306b関\u3059\u308b質問。",
        routes: [{ tool_type: "question" }],
        response: "現在\u306e月間夜勤上限\u306f8回\u3067\u3059。",
      };
      const planTurn6Question = await manager.extractPlan(
        "現在\u306e夜勤上限\u306f\u3044\u304f\u3064？",
        appliedTurn4.updatedState
      );
      const turn6RouterPrompt = capturedTurn1Prompts[capturedTurn1Prompts.length - 1]!;
      expect(turn6RouterPrompt).not.toContain("佐藤\u3055\u3093\u309210日休\u307f\u306b\u3057\u3066、夜勤上限\u3082調整\u3057\u3066");
      expect(turn6RouterPrompt).toContain("補足\u3042\u3042\u3042");
      expect(planTurn6Question.intentType).toBe("consult_only");
      expect(planTurn6Question.nonToolReason).toBe("question");

      // Turn 7: Subsequent turn prompt must NOT contain pending previous turn marker
      turn1Reply = {
        thought: "\u30b7\u30d5\u30c8再計算\u306e\u307f\u3092実行\u3059\u308b。",
        routes: [{ tool_type: "system_action", instruction: "\u30b7\u30d5\u30c8\u3092再計算\u3059\u308b" }],
        response: "\u30b7\u30d5\u30c8\u3092再計算\u3057\u307e\u3059。",
      };
      turn2RepliesBySchema = new Map([
        [SYSTEM_ACTION_TOOLS_SCHEMA, { tools: [{ tool_name: "solve_only", args: {} }] }],
      ]);
      const planTurn7SolveOnly = await manager.extractPlan(
        "\u30b7\u30d5\u30c8\u3092再計算\u3057\u3066",
        appliedTurn4.updatedState
      );
      expect(capturedTurn1Prompts[capturedTurn1Prompts.length - 1]).not.toContain(
        "前回(未適用\u30fb回答待\u3061)"
      );
      expect(planTurn7SolveOnly.intentType).toBe("solve_only");

      manager.destroy();
    } finally {
      g.LanguageModel = origLM;
    }
  });

  it("distinguishes headcount units ('名','人') from frequency quota ('回') in custom shift prompts and operations", () => {
    // 1. Verify router prompt explicitly guides disambiguation of daily headcount from monthly quota
    expect(STAGE1_ROUTER_SYSTEM_PROMPT).toContain("1日\u3042\u305f\u308a\u306e配置人数（名\u30fb人）");
    expect(STAGE1_ROUTER_SYSTEM_PROMPT).toContain("個人別\u306e月間回数（回）");
    expect(STAGE1_ROUTER_SYSTEM_PROMPT).toContain("\u30ea\u30fc\u30c0\u30fc業務可\u306f1日最大1名\u307e\u3067\u306b制限\u3059\u308b");
    // Ensure test scenario terms ('Shift A') are NOT hardcoded in few-shot examples
    expect(STAGE1_ROUTER_SYSTEM_PROMPT).not.toContain("\u30b7\u30d5\u30c8A");
    expect(STAGE1_ROUTER_SYSTEM_PROMPT).not.toContain("\u30b7\u30d5\u30c8 A");

    // 2. Verify stage 2 custom shift prompt strictly assigns headcount units ('名','人') to add_daily_shift_cap
    expect(CUSTOM_SHIFT_STAGE2_PROMPT).toContain("助数詞（名\u30fb人 vs 回）\u306b\u3088\u308b配置人数\u3068月間\u30ce\u30eb\u30de\u306e厳密\u306a区別");
    expect(CUSTOM_SHIFT_STAGE2_PROMPT).toContain("add_daily_shift_cap");
    expect(CUSTOM_SHIFT_STAGE2_PROMPT).toContain("add_shift_quota");
    expect(CUSTOM_SHIFT_STAGE2_PROMPT).not.toContain("\u30b7\u30d5\u30c8A");
    expect(CUSTOM_SHIFT_STAGE2_PROMPT).not.toContain("\u30b7\u30d5\u30c8 A");

    // 3. Verify tool call conversion: 'max 2 newcomers' (boundType: 'max', staffCount: 2, attribute: 'newcomer')
    // correctly creates a daily_shift_cap rule with maxStaff=2 rather than a monthly shift_count_quota
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11, seed: 202611 });
    const withCustomShift = applyChatOperationsToState(baseState, [
      { op: "add_custom_shift", shiftName: "\u30b7\u30d5\u30c8A", shift: "CS1", shortLabel: "\u30b7", baseShift: "D" },
    ]).updatedState;

    const opCap = convertStage2ToolToOperation(
      {
        tool_name: "add_daily_shift_cap",
        args: {
          shiftName: "\u30b7\u30d5\u30c8A",
          attribute: "newcomer",
          boundType: "max",
          staffCount: 2,
        },
      },
      withCustomShift
    );
    expect(opCap).not.toBeNull();
    expect(opCap?.op).toBe("add_daily_shift_cap");
    if (opCap?.op === "add_daily_shift_cap") {
      expect(opCap.maxStaff).toBe(2);
      expect(opCap.minStaff).toBeUndefined();
      expect(opCap.attribute).toBe("newcomer");
    }

    const appliedState = applyChatOperationsToState(withCustomShift, [opCap!]).updatedState;
    const rule = appliedState.customRules.find(
      (r) => r.kind === "daily_shift_cap" && r.shift === "CS1" && r.attribute === "newcomer"
    );
    expect(rule).toBeDefined();
    expect(rule?.maxStaff).toBe(2);
    expect(rule?.minStaff).toBeUndefined();
    // Invariant: it must NEVER create a shift_count_quota rule
    expect(appliedState.customRules.some((r) => r.kind === "shift_count_quota")).toBe(false);
  });

  it("evaluates day-type staffing rules consistently between model building and schedule evaluation", () => {
    const state = generateNurseSchedulingState({ staffCount: 10, year: 2026, month: 11 }); // Nov 1: Sun, Nov 2: Mon, Nov 3: Holiday (Culture Day)
    const weekdayRule = {
      id: "rule_weekday_staffing",
      kind: "staffing_rule" as const,
      enabled: true,
      description: "平日日勤\u306f\u30ea\u30fc\u30c0\u30fc2名以上",
      shifts: ["D" as const],
      attribute: "leader",
      dayType: "weekday" as const,
      minCount: 2,
    };

    // Nov 1 is Sunday (dow=0) -> weekdayRule not applicable
    expect(isStaffingRuleApplicableOnDay(weekdayRule, 1, state.config)).toBe(false);
    // Nov 2 is Monday (dow=1) -> weekdayRule applicable
    expect(isStaffingRuleApplicableOnDay(weekdayRule, 2, state.config)).toBe(true);
    // Nov 3 is Culture Day (Holiday) -> weekdayRule not applicable
    expect(isStaffingRuleApplicableOnDay(weekdayRule, 3, state.config)).toBe(false);

    // Empty schedule (all OFF)
    const emptySchedule: Record<string, any[]> = {};
    for (const n of state.nurses) {
      emptySchedule[n.id] = new Array(state.config.numDays).fill("O");
    }

    const stateWithRule = {
      ...state,
      customRules: [weekdayRule],
    };

    const evalResult = evaluateNurseSchedule(stateWithRule, emptySchedule);
    // On Day 1 (Sunday) and Day 3 (Holiday), weekdayRule must NOT fire a violation
    const sundayViolations = evalResult.violations.filter((v) => v.day === 1 && v.id.includes("rule_weekday_staffing"));
    const holidayViolations = evalResult.violations.filter((v) => v.day === 3 && v.id.includes("rule_weekday_staffing"));
    const mondayViolations = evalResult.violations.filter((v) => v.day === 2 && v.id.includes("rule_weekday_staffing"));

    expect(sundayViolations.length).toBe(0);
    expect(holidayViolations.length).toBe(0);
    expect(mondayViolations.length).toBe(1);

    // Soft all-staff rule must not produce hard coverage violations
    const softAllStaffRule = {
      id: "rule_soft_all_staff",
      kind: "staffing_rule" as const,
      enabled: true,
      description: "日勤\u306f全員\u306710名（努力目標）",
      shifts: ["D" as const],
      attribute: "all",
      isHard: false,
      minCount: 10,
    };
    const stateWithSoftAllStaff = {
      ...state,
      customRules: [softAllStaffRule],
    };
    const softEval = evaluateNurseSchedule(stateWithSoftAllStaff, emptySchedule);
    const hardCovViolations = softEval.violations.filter(
      (v) => v.category === "coverage" && v.id.startsWith("cov_D_")
    );
    expect(hardCovViolations.length).toBe(0);
  });

  it("includes day-type active dates in conflict diagnosis for mid-week starting months", async () => {
    // June 2026 starts on Monday (June 1, 2, 3 are all Mon, Tue, Wed; first weekend is June 6-7)
    const juneState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 6 });
    const impossibleWeekendRule = {
      id: "rule_impossible_weekend",
      kind: "staffing_rule" as const,
      enabled: true,
      description: "土日深夜勤\u306f\u30ea\u30fc\u30c0\u30fc15名以上必要（不可能\u306a人数）",
      shifts: ["N" as const],
      attribute: "leader",
      dayType: "weekend" as const,
      minCount: 15,
      isHard: true,
    };
    const stateWithRule = {
      ...juneState,
      customRules: [impossibleWeekendRule],
    };
    const diag = await diagnoseNurseScheduleWithHiGHS(stateWithRule);
    expect(diag.status).toBe("Unsat");
    expect(diag.conflicts.some((c) => c.name.includes("rule_impossible_weekend"))).toBe(true);
  });

  it("honors enforceSkillCoverage toggle and preserves hard date_coverage beside staffing rules", () => {
    const state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });
    const staffingRule = {
      id: "rule_staffing_d_12",
      kind: "staffing_rule" as const,
      enabled: true,
      description: "平日日勤\u306f全員\u306712名",
      shifts: ["D" as const],
      attribute: "all",
      dayType: "weekday" as const,
      minCount: 12,
      isHard: true,
    };
    const dateCoverageRule = {
      id: "rule_date_cov_15",
      kind: "date_coverage" as const,
      enabled: true,
      description: "11月2日日勤\u306f18名必要",
      shift: "D" as const,
      day: 2,
      minStaff: 18,
      isHard: true,
    };

    const stateWithRules = {
      ...state,
      customRules: [staffingRule, dateCoverageRule],
    };

    // When enforceSkillCoverage is true, staffing rule applies to Day 2 (Monday)
    const reqWithStaffing = getRequiredDailyCoverage({ ...stateWithRules, customRules: [staffingRule] }, 2);
    expect(reqWithStaffing.D).toBe(12);

    // When enforceSkillCoverage is false, staffing rule is ignored
    const reqWithoutStaffing = getRequiredDailyCoverage({
      ...stateWithRules,
      config: { ...state.config, enforceSkillCoverage: false },
      customRules: [staffingRule],
    }, 2);
    expect(reqWithoutStaffing.D).toBe(state.config.weekdayDayStaff);

    // When date_coverage is present on Day 2, it overrides both base and staffing rule to 18
    const reqWithDateCov = getRequiredDailyCoverage(stateWithRules, 2);
    expect(reqWithDateCov.D).toBe(18);

    // Model building must retain the cov_D_d2 constraint with requirement 18
    const washiModel = buildNurseWashiModel(stateWithRules, { solver: "highs" });
    const covMeta = washiModel.constraintMeta.get("cov_D_d2");
    expect(covMeta).toBeDefined();
    expect(covMeta?.labelJa).toContain("18名");
  });

  it("supports custom shifts, day selections (allowedDaysOfWeek / includeHolidays), and multi-attribute OR in staffing rules", () => {
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11, seed: 42 });

    // 1. doesNurseMatchAttribute with comma-separated OR tokens
    const leaderNurse = baseState.nurses.find((n) => n.skills.includes("leader_cap"))!;
    const icuNurse = baseState.nurses.find((n) => n.skills.includes("icu_er") && !n.skills.includes("leader_cap"))!;
    const plainNurse = baseState.nurses.find((n) => !n.skills.includes("leader_cap") && !n.skills.includes("icu_er"))!;

    expect(doesNurseMatchAttribute(leaderNurse, "leader_cap,icu_er")).toBe(true);
    expect(doesNurseMatchAttribute(icuNurse, "leader_cap,icu_er")).toBe(true);
    expect(doesNurseMatchAttribute(plainNurse, "leader_cap,icu_er")).toBe(false);

    // 2. isStaffingRuleApplicableOnDay with allowedDaysOfWeek and includeHolidays
    // Nov 2, 2026 is Monday (regular)
    // Nov 3, 2026 is Tuesday (Culture Day - Holiday)
    // Nov 4, 2026 is Wednesday (regular)
    // Nov 23, 2026 is Monday (Labor Thanksgiving Day - Holiday)
    const ruleMwfNoHol: CustomConstraintRule = {
      id: "mwf_no_hol",
      kind: "staffing_rule",
      enabled: true,
      description: "月水金 (祝日除\u304f)",
      shifts: ["D"],
      attribute: "all",
      dayType: "custom",
      allowedDaysOfWeek: [1, 3, 5],
      includeHolidays: false,
      minCount: 2,
    };
    expect(isStaffingRuleApplicableOnDay(ruleMwfNoHol, 2, baseState.config)).toBe(true); // Nov 2 (Mon)
    expect(isStaffingRuleApplicableOnDay(ruleMwfNoHol, 3, baseState.config)).toBe(false); // Nov 3 (Tue Holiday)
    expect(isStaffingRuleApplicableOnDay(ruleMwfNoHol, 4, baseState.config)).toBe(true); // Nov 4 (Wed)
    expect(isStaffingRuleApplicableOnDay(ruleMwfNoHol, 23, baseState.config)).toBe(false); // Nov 23 (Mon Holiday excluded)

    const ruleMwfWithHol: CustomConstraintRule = {
      ...ruleMwfNoHol,
      id: "mwf_with_hol",
      includeHolidays: true,
    };
    expect(isStaffingRuleApplicableOnDay(ruleMwfWithHol, 2, baseState.config)).toBe(true); // Nov 2 (Mon)
    expect(isStaffingRuleApplicableOnDay(ruleMwfWithHol, 3, baseState.config)).toBe(true); // Nov 3 (Tue Holiday included)
    expect(isStaffingRuleApplicableOnDay(ruleMwfWithHol, 23, baseState.config)).toBe(true); // Nov 23 (Mon Holiday included)

    // 3. Staffing rule on Custom Shift and on 'O' (公休) with multi-attribute
    const stateWithCustom: NurseSchedulingState = {
      ...baseState,
      customShiftDefs: [
        {
          code: "T",
          shortLabel: "研",
          label: "研修",
          baseShift: "D",
          timeBand: "day",
          includedInAliases: ["W"],
        },
      ],
      customRules: [
        {
          id: "rule_t_leader_icu",
          kind: "staffing_rule",
          enabled: true,
          description: "研修T\u306f月水金\u306b\u30ea\u30fc\u30c0\u30fc\u307e\u305f\u306f救急\u304c1名以上",
          shifts: ["T"],
          attribute: "leader_cap,icu_er",
          dayType: "custom",
          allowedDaysOfWeek: [1, 3, 5],
          minCount: 1,
          isHard: true,
        },
        {
          id: "rule_off_weekend",
          kind: "staffing_rule",
          enabled: true,
          description: "公休O\u306f土日\u306b全員\u30675名以上",
          shifts: ["O"],
          attribute: "all",
          dayType: "weekend",
          minCount: 5,
          isHard: true,
        },
      ],
    };

    const built = buildNurseWashiModel(stateWithCustom, { solver: "highs" });
    const tConstraint = built.constraintMeta.get("staffing_min_rule_t_leader_icu_T_d2");
    expect(tConstraint).toBeDefined();
    expect(tConstraint?.labelJa).toContain("研修 (研) >= 1名");

    const offConstraint = built.constraintMeta.get("staffing_min_rule_off_weekend_O_d1");
    // Nov 1, 2026 is Sunday (weekend)
    expect(offConstraint).toBeDefined();
    expect(offConstraint?.labelJa).toContain("公休(O) >= 5名");
  });
});
