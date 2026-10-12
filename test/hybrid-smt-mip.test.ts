import { describe, it, expect } from "vitest";
import { runHybridPipeline } from "../examples/node/07-hybrid-smt-mip.js";

describe("07-hybrid-smt-mip.ts Pipeline Direct Verification (TDD)", () => {
  it("halts execution on contradictory policy (Unsat) without invoking MIP", async () => {
    const result = await runHybridPipeline({
      scenarioName: "Test: Contradictory Policy",
      forceConflict: true,
    });

    expect(result.status).toBe("Unsat");
    expect(result.executedMIP).toBe(false);
  });

  it("proceeds to MIP and carries SMT deployment decisions to MIP optimization", async () => {
    const result = await runHybridPipeline({
      scenarioName: "Test: Feasible Policy",
      forceConflict: false,
    });

    expect(result.status).toBe("Sat");
    expect(result.executedMIP).toBe(true);

    // Issue #34: SMT verified multi-region deployment (deployEurope=true & deployUS=true).
    // MIP must enforce both centers to be online, satisfying the SMT deployment policy.
    expect(result.openEU).toBe(1);
    expect(result.openUS).toBe(1);
    expect(result.capEU).toBe(50); // Minimum batch in EU
    expect(result.capUS).toBe(400); // Remainder of 450 TB/s in cheaper US
    expect(result.objectiveValue).toBe(15700); // 5000*2 + 18*50 + 12*400 = 15700
  });

  it("halts execution safely when SMT check status is Unknown", async () => {
    const result = await runHybridPipeline({
      scenarioName: "Test: Unknown Status",
      mockStatus: "Unknown",
    });

    expect(result.status).toBe("Unknown");
    expect(result.executedMIP).toBe(false);
  });
});
