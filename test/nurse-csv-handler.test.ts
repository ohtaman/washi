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
  generateNurseSchedulingState,
} from "../examples/web-demo/apps/ai-shift/generator";
import { solveNurseScheduleWithWashi } from "../examples/web-demo/apps/ai-shift/solver";

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
});
