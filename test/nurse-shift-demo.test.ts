import { describe, it, expect } from "vitest";
import {
  generateNurseSchedulingState,
  getDayOfWeek,
  injectConflictScenario,
} from "../examples/web-demo/apps/ai-shift/generator.js";
import {
  buildNurseWashiModel,
  evaluateNurseSchedule,
  solveNurseScheduleWithWashi,
  diagnoseNurseScheduleWithHiGHS,
} from "../examples/web-demo/apps/ai-shift/solver.js";
import {
  clearNurseContractFromState,
  createDefaultShiftAliases,
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
  CUSTOM_SHIFT_TOOLS_SCHEMA,
  SKILL_AND_PAIR_TOOLS_SCHEMA,
  STAFF_CALENDAR_TOOLS_SCHEMA,
  STAFF_CONTRACT_TOOLS_SCHEMA,
  WARD_COVERAGE_AND_PARAM_TOOLS_SCHEMA,
  WARD_TRANSITION_AND_RULE_TOOLS_SCHEMA,
  SYSTEM_ACTION_TOOLS_SCHEMA,
  buildCategoryDynamicDictionary,
  verifyExecutionAgainstRequest,
} from "../examples/web-demo/apps/ai-shift/nano-client.js";

describe("1-Month 3-Shift Nurse Scheduling Demo (30 Nurses, Carryover, HiGHS + Z3)", () => {
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

  it("diagnoses carryover conflict with Z3 unsatCore when Day 1 is pinned to D after prev month N", async () => {
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });
    const { updatedState } = injectConflictScenario(baseState, "carryover_clash");

    const t0 = performance.now();
    const res = await solveNurseScheduleWithWashi(updatedState);
    const elapsed = performance.now() - t0;

    console.log(
      `[Carryover Conflict Z3] status=${res.status}, conflicts=${res.rawConflictNames.join(", ")}, total=${Math.round(elapsed)}ms`
    );

    expect(res.status).toBe("Infeasible");
    expect(res.conflicts.length).toBeGreaterThan(0);
    expect(res.rawConflictNames.some((c) => c.includes("carryover_N_to_D_N01_d1"))).toBe(true);
  }, 30_000);

  it("diagnoses leader shortage conflict with Z3 unsatCore", async () => {
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });
    const { updatedState } = injectConflictScenario(baseState, "leader_shortage");

    const t0 = performance.now();
    const res = await solveNurseScheduleWithWashi(updatedState);
    const elapsed = performance.now() - t0;

    console.log(
      `[Leader Shortage Conflict Z3] status=${res.status}, conflicts=${res.rawConflictNames.join(", ")}, total=${Math.round(elapsed)}ms`
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
      `[Monthly Night Cap=5 Z3] status=${resNight.status}, conflicts=${resNight.rawConflictNames.slice(0, 6).join(", ")}, time=${nightMs}ms`
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
                summaryJa: "テスト",
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

  it("handles multi-turn training prerequisite ('2回受けないと夜勤ができない') and weekday restriction ('研修は平日のみ')", async () => {
    let state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });

    // Turn 1: "新人研修シフトを追加して"
    state = applyChatOperationsToState(state, [
      convertStage2ToolToOperation(
        { tool_name: "add_custom_shift", args: { shiftName: "新人研修", shortLabel: "研" } },
        state
      )!,
    ]).updatedState;
    const tDef = state.customShiftDefs.find((d) => d.label === "新人研修");
    expect(tDef).toBeDefined();
    const tCode = tDef!.code;

    // Turn 2: "新人は新人研修を2回受けないと夜勤ができない"
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

    // Turn 3: "研修は平日のみ"
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

  it("handles previous-month training credit, splitting newcomers into 新人1 and 新人2, and daily shift cap ('1日に2名まで')", async () => {
    let state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });

    // Turn 1: "新人研修シフトを追加して。新人は、この研修を必ず2回受けないと、夜勤や準夜勤にはいれない。"
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

    // Turn 2: "新人研修は、前の月でもよい、というふうにできる？"
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

    // Turn 4: "新人研修は、1日に2名までしか受けられない。"
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
        yield "完了しました。";
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
        response: "新人研修シフト(研)を追加し、2回受講するまで夜勤に入れないルールを設定します。",
        routes: [
          {
            tool_type: "custom_shift",
            instruction:
              "新人研修シフトを追加して。新人は、この研修を必ず2回受けないと、夜勤や準夜勤にはいれない。",
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
        "新人研修シフトを追加して。新人は、この研修を必ず2回受けないと、夜勤や準夜勤にはいれない。",
        state
      );
      expect(plan1.intentType).toBe("modify_and_solve");
      expect(plan1.stage1Response).toContain("新人研修シフト");
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
        response: "前月までの新人研修の受講実績も含めるように設定します。",
        routes: [
          {
            tool_type: "custom_shift",
            instruction: "新人研修は、前の月までの受講分も含めてよいことにして。",
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
        "新人研修は、前の月までの受講分も含めてよいことにして。",
        state
      );
      expect(plan2.intentType).toBe("modify_and_solve");
      expect(promptCalls.length).toBe(2);
      expect(promptCalls[0]!.schema).toBe(STAGE1_ROUTER_SCHEMA);
      expect(promptCalls[1]!.schema).toBe(CUSTOM_SHIFT_TOOLS_SCHEMA);
      state = applyChatOperationsToState(state, plan2.operations).updatedState;

      // Step 3: Weekday restriction + Daily cap ("1日に2名まで") via Turn 1 (routes: [{ tool_type: "custom_shift" }]) -> Turn 2 (CUSTOM_SHIFT_TOOLS_SCHEMA)
      promptCalls.length = 0;
      currentTurn1Reply = {
        response: "新人研修を平日のみ・1日2名までに制限します。",
        routes: [
          {
            tool_type: "custom_shift",
            instruction: "新人研修は平日のみで、1日に2名までしか受けられない。",
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
        "新人研修は平日のみで、1日に2名までしか受けられない。",
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

      // Step 4b: Night shift leveling by skill/role ("スキル毎に、夜勤の数を平準化したい" -> ward_coverage_and_param -> level_night_shifts)
      promptCalls.length = 0;
      currentTurn1Reply = {
        response: "スキルごとに夜勤の数を平準化するルールを設定します。",
        routes: [
          {
            tool_type: "ward_coverage_and_param",
            instruction: "スキル毎に、夜勤の数を平準化したい",
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
      const planLevel = await manager.extractPlan("スキル毎に、夜勤の数を平準化したい", state);
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
        thought: "佐藤さんの12日休み固定はstaff_calendar、最大連勤4日への変更はward_coverage_and_paramに分解する。",
        response: "佐藤さんの12日を公休に固定し、最大連勤日数を4日に変更します。",
        routes: [
          {
            tool_type: "staff_calendar",
            instruction: "佐藤 美咲さんの12日を確定の休み(O)にして",
          },
          {
            tool_type: "ward_coverage_and_param",
            instruction: "最大連勤を4日に変更して",
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
        "佐藤 美咲さんの12日を確定の休み(O)にして、最大連勤を4日に変更して",
        state,
        undefined,
        (ev) => progressPhases.push(ev.phase)
      );
      currentTurn2ReplyBySchema.clear();
      expect(planMultiCat.intentType).toBe("modify_and_solve");
      expect(planMultiCat.stage1Thought).toBe(
        "佐藤さんの12日休み固定はstaff_calendar、最大連勤4日への変更はward_coverage_and_paramに分解する。"
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
      expect(promptCalls[1]!.promptText).toContain("佐藤 美咲さんの12日を確定の休み(O)にして");
      expect(promptCalls[1]!.promptText).not.toContain("最大連勤を4日に変更して");
      expect(promptCalls[2]!.schema).toBe(WARD_COVERAGE_AND_PARAM_TOOLS_SCHEMA);
      expect(promptCalls[2]!.promptText).toContain("最大連勤を4日に変更して");
      expect(promptCalls[2]!.promptText).not.toContain("佐藤 美咲さんの12日を確定の休み(O)にして");
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
        response: "現在のルール設定や対応機能をご説明します。",
        routes: [{ tool_type: "question" }],
      };
      const plan4 = await manager.extractPlan("なにができる？", state);
      expect(plan4.intentType).toBe("consult_only");
      expect(plan4.nonToolReason).toBe("question");
      expect(plan4.operations).toEqual([]);
      expect(promptCalls.length).toBe(1);

      let consultReply = "";
      for await (const chunk of manager.streamConsultationReply("なにができる？", [], state, null)) {
        consultReply += chunk;
      }
      const consultTrace = manager.getLastConsultTrace();
      expect(consultTrace).toBeDefined();
      expect(consultTrace!.userPrompt).toContain("このAIアシスタントでできること");
      expect(consultTrace!.userPrompt).toContain("スキル・資格の追加・削除・リーダー代行設定");
      expect(consultTrace!.userPrompt).not.toContain("WaSHI (HiGHS) 最適化・検証結果");
      expect(consultTrace!.userPrompt).not.toContain("求解時間:");
      expect(consultTrace!.systemPrompt).not.toContain("変更オペレーションは実行されませんでした");

      // Step 5b: Unsupported request ("unsupported") skips Turn 2 and instructs Turn 3 to explain out-of-scope + suggest alternatives
      promptCalls.length = 0;
      currentTurn1Reply = {
        response: "給与や手当額の計算・変更には対応していません。",
        routes: [{ tool_type: "unsupported" }],
      };
      const planUnsupported = await manager.extractPlan("夜勤手当を1回5000円に増やして", state);
      expect(planUnsupported.intentType).toBe("consult_only");
      expect(planUnsupported.nonToolReason).toBe("unsupported");
      expect(planUnsupported.operations).toEqual([]);
      expect(promptCalls.length).toBe(1);

      for await (const _ of manager.streamConsultationReply("夜勤手当を1回5000円に増やして", [], state, null)) {
        // consume stream
      }
      const unsupportedTrace = manager.getLastConsultTrace();
      expect(unsupportedTrace!.userPrompt).toContain("【システム未対応の要求に対する回答指示】");
      expect(unsupportedTrace!.userPrompt).toContain("給与や手当額の計算・変更には対応していません。");

      // Step 5c: Ambiguous request ("clarify") skips Turn 2 and instructs Turn 3 to ask for missing specifics
      promptCalls.length = 0;
      currentTurn1Reply = {
        response: "どなたの・何月何日（または何日〜何日）を公休にするか教えていただけますか？",
        routes: [{ tool_type: "clarify" }],
      };
      const planClarify = await manager.extractPlan("来週休ませて", state);
      expect(planClarify.intentType).toBe("consult_only");
      expect(planClarify.nonToolReason).toBe("clarify");
      expect(planClarify.operations).toEqual([]);
      expect(promptCalls.length).toBe(1);

      for await (const _ of manager.streamConsultationReply("来週休ませて", [], state, null)) {
        // consume stream
      }
      const clarifyTrace = manager.getLastConsultTrace();
      expect(clarifyTrace!.userPrompt).toContain("【情報不足・確認が必要な指示に対する回答指示】");
      expect(clarifyTrace!.userPrompt).not.toContain("このAIアシスタントでできること");

      // Step 6: Skill addition ("スキルを追加したい。副リーダー。リーダーの代わりになれる。")
      // Routes to "skill_and_pair" -> add_skill_def, adds sub_leader with substitutesFor="leader_cap",
      // and does NOT create a custom shift CS1 or secretly modify nurse profiles without update_nurse_skill
      promptCalls.length = 0;
      currentTurn1Reply = {
        response: "リーダーの代わりになれる「副リーダー」スキルを追加します。",
        routes: [
          {
            tool_type: "skill_and_pair",
            instruction: "スキルを追加したい。副リーダー。リーダーの代わりになれる。",
          },
        ],
      };
      currentTurn2Reply = {
        tools: [
          {
            tool_name: "add_skill_def",
            args: { skillName: "副リーダー", substitutesFor: "リーダー" },
          },
        ],
      };
      const planSkillAdd = await manager.extractPlan(
        "スキルを追加したい。副リーダー。リーダーの代わりになれる。",
        state
      );
      expect(planSkillAdd.intentType).toBe("modify_and_solve");
      expect(promptCalls[1]!.schema).toBe(SKILL_AND_PAIR_TOOLS_SCHEMA);
      expect(planSkillAdd.operations).toEqual([
        {
          op: "add_skill_def",
          skillName: "副リーダー",
          substitutesFor: "leader_cap",
          skillMinDay: undefined,
          skillMinEvening: undefined,
          skillMinNight: undefined,
        },
      ]);
      state = applyChatOperationsToState(state, planSkillAdd.operations).updatedState;
      expect(state.customShiftDefs.some((d) => d.label === "副リーダー")).toBe(false);
      const subLeaderDef = state.skillDefs?.find(
        (s) => s.label === "副リーダー" && s.substitutesFor === "leader_cap"
      );
      expect(subLeaderDef).toBeDefined();
      const subLeaderCode = subLeaderDef!.code;
      // Defining a skill does not secretly auto-assign it until update_nurse_skill is called
      expect(state.nurses.some((n) => n.skills.includes(subLeaderCode))).toBe(false);

      // Explicitly assign sub_leader to mid-career nurses via update_nurse_skill
      state = applyChatOperationsToState(state, [
        convertStage2ToolToOperation(
          { tool_name: "update_nurse_skill", args: { target: "中堅", skillName: "副リーダー", action: "add" } },
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

    // 1. Add substitute skill "副リーダー", remove "人工呼吸器", require N->O transition + team_A/team_B staffing rules, and set N05 to day-only
    state = applyChatOperationsToState(state, [
      { op: "add_skill_def", skillName: "副リーダー", substitutesFor: "leader_cap" },
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
      state.skillDefs?.some((s) => s.label === "副リーダー" && s.substitutesFor === "leader_cap")
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
            if (input.includes("ユーザーの発話:")) {
              return JSON.stringify({
                response: "小林さんの11月1日から11月17日までのシフトを公休(O)に固定します。",
                routes: [
                  {
                    tool_type: "staff_calendar",
                    instruction: "小林さんが怪我をして11/17まで動けないらしい。",
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
        "小林さんが怪我をして11/17まで動けないらしい。",
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
        { tool_name: "add_skill_def", args: { skillName: "認知症ケア", minDay: 1 } },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "update_nurse_skill",
          args: { target: "中堅", skillName: "認知症ケア", action: "add" },
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
    // - 日勤(D) に 救急・ICU スキル が 2人以上
    // - 日勤(D) に 新人 (newcomer) は 2人以下
    // - 日勤(D) に A班 (team_A) が 3人以上
    // - 準夜勤(E) に B班 (team_B) が 1人以上
    const ops = [
      convertStage2ToolToOperation(
        {
          tool_name: "set_staffing_rule",
          args: { targetShift: "D", attribute: "救急・ICU", minCount: 2 },
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

  it("handles date-bounded custom shift with daily newcomer staffing ('祭りは11月16日から3日間、毎日新人2名をアサイン') and multi-turn history", async () => {
    let state = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11 });

    // 1. Single-turn application of:
    // "祭りというシフトを追加してほしい。祭りは11月16日から3日間。その間、毎日新人2名をアサイン。祭りは日勤扱い。"
    const ops = [
      convertStage2ToolToOperation(
        { tool_name: "add_custom_shift", args: { shiftName: "祭り", baseShift: "D" } },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "add_shift_day_restriction",
          args: { shiftName: "祭り", startDay: 16, endDay: 18 },
        },
        state
      )!,
      convertStage2ToolToOperation(
        {
          tool_name: "add_daily_shift_cap",
          args: {
            shiftName: "祭り",
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

    const matsuriDef = state.customShiftDefs.find((d) => d.label === "祭り");
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
    //   - N25: パート契約 (minWorkDays: 0, maxWorkDays: 10, weekdayOnly)
    //   - N15: 夜勤専従 (nightShiftOnly, minWorkDays: 8)
    //   - N16: 深夜勤免除 (forbidLateNight)
    //   - N17: 準夜勤免除 (forbidEvening)
    // ② Individual max consecutive days:
    //   - N18: 3連勤まで (maxConsecutiveDays: 3)
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
    // 3. N28: "土日祝休み" via set_nurse_contract preset
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
            item: "土日祝休み",
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

    // Add a custom alias "DE" (日勤または準夜勤, excluding N and O)
    state = {
      ...state,
      shiftAliases: [
        ...defaultAliases,
        {
          code: "DE",
          label: "日勤・準夜",
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
          reason: "夜勤帯(準夜または深夜)希望",
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
          description: "11/10: N11 を 日勤・準夜(DE) に固定",
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
          label: "日勤・準夜(深夜除外)",
          shifts: ["D", "E"],
          builtIn: false,
        },
      ],
    };

    const dictCalendar = buildCategoryDynamicDictionary(
      "staff_calendar",
      state,
      "N01の12日を新人研修に固定"
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
        thought: "N02の15日公休固定(staff_calendar)と日深夜禁止(ward_transition_and_rule)の2件。",
        routes: [
          { tool_type: "staff_calendar", instruction: "N02の15日を確定の公休(O)に固定する" },
          { tool_type: "ward_transition_and_rule", instruction: "日勤→翌日深夜勤(日深夜)を禁止する" },
        ],
        response: "N02の15日を公休に固定し、日深夜を禁止します。",
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
        "N02の15日を確定の休みにして、日深夜を禁止して",
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
        thought: "N05を日勤専従にする変更。",
        routes: [{ tool_type: "staff_calendar", instruction: "N05を日勤専従にする" }],
        response: "N05を日勤専従に設定します。",
      };
      turn2RepliesBySchema = new Map([
        [
          STAFF_CALENDAR_TOOLS_SCHEMA,
          {
            tools: [{ tool_name: "none", args: {} }],
          },
        ],
      ]);

      const planB = await manager.extractPlan("N05を日勤専従にして", state);
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
          "スキルを追加したい。副リーダー",
          "新人研修シフトを追加して。新人は",
          "怪我をして11/17まで",
          "スキル毎に、夜勤の数を平準化したい",
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
        "ご指定の操作には対応していません。対応可能な機能については一覧をご確認ください。";

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

      // Mode 1: Turn 1 directly classifies out-of-scope request ("夜勤手当を1回1万5000円で計算して給与明細を出して") as unsupported
      turn1Reply = {
        thought: "給与・夜勤手当の計算はシステム未対応のため unsupported とする。",
        routes: [{ tool_type: "unsupported" }],
        response: "夜勤手当や給与の計算には対応していません。",
      };
      turn2RepliesBySchema = new Map();
      consultReplyText =
        "夜勤手当や給与の計算は本システムの対応範囲外のため実行できません。";

      const plan1 = await manager.extractPlan(
        "夜勤手当を1回1万5000円で計算して給与明細を出して",
        state
      );
      expect(plan1.intentType).toBe("consult_only");
      expect(plan1.nonToolReason).toBe("unsupported");
      expect(plan1.operations).toEqual([]);
      expect(plan1.summaryJa).toContain("対応していません");

      let reply1 = "";
      for await (const chunk of manager.streamConsultationReply(
        "夜勤手当を1回1万5000円で計算して給与明細を出して",
        [],
        state,
        null
      )) {
        reply1 += chunk;
      }
      expect(reply1).toContain("対応範囲外のため実行できません");
      const trace1 = manager.getLastConsultTrace();
      expect(trace1?.userPrompt).toContain("【システム未対応の要求に対する回答指示】");
      expect(trace1?.userPrompt).toContain("夜勤手当や給与の計算には対応していません。");

      // Mode 2: Turn 1 optimistically routes an unsupported request ("夜勤の仮眠休憩を90分以上に設定して") to ward_coverage_and_param,
      // but Turn 2 (and sibling ward_transition_and_rule) both reject it with tool_name: "none".
      // Step 3 verification must catch it, override Turn 1's optimistic response, and convey that it is unsupported.
      turn1Reply = {
        thought: "夜勤の仮眠休憩時間を90分にする設定変更。",
        routes: [
          {
            tool_type: "ward_coverage_and_param",
            instruction: "夜勤の仮眠休憩を90分以上に設定する",
          },
        ],
        response: "夜勤の仮眠休憩を90分以上に設定します。",
      };
      turn2RepliesBySchema = new Map([
        [WARD_COVERAGE_AND_PARAM_TOOLS_SCHEMA, { tools: [{ tool_name: "none", args: {} }] }],
        [WARD_TRANSITION_AND_RULE_TOOLS_SCHEMA, { tools: [{ tool_name: "none", args: {} }] }],
      ]);
      consultReplyText =
        "夜勤の仮眠休憩時間の設定には対応していないため、変更できません。";

      const plan2 = await manager.extractPlan("夜勤の仮眠休憩を90分以上に設定して", state);
      expect(plan2.intentType).toBe("consult_only");
      expect(plan2.nonToolReason).toBe("unsupported");
      expect(plan2.operations).toEqual([]);
      expect(plan2.verificationResult?.verified).toBe(false);
      expect(plan2.verificationResult?.missingRoutes.length).toBe(1);
      // Turn 1's false-positive "設定します" must be replaced with an honest refusal
      expect(plan2.summaryJa).toContain("未対応");
      expect(plan2.summaryJa).not.toContain("設定します。");

      let reply2 = "";
      for await (const chunk of manager.streamConsultationReply(
        "夜勤の仮眠休憩を90分以上に設定して",
        [],
        state,
        null
      )) {
        reply2 += chunk;
      }
      expect(reply2).toContain("対応していないため");
      const trace2 = manager.getLastConsultTrace();
      expect(trace2?.userPrompt).toContain("【システム未対応の要求に対する回答指示】");
      expect(trace2?.userPrompt).toContain("未対応です");
      expect(trace2?.userPrompt).not.toContain("夜勤の仮眠休憩を90分以上に設定します。");

      // Mode 3: Request targets a staff member who does not exist in the ward roster ("徳川家康さんの12日を休みにして")
      turn1Reply = {
        thought: "徳川家康さんの12日を公休に固定する。",
        routes: [
          {
            tool_type: "staff_calendar",
            instruction: "徳川家康さんの12日を確定の公休(O)に固定する",
          },
        ],
        response: "徳川家康さんの12日を公休に固定します。",
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
        "指定された「徳川家康」さんは病棟名簿に存在しないため、シフトを設定できません。";

      const plan3 = await manager.extractPlan("徳川家康さんの12日を休みにして", state);
      expect(plan3.intentType).toBe("consult_only");
      expect(plan3.nonToolReason).toBe("unsupported");
      expect(plan3.operations).toEqual([]);
      expect(plan3.verificationResult?.verified).toBe(false);
      expect(plan3.summaryJa).toContain("徳川家康");
      expect(plan3.summaryJa).toContain("病棟名簿に存在しないため");

      let reply3 = "";
      for await (const chunk of manager.streamConsultationReply(
        "徳川家康さんの12日を休みにして",
        [],
        state,
        null
      )) {
        reply3 += chunk;
      }
      expect(reply3).toContain("存在しないため");
      const trace3 = manager.getLastConsultTrace();
      expect(trace3?.userPrompt).toContain("病棟名簿に存在しないため");

      // Mode 4: Composite request with 1 supported operation + 1 unsupported operation
      // ("N01の12日を確定の休みにして、夜勤の仮眠休憩を90分にして")
      turn1Reply = {
        thought: "N01の12日公休固定と、夜勤の仮眠休憩90分設定の複合指示。",
        routes: [
          {
            tool_type: "staff_calendar",
            instruction: "N01の12日を確定の公休(O)に固定する",
          },
          {
            tool_type: "ward_coverage_and_param",
            instruction: "夜勤の仮眠休憩を90分に設定する",
          },
        ],
        response: "N01の12日を公休に固定し、仮眠休憩を設定します。",
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
        "・佐藤 美咲(N01)さんの11/12を公休(O)に固定しました。\n・夜勤の仮眠休憩時間の設定には対応していないため適用していません。";

      const plan4 = await manager.extractPlan(
        "N01の12日を確定の休みにして、夜勤の仮眠休憩を90分にして",
        state
      );
      expect(plan4.intentType).toBe("modify_and_solve");
      expect(plan4.operations.length).toBe(1);
      expect(plan4.verificationResult?.verified).toBe(false);
      expect(plan4.verificationResult?.appliedCount).toBe(1);
      expect(plan4.verificationResult?.missingRoutes).toEqual([
        'ward_coverage_and_param("夜勤の仮眠休憩を90分に設定する")',
      ]);

      const applied4 = applyChatOperationsToState(state, plan4.operations);
      let reply4 = "";
      for await (const chunk of manager.streamConsultationReply(
        "N01の12日を確定の休みにして、夜勤の仮眠休憩を90分にして",
        applied4.appliedLogs,
        applied4.updatedState,
        null
      )) {
        reply4 += chunk;
      }
      expect(reply4).toContain("対応していないため");
      const trace4 = manager.getLastConsultTrace();
      expect(trace4?.userPrompt).toContain("【⚠️ 未対応のため適用できなかった指示】");
      expect(trace4?.userPrompt).toContain("夜勤の仮眠休憩を90分に設定する");

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
            return "・佐藤 美咲(N01)さんの11/12を公休(休)に固定しました。\n・希望休の充足率100%でシフト表を更新しました。";
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
        "佐藤さんの12日を休みにして",
        applied.appliedLogs,
        applied.updatedState,
        nextSolve
      )) {
        // consume stream
      }
      const trace = manager.getLastConsultTrace();
      expect(trace).toBeDefined();
      // Must include nurse-relevant information: applied change, request satisfaction, and schedule diff
      expect(trace!.userPrompt).toContain("11/12: 佐藤 美咲(N01) を「公休(O)」に固定");
      expect(trace!.userPrompt).toContain("希望達成状況:");
      expect(trace!.userPrompt).toContain("前回のシフトからの変更:");
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
          attribute: "救急・ICU",
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
          description: "11/14 N01 なるべく日勤 (重み15)",
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
          description: "11/14 N01 なるべく公休 (重み90)",
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
        attribute: "未登録スキル",
        minCount: 1,
      },
      {
        op: "update_nurse_skill",
        nurseNameOrId: "N01",
        skillName: "未登録スキル",
        skillAction: "add",
      },
      {
        op: "add_shift_quota",
        shiftName: "未登録シフト",
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
      { op: "add_custom_shift", shiftName: "祭り", shortLabel: "祭", baseShift: "D" },
      { op: "add_shift_quota", shiftName: "祭り", attribute: "all", minCount: 2, maxCount: 2 },
      { op: "add_shift_day_restriction", shiftName: "祭り", startDay: 10, endDay: 12 },
    ]).updatedState;
    expect(customShiftState.customRules.some((r) => r.kind === "shift_count_quota")).toBe(true);
    expect(customShiftState.customRules.some((r) => r.kind === "daily_shift_cap")).toBe(false);

    // Invariant 4: add_daily_shift_cap with maxStaff only must NEVER coerce minStaff = maxStaff or delete shift_count_quota
    const capOnlyState = applyChatOperationsToState(customShiftState, [
      { op: "add_daily_shift_cap", shiftName: "祭り", maxStaff: 3 },
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
      { op: "add_custom_shift", shiftName: "オリエンテーション", shortLabel: "オリ", baseShift: "D" },
      { op: "add_shift_prerequisite", shiftName: "オリエンテーション", attribute: "newcomer", prereqMinCount: 2, restrictedShifts: ["E", "N"] },
    ]).updatedState;
    const built = buildNurseWashiModel(prereqState);
    const lp = built.model.toLpString();
    const objSection = lp.split("Subject To")[0] ?? "";
    expect(objSection).not.toMatch(/\+\s*30\s+C_/);
  });

  it("enforces zero-holder skill/staffing minima, validates ICU coverage, resolves aliases in daily_shift_cap, and counts custom O-based shifts as days off", async () => {
    const baseState = generateNurseSchedulingState({ staffCount: 30, year: 2026, month: 11, seed: 42 });

    // 1. Custom skill with minDay > 0 and 0 holders must be Infeasible when hard, and diagnosed in Z3
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
          description: "日勤(D)は1日6〜20名",
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

    // 1. add_skill_def resolves substitutesFor even when formatted with shortLabel parens like "リーダー業務可(リ)"
    const skillSubOp = convertStage2ToolToOperation(
      {
        tool_name: "add_skill_def",
        args: { skillName: "副リーダー", substitutesFor: "リーダー業務可(リ)" },
      },
      baseState
    );
    expect(skillSubOp?.op).toBe("add_skill_def");
    if (skillSubOp?.op === "add_skill_def") {
      expect(skillSubOp.substitutesFor).toBe("leader_cap");
      expect(skillSubOp.skillMinDay).toBeUndefined();
    }

    // 2. add_shift_quota / add_daily_shift_cap / update_nurse_skill accept team_A ("A班") or skills ("救急・重症対応") uniformly
    const quotaTeamOp = convertStage2ToolToOperation(
      {
        tool_name: "add_shift_quota",
        args: { shiftName: "カンファレンス", attribute: "A班", count: 1 },
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
        args: { target: "B班", skillName: "副リーダー", action: "add" },
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
      { op: "add_custom_shift", shiftName: "カンファレンス", baseShift: "D" },
      quotaTeamOp!,
    ]).updatedState;

    const subLeaderSkill = applied.skillDefs?.find((s) => s.label === "副リーダー");
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

    // Solver should enforce quota on A班 (team_A) nurses for カンファレンス
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
          description: "N05 の準夜勤は前月累計込みで最大2回まで",
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
    expect(getJapaneseHolidayName(2026, 9, 22)).toBe("国民の休日");
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
      { op: "add_skill_def", skillName: "透析サブ", substitutesFor: "透析管理" },
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
      afterSkillRemoved.skillDefs!.find((s) => s.label === "透析サブ")?.substitutesFor
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
          description: "11/5 日勤25名目標(ソフト)",
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
          description: "合同研修はなるべく11/10〜12のみ(ソフト)",
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
});
