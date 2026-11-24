import { describe, it, expect, afterAll } from "vitest";
import { Model, not, xor, and, or, BoolOp } from "../src/index.js";
import "../src/modeler/solvers/glpk/index.js";
import { registerZ3Solver, killZ3Threads } from "../src/modeler/solvers/z3.js";

registerZ3Solver();

afterAll(async () => {
  await killZ3Threads();
});

const SOLVERS = ["highs", "glpk", "z3"] as const;

describe("Issue #257: MIP equivalence for nested implies(), duplicate boolean operands, and empty xor()", () => {
  it("1. enforces full equivalence for negated/nested implies(a, b): not(a.implies(b)) requires a=true, b=false", async () => {
    for (const solver of SOLVERS) {
      // 1a. not(b.implies(b)) is a contradiction -> Unsat / Infeasible
      const mTaut = new Model({ name: `NotImpliesSelf_${solver}`, solver });
      const b = mTaut.bool("b");
      mTaut.constraint(not(b.implies(b)), "not_tautology");

      expect((await mTaut.check()).status, `Expected Unsat on ${solver}`).toBe("Unsat");
      expect(await mTaut.solve(), `Expected Infeasible on ${solver}`).toBe("Infeasible");

      // 1b. not(a.implies(b)) must force a = true and b = false
      const mNegImp = new Model({ name: `NotImplies_${solver}`, solver });
      const a2 = mNegImp.bool("a");
      const b2 = mNegImp.bool("b");
      mNegImp.constraint(not(a2.implies(b2)), "neg_imp");

      expect((await mNegImp.check()).status, `Expected Sat on ${solver}`).toBe("Sat");
      expect(a2.value).toBe(true);
      expect(b2.value).toBe(false);
      expect(mNegImp.verify().valid).toBe(true);

      // 1c. not(a.implies(b)) with a = false must be Unsat
      const mForceAFalse = new Model({ name: `NotImpliesAFalse_${solver}`, solver });
      const a3 = mForceAFalse.bool("a");
      const b3 = mForceAFalse.bool("b");
      mForceAFalse.constraint(not(a3.implies(b3)), "neg_imp");
      mForceAFalse.constraint(not(a3), "force_a_false");

      expect((await mForceAFalse.check()).status, `Expected Unsat on ${solver}`).toBe("Unsat");
      expect(await mForceAFalse.solve(), `Expected Infeasible on ${solver}`).toBe("Infeasible");

      // 1d. not(a.implies(b)) with b = true must be Unsat
      const mForceBTrue = new Model({ name: `NotImpliesBTrue_${solver}`, solver });
      const a4 = mForceBTrue.bool("a");
      const b4 = mForceBTrue.bool("b");
      mForceBTrue.constraint(not(a4.implies(b4)), "neg_imp");
      mForceBTrue.constraint(b4, "force_b_true");

      expect((await mForceBTrue.check()).status, `Expected Unsat on ${solver}`).toBe("Unsat");
      expect(await mForceBTrue.solve(), `Expected Infeasible on ${solver}`).toBe("Infeasible");

      // 1e. Nested implies inside xor: xor(a.implies(b), true_var) requires !(a => b)
      const mXorImp = new Model({ name: `XorImplies_${solver}`, solver });
      const a5 = mXorImp.bool("a");
      const b5 = mXorImp.bool("b");
      const t5 = mXorImp.bool("t");
      mXorImp.constraint(t5, "force_t");
      mXorImp.constraint(xor(a5.implies(b5), t5), "xor_imp");

      expect((await mXorImp.check()).status, `Expected Sat on ${solver}`).toBe("Sat");
      expect(a5.value).toBe(true);
      expect(b5.value).toBe(false);
      expect(mXorImp.verify().valid).toBe(true);

      // 1f. Nested implies as antecedent of another implies: (a => b) => c with !a and !b must force c = true
      const mNestedAnte = new Model({ name: `NestedImpliesAnte_${solver}`, solver });
      const a6 = mNestedAnte.bool("a");
      const b6 = mNestedAnte.bool("b");
      const c6 = mNestedAnte.bool("c");
      mNestedAnte.constraint(a6.implies(b6).implies(c6), "nested_ante");
      mNestedAnte.constraint(not(a6), "force_not_a");
      mNestedAnte.constraint(not(b6), "force_not_b");
      mNestedAnte.constraint(not(c6), "force_not_c");

      expect((await mNestedAnte.check()).status, `Expected Unsat on ${solver}`).toBe("Unsat");
      expect(await mNestedAnte.solve(), `Expected Infeasible on ${solver}`).toBe("Infeasible");
    }
  });

  it("2. accumulates duplicate boolean operands in implies() and xor()", async () => {
    for (const solver of SOLVERS) {
      // 2a. (a => !a) && a is Unsat
      const mImp = new Model({ name: `DupImplies_${solver}`, solver });
      const a = mImp.bool("a");
      mImp.constraint(a.implies(not(a)), "a_imp_not_a");
      mImp.constraint(a, "force_a");

      expect((await mImp.check()).status, `Expected Unsat on ${solver}`).toBe("Unsat");
      expect(await mImp.solve(), `Expected Infeasible on ${solver}`).toBe("Infeasible");

      // 2b. (a => !a) without force_a is Sat with a = false
      const mImpSat = new Model({ name: `DupImpliesSat_${solver}`, solver });
      const aSat = mImpSat.bool("a");
      mImpSat.constraint(aSat.implies(not(aSat)), "a_imp_not_a");

      expect((await mImpSat.check()).status, `Expected Sat on ${solver}`).toBe("Sat");
      expect(aSat.value).toBe(false);
      expect(mImpSat.verify().valid).toBe(true);

      // 2c. xor(c, c) is Unsat
      const mXor = new Model({ name: `DupXor_${solver}`, solver });
      const c = mXor.bool("c");
      mXor.constraint(xor(c, c), "self_xor");

      expect((await mXor.check()).status, `Expected Unsat on ${solver}`).toBe("Unsat");
      expect(await mXor.solve(), `Expected Infeasible on ${solver}`).toBe("Infeasible");

      // 2d. or(d, d) with !d is Unsat, and and(d, d) with d is Sat
      const mOr = new Model({ name: `DupOr_${solver}`, solver });
      const d = mOr.bool("d");
      mOr.constraint(or(d, d), "dup_or");
      mOr.constraint(not(d), "not_d");

      expect((await mOr.check()).status, `Expected Unsat on ${solver}`).toBe("Unsat");
      expect(await mOr.solve(), `Expected Infeasible on ${solver}`).toBe("Infeasible");

      const mAnd = new Model({ name: `DupAnd_${solver}`, solver });
      const e = mAnd.bool("e");
      mAnd.constraint(and(e, e), "dup_and");
      expect((await mAnd.check()).status, `Expected Sat on ${solver}`).toBe("Sat");
      expect(e.value).toBe(true);
      expect(mAnd.verify().valid).toBe(true);
    }
  });

  it("3. handles empty BoolOp('xor', []) as Unsat / Infeasible", async () => {
    for (const solver of SOLVERS) {
      const mEmptyXor = new Model({ name: `EmptyXor_${solver}`, solver });
      mEmptyXor.constraint(new BoolOp("xor", []), "empty_xor");

      expect((await mEmptyXor.check()).status, `Expected Unsat on ${solver}`).toBe("Unsat");
      expect(await mEmptyXor.solve(), `Expected Infeasible on ${solver}`).toBe("Infeasible");
    }
  });
});
