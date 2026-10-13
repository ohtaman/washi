import { describe, it, expect } from "vitest";
import {
  parseUserShiftIntent,
  applyIntentToRequirements,
} from "../examples/web-demo/src/ai-shift/nano-client.js";
import {
  DEFAULT_COVERAGE,
  DEFAULT_STAFF,
} from "../examples/web-demo/src/ai-shift/shift-solver.js";
import type { ShiftRequirements } from "../examples/web-demo/src/ai-shift/types.js";

describe("AI Shift Intent Parser & Requirements Applicator", () => {
  const baseRequirements: ShiftRequirements = {
    staffList: DEFAULT_STAFF,
    requiredCoverage: { ...DEFAULT_COVERAGE },
    seniorRequiredDaily: true,
    dayOffRequests: [
      { staff: "Alice", day: "Sat", reason: "Family event (Senior)" },
      { staff: "Bob", day: "Sat", reason: "Personal trip (Senior)" },
    ],
  };

  describe("parseUserShiftIntent", () => {
    it("extracts coverage-only edits without returning hardcoded dayOffRequests or waiving senior duty", () => {
      const intent = parseUserShiftIntent("土曜日の必要人数を2人にしてください");

      expect(intent.action).toBe("relax");
      expect(intent.coverageOverrides).toEqual({ Sat: 2 });
      expect(intent.dayOffRequests).toBeUndefined();
      expect(intent.seniorRequiredDaily).toBeUndefined();
      expect(intent.summary).toContain("Sat");
      expect(intent.summary).toContain("2");
    });

    it("handles English coverage-only query without clearing leaves or waiving senior duty", () => {
      const intent = parseUserShiftIntent("Please reduce Saturday required coverage to 2 staff");

      expect(intent.coverageOverrides).toEqual({ Sat: 2 });
      expect(intent.dayOffRequests).toBeUndefined();
      expect(intent.seniorRequiredDaily).toBeUndefined();
    });

    it("parses senior waiver when explicitly requested along with coverage", () => {
      const intent = parseUserShiftIntent("土曜日の必要人数を2人にして、シニア常駐義務を免除してください");

      expect(intent.coverageOverrides).toEqual({ Sat: 2 });
      expect(intent.seniorRequiredDaily).toBe(false);
      expect(intent.dayOffRequests).toBeUndefined();
    });

    it("parses senior waiver only query without altering coverage or vacation requests", () => {
      const intent = parseUserShiftIntent("シニア常駐義務を免除してください");

      expect(intent.action).toBe("relax");
      expect(intent.seniorRequiredDaily).toBe(false);
      expect(intent.coverageOverrides).toBeUndefined();
      expect(intent.dayOffRequests).toBeUndefined();
    });

    it("parses Option 2 (案2 / 条件緩和) preset without overwriting existing leave requests", () => {
      const intent = parseUserShiftIntent("案2（条件緩和）で進めてください");

      expect(intent.action).toBe("relax");
      expect(intent.coverageOverrides).toEqual({ Sat: 2 });
      expect(intent.seniorRequiredDaily).toBe(false);
      expect(intent.dayOffRequests).toBeUndefined();
    });

    it("parses Option 1 (案1 / 振替交渉) with negotiated day-off requests", () => {
      const intent = parseUserShiftIntent("案1の振替交渉で調整してください");

      expect(intent.action).toBe("modify");
      expect(intent.dayOffRequests).toBeDefined();
      expect(intent.dayOffRequests?.some((r) => r.staff === "Bob" && r.day === "Fri")).toBe(true);
      expect(intent.coverageOverrides).toBeUndefined();
    });
  });

  describe("applyIntentToRequirements", () => {
    it("preserves existing day-off requests and senior requirement on coverage-only edit", () => {
      const intent = parseUserShiftIntent("土曜日の必要人数を2人にしてください");
      const updated = applyIntentToRequirements(baseRequirements, intent);

      // Coverage is updated
      expect(updated.requiredCoverage.Sat).toBe(2);
      expect(updated.requiredCoverage.Mon).toBe(DEFAULT_COVERAGE.Mon);

      // Existing leaves are preserved
      expect(updated.dayOffRequests).toEqual(baseRequirements.dayOffRequests);

      // Senior duty remains untouched
      expect(updated.seniorRequiredDaily).toBe(true);
    });

    it("applies senior duty waiver without clearing leaves or coverage", () => {
      const intent = parseUserShiftIntent("シニア常駐義務を免除してください");
      const updated = applyIntentToRequirements(baseRequirements, intent);

      expect(updated.seniorRequiredDaily).toBe(false);
      expect(updated.dayOffRequests).toEqual(baseRequirements.dayOffRequests);
      expect(updated.requiredCoverage).toEqual(baseRequirements.requiredCoverage);
    });

    it("applies option 2 relaxation preserving existing conflict leaves", () => {
      const intent = parseUserShiftIntent("案2で調整して");
      const updated = applyIntentToRequirements(baseRequirements, intent);

      expect(updated.requiredCoverage.Sat).toBe(2);
      expect(updated.seniorRequiredDaily).toBe(false);
      expect(updated.dayOffRequests).toEqual(baseRequirements.dayOffRequests);
    });

    it("resets to defaults when action is create", () => {
      const modifiedReq: ShiftRequirements = {
        ...baseRequirements,
        requiredCoverage: { ...DEFAULT_COVERAGE, Sat: 1 },
        seniorRequiredDaily: false,
      };

      const intent = parseUserShiftIntent("標準のシフトを作成してください");
      const updated = applyIntentToRequirements(modifiedReq, intent);

      expect(updated.requiredCoverage.Sat).toBe(3);
      expect(updated.seniorRequiredDaily).toBe(true);
      expect(updated.dayOffRequests.length).toBeGreaterThan(0);
    });
  });
});
