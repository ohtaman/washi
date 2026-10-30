import fs from "node:fs";
import { describe, it, expect } from "vitest";
import {
  exportNursesCsv,
  exportRelationsCsv,
  exportRequestsCsv,
  getSampleNursesCsv,
  getSampleRelationsCsv,
  getSampleRequestsCsv,
  parseNursesCsv,
  parseRelationsCsv,
  parseRequestsCsv,
  validateNurseDataset,
} from "../examples/web-demo/apps/ai-shift/csv-handler";
import {
  createBlankNurseSchedulingState,
  createDefaultStaffingRules,
  generateNurseSchedulingState,
  MAX_STAFF_COUNT,
  MIN_STAFF_COUNT,
} from "../examples/web-demo/apps/ai-shift/generator";
import {
  getRequiredDailyCoverage,
  solveNurseScheduleWithWashi,
} from "../examples/web-demo/apps/ai-shift/solver";

describe("Nurse Scheduling CSV Handler & Blank Slate Mode", () => {
  it("initializes a valid blank nurse scheduling state and safely handles solve without crashing", async () => {
    const blank = createBlankNurseSchedulingState();
    expect(blank.nurses.length).toBe(0);
    expect(blank.preferences.length).toBe(0);
    expect(blank.relations.length).toBe(0);
    expect(blank.customRules.length).toBe(0);

    const outcome = await solveNurseScheduleWithWashi(blank);
    expect(outcome.status).toBe("Optimal");
    expect(outcome.numVariables).toBe(0);
    expect(outcome.schedule).toEqual({});
    expect(outcome.evaluation?.valid).toBe(true);
    expect(outcome.evaluation?.violations.length).toBe(0);
  });

  it("exports sample nurses, requests, and relations to valid CSV and parses them back losslessly", () => {
    const defaultState = generateNurseSchedulingState({
      staffCount: 15,
      year: 2026,
      month: 11,
      seed: 12345,
    });

    // 1. Nurses CSV
    const nursesCsv = exportNursesCsv(defaultState.nurses);
    expect(nursesCsv).toContain("id,name,kana,skills");
    expect(nursesCsv).toContain("N01");
    const parsedNurses = parseNursesCsv(nursesCsv);
    expect(parsedNurses.errors).toHaveLength(0);
    expect(parsedNurses.nurses).toHaveLength(15);
    const n1 = parsedNurses.nurses.find((n) => n.id === "N01");
    expect(n1?.name).toBe(defaultState.nurses[0].name);
    expect(n1?.skills).toEqual(defaultState.nurses[0].skills);
    expect(n1?.prevMonthShifts).toHaveLength(7);

    // 2. Requests CSV
    const reqsCsv = exportRequestsCsv(defaultState.preferences);
    expect(reqsCsv).toContain("nurseId,day,shift,isHard,reason");
    const knownIds = new Set(parsedNurses.nurses.map((n) => n.id));
    const parsedReqs = parseRequestsCsv(reqsCsv, knownIds);
    expect(parsedReqs.errors).toHaveLength(0);
    expect(parsedReqs.preferences).toHaveLength(defaultState.preferences.length);
    if (defaultState.preferences.length > 0) {
      expect(parsedReqs.preferences[0].nurseId).toBe(defaultState.preferences[0].nurseId);
      expect(parsedReqs.preferences[0].day).toBe(defaultState.preferences[0].day);
      expect(parsedReqs.preferences[0].shift).toBe(defaultState.preferences[0].shift);
      expect(parsedReqs.preferences[0].isHard).toBe(defaultState.preferences[0].isHard);
    }

    // 3. Relations CSV
    const relsCsv = exportRelationsCsv(defaultState.relations);
    expect(relsCsv).toContain("type,nurseA,nurseB,shifts,isHard,reason");
    const parsedRels = parseRelationsCsv(relsCsv, knownIds);
    expect(parsedRels.errors).toHaveLength(0);
    expect(parsedRels.relations).toHaveLength(defaultState.relations.length);
    if (defaultState.relations.length > 0) {
      expect(parsedRels.relations[0].nurseA).toBe(defaultState.relations[0].nurseA);
      expect(parsedRels.relations[0].nurseB).toBe(defaultState.relations[0].nurseB);
      expect(parsedRels.relations[0].type).toBe(defaultState.relations[0].type);
    }
  });

  it("parses Japanese headers and tolerant localized tokens correctly", () => {
    const jaNursesCsv = `
ID,氏名,フリガナ,スキル,経験年数,契約形態,夜勤可否,月間夜勤上限,最小公休数,最小勤務日数,最大勤務日数,最大連勤日数,平日専従,祝日休,前月最終勤務
N99,田中 花子,タナカ ハナコ,"リーダー;救急",10,full_time,可,6,9,15,22,4,いいえ,いいえ,"休;日;日;準;深;休;日"
`.trim();

    const parsed = parseNursesCsv(jaNursesCsv);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.nurses).toHaveLength(1);
    const n = parsed.nurses[0];
    expect(n.id).toBe("N99");
    expect(n.name).toBe("田中 花子");
    expect(n.skills).toContain("leader_cap");
    expect(n.skills).toContain("icu_er");
    expect(n.yearsExp).toBe(10);
    expect(n.nightOk).toBe(true);
    expect(n.maxMonthlyNightShifts).toBe(6);
    expect(n.maxConsecutiveWorkDays).toBe(4);
    expect(n.prevMonthShifts).toEqual(["O", "D", "D", "E", "N", "O", "D"]);
  });

  it("validates nurse dataset references and detects errors", () => {
    const nurses = [
      {
        id: "N01",
        name: "看護師1",
        kana: "カンゴシ1",
        skills: ["leader_cap" as const],
        nightOk: true,
        yearsExp: 5,
        prevMonthShifts: ["O", "D", "D", "E", "N", "O", "D"] as const,
        yearly36Stats: {
          past11MonthsOvertimeHours: 120,
          currentMonthOvertimeHours: 0,
          annualProjectedHours: 120,
          specialExtensionMonthsCount: 0,
        },
      },
    ];

    const invalidReqs = [
      {
        id: "req1",
        nurseId: "N99", // non-existent nurse
        day: 5,
        shift: "O",
        isHard: true,
        reason: "希望休",
      },
      {
        id: "req2",
        nurseId: "N01",
        day: 45, // invalid day of month
        shift: "D",
        isHard: true,
        reason: "日勤",
      },
    ];

    const invalidRels = [
      {
        id: "rel1",
        type: "ng_pair" as const,
        nurseA: "N01",
        nurseB: "N99", // non-existent nurse
        reason: "相性NG",
      },
      {
        id: "rel2",
        type: "ng_pair" as const,
        nurseA: "N01",
        nurseB: "N01", // self pair
        reason: "自己ペア",
      },
    ];

    const validation = validateNurseDataset(nurses, invalidReqs, invalidRels, 30);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => e.includes("N99"))).toBe(true);
    expect(validation.errors.some((e) => e.includes("45"))).toBe(true);
    expect(validation.errors.some((e) => e.includes("自己ペア") || e.includes("N01"))).toBe(true);
  });

  it("provides downloadable template samples that pass full validation", () => {
    const sampleNurses = getSampleNursesCsv();
    const sampleReqs = getSampleRequestsCsv();
    const sampleRels = getSampleRelationsCsv();

    const parsedNurses = parseNursesCsv(sampleNurses);
    expect(parsedNurses.errors).toHaveLength(0);
    expect(parsedNurses.nurses.length).toBeGreaterThanOrEqual(10);

    const knownIds = new Set(parsedNurses.nurses.map((n) => n.id));
    const parsedReqs = parseRequestsCsv(sampleReqs, knownIds);
    expect(parsedReqs.errors).toHaveLength(0);

    const parsedRels = parseRelationsCsv(sampleRels, knownIds);
    expect(parsedRels.errors).toHaveLength(0);

    const val = validateNurseDataset(
      parsedNurses.nurses,
      parsedReqs.preferences,
      parsedRels.relations,
      30
    );
    expect(val.valid).toBe(true);
  });

  it("handles commas and quotes in reason fields safely", () => {
    const preferences = [
      {
        id: "p1",
        nurseId: "N01",
        day: 10,
        shift: "O" as const,
        isHard: true,
        reason: '有給休暇, 私用（"急用"のため）',
      },
    ];
    const csv = exportRequestsCsv(preferences);
    expect(csv).toContain('"有給休暇, 私用（""急用""のため）"');

    const parsed = parseRequestsCsv(csv);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.preferences).toHaveLength(1);
    expect(parsed.preferences[0].reason).toBe('有給休暇, 私用（"急用"のため）');
  });

  it("handles empty CSV text and malformed rows gracefully", () => {
    expect(parseNursesCsv("").errors).toContain("CSVファイルが空です。");
    expect(parseRequestsCsv("").preferences).toHaveLength(0);
    expect(parseRelationsCsv("").relations).toHaveLength(0);

    const malformed = `
id,name
,
N01,
`.trim();
    const parsed = parseNursesCsv(malformed);
    expect(parsed.nurses).toHaveLength(0);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it("rejects unknown or invalid shift tokens during CSV import and validation", () => {
    const invalidShiftCsv = `
nurseId,day,shift,isHard,reason
N01,5,DN,1,タイポシフト
N01,6,UNKNOWN,0,無効シフト
N01,7,D,0,正常日勤
`.trim();

    const parsed = parseRequestsCsv(invalidShiftCsv);
    expect(parsed.errors.length).toBe(2);
    expect(parsed.errors[0]).toContain('不明なシフトコード "DN"');
    expect(parsed.errors[1]).toContain('不明なシフトコード "UNKNOWN"');
    expect(parsed.preferences).toHaveLength(1);
    expect(parsed.preferences[0].shift).toBe("D");

    // Allows custom shift codes when explicitly registered
    const customAllowed = parseRequestsCsv(
      "nurseId,day,shift,isHard,reason\nN01,5,T,1,研修シフト",
      undefined,
      new Set(["T"])
    );
    expect(customAllowed.errors).toHaveLength(0);
    expect(customAllowed.preferences).toHaveLength(1);
    expect(customAllowed.preferences[0].shift).toBe("T");

    // Dataset validation also catches invalid shift codes
    const nurses = [
      {
        id: "N01",
        name: "看護師1",
        kana: "カンゴシ1",
        skills: ["leader_cap" as const],
        nightOk: true,
        yearsExp: 5,
        prevMonthShifts: ["O", "D", "D", "E", "N", "O", "D"] as const,
        yearly36Stats: {
          past11MonthsOvertimeHours: 120,
          currentMonthOvertimeHours: 0,
          annualProjectedHours: 120,
          specialExtensionMonthsCount: 0,
        },
      },
    ];
    const invalidPref = [
      {
        id: "p_err",
        nurseId: "N01",
        day: 5,
        shift: "INVALID_CODE",
        isHard: true,
        reason: "テスト",
      },
    ];
    const val = validateNurseDataset(nurses, invalidPref, [], 30);
    expect(val.valid).toBe(false);
    expect(val.errors.some((e) => e.includes("INVALID_CODE"))).toBe(true);
  });

  it("defaults empty relation shifts cell to ['E', 'N'] and rejects empty shift lists", () => {
    // 1. Omitted or empty shifts column defaults to E;N
    const relsWithBlankShifts = `
type,nurseA,nurseB,shifts,isHard,reason
ng_pair,N01,N02,,1,相性NG
preceptor,N03,N04,"  ",1,指導ペア
`.trim();

    const parsed = parseRelationsCsv(relsWithBlankShifts);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.relations).toHaveLength(2);
    expect(parsed.relations[0].shifts).toEqual(["E", "N"]);
    expect(parsed.relations[1].shifts).toEqual(["E", "N"]);

    // 2. Full-dataset validation flags any relation with empty shifts
    const nurses = [
      {
        id: "N01",
        name: "看護師1",
        kana: "カンゴシ1",
        skills: ["leader_cap" as const],
        nightOk: true,
        yearsExp: 5,
        prevMonthShifts: ["O", "D", "D", "E", "N", "O", "D"] as const,
        yearly36Stats: {
          past11MonthsOvertimeHours: 120,
          currentMonthOvertimeHours: 0,
          annualProjectedHours: 120,
          specialExtensionMonthsCount: 0,
        },
      },
      {
        id: "N02",
        name: "看護師2",
        kana: "カンゴシ2",
        skills: [] as const,
        nightOk: true,
        yearsExp: 3,
        prevMonthShifts: ["O", "D", "D", "E", "N", "O", "D"] as const,
        yearly36Stats: {
          past11MonthsOvertimeHours: 80,
          currentMonthOvertimeHours: 0,
          annualProjectedHours: 80,
          specialExtensionMonthsCount: 0,
        },
      },
    ];

    const invalidRel = [
      {
        id: "rel_empty",
        type: "ng_pair" as const,
        nurseA: "N01",
        nurseB: "N02",
        shifts: [],
        reason: "空シフト",
      },
    ];

    const val = validateNurseDataset(nurses, [], invalidRel, 30);
    expect(val.valid).toBe(false);
    expect(val.errors.some((e) => e.includes("対象シフトが空です"))).toBe(true);
  });

  it("strips UTF-8 BOM from CSV text and column headers properly", () => {
    const bomCsv = "\uFEFFid,name,skills,nightOk,yearsExp\nN01,BOM看護師,leader,true,5\n";
    const parsed = parseNursesCsv(bomCsv);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.nurses).toHaveLength(1);
    expect(parsed.nurses[0].id).toBe("N01");
    expect(parsed.nurses[0].name).toBe("BOM看護師");
  });

  it("initializes blank state with pre-populated baseline ward constraints", () => {
    const blank = createBlankNurseSchedulingState();
    expect(blank.nurses).toHaveLength(0);
    expect(blank.preferences).toHaveLength(0);
    expect(blank.relations).toHaveLength(0);
    expect(blank.customRules).toHaveLength(0);

    // Basic ward constraints must be pre-populated
    expect(blank.config.weekdayDayStaff).toBe(10);
    expect(blank.config.weekendDayStaff).toBe(7);
    expect(blank.config.eveningStaff).toBe(3);
    expect(blank.config.nightStaff).toBe(3);
    expect(blank.config.maxConsecutiveWorkDays).toBe(5);
    expect(blank.config.minMonthlyDaysOff).toBe(9);
    expect(blank.config.maxMonthlyNightShifts).toBe(8);
    expect(blank.config.enforce36Agreement).toBe(true);
    expect(blank.config.shiftTransitions).toBeDefined();
    expect(blank.skillDefs.length).toBeGreaterThanOrEqual(3);
  });

  it("verifies 4-step tutorial workflow and tab layout alignment with shift matrix first", () => {
    const html = fs.readFileSync("examples/web-demo/apps/ai-shift/index.html", "utf8");

    // 1. 4-step tutorial banner
    expect(html).toContain("STEP 1");
    expect(html).toContain("STEP 2");
    expect(html).toContain("STEP 3");
    expect(html).toContain("STEP 4");
    expect(html).toContain("id=\"btn-tut-step1\"");
    expect(html).toContain("id=\"btn-tut-step2\"");
    expect(html).toContain("id=\"btn-tut-step3\"");
    expect(html).toContain("id=\"btn-tut-step4\"");

    // 2. Tab button ordering: Schedule -> Staff -> Constraints
    const scheduleBtnIdx = html.indexOf("id=\"tab-btn-schedule\"");
    const staffBtnIdx = html.indexOf("id=\"tab-btn-staff\"");
    const constraintsBtnIdx = html.indexOf("id=\"tab-btn-constraints\"");
    expect(scheduleBtnIdx).toBeGreaterThan(-1);
    expect(staffBtnIdx).toBeGreaterThan(scheduleBtnIdx);
    expect(constraintsBtnIdx).toBeGreaterThan(staffBtnIdx);

    // Initial active tab button is schedule
    const scheduleBtnSnippet = html.slice(scheduleBtnIdx - 50, scheduleBtnIdx + 150);
    expect(scheduleBtnSnippet).toContain("results-tab-btn active");

    // 3. Tab panel ordering: schedule (visible) -> staff (hidden) -> constraints (hidden)
    const schedulePanelIdx = html.indexOf("id=\"tab-panel-schedule\"");
    const staffPanelIdx = html.indexOf("id=\"tab-panel-staff\"");
    const constraintsPanelIdx = html.indexOf("id=\"tab-panel-constraints\"");
    expect(schedulePanelIdx).toBeGreaterThan(-1);
    expect(staffPanelIdx).toBeGreaterThan(schedulePanelIdx);
    expect(constraintsPanelIdx).toBeGreaterThan(staffPanelIdx);

    const schedulePanelSnippet = html.slice(schedulePanelIdx, schedulePanelIdx + 250);
    expect(schedulePanelSnippet).not.toContain("hidden");

    const staffPanelSnippet = html.slice(staffPanelIdx, staffPanelIdx + 250);
    expect(staffPanelSnippet).toContain("hidden");

    const constraintsPanelSnippet = html.slice(constraintsPanelIdx, constraintsPanelIdx + 250);
    expect(constraintsPanelSnippet).toContain("hidden");

    // 4. Sentence builder and rule elements exist
    expect(html).toContain("id=\"staffing-rules-list\"");
    expect(html).toContain("id=\"btn-add-sentence-rule\"");
    expect(html).toContain("id=\"builder-shift\"");
    expect(html).toContain("id=\"builder-day-type\"");
    expect(html).toContain("id=\"builder-attribute\"");
    expect(html).toContain("id=\"builder-min-count\"");
    expect(html).toContain("id=\"builder-max-count\"");
    expect(html).toContain("id=\"builder-hardness\"");
  });

  it("ensures all DOM elements queried by $() in ai-shift main.ts exist in index.html", () => {
    const mainTs = fs.readFileSync("examples/web-demo/apps/ai-shift/main.ts", "utf8");
    const html = fs.readFileSync("examples/web-demo/apps/ai-shift/index.html", "utf8");

    const idRegex = /\$\(\s*["']([^"']+)["']\s*\)/g;
    let match: RegExpExecArray | null;
    const missing: string[] = [];

    while ((match = idRegex.exec(mainTs)) !== null) {
      const id = match[1];
      if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
        missing.push(id);
      }
    }

    expect([...new Set(missing)]).toEqual([]);
  });

  it("clamps out-of-range staffCount when generating nurse scheduling state to avoid infeasible coverage ratios", () => {
    // Exceeding supported maximum (e.g. 100) must clamp to MAX_STAFF_COUNT (36)
    const stateOver = generateNurseSchedulingState({ staffCount: 100 });
    expect(stateOver.nurses.length).toBe(MAX_STAFF_COUNT);
    expect(stateOver.config.staffCount).toBe(MAX_STAFF_COUNT);
    expect(stateOver.config.weekdayDayStaff).toBe(Math.round((MAX_STAFF_COUNT * 10) / 30)); // 12
    expect(stateOver.config.eveningStaff).toBe(Math.round((MAX_STAFF_COUNT * 3) / 30)); // 4
    expect(stateOver.config.nightStaff).toBe(Math.round((MAX_STAFF_COUNT * 3) / 30)); // 4

    // Below supported minimum (e.g. 5) must clamp to MIN_STAFF_COUNT (15)
    const stateUnder = generateNurseSchedulingState({ staffCount: 5 });
    expect(stateUnder.nurses.length).toBe(MIN_STAFF_COUNT);
    expect(stateUnder.config.staffCount).toBe(MIN_STAFF_COUNT);
  });

  it("creates default staffing rules and verifies coverage differentiation by dayType", () => {
    const rules = createDefaultStaffingRules(30);
    expect(rules.length).toBeGreaterThanOrEqual(7);

    const weekdayDayRule = rules.find((r) => r.shifts?.includes("D") && r.dayType === "weekday");
    expect(weekdayDayRule).toBeDefined();
    expect(weekdayDayRule?.minCount).toBe(10);

    const weekendDayRule = rules.find(
      (r) => r.shifts?.includes("D") && r.dayType === "weekend_holiday"
    );
    expect(weekendDayRule).toBeDefined();
    expect(weekendDayRule?.minCount).toBe(7);

    // Verify getRequiredDailyCoverage respects staffing_rule dayType differentiation
    const state = generateNurseSchedulingState({
      year: 2026,
      month: 11,
      staffCount: 30,
    });
    state.customRules = rules;
    // 2026-11-01 is Sunday (dow: 0), 2026-11-02 is Monday (dow: 1, weekday), 2026-11-03 is Culture Day (Holiday)
    const sundayCov = getRequiredDailyCoverage(state, 1);
    const mondayCov = getRequiredDailyCoverage(state, 2);
    const holidayCov = getRequiredDailyCoverage(state, 3);

    expect(sundayCov.D).toBe(7);
    expect(sundayCov.E).toBe(3);
    expect(sundayCov.N).toBe(3);

    expect(mondayCov.D).toBe(10);
    expect(mondayCov.E).toBe(3);
    expect(mondayCov.N).toBe(3);

    expect(holidayCov.D).toBe(7);
  });
});
