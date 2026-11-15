import { describe, it, expect, afterAll } from "vitest";
import {
  Model,
  Constraint,
  LinExpr,
  expr,
  minimize,
  maximize,
  and,
  or,
  not,
  implies,
  xor,
  linearizeModelForMip,
} from "../src/index.js";
import "../src/modeler/solvers/glpk/index.js";
import { registerZ3Solver, killZ3Threads } from "../src/modeler/solvers/z3.js";

registerZ3Solver();

afterAll(async () => {
  await killZ3Threads();
});

describe("Issue #221: MIP linearization of implies() with general inequality/equality antecedents", () => {
  it("enforces contrapositive for <= integer antecedent across HiGHS, GLPK, and Z3 (check & solve)", async () => {
    for (const solver of ["highs", "glpk", "z3"] as const) {
      // 1. Exact reproduction from Issue #221: lux <= 10 & (lux <= 50 => isNight) & !isNight => Unsat
      const mUnsat = new Model({ name: `ImpliesLeUnsat_${solver}`, solver });
      const lux = mUnsat.integer("lux", { lb: 0, ub: 1000 });
      const isNight = mUnsat.bool("isNight");

      mUnsat.constraint(lux.le(50).implies(isNight), "dark_implies_night");
      mUnsat.constraint(expr`${lux} <= 10`, "sensor_dark");
      mUnsat.constraint(isNight.not(), "force_day");

      const checkRes = await mUnsat.check();
      expect(checkRes.status, `Expected Unsat on ${solver}`).toBe("Unsat");
      expect(checkRes.conflicts).toBeDefined();
      expect(checkRes.conflicts!.length).toBeGreaterThan(0);
      for (const name of checkRes.conflicts!) {
        expect(["dark_implies_night", "sensor_dark", "force_day"]).toContain(name);
      }

      expect(await mUnsat.solve()).toBe("Infeasible");

      // 2. When consequent is forced false (!isNight), minimizing lux must yield exact boundary lux = 51
      const mBoundary = new Model({ name: `ImpliesLeBoundary_${solver}`, solver });
      const luxB = mBoundary.integer("lux", { lb: 0, ub: 1000 });
      const isNightB = mBoundary.bool("isNight");

      mBoundary.constraint(expr`${luxB} <= 50`.implies(isNightB), "dark_implies_night");
      mBoundary.constraint(not(isNightB), "force_day");
      mBoundary.objective(minimize(luxB));

      expect(await mBoundary.solve()).toBe("Optimal");
      expect(luxB.value).toBe(51);
      expect(isNightB.value).toBe(false);
      expect(mBoundary.validateSolution().valid).toBe(true);

      // 3. At exact boundary lux == 50, isNight must be forced true even when minimizing an activated cost
      const mAt50 = new Model({ name: `ImpliesLeAt50_${solver}`, solver });
      const lux50 = mAt50.integer("lux", { lb: 0, ub: 1000 });
      const isNight50 = mAt50.bool("isNight");
      const lampOn = mAt50.binary("lampOn");

      mAt50.constraint(expr`${lux50} <= 50`.implies(isNight50), "dark_implies_night");
      mAt50.constraint(isNight50.implies(expr`${lampOn} == 1`), "night_lamp");
      mAt50.constraint(expr`${lux50} == 50`, "at_50");
      mAt50.objective(minimize(lampOn));

      expect(await mAt50.solve()).toBe("Optimal");
      expect(isNight50.value).toBe(true);
      expect(lampOn.value).toBe(1);
      expect(mAt50.validateSolution().valid).toBe(true);

      // 4. Open-world one-way check: at lux == 51, isNight == true is also feasible (not iff)
      const mOpenWorld = new Model({ name: `ImpliesLeOpenWorld_${solver}`, solver });
      const luxOw = mOpenWorld.integer("lux", { lb: 0, ub: 1000 });
      const isNightOw = mOpenWorld.bool("isNight");
      mOpenWorld.constraint(expr`${luxOw} <= 50`.implies(isNightOw), "dark_implies_night");
      mOpenWorld.constraint(expr`${luxOw} == 51`, "at_51");
      mOpenWorld.constraint(isNightOw, "override_night");

      expect((await mOpenWorld.check()).status).toBe("Sat");
      expect(luxOw.value).toBe(51);
      expect(isNightOw.value).toBe(true);
      expect(mOpenWorld.validateSolution().valid).toBe(true);
    }
  });

  it("enforces contrapositive for >= integer antecedent, multi-term expressions, constant offsets, and one-sided bounds", async () => {
    for (const solver of ["highs", "glpk", "z3"] as const) {
      // 1. (clearance >= 4) => hasMfa; with !hasMfa and maximize(clearance), max clearance is 3
      const mGe = new Model({ name: `ImpliesGe_${solver}`, solver });
      const clearance = mGe.integer("clearance", { lb: 0, ub: 5 });
      const hasMfa = mGe.bool("hasMfa");

      mGe.constraint(implies(expr`${clearance} >= 4`, hasMfa), "mfa_policy");
      mGe.constraint(not(hasMfa), "no_mfa");
      mGe.objective(maximize(clearance));

      expect(await mGe.solve()).toBe("Optimal");
      expect(clearance.value).toBe(3);
      expect(hasMfa.value).toBe(false);
      expect(mGe.validateSolution().valid).toBe(true);

      // 2. Multi-variable antecedent with negative coefficient and non-zero lhs.constant:
      //    2*a - 3*b + 5 <= 10  (i.e. 2*a - 3*b <= 5) => flag
      const mMulti = new Model({ name: `ImpliesMulti_${solver}`, solver });
      const a = mMulti.integer("a", { lb: 0, ub: 10 });
      const b = mMulti.integer("b", { lb: 0, ub: 10 });
      const flag = mMulti.bool("flag");
      const rawAntecedent = new Constraint(
        new LinExpr(
          new Map([
            [a, 2],
            [b, -3],
          ]),
          5
        ),
        "<=",
        10,
        "shifted_le"
      );

      mMulti.constraint(rawAntecedent.implies(flag), "multi_imp");
      mMulti.constraint(not(flag), "no_flag");
      mMulti.objective(minimize(expr`2 * ${a} - 3 * ${b}`));

      expect(await mMulti.solve()).toBe("Optimal");
      expect(mMulti.objectiveValue).toBe(6);
      expect(mMulti.validateSolution().valid).toBe(true);
    }

    // 3. One-sided bounded integer antecedent on HiGHS & GLPK: (x <= 5) => (y >= 10) with x, y in [0, Infinity)
    for (const solver of ["highs", "glpk"] as const) {
      const mOneSided = new Model({ name: `OneSided_${solver}`, solver });
      const x = mOneSided.integer("x", { lb: 0 });
      const y = mOneSided.integer("y", { lb: 0 });

      mOneSided.constraint(x.le(5).implies(y.ge(10)), "one_sided_imp");
      mOneSided.constraint(expr`${y} == 4`, "small_y");
      mOneSided.objective(minimize(x));

      expect(await mOneSided.solve()).toBe("Optimal");
      expect(x.value).toBe(6);
      expect(y.value).toBe(4);
      expect(mOneSided.validateSolution().valid).toBe(true);
    }
  });

  it("enforces contrapositive for == integer antecedent across HiGHS, GLPK, and Z3", async () => {
    for (const solver of ["highs", "glpk", "z3"] as const) {
      // 1. pin == 5 & (pin == 5 => unlocked) & !unlocked => Unsat
      const mEqUnsat = new Model({ name: `ImpliesEqUnsat_${solver}`, solver });
      const pin = mEqUnsat.integer("pin", { lb: 0, ub: 9 });
      const unlocked = mEqUnsat.bool("unlocked");

      mEqUnsat.constraint(expr`${pin} == 5`.implies(unlocked), "pin_unlock");
      mEqUnsat.constraint(expr`${pin} == 5`, "entered_5");
      mEqUnsat.constraint(not(unlocked), "locked");
      expect((await mEqUnsat.check()).status).toBe("Unsat");

      // 2. With !unlocked and pin >= 5, minimizing pin skips 5 and selects 6
      const mAbove = new Model({ name: `ImpliesEqAbove_${solver}`, solver });
      const pinA = mAbove.integer("pin", { lb: 0, ub: 9 });
      const unlockedA = mAbove.bool("unlocked");
      mAbove.constraint(expr`${pinA} == 5`.implies(unlockedA), "pin_unlock");
      mAbove.constraint(not(unlockedA), "locked");
      mAbove.constraint(expr`${pinA} >= 5`, "at_least_5");
      mAbove.objective(minimize(pinA));

      expect(await mAbove.solve()).toBe("Optimal");
      expect(pinA.value).toBe(6);
      expect(mAbove.validateSolution().valid).toBe(true);

      // 3. With !unlocked and pin <= 5, maximizing pin skips 5 and selects 4
      const mBelow = new Model({ name: `ImpliesEqBelow_${solver}`, solver });
      const pinB = mBelow.integer("pin", { lb: 0, ub: 9 });
      const unlockedB = mBelow.bool("unlocked");
      mBelow.constraint(expr`${pinB} == 5`.implies(unlockedB), "pin_unlock");
      mBelow.constraint(not(unlockedB), "locked");
      mBelow.constraint(expr`${pinB} <= 5`, "at_most_5");
      mBelow.objective(maximize(pinB));

      expect(await mBelow.solve()).toBe("Optimal");
      expect(pinB.value).toBe(4);
      expect(mBelow.validateSolution().valid).toBe(true);

      // 4. Direct binary antecedent where consequent also references the binary variable
      const mSelfRef = new Model({ name: `ImpliesBinSelfRef_${solver}`, solver });
      const b = mSelfRef.binary("b");
      const x = mSelfRef.continuous("x", { lb: 0, ub: 10 });
      mSelfRef.constraint(b.eq(1));
      mSelfRef.constraint(b.eq(1).implies(expr`${b} + ${x} >= 5`), "self_ref_imp");
      mSelfRef.objective(minimize(x));

      expect(await mSelfRef.solve()).toBe("Optimal");
      expect(b.value).toBe(1);
      expect(x.value).toBeCloseTo(4, 5);
      expect(mSelfRef.validateSolution().valid).toBe(true);
    }

    // 5. Boundary equality on one-sided bounded integer [0, +Infinity): (x == 0) => flag
    for (const solver of ["highs", "glpk"] as const) {
      const mOneSidedEq = new Model({ name: `ImpliesOneSidedEq_${solver}`, solver });
      const x = mOneSidedEq.integer("x", { lb: 0 });
      const flag = mOneSidedEq.bool("flag");
      mOneSidedEq.constraint(x.eq(0).implies(flag), "zero_implies_flag");
      mOneSidedEq.constraint(not(flag), "no_flag");
      mOneSidedEq.objective(minimize(x));

      expect(await mOneSidedEq.solve()).toBe("Optimal");
      expect(x.value).toBe(1);
      expect(flag.value).toBe(false);
      expect(mOneSidedEq.validateSolution().valid).toBe(true);
    }

    // 6. Direct binary antecedent to BoolVar / not(BoolVar) emits zero extra auxiliary variables
    const mDirectBin = new Model({ solver: "highs" });
    const b1 = mDirectBin.binary("b1");
    const b0 = mDirectBin.binary("b0");
    const f1 = mDirectBin.bool("f1");
    const f0 = mDirectBin.bool("f0");
    const fn1 = mDirectBin.bool("fn1");
    const fn0 = mDirectBin.bool("fn0");
    const linDirect = linearizeModelForMip(
      mDirectBin.variables,
      mDirectBin.boolVars,
      mDirectBin.constraints,
      [
        { name: "b1_f1", expr: b1.eq(1).implies(f1) },
        { name: "b0_f0", expr: b0.eq(0).implies(f0) },
        { name: "b1_not_fn1", expr: b1.eq(1).implies(not(fn1)) },
        { name: "b0_not_fn0", expr: b0.eq(0).implies(not(fn0)) },
      ]
    );
    expect(linDirect.variables).toHaveLength(6); // b1, b0, f1, f0, fn1, fn0 only (zero aux vars)
    mDirectBin.constraint(b1.eq(1).implies(f1), "b1_f1");
    mDirectBin.constraint(b0.eq(0).implies(f0), "b0_f0");
    mDirectBin.constraint(b1.eq(1).implies(not(fn1)), "b1_not_fn1");
    mDirectBin.constraint(b0.eq(0).implies(not(fn0)), "b0_not_fn0");
    mDirectBin.constraint(b1.eq(1));
    mDirectBin.constraint(b0.eq(0));
    expect((await mDirectBin.check()).status).toBe("Sat");
    expect(f1.value).toBe(true);
    expect(f0.value).toBe(true);
    expect(fn1.value).toBe(false);
    expect(fn0.value).toBe(false);
  });

  it("linearizes integer comparison constraints in not(), xor(), and negated consequents across HiGHS, GLPK, and Z3", async () => {
    for (const solver of ["highs", "glpk", "z3"] as const) {
      // 1. Top-level not(x <= 50) -> x >= 51 (works even on one-sided integer x in [0, Infinity) on MIP)
      const mNotLe = new Model({ name: `NotLe_${solver}`, solver });
      const x = mNotLe.integer("x", { lb: 0, ub: solver === "z3" ? 1000 : Infinity });
      mNotLe.constraint(not(expr`${x} <= 50`), "not_le_50");
      mNotLe.objective(minimize(x));
      expect(await mNotLe.solve()).toBe("Optimal");
      expect(x.value).toBe(51);
      expect(mNotLe.validateSolution().valid).toBe(true);

      // 2. Top-level not(pin == 5) with pin >= 5 -> minimize(pin) == 6
      const mNotEq = new Model({ name: `NotEq_${solver}`, solver });
      const pin = mNotEq.integer("pin", { lb: 0, ub: 9 });
      mNotEq.constraint(not(expr`${pin} == 5`), "not_eq_5");
      mNotEq.constraint(expr`${pin} >= 5`, "at_least_5");
      mNotEq.objective(minimize(pin));
      expect(await mNotEq.solve()).toBe("Optimal");
      expect(pin.value).toBe(6);
      expect(mNotEq.validateSolution().valid).toBe(true);

      // 3. De Morgan: not(and(flag, y == 0)) with flag == true and one-sided y in [0, Infinity) -> minimize(y) == 1
      const mDeMorgan = new Model({ name: `DeMorgan_${solver}`, solver });
      const y = mDeMorgan.integer("y", { lb: 0, ub: solver === "z3" ? 100 : Infinity });
      const flag = mDeMorgan.bool("flag");
      mDeMorgan.constraint(flag, "flag_on");
      mDeMorgan.constraint(not(flag.and(y.eq(0))), "not_flag_and_zero");
      mDeMorgan.objective(minimize(y));
      expect(await mDeMorgan.solve()).toBe("Optimal");
      expect(y.value).toBe(1);
      expect(mDeMorgan.validateSolution().valid).toBe(true);

      // 4. Negated consequent: implies(vip, not(fee >= 10)) with vip == true -> maximize(fee) == 9
      const mImpNot = new Model({ name: `ImpNot_${solver}`, solver });
      const vip = mImpNot.bool("vip");
      const fee = mImpNot.integer("fee", { lb: 0, ub: 100 });
      mImpNot.constraint(vip, "is_vip");
      mImpNot.constraint(implies(vip, not(expr`${fee} >= 10`)), "vip_fee_cap");
      mImpNot.objective(maximize(fee));
      expect(await mImpNot.solve()).toBe("Optimal");
      expect(fee.value).toBe(9);
      expect(mImpNot.validateSolution().valid).toBe(true);

      // 5. xor(flag, lux <= 50): when flag == true, lux <= 50 must be false (min lux == 51);
      //    when flag == false, lux <= 50 must be true (max lux == 50)
      const mXorTrue = new Model({ name: `XorTrue_${solver}`, solver });
      const fT = mXorTrue.bool("flag");
      const luxT = mXorTrue.integer("lux", { lb: 0, ub: 1000 });
      mXorTrue.constraint(fT, "flag_true");
      mXorTrue.constraint(xor(fT, expr`${luxT} <= 50`), "xor_rule");
      mXorTrue.objective(minimize(luxT));
      expect(await mXorTrue.solve()).toBe("Optimal");
      expect(luxT.value).toBe(51);
      expect(mXorTrue.validateSolution().valid).toBe(true);

      const mXorFalse = new Model({ name: `XorFalse_${solver}`, solver });
      const fF = mXorFalse.bool("flag");
      const luxF = mXorFalse.integer("lux", { lb: 0, ub: 1000 });
      mXorFalse.constraint(not(fF), "flag_false");
      mXorFalse.constraint(xor(fF, expr`${luxF} <= 50`), "xor_rule");
      mXorFalse.objective(maximize(luxF));
      expect(await mXorFalse.solve()).toBe("Optimal");
      expect(luxF.value).toBe(50);
      expect(mXorFalse.validateSolution().valid).toBe(true);

      // 6. not(implies(x + 5 <= 10, flag)) <=> (x <= 5) AND !flag
      const mNotImp = new Model({ name: `NotImp_${solver}`, solver });
      const xImp = mNotImp.integer("x", { lb: 0, ub: 20 });
      const fImp = mNotImp.bool("flag");
      const shiftedLe = new Constraint(new LinExpr(new Map([[xImp, 1]]), 5), "<=", 10, "shifted");
      mNotImp.constraint(not(implies(shiftedLe, fImp)), "not_imp");
      mNotImp.objective(maximize(xImp));
      expect(await mNotImp.solve()).toBe("Optimal");
      expect(xImp.value).toBe(5);
      expect(fImp.value).toBe(false);
      expect(mNotImp.validateSolution().valid).toBe(true);
    }
  });

  it("supports compound antecedents with integer constraints and constant-only antecedents on HiGHS and GLPK", async () => {
    for (const solver of ["highs", "glpk"] as const) {
      const mComp = new Model({ name: `CompoundAnte_${solver}`, solver });
      const armed = mComp.bool("armed");
      const lux = mComp.integer("lux", { lb: 0, ub: 1000 });
      const siren = mComp.bool("siren");

      mComp.constraint(and(armed, expr`${lux} <= 50`).implies(siren), "intrusion_rule");
      mComp.constraint(armed, "is_armed");
      mComp.constraint(expr`${lux} <= 20`, "is_dark");
      mComp.constraint(not(siren), "siren_off");

      const compRes = await mComp.check();
      expect(compRes.status).toBe("Unsat");

      // Constant-only antecedents: (3 <= 5) => flagTrue, and (10 <= 5) => flagFree
      const mConst = new Model({ name: `ConstAnte_${solver}`, solver });
      const flagTrue = mConst.bool("flagTrue");
      const flagFree = mConst.bool("flagFree");
      const alwaysTrueC = new Constraint(new LinExpr(new Map(), 3), "<=", 5, "const_true");
      const alwaysFalseC = new Constraint(new LinExpr(new Map(), 10), "<=", 5, "const_false");
      mConst.constraint(and(alwaysTrueC, flagTrue.or(alwaysTrueC)).implies(flagTrue), "true_imp");
      mConst.constraint(alwaysFalseC.implies(flagFree), "false_imp");
      mConst.constraint(not(flagFree), "keep_free_false");

      expect((await mConst.check()).status).toBe("Sat");
      expect(flagTrue.value).toBe(true);
      expect(flagFree.value).toBe(false);
      expect(mConst.validateSolution().valid).toBe(true);
    }
  });

  it("throws a clear error with Z3 / or(expr`... + eps`) / m.bool() guidance for continuous or non-integer negated constraints on MIP backends", async () => {
    const createContinuousAntecedentModel = (solver: string) => {
      const m = new Model({ name: `ContAnte_${solver}`, solver });
      const temp = m.continuous("temp", { lb: 0, ub: 100 });
      const alarm = m.bool("alarm");
      m.constraint(expr`${temp} <= 50`.implies(alarm), "cold_alarm");
      m.constraint(expr`${temp} <= 20`, "freezing");
      m.constraint(not(alarm), "alarm_muted");
      return m;
    };

    for (const mipSolver of ["highs", "glpk"] as const) {
      const mMip = createContinuousAntecedentModel(mipSolver);
      await expect(mMip.check()).rejects.toThrow(/Continuous.*temp|temp.*Continuous/i);
      await expect(mMip.check()).rejects.toThrow(/solver:\s*"z3"/i);
      await expect(mMip.check()).rejects.toThrow(/or\(expr`/);
      await expect(mMip.check()).rejects.toThrow(/m\.bool\(\)/);
      await expect(mMip.solve()).rejects.toThrow(/Continuous.*temp|temp.*Continuous/i);

      // Negated continuous constraint in not() and xor() also throws with the same guidance
      const mNotCont = new Model({ solver: mipSolver });
      const tNot = mNotCont.continuous("temp", { lb: 0, ub: 100 });
      mNotCont.constraint(not(expr`${tNot} <= 50`), "not_cold");
      await expect(mNotCont.solve()).rejects.toThrow(/or\(expr`/);

      const mXorCont = new Model({ solver: mipSolver });
      const tXor = mXorCont.continuous("temp", { lb: 0, ub: 100 });
      const fXor = mXorCont.bool("flag");
      mXorCont.constraint(xor(fXor, expr`${tXor} <= 50`), "xor_cold");
      await expect(mXorCont.check()).rejects.toThrow(/or\(expr`/);

      // Explicit closed-tolerance rewrite or(expr`temp >= 50 + eps`, alarm) succeeds on MIP
      const mExplicit = new Model({ solver: mipSolver });
      const tExp = mExplicit.continuous("temp", { lb: 0, ub: 100 });
      const aExp = mExplicit.bool("alarm");
      const eps = 0.5;
      mExplicit.constraint(or(expr`${tExp} >= ${50 + eps}`, aExp), "cold_alarm_eps");
      mExplicit.constraint(not(aExp), "alarm_muted");
      mExplicit.objective(minimize(tExp));
      expect(await mExplicit.solve()).toBe("Optimal");
      expect(tExp.value).toBeCloseTo(50.5, 5);
      expect(mExplicit.validateSolution().valid).toBe(true);
    }

    expect((await createContinuousAntecedentModel("z3").check()).status).toBe("Unsat");

    const mFracCoeff = new Model({ solver: "highs" });
    const qty = mFracCoeff.integer("qty", { lb: 0, ub: 100 });
    const triggered = mFracCoeff.bool("triggered");
    mFracCoeff.constraint(expr`0.5 * ${qty} <= 10`.implies(triggered), "frac_coeff_rule");
    await expect(mFracCoeff.check()).rejects.toThrow(/integer coefficient/i);
    await expect(mFracCoeff.check()).rejects.toThrow(/or\(expr`/);
    await expect(mFracCoeff.check()).rejects.toThrow(/m\.bool\(\)/);

    const mFracRhs = new Model({ solver: "highs" });
    const count = mFracRhs.integer("count", { lb: 0, ub: 100 });
    const alert = mFracRhs.bool("alert");
    mFracRhs.constraint(expr`${count} <= 10.5`.implies(alert), "frac_rhs_rule");
    await expect(mFracRhs.check()).rejects.toThrow(/integer/i);
    await expect(mFracRhs.check()).rejects.toThrow(/or\(expr`/);
    await expect(mFracRhs.check()).rejects.toThrow(/m\.bool\(\)/);

    const mUnsafeInt = new Model({ solver: "highs" });
    const big = mUnsafeInt.integer("big", { lb: 0, ub: Number.MAX_SAFE_INTEGER });
    const bigFlag = mUnsafeInt.bool("bigFlag");
    expect(() =>
      linearizeModelForMip(
        mUnsafeInt.variables,
        mUnsafeInt.boolVars,
        mUnsafeInt.constraints,
        [{ name: "unsafe_rhs", expr: expr`${big} <= ${Number.MAX_SAFE_INTEGER}`.implies(bigFlag) }]
      )
    ).toThrow(/safe integer/i);
  });
});
