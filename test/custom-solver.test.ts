import { describe, it, expect, vi } from "vitest";
import {
  Model,
  expr,
  registerSolver,
  listAvailableSolvers,
  getSolver,
  setDefaultSolver,
  type Solver,
  type SolverOptions,
  type SolverResult,
  type LpModelData,
  type LpExportResult,
} from "../src/index.js";

describe("Custom Solver Plugin Architecture", () => {
  it("rejects unregistered solver names with helpful instructions", async () => {
    const model = new Model({ name: "UnregisteredGlpk" });
    const x = model.continuous("x");
    model.maximize(x);

    expect(() => getSolver("glpk")).toThrow(
      "Solver 'glpk' not found. Available solvers: highs, mock. Please import '@ohtaman/washi/solvers/glpk' before selecting this solver."
    );

    expect(() => getSolver("z3")).toThrow(
      "Solver 'z3' not found. Available solvers: highs, mock. Please import '@ohtaman/washi/solvers/z3' before selecting this solver."
    );

    expect(() => getSolver("quantum-solver")).toThrow(
      "Solver 'quantum-solver' not found. Available solvers: highs, mock"
    );
  });

  it("allows registering and executing a custom third-party solver plugin", async () => {
    class DummyThirdPartySolver implements Solver {
      public readonly name = "DummyThirdParty";
      public readonly version = "1.0.0";
      public readonly capabilities = { supportsMIP: true, supportsQP: false };
      public options: SolverOptions;

      constructor(options: SolverOptions = {}) {
        this.options = options;
      }

      async solve(
        modelData: LpModelData,
        lpResult: LpExportResult,
        options: SolverOptions = {}
      ): Promise<SolverResult> {
        expect(lpResult.lpString).toContain("Subject To");
        return {
          status: "Optimal",
          objectiveValue: 1234.5,
          values: {
            v_a: 10,
            v_b: 20,
          },
          duals: {
            c_budget: 3.5,
          },
          slacks: {
            c_budget: 0,
          },
          runTime: 0.042,
          logs: ["DummyThirdParty solved successfully."],
        };
      }
    }

    registerSolver("dummy-3rd-party", (opts) => new DummyThirdPartySolver(opts));

    expect(listAvailableSolvers()).toContain("dummy-3rd-party");

    const m = new Model({ name: "ThirdPartyModel", solver: "dummy-3rd-party" });
    const a = m.continuous("v_a");
    const b = m.continuous("v_b");
    m.maximize(a.mul(2).add(b.mul(3)));
    m.constrain(a.add(b).le(30), "c_budget");
    const c1 = m.getConstraintByName("c_budget")!;

    const status = await m.optimize();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(1234.5);
    expect(a.value).toBe(10);
    expect(b.value).toBe(20);
    expect(c1.dual).toBe(3.5);
    expect(c1.slack).toBe(0);
  });

  it("supports passing custom solver instance directly to Model", async () => {
    const inlineSolver: Solver = {
      name: "InlineSolver",
      async solve(modelData, lpResult) {
        return {
          status: "Optimal",
          objectiveValue: 999,
          values: { p_x: 42 },
          runTime: 0.001,
        };
      },
    };

    const model = new Model({ solver: inlineSolver });
    const x = model.continuous("p_x");
    model.maximize(x);
    await model.optimize();
    expect(x.value).toBe(42);
    expect(model.objectiveValue).toBe(999);
  });

  it("handles capability validation when solver does not support quadratic objectives", async () => {
    const linearOnlySolver: Solver = {
      name: "LinearOnly",
      capabilities: { supportsMIP: true, supportsQP: false },
      async solve() {
        return { status: "Optimal", objectiveValue: 0, values: {} };
      },
    };

    const model = new Model({ solver: linearOnlySolver });
    const x = model.continuous("x");
    // Quadratic objective x * x
    model.maximize(x.mul(x));

    await expect(model.optimize()).rejects.toThrow(
      'does not support quadratic objectives'
    );
  });

  it("propagates primal values and duals into WaSHI Model (guide documentation test snippet)", async () => {
    class CloudSolver implements Solver {
      name = "CloudSolver";
      async solve(modelData: LpModelData, lpResult: LpExportResult): Promise<SolverResult> {
        return {
          status: "Optimal",
          objectiveValue: 36,
          values: { x: 0, y: 12 },
          duals: { budget: 3 },
          runTime: 0.1,
        };
      }
    }

    const model = new Model({ solver: new CloudSolver() });
    const x = model.continuous("x", { lb: 0, ub: 10 });
    const y = model.continuous("y", { lb: 0, ub: 10 });
    model.maximize(expr`2 * ${x} + 3 * ${y}`);
    model.constrain(expr`${x} + ${y} <= 12`, "budget");

    const status = await model.optimize();
    expect(status).toBe("Optimal");
    expect(x.value).toBeDefined();
    const c1 = model.getConstraintByName("budget");
    expect(c1?.dual).toBeDefined();
  });
});
