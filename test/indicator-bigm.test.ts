import { describe, it, expect } from "vitest";
import { Model, sum, expr, LinExpr, deriveBigMForLe, deriveBigMForGe, buildIndicatorLinearization } from "../src/modeler/index.js";

describe("TDD: Indicator Constraints & Big-M Auto-Linearization", () => {
  it("enforces constraint f(x) <= b only when indicator variable z == 1 (activeValue = 1)", async () => {
    const m = new Model({ name: "FacilityActivation" });
    // Continuous capacity x, binary activation flag z
    const x = m.continuous("x", { lb: 0, ub: 100 });
    const z = m.binary("z");

    // When z = 0, factory is closed: x <= 0
    // When z = 1, factory is open: x <= 50
    // We formulate: if z == 0 then x <= 0 (i.e. x <= 50 * z)
    // Using indicator:
    // "If z == 0, then x <= 0" with M = 100
    m.indicator(z, x.le(0), { activeValue: 0, M: 100, name: "factory_closed" });

    // Fixed cost for opening factory ($20), profit from production ($1/unit)
    // Objective: Maximize profit - cost = 1*x - 20*z
    m.maximize(x.sub(z.mul(20)));

    // Case 1: Capacity upper bound 30. Profit = 30 - 20 = 10 > 0 -> should open (z=1, x=30)
    m.add(x.le(30));
    let status = await m.solve();
    expect(status).toBe("Optimal");
    expect(z.value).toBe(1);
    expect(x.value).toBe(30);
    expect(m.objectiveValue).toBe(10);
  });

  it("forces production to 0 if fixed cost outweighs profits (z = 0)", async () => {
    const m = new Model();
    const x = m.continuous("x", { lb: 0 });
    const z = m.binary("z");

    // if z == 0 then x <= 0
    m.indicator(z, x.le(0), { activeValue: 0, M: 100 });

    // If demand is only 5 units, profit = 5 - 20 = -15 < 0 -> should not open (z=0, x=0)
    m.add(x.le(5));
    m.maximize(x.sub(z.mul(20)));

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(z.value).toBe(0);
    expect(x.value).toBe(0);
    expect(m.objectiveValue).toBe(0);
  });

  it("handles >= constraint when indicator is active (activeValue = 1)", async () => {
    const m = new Model();
    const x = m.continuous("x", { lb: 0, ub: 50 });
    const z = m.binary("z");

    // If z == 1, then x >= 20 (minimum batch size)
    m.indicator(z, x.ge(20), { activeValue: 1, M: 50, name: "min_batch" });

    // Force z = 1
    m.add(z.eq(1));
    m.minimize(x);

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(x.value).toBe(20);
  });

  it("handles equality constraint f(x) == b via two-sided Big-M linearization", async () => {
    const m = new Model();
    const x = m.continuous("x", { lb: 0, ub: 100 });
    const z = m.binary("z");

    // If z == 1, then x == 42
    m.indicator(z, x.eq(42), { activeValue: 1, M: 100, name: "exact_value" });

    m.add(z.eq(1));
    m.minimize(x);

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(x.value).toBe(42);
  });

  it("supports expr`...` tagged template literal directly without type assertions", async () => {
    const m = new Model("IndicatorExprTest");
    const x = m.continuous("x", { lb: 0, ub: 200 });
    const b = m.binary("b");

    // Directly pass expr`...` to m.indicator without cast
    m.indicator(b, expr`${x} >= 100`, { activeValue: 1, M: 1000 });

    // Force b = 1
    m.constrain(expr`${b} == 1`);
    m.minimize(expr`${x}`);

    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(x.value).toBe(100);
  });

  it("rejects quadratic expressions or invalid comparisons in indicator()", () => {
    const m = new Model();
    const x = m.continuous("x");
    const b = m.binary("b");

    expect(() => m.indicator(b, expr`${x} * ${x}` as any)).toThrow(
      /Quadratic expressions or constraints are not supported in indicator constraints/
    );
    expect(() => m.indicator(b, expr`2 * ${x} + 5` as any)).toThrow(
      /Invalid constraint expression passed to indicator/
    );
  });

  describe("Issue #50: Safe Big-M derivation, bound checking & override validation", () => {
    it("never silently truncates feasible solutions with large bounds when M is omitted", async () => {
      const m = new Model("LargeBoundSafeBigM");
      // Scale: 10,000,000 (1e7). With the old default M = 1e5, x would be truncated to 1e5 when z = 0.
      const x = m.continuous("x", { lb: 0, ub: 10_000_000 });
      const z = m.binary("z");

      // When z == 1, capacity is restricted to 2,000,000
      // When z == 0, constraint is relaxed and x should reach its full 10,000,000 upper bound!
      m.indicator(z, x.le(2_000_000), { activeValue: 1 });

      // Force z = 0 (inactive), maximize x
      m.constrain(expr`${z} == 0`);
      m.maximize(x);

      const status = await m.solve();
      expect(status).toBe("Optimal");
      expect(z.value).toBe(0);
      expect(x.value).toBe(10_000_000);
      expect(m.objectiveValue).toBe(10_000_000);
    });

    it("correctly auto-derives Big-M for all activeValue (0, 1) and sense (<=, >=, ==) combinations", async () => {
      // 1. activeValue = 1, sense: <=
      {
        const m = new Model();
        const x = m.continuous("x", { lb: 0, ub: 100 });
        const z = m.binary("z");
        m.indicator(z, x.le(30), { activeValue: 1 });
        m.constrain(expr`${z} == 1`);
        m.maximize(x);
        await m.solve();
        expect(x.value).toBe(30);

        // When inactive (z == 0), x can reach 100
        const m2 = new Model();
        const x2 = m2.continuous("x", { lb: 0, ub: 100 });
        const z2 = m2.binary("z");
        m2.indicator(z2, x2.le(30), { activeValue: 1 });
        m2.constrain(expr`${z2} == 0`);
        m2.maximize(x2);
        await m2.solve();
        expect(x2.value).toBe(100);
      }

      // 2. activeValue = 1, sense: >=
      {
        const m = new Model();
        const x = m.continuous("x", { lb: 0, ub: 100 });
        const z = m.binary("z");
        m.indicator(z, x.ge(40), { activeValue: 1 });
        m.constrain(expr`${z} == 1`);
        m.minimize(x);
        await m.solve();
        expect(x.value).toBe(40);

        // When inactive (z == 0), x can reach 0
        const m2 = new Model();
        const x2 = m2.continuous("x", { lb: 0, ub: 100 });
        const z2 = m2.binary("z");
        m2.indicator(z2, x2.ge(40), { activeValue: 1 });
        m2.constrain(expr`${z2} == 0`);
        m2.minimize(x2);
        await m2.solve();
        expect(x2.value).toBe(0);
      }

      // 3. activeValue = 1, sense: ==
      {
        const m = new Model();
        const x = m.continuous("x", { lb: 0, ub: 100 });
        const z = m.binary("z");
        m.indicator(z, x.eq(55), { activeValue: 1 });
        m.constrain(expr`${z} == 1`);
        m.minimize(x);
        await m.solve();
        expect(x.value).toBe(55);

        // When inactive (z == 0), x can be minimized to 0 and maximized to 100
        const m2 = new Model();
        const x2 = m2.continuous("x", { lb: 0, ub: 100 });
        const z2 = m2.binary("z");
        m2.indicator(z2, x2.eq(55), { activeValue: 1 });
        m2.constrain(expr`${z2} == 0`);
        m2.maximize(x2);
        await m2.solve();
        expect(x2.value).toBe(100);
      }

      // 4. activeValue = 0, sense: <=
      {
        const m = new Model();
        const x = m.continuous("x", { lb: 0, ub: 100 });
        const z = m.binary("z");
        m.indicator(z, x.le(25), { activeValue: 0 });
        m.constrain(expr`${z} == 0`);
        m.maximize(x);
        await m.solve();
        expect(x.value).toBe(25);

        // When inactive (z == 1), x can reach 100
        const m2 = new Model();
        const x2 = m2.continuous("x", { lb: 0, ub: 100 });
        const z2 = m2.binary("z");
        m2.indicator(z2, x2.le(25), { activeValue: 0 });
        m2.constrain(expr`${z2} == 1`);
        m2.maximize(x2);
        await m2.solve();
        expect(x2.value).toBe(100);
      }

      // 5. activeValue = 0, sense: >=
      {
        const m = new Model();
        const x = m.continuous("x", { lb: 0, ub: 100 });
        const z = m.binary("z");
        m.indicator(z, x.ge(65), { activeValue: 0 });
        m.constrain(expr`${z} == 0`);
        m.minimize(x);
        await m.solve();
        expect(x.value).toBe(65);

        // When inactive (z == 1), x can reach 0
        const m2 = new Model();
        const x2 = m2.continuous("x", { lb: 0, ub: 100 });
        const z2 = m2.binary("z");
        m2.indicator(z2, x2.ge(65), { activeValue: 0 });
        m2.constrain(expr`${z2} == 1`);
        m2.minimize(x2);
        await m2.solve();
        expect(x2.value).toBe(0);
      }

      // 6. activeValue = 0, sense: ==
      {
        const m = new Model();
        const x = m.continuous("x", { lb: 0, ub: 100 });
        const z = m.binary("z");
        m.indicator(z, x.eq(77), { activeValue: 0 });
        m.constrain(expr`${z} == 0`);
        m.minimize(x);
        await m.solve();
        expect(x.value).toBe(77);

        // When inactive (z == 1), x can reach 100
        const m2 = new Model();
        const x2 = m2.continuous("x", { lb: 0, ub: 100 });
        const z2 = m2.binary("z");
        m2.indicator(z2, x2.eq(77), { activeValue: 0 });
        m2.constrain(expr`${z2} == 1`);
        m2.maximize(x2);
        await m2.solve();
        expect(x2.value).toBe(100);
      }
    });

    it("correctly handles multi-variable expressions with mixed positive and negative coefficients", async () => {
      const m = new Model("MixedCoeffTest");
      // 2*x1 - 3*x2 <= 10
      // x1 in [0, 20], x2 in [5, 15]
      // max(2*x1 - 3*x2) = 2*20 - 3*5 = 40 - 15 = 25
      // M_le = 25 - 10 = 15
      const x1 = m.continuous("x1", { lb: 0, ub: 20 });
      const x2 = m.continuous("x2", { lb: 5, ub: 15 });
      const z = m.binary("z");

      m.indicator(z, expr`2 * ${x1} - 3 * ${x2} <= 10`, { activeValue: 1 });

      // When z == 1, 2*x1 - 3*x2 <= 10 is enforced.
      // If we maximize 2*x1 - 3*x2, the maximum should be exactly 10.
      m.constrain(expr`${z} == 1`);
      m.maximize(expr`2 * ${x1} - 3 * ${x2}`);

      const status = await m.solve();
      expect(status).toBe("Optimal");
      expect(2 * x1.value! - 3 * x2.value!).toBeCloseTo(10);

      // When z == 0, the constraint is relaxed and 2*x1 - 3*x2 can reach 25!
      const m2 = new Model();
      const y1 = m2.continuous("y1", { lb: 0, ub: 20 });
      const y2 = m2.continuous("y2", { lb: 5, ub: 15 });
      const b2 = m2.binary("b2");
      m2.indicator(b2, expr`2 * ${y1} - 3 * ${y2} <= 10`, { activeValue: 1 });
      m2.constrain(expr`${b2} == 0`);
      m2.maximize(expr`2 * ${y1} - 3 * ${y2}`);

      const status2 = await m2.solve();
      expect(status2).toBe("Optimal");
      expect(2 * y1.value! - 3 * y2.value!).toBeCloseTo(25);
    });

    it("fails with an actionable error when variables lack required finite bounds", () => {
      const m = new Model("UnboundedCheck");
      const z = m.binary("z");

      // 1. Variable with positive coefficient in <= lacking upper bound (ub = Infinity)
      const xUnboundedUb = m.continuous("x_no_ub", { lb: 0 }); // ub is Infinity
      expect(() => m.indicator(z, xUnboundedUb.le(50))).toThrow(
        /Cannot derive safe Big-M for indicator constraint.*variable "x_no_ub" lacks a finite upper bound.*specify \{ M \} explicitly/i
      );

      // 2. Variable with negative coefficient in <= lacking lower bound (lb = -Infinity)
      const xUnboundedLb = m.continuous("x_no_lb", { lb: -Infinity, ub: 10 });
      expect(() => m.indicator(z, expr`-2 * ${xUnboundedLb} <= 50`)).toThrow(
        /Cannot derive safe Big-M for indicator constraint.*variable "x_no_lb" lacks a finite lower bound.*specify \{ M \} explicitly/i
      );

      // 3. Variable with positive coefficient in >= lacking lower bound (lb = -Infinity)
      expect(() => m.indicator(z, xUnboundedLb.ge(50))).toThrow(
        /Cannot derive safe Big-M for indicator constraint.*variable "x_no_lb" lacks a finite lower bound.*specify \{ M \} explicitly/i
      );

      // 4. Variable with negative coefficient in >= lacking upper bound (ub = Infinity)
      expect(() => m.indicator(z, expr`-1 * ${xUnboundedUb} >= 50`)).toThrow(
        /Cannot derive safe Big-M for indicator constraint.*variable "x_no_ub" lacks a finite upper bound.*specify \{ M \} explicitly/i
      );

      // 5. Equality constraint requires bounds in both directions
      expect(() => m.indicator(z, xUnboundedUb.eq(50))).toThrow(
        /Cannot derive safe Big-M/i
      );
    });

    it("accepts user-provided M override even when variables are unbounded", async () => {
      const m = new Model("ExplicitMUnbounded");
      // Variables have no explicit upper bound (default ub = Infinity)
      const x = m.continuous("x", { lb: 0 });
      const z = m.binary("z");

      // Specifying M explicitly bypasses bound requirement
      expect(() =>
        m.indicator(z, x.le(50), { activeValue: 1, M: 200 })
      ).not.toThrow();

      m.constrain(expr`${z} == 1`);
      m.maximize(x);

      const status = await m.solve();
      expect(status).toBe("Optimal");
      expect(x.value).toBe(50);
    });

    it("rejects invalid user-provided M values (negative, zero, NaN, Infinity)", () => {
      const m = new Model();
      const x = m.continuous("x", { lb: 0, ub: 100 });
      const z = m.binary("z");

      expect(() => m.indicator(z, x.le(50), { M: 0 })).toThrow(
        /Invalid Big-M value.*expected a finite positive number/
      );
      expect(() => m.indicator(z, x.le(50), { M: -100 })).toThrow(
        /Invalid Big-M value.*expected a finite positive number/
      );
      expect(() => m.indicator(z, x.le(50), { M: NaN })).toThrow(
        /Invalid Big-M value.*expected a finite positive number/
      );
      expect(() => m.indicator(z, x.le(50), { M: Infinity })).toThrow(
        /Invalid Big-M value.*expected a finite positive number/
      );
    });

    it("rejects invalid activeValue options", () => {
      const m = new Model();
      const x = m.continuous("x", { lb: 0, ub: 100 });
      const z = m.binary("z");

      expect(() => m.indicator(z, x.le(50), { activeValue: 2 as any })).toThrow(
        /Invalid activeValue: 2.*must be 0 or 1/
      );
      expect(() => m.indicator(z, x.le(50), { activeValue: -1 as any })).toThrow(
        /Invalid activeValue: -1.*must be 0 or 1/
      );
      expect(() =>
        buildIndicatorLinearization(z, x.add(0), "<=", 50, 2 as any, 50, "ind")
      ).toThrow(/Invalid activeValue: 2.*must be 0 or 1/);
      expect(() =>
        buildIndicatorLinearization(z, x.add(0), "==" as any, 50, 1, 50, "ind")
      ).toThrow(/Invalid indicator sense/i);
      expect(() =>
        buildIndicatorLinearization(x, x.add(0), "<=", 50, 1, 50, "ind")
      ).toThrow(/must be a Binary variable/i);
      const corruptedZ = m.binary("corrupted_z");
      corruptedZ.ub = 2;
      expect(() =>
        buildIndicatorLinearization(corruptedZ, x.add(0), "<=", 50, 1, 50, "ind")
      ).toThrow(/Binary indicator variable.*invalid bounds/i);
    });

    it("handles constraints where bounds already satisfy the inequality (M = 0)", async () => {
      const m = new Model("TriviallySatisfied");
      // x in [0, 50], constraint is x <= 100. max(x) - 100 = 50 - 100 = -50 <= 0, so M = 0.
      const x = m.continuous("x", { lb: 0, ub: 50 });
      const z = m.binary("z");

      expect(() => m.indicator(z, x.le(100), { activeValue: 1 })).not.toThrow();
      m.constrain(expr`${z} == 0`);
      m.maximize(x);

      const status = await m.solve();
      expect(status).toBe("Optimal");
      expect(x.value).toBe(50);
    });

    it("detects finite arithmetic overflow in Big-M derivation and shifted RHS before mutating model", async () => {
      const m = new Model("OverflowDetection");
      const x = m.continuous("x", { lb: -1e308, ub: 1e308 });
      const z = m.binary("z");

      // 1. Overflow in deriveBigMForLe (2 * 1e308 => Infinity)
      expect(() => deriveBigMForLe(x.mul(2), 0, "overflow_le")).toThrow(
        /Cannot derive safe Big-M.*numeric overflow/i
      );

      // 2. Overflow in deriveBigMForGe (2 * -1e308 => -Infinity)
      expect(() => deriveBigMForGe(x.mul(2), 0, "overflow_ge")).toThrow(
        /Cannot derive safe Big-M.*numeric overflow/i
      );

      // 3. indicator() throws before mutating model.constraints (even on equality where <= might succeed before >= overflows)
      const y = m.continuous("y", { lb: -1e308, ub: 10 });
      expect(() => m.indicator(z, y.mul(2).eq(0), { name: "eq_overflow" })).toThrow(
        /Cannot derive safe Big-M.*numeric overflow/i
      );
      expect(m.constraints.length).toBe(0);

      // 4. User-supplied finite M that overflows shifted RHS (rhs + M => Infinity)
      const u = m.continuous("u", { lb: 0, ub: 100 });
      expect(() =>
        m.indicator(z, u.le(1e308), { activeValue: 1, M: 1e308, name: "shifted_rhs_overflow" })
      ).toThrow(/shifted right-hand side overflows finite floating-point range/i);
      expect(m.constraints.length).toBe(0);

      // 5. Representable indicator with large cancelling lhs.constant and rhs (effectiveRhs = 0) succeeds
      const w = m.continuous("w", { lb: 0, ub: 1e308 });
      const cancellingExpr = new LinExpr(new Map([[w, 1]]), 1e308);
      expect(deriveBigMForLe(cancellingExpr, 1e308, "cancelling_le")).toBe(1e308);

      // 6. NaN constant in LinExpr is rejected rather than coerced to 0
      const nanExpr = new LinExpr(new Map([[u, 1]]), NaN);
      expect(() => deriveBigMForLe(nanExpr, 10, "nan_const")).toThrow(/non-finite constant/i);

      // 7. Rejects trigger variable appearing in constrained linear expression
      expect(() =>
        buildIndicatorLinearization(z, u.add(z), "<=", 0, 1, 100, "trigger_in_lhs")
      ).toThrow(/cannot include its own binary activation variable/i);

      // 8. Ordinary fractional indicator (x in [0, 1], x <= 0.1, activeValue = 1) succeeds and solves accurately
      const mFrac = new Model("FractionalIndicator");
      const xFrac = mFrac.continuous("xFrac", { lb: 0, ub: 1 });
      const zFrac = mFrac.binary("zFrac");
      expect(() => mFrac.indicator(zFrac, xFrac.le(0.1), { activeValue: 1 })).not.toThrow();
      mFrac.constrain(expr`${zFrac} == 1`);
      mFrac.maximize(xFrac);
      await mFrac.solve();
      expect(xFrac.value).toBeCloseTo(0.1, 6);

      // 9. Failed indicator() validation preserves existing solved state and rejects non-canonical runtime type spellings
      expect(() =>
        mFrac.indicator(zFrac, xFrac.le(0), { activeValue: 2 as unknown as 0 | 1 })
      ).toThrow(/Invalid activeValue/i);
      expect(mFrac.status).toBe("Optimal");
      expect(xFrac.value).toBeCloseTo(0.1, 6);
      const fakeUpperVar = m.continuous("fakeUpper", { lb: 0, ub: 1 });
      (fakeUpperVar as unknown as { type: string }).type = "BINARY";
      expect(() => m.indicator(fakeUpperVar, x.le(0))).toThrow(/Invalid variable/i);
    });
  });
});

