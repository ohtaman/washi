import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  Model,
  Var,
  BoolExpr,
  Constraint,
  expr,
  sum,
  at,
  distinct,
  disjoint,
  cumulative,
  allowed,
  and,
  or,
  not,
  implies,
  xor,
  minimize,
  maximize,
  linearizeModelForMip,
} from "../src/index.js";
import "../src/modeler/solvers/glpk.js";
import "../src/modeler/solvers/pumpkin.js";
import { registerZ3Solver, killZ3Threads } from "../src/modeler/solvers/z3.js";

describe("CP Global Constraints, Discrete !=/</>, & Native Indicator Lowering (Issue #262)", () => {
  beforeAll(() => {
    registerZ3Solver();
  });

  afterAll(async () => {
    await killZ3Threads();
  });

  describe("Discrete comparisons !=, <, > and fluent .ne(), .lt(), .gt()", () => {
    it("supports <, >, != in expr and fluent methods across all 4 solvers (top-level and inside logic)", async () => {
      const m = new Model("DiscreteComparisons");
      const rankA = m.integer("rankA", { lb: 1, ub: 4 });
      const rankB = m.integer("rankB", { lb: 1, ub: 4 });
      const roomA = m.integer("roomA", { lb: 1, ub: 3 });
      const roomB = m.integer("roomB", { lb: 1, ub: 3 });
      const flag = m.bool("flag");

      m.constraint(expr`${rankA} < ${rankB}`, "strict_order");
      m.constraint(expr`${rankB} > 2`, "rankB_gt_2");
      m.constraint(expr`${roomA} != ${roomB}`, "diff_room");
      m.constraint(implies(flag, roomA.ne(1)), "flag_roomA_ne_1");
      m.constraint(not(rankA.lt(2)), "not_lt_2"); // rankA >= 2
      m.constraint(flag);
      m.objective(minimize(expr`${rankA} + ${rankB} + ${roomA} + ${roomB}`));

      // rankA >= 2, rankB >= 3 (rankA < rankB), roomA != 1 & roomA != roomB -> roomA=2, roomB=1 -> 2+3+2+1 = 8
      for (const solver of ["highs", "glpk", "pumpkin", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        expect(m.objectiveValue).toBeCloseTo(8, 5);
        expect(rankA.value!).toBeLessThan(rankB.value!);
        expect(roomA.value).not.toBe(roomB.value);
        expect(m.validateSolution().valid).toBe(true);
      }
    });

    it("rejects Continuous variables and fractional constants in !=, <, > (even when x - x cancels)", async () => {
      const m = new Model("RejectContinuousDiscreteComp");
      const c1 = m.continuous("c1", { lb: 0, ub: 10 });
      const i1 = m.integer("i1", { lb: 0, ub: 10 });

      expect(() => expr`${c1} < 5`).toThrow(/Continuous|integer/i);
      expect(() => expr`${c1} > 1`).toThrow(/Continuous|integer/i);
      expect(() => expr`${c1} != 2`).toThrow(/Continuous|integer/i);
      expect(() => c1.lt(c1)).toThrow(/Continuous|integer/i);
      expect(() => c1.ne(c1)).toThrow(/Continuous|integer/i);
      expect(() => expr`${c1} != ${c1}`).toThrow(/Continuous|integer/i);
      expect(() => i1.lt(2.5)).toThrow(/integer/i);
      expect(() => expr`0.5 * ${i1} != 1`).toThrow(/integer/i);

      // Post-construction mutation from Integer to Continuous must fail validateIntegrity()
      const mMut = new Model("MutateType");
      const dyn = mMut.integer("dyn", { lb: 0, ub: 5 });
      mMut.constraint(expr`${dyn} != 3`, "neq3");
      dyn.type = "Continuous";
      expect(() => mMut.validateIntegrity()).toThrow(/Continuous|integer/i);

      // Direct Constraint construction or mutating sense/rhs to discrete != on Continuous/fractional must reject (even on Z3)
      const mDirect = new Model("DirectNeq");
      const dc = mDirect.continuous("dc", { lb: 0, ub: 5 });
      expect(() =>
        mDirect.constraint(new Constraint(dc.add(0), "!=", 2, "bad_direct_neq"))
      ).toThrow(/Continuous|integer/i);

      const mSense = new Model("SenseMutate");
      const sc = mSense.continuous("sc", { lb: 0, ub: 5 });
      const eqRow = mSense.constraint(expr`${sc} == 2`, "eq_row");
      eqRow.sense = "!=";
      expect(() => mSense.validateIntegrity()).toThrow(/Continuous|integer/i);
      await expect(mSense.solve({ solver: "z3" })).rejects.toThrow(/Continuous|integer/i);

      const mRhs = new Model("RhsMutate");
      const si = mRhs.integer("si", { lb: 0, ub: 5 });
      const neqRow = mRhs.constraint(expr`${si} != 2`, "neq_row");
      expect(() => {
        neqRow.rhs = 2.5;
      }).toThrow(/integer/i);
    });
  });

  describe("distinct(vars) — positive, negative, multi-variable LinExpr, 2D/Record/Set", () => {
    it("solves distinct() across all solvers including multi-variable LinExpr operands and 2D/Record/Set", async () => {
      const m = new Model("DistinctMulti");
      const x = m.integer(["a", "b", "c"] as const, { lb: 1, ub: 3 });
      const offset = m.integer("offset", { lb: 0, ub: 1 });

      m.constraint(distinct(x), "unique_abc");
      m.constraint(distinct([x.a, expr`${x.b} + ${offset}`, 4]), "with_linexpr_and_const");
      m.constraint(expr`${offset} == 1`);
      m.objective(maximize(expr`10 * ${x.a} + 2 * ${x.b} + ${x.c}`));

      // x.a, x.b, x.c is a permutation of {1,2,3}, and x.a != x.b + 1.
      // Max obj puts x.a = 3; x.b + 1 != 3 => x.b != 2 => x.b = 1, x.c = 2 -> 30 + 2 + 2 = 34
      for (const solver of ["highs", "glpk", "pumpkin", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        expect(m.objectiveValue).toBeCloseTo(34, 5);
        expect(x.a.value).toBe(3);
        expect(x.b.value).toBe(1);
        expect(x.c.value).toBe(2);
        expect(m.validateSolution().valid).toBe(true);
      }
    });

    it("supports not(distinct(...)), xor(distinct(...), flag), and implies(distinct(...), flag)", async () => {
      const m = new Model("DistinctNegativePolarity");
      const v = m.integer(3, { lb: 1, ub: 3, prefix: "v" });
      const flag = m.bool("flag");

      // v[0], v[1], v[2] must NOT all be distinct, and v[0] < v[1]
      m.constraint(not(distinct(v)), "must_have_duplicate");
      m.constraint(expr`${v[0]} < ${v[1]}`, "v0_lt_v1");
      // xor(distinct([v[0], v[2]]), flag) with flag=true => v[0] == v[2]
      m.constraint(xor(distinct([v[0], v[2]]), flag), "xor_distinct");
      m.constraint(flag);
      m.objective(maximize(sum(v)));

      // v[0] < v[1] <= 3, v[0] == v[2] -> max when v[1]=3, v[0]=v[2]=2 -> sum = 7
      for (const solver of ["highs", "glpk", "pumpkin", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        expect(m.objectiveValue).toBeCloseTo(7, 5);
        expect(v[0].value).toBe(v[2].value);
        expect(m.validateSolution().valid).toBe(true);
      }
    });

    it("detects Unsat & unsatCore when pigeonhole distinct() is infeasible", async () => {
      const m = new Model("PigeonholeDistinct");
      const rooms = m.integer(3, { lb: 1, ub: 2, prefix: "r" });
      m.constraint(distinct(rooms), "unique_rooms");

      for (const solver of ["highs", "pumpkin", "z3"] as const) {
        const res = await m.check({ solver });
        expect(res.status, `solver=${solver}`).toBe("Unsat");
        expect(res.conflicts).toContain("unique_rooms");
      }
    });
  });

  describe("disjoint(tasks) — positive, negative, multi-variable start, zero-duration parity", () => {
    it("solves disjunctive scheduling including Vilim edge-finding & multi-variable start across all 4 solvers", async () => {
      const m = new Model("DisjointScheduling");
      const s = m.integer(3, { lb: 0, ub: 20, prefix: "s" });
      const delay = m.integer("delay", { lb: 1, ub: 2 });
      const makespan = m.integer("makespan", { lb: 0, ub: 30 });

      m.constraint(
        disjoint([
          { start: s[0], duration: 4 },
          { start: expr`${s[1]} + ${delay}`, duration: 5 },
          { start: s[2], duration: 3 },
        ]),
        "machine_1"
      );
      m.constraint(expr`${s[0]} + 4 <= ${makespan}`);
      m.constraint(expr`${s[1]} + ${delay} + 5 <= ${makespan}`);
      m.constraint(expr`${s[2]} + 3 <= ${makespan}`);
      m.constraint(expr`${delay} == 1`);
      m.objective(minimize(makespan));

      // Total duration = 4 + 5 + 3 = 12, delay = 1 (s[1]+1 >= 0 ok), min makespan = 12
      for (const solver of ["highs", "glpk", "pumpkin", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        expect(m.objectiveValue).toBeCloseTo(12, 5);
        expect(m.validateSolution().valid).toBe(true);
      }
    });

    it("keeps zero-duration task semantics aligned across Pumpkin, Z3, HiGHS, GLPK, and validateSolution()", async () => {
      // Pumpkin's disjunctive_strict allows a duration-0 task at s=0 or s=5 (boundary of [0, 5]),
      // and forbids placing it strictly inside (0, 5), i.e., 0 < s0 < 5.
      const m = new Model("ZeroDurationDisjoint");
      const s0 = m.integer("s0", { lb: 1, ub: 4 });
      const s1 = m.integer("s1", { lb: 0, ub: 0 });
      m.constraint(
        disjoint([
          { start: s0, duration: 0 },
          { start: s1, duration: 5 },
        ]),
        "zero_dur_overlap"
      );

      for (const solver of ["highs", "pumpkin", "z3"] as const) {
        const res = await m.check({ solver });
        expect(res.status, `solver=${solver}`).toBe("Unsat");
      }

      // Boundary s0 = 5 with s1 = 0, d1 = 5 must be Sat and valid
      const mSat = new Model("ZeroDurationBoundary");
      const b0 = mSat.integer("b0", { lb: 5, ub: 5 });
      const b1 = mSat.integer("b1", { lb: 0, ub: 0 });
      mSat.constraint(
        disjoint([
          { start: b0, duration: 0 },
          { start: b1, duration: 5 },
        ]),
        "zero_dur_boundary"
      );
      for (const solver of ["highs", "pumpkin", "z3"] as const) {
        const res = await mSat.check({ solver });
        expect(res.status, `solver=${solver}`).toBe("Sat");
        expect(mSat.validateSolution().valid).toBe(true);
      }
    });

    it("supports not(disjoint(tasks)) and implies(disjoint(tasks), flag) across all 4 solvers", async () => {
      // Task 0: [0, 4], Task 1: [s1, s1+3], require overlap -> s1 in [0..3], max s1 = 3 (overlap at t=3..4 -> 3 < 4 and 0 < 3+3)
      const m = new Model("NegatedDisjoint");
      const s1 = m.integer("s1", { lb: 0, ub: 10 });
      const s0 = m.integer("s0", { lb: 0, ub: 0 });
      const flag = m.bool("flag");

      m.constraint(
        implies(
          disjoint([
            { start: s0, duration: 4 },
            { start: s1, duration: 3 },
          ]),
          flag
        ),
        "disjoint_implies_flag"
      );
      m.constraint(not(flag), "forbid_flag"); // forces NOT disjoint -> overlap!
      m.objective(maximize(s1));

      // Overlap between [0, 4) and [s1, s1 + 3): s1 < 4 && 0 < s1 + 3 => max s1 = 3
      for (const solver of ["highs", "glpk", "pumpkin", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        expect(m.objectiveValue).toBeCloseTo(3, 5);
        expect(m.validateSolution().valid).toBe(true);
      }
    });
  });

  describe("cumulative(tasks, capacity) — positive, negative, and MIP horizon guard", () => {
    it("solves cumulative RCPSP scheduling identically across HiGHS, GLPK, Pumpkin, and Z3", async () => {
      const m = new Model("CumulativeRCPSP");
      const s = m.integer(3, { lb: 0, ub: 10, prefix: "s" });
      const makespan = m.integer("makespan", { lb: 0, ub: 15 });

      m.constraint(
        cumulative(
          [
            { start: s[0], duration: 4, demand: 2 },
            { start: s[1], duration: 3, demand: 1 },
            { start: s[2], duration: 3, demand: 1 },
          ],
          2
        ),
        "worker_cap"
      );
      m.constraint(expr`${s[0]} + 4 <= ${makespan}`);
      m.constraint(expr`${s[1]} + 3 <= ${makespan}`);
      m.constraint(expr`${s[2]} + 3 <= ${makespan}`);
      m.objective(minimize(makespan));

      // Task 0 uses all capacity 2 for duration 4; Tasks 1 & 2 each use 1 for duration 3 and can run in parallel -> min makespan = 4 + 3 = 7
      for (const solver of ["highs", "glpk", "pumpkin", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        expect(m.objectiveValue).toBeCloseTo(7, 5);
        expect(m.validateSolution().valid).toBe(true);
      }
    });

    it("supports not(cumulative(tasks, cap)) across all 4 solvers", async () => {
      const m = new Model("NegatedCumulative");
      const s1 = m.integer("s1", { lb: 0, ub: 10 });
      const s0 = m.integer("s0", { lb: 0, ub: 0 });
      m.constraint(
        not(
          cumulative(
            [
              { start: s0, duration: 5, demand: 2 },
              { start: s1, duration: 3, demand: 1 },
            ],
            2
          )
        ),
        "must_overload"
      );
      m.objective(maximize(s1));

      // Task 0 covers [0, 5). Task 1 covers [s1, s1+3). To overload cap 2, must overlap [0, 5) => max s1 = 4
      for (const solver of ["highs", "glpk", "pumpkin", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        expect(m.objectiveValue).toBeCloseTo(4, 5);
        expect(m.validateSolution().valid).toBe(true);
      }
    });

    it("throws memory-guard Error on huge cumulative horizon in MIP recommending Pumpkin, while Pumpkin solves it", async () => {
      const m = new Model("HugeHorizonCumulative");
      const s1 = m.integer("s1", { lb: 0, ub: 50_000 });
      const s2 = m.integer("s2", { lb: 0, ub: 50_000 });
      m.constraint(
        cumulative(
          [
            { start: s1, duration: 100, demand: 2 },
            { start: s2, duration: 100, demand: 2 },
          ],
          2
        ),
        "huge_cap"
      );
      m.objective(minimize(expr`${s1} + ${s2}`));

      await expect(m.solve({ solver: "highs" })).rejects.toThrow(/pumpkin/i);

      const status = await m.solve({ solver: "pumpkin" });
      expect(status).toBe("Optimal");
      expect(m.objectiveValue).toBeCloseTo(100, 5);
      expect(m.validateSolution().valid).toBe(true);
    });
  });

  describe("allowed(vars, tuples) — positive table & negative_table / no-good cuts", () => {
    it("enforces positive allowed tuples and negated forbidden tuples across all 4 solvers", async () => {
      const m = new Model("AllowedTuples");
      const role = m.integer("role", { lb: 0, ub: 2 });
      const level = m.integer("level", { lb: 1, ub: 4 });
      const shiftToday = m.binary("shiftToday");
      const shiftNext = m.binary("shiftNext");

      m.constraint(
        allowed([role, level], [
          [0, 1],
          [1, 3],
          [2, 2],
        ]),
        "valid_role_level"
      );
      // Forbid (shiftToday=1, shiftNext=1) using negated allowed
      m.constraint(
        not(allowed([shiftToday, shiftNext], [[1, 1]])),
        "forbid_double_night"
      );
      m.constraint(expr`${shiftToday} == 1`);
      m.objective(maximize(expr`${role} + ${level} + 10 * ${shiftNext}`));

      // shiftToday=1 => shiftNext=0; max(role+level) is (1,3) or (2,2) = 4
      for (const solver of ["highs", "glpk", "pumpkin", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        expect(m.objectiveValue).toBeCloseTo(4, 5);
        expect(shiftNext.value).toBe(0);
        expect(m.validateSolution().valid).toBe(true);
      }
    });

    it("supports allowed inside implies() and empty tuple table semantics", async () => {
      const m = new Model("ImpliesAllowed");
      const flag = m.bool("flag");
      const a = m.integer("a", { lb: 1, ub: 3 });
      const b = m.integer("b", { lb: 1, ub: 3 });

      m.constraint(implies(flag, allowed([a, b], [[1, 3], [2, 2]])));
      m.constraint(flag);
      m.objective(maximize(expr`2 * ${a} + ${b}`));

      // 2*1 + 3 = 5, 2*2 + 2 = 6 -> optimal 6
      for (const solver of ["highs", "glpk", "pumpkin", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        expect(m.objectiveValue).toBeCloseTo(6, 5);
        expect(m.validateSolution().valid).toBe(true);
      }

      // Empty allowed tuples => Unsat
      const mEmpty = new Model("EmptyAllowed");
      const x = mEmpty.integer("x", { lb: 0, ub: 1 });
      mEmpty.constraint(allowed([x], []), "empty_table");
      for (const solver of ["highs", "pumpkin", "z3"] as const) {
        const res = await mEmpty.check({ solver });
        expect(res.status, `solver=${solver}`).toBe("Unsat");
      }
    });
  });

  describe("Native m.indicator() lowering without Big-M degradation", () => {
    it("preserves Constraint[] and Big-M toLpString(), lowers natively on Pumpkin/Z3 when M omitted, and invalidates metadata on mutation", async () => {
      const m = new Model("NativeIndicator");
      const b = m.binary("b");
      // Use bounds large enough (10^8) that Big-M 10^8 + 10^8 could strain or fail i32 propagation if summed loosely,
      // or verify both equality and inequality indicators work cleanly across HiGHS, Pumpkin, and Z3.
      const x = m.integer("x", { lb: 0, ub: 500_000_000 });

      const rows = m.indicator(b, expr`${x} <= 10`, { activeValue: 1, name: "cap_when_b" });
      expect(Array.isArray(rows)).toBe(true);
      expect(rows).toHaveLength(1);

      // toLpString() MUST preserve Big-M linear inequality for backward compatibility
      const lp = m.toLpString();
      expect(lp).toContain("cap_when_b:");
      expect(lp).toContain("499999990 b");

      m.constraint(expr`${b} == 0`);
      m.objective(maximize(x));

      for (const solver of ["highs", "pumpkin", "z3"] as const) {
        const status = await m.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        expect(x.value).toBe(500_000_000);
        expect(m.validateSolution().valid).toBe(true);
      }

      // Strictly prove Pumpkin bypasses Big-M: with ub = 1_000_000_000, the Big-M linear row
      // x + 999_999_990 * b <= 1_000_000_000 has magnitude 2_999_999_990 > MAX_PROPAGATOR_MAGNITUDE (2_147_483_646),
      // which would fail on Pumpkin if Big-M were serialized instead of native implied_by(b, x <= 10).
      const mNoBigM = new Model("NativeIndicatorBypassBigM");
      const b2 = mNoBigM.binary("b2");
      const x2 = mNoBigM.integer("x2", { lb: 0, ub: 1_000_000_000 });
      mNoBigM.indicator(b2, expr`${x2} <= 10`, { activeValue: 1, name: "huge_ind" });
      mNoBigM.constraint(expr`${b2} == 0`);
      mNoBigM.objective(maximize(x2));

      for (const solver of ["highs", "pumpkin", "z3"] as const) {
        const status = await mNoBigM.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        expect(x2.value).toBe(1_000_000_000);
        expect(mNoBigM.validateSolution().valid).toBe(true);
      }
    });

    it("attributes unsatCore on Pumpkin and Z3 for m.indicator() and respects post-mutation invalidation", async () => {
      const m = new Model("IndicatorConflict");
      const b = m.binary("b");
      const x = m.integer("x", { lb: 0, ub: 100 });
      const rows = m.indicator(b, expr`${x} <= 10`, { activeValue: 1, name: "ind_cap" });
      m.constraint(expr`${b} == 1`, "force_b");
      m.constraint(expr`${x} >= 20`, "min_x");

      for (const solver of ["pumpkin", "z3"] as const) {
        const res = await m.check({ solver });
        expect(res.status, `solver=${solver}`).toBe("Unsat");
        expect(res.conflicts).toEqual(expect.arrayContaining(["ind_cap", "force_b", "min_x"]));
      }

      // Mutating the returned Constraint row directly clears indicator origin metadata so subsequent edits take effect honestly
      const mMut = new Model("IndicatorRowMutation");
      const bm = mMut.binary("bm");
      const xm = mMut.integer("xm", { lb: 0, ub: 10 });
      const [indRow] = mMut.indicator(bm, expr`${xm} <= 5`, { activeValue: 1, name: "mut_ind" });
      // Original Big-M row: xm + 5 bm <= 10; relax RHS to 20 after mutating
      indRow.rhs = 20;
      mMut.constraint(expr`${bm} == 1`);
      mMut.objective(maximize(xm));
      // Must reach xm = 10 on Pumpkin too (if stale _indicatorOrigin weren't cleared, Pumpkin would still enforce xm <= 5!)
      for (const solver of ["highs", "pumpkin", "z3"] as const) {
        const status = await mMut.solve({ solver });
        expect(status, `solver=${solver}`).toBe("Optimal");
        expect(xm.value).toBe(10);
      }

      // Mutating indicator binVar to non-binary after m.indicator() must fail validateIntegrity()
      const mBinMut = new Model("IndicatorBinMutate");
      const bb = mBinMut.binary("bb");
      const xb = mBinMut.integer("xb", { lb: 0, ub: 10 });
      mBinMut.indicator(bb, expr`${xb} <= 5`, { name: "ind_bin_mut" });
      bb.type = "Continuous";
      expect(() => mBinMut.validateIntegrity()).toThrow(/Binary|Continuous|invalid type/i);
    });
  });

  describe("Codex review regressions (#266)", () => {
    it("rejects unsafe cumulative time bounds (1e20 and task end overflow near MAX_SAFE_INTEGER) without hanging", async () => {
      const m = new Model("UnsafeCumulative1e20");
      const s = m.integer("s", { lb: 1e20, ub: 1e20 });
      m.constraint(cumulative([{ start: s, duration: 1, demand: 1 }], 1), "cum_huge");
      await expect(m.solve({ solver: "highs" })).rejects.toThrow(/safe integer/i);
      await expect(m.check({ solver: "highs" })).rejects.toThrow(/safe integer/i);
      expect(() =>
        linearizeModelForMip(m.variables, m.boolVars, m.constraints, m.logicalConstraints)
      ).toThrow(/safe integer/i);

      const mEnd = new Model("UnsafeCumulativeEnd");
      const sEnd = mEnd.integer("sEnd", {
        lb: Number.MAX_SAFE_INTEGER - 1,
        ub: Number.MAX_SAFE_INTEGER - 1,
      });
      mEnd.constraint(cumulative([{ start: sEnd, duration: 5, demand: 1 }], 1), "cum_end_ovf");
      expect(() =>
        linearizeModelForMip(mEnd.variables, mEnd.boolVars, mEnd.constraints, mEnd.logicalConstraints)
      ).toThrow(/safe integer/i);
    });

    it("rounds fractional Integer bounds cleanly in cumulative and detects empty integer intervals", async () => {
      for (const sense of ["min", "max"] as const) {
        const mFrac = new Model(`FracCum_${sense}`);
        const x = mFrac.integer("x", { lb: 0.5, ub: 2.5 });
        mFrac.constraint(cumulative([{ start: x, duration: 1, demand: 1 }], 1), "cum_frac");
        mFrac.objective(sense === "min" ? minimize(x) : maximize(x));

        for (const solver of ["highs", "z3"] as const) {
          const status = await mFrac.solve({ solver });
          expect(status, `sense=${sense}, solver=${solver}`).toBe("Optimal");
          expect(x.value, `sense=${sense}, solver=${solver}`).toBe(sense === "min" ? 1 : 2);
          expect(mFrac.validateSolution().valid).toBe(true);
        }
      }

      // Empty integer interval [0.5, 0.8] -> Infeasible / Unsat
      for (const negated of [false, true]) {
        const mEmpty = new Model(`EmptyIntCum_${negated}`);
        const y = mEmpty.integer("y", { lb: 0.5, ub: 0.8 });
        const gc = cumulative([{ start: y, duration: 1, demand: 1 }], 1);
        mEmpty.constraint(negated ? not(gc) : gc, "cum_empty");
        expect(await mEmpty.solve({ solver: "highs" })).toBe("Infeasible");
        expect((await mEmpty.check({ solver: "highs" })).status).toBe("Unsat");
        expect((await mEmpty.check({ solver: "z3" })).status).toBe("Unsat");
      }
    });

    it("enforces at() element domain guards even inside constant-simplifying globals", async () => {
      const scenarios: Array<(i: Var) => BoolExpr> = [
        (i) => distinct([at([10], i)]),
        (i) => not(distinct([at([10], i)])),
        (i) => not(allowed([at([10], i)], [])),
        (i) => cumulative([{ start: at([10], i), duration: 0, demand: 1 }], 1),
        (i) => not(cumulative([{ start: at([10], i), duration: 2, demand: 5 }], 1)),
      ];

      for (let idxCase = 0; idxCase < scenarios.length; idxCase++) {
        const m = new Model(`GlobalAtGuard_${idxCase}`);
        const i = m.integer("i", { lb: 1, ub: 1 });
        m.constraint(scenarios[idxCase](i), `c_${idxCase}`);
        for (const solver of ["highs", "pumpkin", "z3"] as const) {
          const res = await m.check({ solver });
          expect(res.status, `case=${idxCase}, solver=${solver}`).toBe("Unsat");
        }
      }
    });

    it("invalidates indicator metadata on in-place row.lhs edits (setTerm, terms Map, constant) and post-registration bound widening", async () => {
      // 1. row.lhs.setTerm(x, 2)
      const m1 = new Model("InPlaceSetTerm");
      const b1 = m1.binary("b");
      const x1 = m1.integer("x", { lb: 0, ub: 10 });
      const [row1] = m1.indicator(b1, x1.le(5));
      row1.lhs.setTerm(x1, 2);
      m1.constraint(b1.eq(1));
      m1.objective(maximize(x1));
      for (const solver of ["highs", "glpk", "pumpkin", "z3"] as const) {
        const status = await m1.solve({ solver });
        expect(status, `setTerm solver=${solver}`).toBe("Optimal");
        expect(x1.value, `setTerm solver=${solver}`).toBe(2);
        expect(m1.validateSolution().valid, `setTerm solver=${solver}`).toBe(true);
      }

      // 2. row.lhs.terms.set(x, 3) direct Map mutation
      const m2 = new Model("InPlaceTermsMapSet");
      const b2 = m2.binary("b");
      const x2 = m2.integer("x", { lb: 0, ub: 10 });
      const [row2] = m2.indicator(b2, x2.le(5));
      row2.lhs.terms.set(x2, 3);
      m2.constraint(b2.eq(1));
      m2.objective(maximize(x2));
      for (const solver of ["highs", "pumpkin", "z3"] as const) {
        const status = await m2.solve({ solver });
        expect(status, `terms.set solver=${solver}`).toBe("Optimal");
        expect(x2.value, `terms.set solver=${solver}`).toBe(1);
        expect(m2.validateSolution().valid, `terms.set solver=${solver}`).toBe(true);
      }

      // 3. row.lhs.constant = 3 direct constant edit
      const m3 = new Model("InPlaceConstantEdit");
      const b3 = m3.binary("b");
      const x3 = m3.integer("x", { lb: 0, ub: 10 });
      const [row3] = m3.indicator(b3, x3.le(5));
      row3.lhs.constant = 3;
      expect(row3._indicatorMeta).toBeUndefined();
      m3.constraint(b3.eq(1));
      m3.objective(maximize(x3));
      for (const solver of ["pumpkin", "z3"] as const) {
        const status = await m3.solve({ solver });
        expect(status, `constant solver=${solver}`).toBe("Optimal");
        expect(x3.value, `constant solver=${solver}`).toBe(2);
        expect(m3.validateSolution().valid, `constant solver=${solver}`).toBe(true);
      }

      // 4. Widening x.ub after m.indicator() invalidates stale derivedM metadata
      const m4 = new Model("BoundWideningAfterIndicator");
      const b4 = m4.binary("b");
      const x4 = m4.integer("x", { lb: 0, ub: 10 });
      m4.indicator(b4, x4.le(5));
      x4.ub = 20;
      m4.constraint(b4.eq(0));
      m4.objective(maximize(x4));
      for (const solver of ["highs", "pumpkin", "z3"] as const) {
        const status = await m4.solve({ solver });
        expect(status, `bound widening solver=${solver}`).toBe("Optimal");
        expect(x4.value, `bound widening solver=${solver}`).toBe(10);
        expect(m4.validateSolution().valid, `bound widening solver=${solver}`).toBe(true);
      }
    });
  });
});
