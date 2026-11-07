import { describe, it, expect } from "vitest";
import { runCVRP } from "../examples/node/13-vehicle-routing-column-generation.js";
import { runTSP } from "../examples/node/14-traveling-salesperson-benders.js";

describe("OR Killer Applications (examples/node/13 and 14)", () => {
  it("executes 13-vehicle-routing-column-generation.ts successfully", async () => {
    const result = await runCVRP();
    expect(result.status).toBe("Optimal");
    expect(result.objectiveValue).toBe(3);
    expect(result.columnsAdded).toBeGreaterThanOrEqual(1);
  });

  it("executes 14-traveling-salesperson-benders.ts successfully", async () => {
    const result = await runTSP();
    expect(result.status).toBe("Optimal");
    expect(result.objectiveValue).toBeCloseTo(7.236, 1e-2);
    expect(result.cutsAdded).toBeGreaterThanOrEqual(1);
  });
});
