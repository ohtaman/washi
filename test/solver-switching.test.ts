import { describe, it, expect, vi } from "vitest";
import {
  Model,
  HiGHS,
  MockSolver,
  registerSolver,
  listAvailableSolvers,
  getSolver,
  setDefaultSolver,
  type Solver,
} from "../src/modeler/index.js";

describe("Pluggable Solvers Architecture (Dynamic Solver Switching)", () => {
  it("lists default available solvers", () => {
    const solvers = listAvailableSolvers();
    expect(solvers).toContain("highs");
    expect(solvers).toContain("mock");
  });

  it("solves with default solver (HiGHS)", async () => {
    const m = new Model({ name: "DefaultTest", sense: "Maximize" });
    const x = m.continuous("x", { lb: 0, ub: 10 });
    const y = m.continuous("y", { lb: 0, ub: 10 });

    m.maximize(x.mul(2).add(y.mul(3)));
    m.constrain(x.add(y).le(12), "budget");

    const status = await m.optimize();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(34);
    expect(x.value).toBe(2);
    expect(y.value).toBe(10);
  });

  it("solves with explicit HiGHS solver instance", async () => {
    const m = new Model({ name: "ExplicitHighs", sense: "Maximize" });
    const x = m.continuous("x", { lb: 0 });
    m.maximize(x.mul(5));
    m.constrain(x.le(7), "c1");

    const status = await m.optimize(new HiGHS({ timeLimit: 10 }));
    expect(status).toBe("Optimal");
    expect(x.value).toBe(7);
    expect(m.objectiveValue).toBe(35);
  });

  it("solves by specifying solver name string", async () => {
    const m = new Model({ name: "StringSolver", sense: "Minimize" });
    const x = m.continuous("x", { lb: 4 });
    m.minimize(x);

    const status = await m.optimize("highs");
    expect(status).toBe("Optimal");
    expect(x.value).toBe(4);
  });

  it("switches solver in Model.solve(solver) and optimize(solver)", async () => {
    const m = new Model("SolverSwitching");
    const x = m.continuous("x", { lb: 0, ub: 100 });
    const y = m.continuous("y", { lb: 0, ub: 100 });

    m.maximize(x.mul(10).add(y.mul(20)));
    m.constrain(x.add(y).le(50));

    // Passing solver instance directly: m.optimize(new HiGHS())
    const status = await m.optimize(new HiGHS());
    expect(status).toBe("Optimal");
    expect(y.value).toBe(50);
    expect(m.objectiveValue).toBe(1000);
  });

  it("switches to MockSolver for deterministic testing without WASM", async () => {
    const m = new Model({ name: "MockTest", sense: "Maximize" });
    const x = m.continuous("x");
    const y = m.continuous("y");
    m.maximize(x.add(y));
    m.constrain(x.add(y).le(10), "c1");

    const mock = new MockSolver({
      status: "Optimal",
      objectiveValue: 42,
      values: { x: 12, y: 30 },
      reducedCosts: { x: 0, y: 0 },
      duals: { c1: 1.5 },
      slacks: { c1: 0 },
    });

    const status = await m.optimize(mock);
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBe(42);
    expect(x.value).toBe(12);
    expect(y.value).toBe(30);
    expect(m.constraints[0].dual).toBe(1.5);
  });

  it("supports user-defined custom solver implementing Solver interface", async () => {
    const customSolver: Solver = {
      name: "AcmeQuantumSolver",
      version: "0.1.0",
      async solve(modelData, lpResult) {
        expect(lpResult.lpString).toContain("Subject To");
        return {
          status: "Optimal",
          objectiveValue: 999,
          values: {
            alpha: 77,
          },
          runTime: 0.005,
        };
      },
    };

    const m = new Model({ name: "CustomSolverModel", solver: customSolver });
    const a = m.continuous("alpha");
    m.maximize(a);

    const status = await m.optimize();
    expect(status).toBe("Optimal");
    expect(a.value).toBe(77);
    expect(m.objectiveValue).toBe(999);
  });

  it("registers and sets a new solver factory", async () => {
    registerSolver("fast-mock", () => new MockSolver({
      status: "Optimal",
      objectiveValue: 777,
      values: { v1: 99 },
    }));

    expect(listAvailableSolvers()).toContain("fast-mock");

    const m = new Model();
    const v1 = m.continuous("v1");
    const status = await m.optimize("fast-mock");

    expect(status).toBe("Optimal");
    expect(v1.value).toBe(99);
    expect(m.objectiveValue).toBe(777);
  });

  it("connects to a custom in-house backend API using Solver interface", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "Optimal",
          objectiveValue: 123.45,
          values: { x: 15, y: 25 },
        }),
      } as any);

      // A real-world custom backend solver driver
      const backendSolver: Solver = {
        name: "InHouseOptimizationAPI",
        async solve(modelData, lpResult) {
          const res = await fetch("https://internal-opt.corp/api/v1/solve", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer secret-token" },
            body: JSON.stringify({ lp: lpResult.lpString }),
          });
          const data = await res.json();
          return {
            status: data.status,
            objectiveValue: data.objectiveValue,
            values: data.values,
          };
        },
      };

      const m = new Model({ name: "InHouseBackendModel", solver: backendSolver });
      const x = m.continuous("x");
      const y = m.continuous("y");
      m.maximize(x.add(y));

      const status = await m.optimize();
      expect(status).toBe("Optimal");
      expect(m.objectiveValue).toBe(123.45);
      expect(x.value).toBe(15);
      expect(y.value).toBe(25);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://internal-opt.corp/api/v1/solve",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer secret-token" }),
        })
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
