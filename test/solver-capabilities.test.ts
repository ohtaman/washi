import { describe, it, expect } from "vitest";
import { Model } from "../src/modeler/model.js";
import { MockSolver } from "../src/modeler/solvers/mock.js";
import { HiGHS } from "../src/modeler/solvers/highs.js";

describe("Solver Capabilities Enforcement", () => {
  it("allows QP when solver supports QP (e.g. HiGHS)", async () => {
    const m = new Model("QP_Allowed");
    const x = m.continuous("x");
    m.minimize(x.mul(x));
    m.constrain(x.ge(2));

    // HiGHS has capabilities.supportsQP === true
    expect(HiGHS.capabilities?.supportsQP).toBe(true);
    const status = await m.solve(HiGHS);
    expect(status).toBe("Optimal");
  });

  it("throws clear error when solving QP with a solver that lacks QP capability", async () => {
    const m = new Model("QP_NotSupported");
    const x = m.continuous("x");
    m.minimize(x.mul(x));
    m.constrain(x.ge(2));

    // Create a mock solver with supportsQP: false
    const linearOnlySolver = new MockSolver({
      name: "LinearOnlySolver",
      capabilities: {
        supportsMIP: true,
        supportsQP: false,
      },
    });

    await expect(m.solve(linearOnlySolver)).rejects.toThrowError(
      /Solver "LinearOnlySolver" does not support quadratic objectives \(QP\)/
    );
  });
});
