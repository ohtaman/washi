import { describe, it, expect } from "vitest";
import { Model, Var, BoolVar, Constraint, expr, c, maximize } from "../src/index.js";

function buildCanonicalModel(modelName: string): Model {
  const m = new Model({ name: modelName });
  const x = m.continuous(2, { lb: 0, ub: 10 }); // x_0, x_1
  const singleVar = m.integer({ lb: 0, ub: 5 }); // x_2
  const b = m.binary(); // x_3
  const p = m.bool(); // p_0
  const flags = m.bool(2); // p_1, p_2

  m.objective(maximize(expr`3 * ${x[0]} + 2 * ${x[1]} + ${singleVar} + ${x[0]} * ${x[1]}`));

  // Unnamed arithmetic constraints -> c_1, c_2
  m.constraint(c`${x[0]} + ${x[1]} <= 12`);
  m.constraint(c`${singleVar} <= 4`);

  // Unnamed string constraint -> c_3
  m.constraint("x_0 - x_1 <= 3");

  // Unnamed indicator constraint -> ind_x_3_c_4
  m.indicator(b, c`${x[0]} <= 5`);

  // Unnamed logical constraints -> lc_1, lc_2
  m.constraint(p.implies(flags[0]));
  m.constraint(flags[0].or(flags[1]));

  return m;
}

describe("Model-scoped Auto-Generated Variable and Constraint Names (Issue #52)", () => {
  it("produces identical auto-generated names and LP exports across models regardless of prior process history", () => {
    const m1 = buildCanonicalModel("DeterministicModel");

    // Pollute process-level counters with another large model and standalone objects
    const noiseModel = new Model("NoiseModel");
    noiseModel.continuous(25, { lb: 0, ub: 100 });
    noiseModel.binary(15);
    noiseModel.bool(10);
    for (let i = 0; i < 20; i++) {
      noiseModel.constraint(c`${noiseModel.vars[i]} <= ${i + 1}`);
    }
    for (let i = 0; i < 5; i++) {
      noiseModel.constraint(noiseModel.boolVars[i].not());
    }
    // Also instantiate standalone objects outside any model
    for (let i = 0; i < 10; i++) {
      const standaloneVar = new Var();
      const standaloneBool = new BoolVar();
      const standaloneConstr = standaloneVar.le(10);
      expect(standaloneVar.id).toBeGreaterThan(0);
      expect(standaloneBool.id).toBeGreaterThan(0);
      expect(standaloneConstr.id).toBeGreaterThan(0);
    }

    const m2 = buildCanonicalModel("DeterministicModel");

    expect(m2.vars.map((v) => v.name)).toEqual(["x_0", "x_1", "x_2", "x_3"]);
    expect(m1.vars.map((v) => v.name)).toEqual(m2.vars.map((v) => v.name));

    expect(m2.boolVars.map((bv) => bv.name)).toEqual(["p_0", "p_1", "p_2"]);
    expect(m1.boolVars.map((bv) => bv.name)).toEqual(m2.boolVars.map((bv) => bv.name));

    expect(m2.constrs.map((con) => con.name)).toEqual([
      "c_1",
      "c_2",
      "c_3",
      "ind_x_3_c_4",
    ]);
    expect(m1.constrs.map((con) => con.name)).toEqual(m2.constrs.map((con) => con.name));

    expect(m2.logicalConstraints.map((lc) => lc.name)).toEqual(["lc_1", "lc_2"]);
    expect(m1.logicalConstraints.map((lc) => lc.name)).toEqual(
      m2.logicalConstraints.map((lc) => lc.name)
    );

    expect(m1.toLpString()).toBe(m2.toLpString());
  });

  it("assigns model-scoped names when unnamed Var or Constraint instances are added via m.add()", () => {
    const m1 = new Model("AddModel1");
    const v1 = new Var({ lb: 0, ub: 10 });
    const v2 = new Var({ prefix: "y", lb: 0, ub: 10 });
    m1.add([v1, v2]);
    const c1 = new Constraint(expr`${v1} + ${v2}` as any, "<=", 15);
    m1.add(c1);

    // Build second identical model after intermediate allocations
    new Var();
    new Var({ prefix: "y" });
    const m2 = new Model("AddModel2");
    const u1 = new Var({ lb: 0, ub: 10 });
    const u2 = new Var({ prefix: "y", lb: 0, ub: 10 });
    m2.add([u1, u2]);
    const k1 = new Constraint(expr`${u1} + ${u2}` as any, "<=", 15);
    m2.add(k1);

    expect(v1.name).toBe("x_0");
    expect(v2.name).toBe("y_0");
    expect(c1.name).toBe("c_1");

    expect(u1.name).toBe("x_0");
    expect(u2.name).toBe("y_0");
    expect(k1.name).toBe("c_1");
    expect(m1.toLpString()).toBe(m2.toLpString());

    // Preserves Constraint.name assigned via property setter before insertion
    const preNamed = u1.le(8);
    preNamed.name = "custom_capacity";
    m2.constraint(preNamed);
    expect(preNamed.name).toBe("custom_capacity");
    expect(m2.getConstraintByName("custom_capacity")).toBe(preNamed);
  });

  it("increments auto-generated variable names across multiple batch and single calls within the same model", () => {
    const m = new Model("SequentialVarNaming");
    const batch1 = m.binary(2); // x_0, x_1
    const single = m.continuous(); // x_2
    const batch2 = m.integer(2); // x_3, x_4
    const customBatch1 = m.continuous(2, { prefix: "flow" }); // flow_0, flow_1
    const customSingle = m.continuous({ prefix: "flow" }); // flow_2

    expect(batch1.map((v) => v.name)).toEqual(["x_0", "x_1"]);
    expect(single.name).toBe("x_2");
    expect(batch2.map((v) => v.name)).toEqual(["x_3", "x_4"]);
    expect(customBatch1.map((v) => v.name)).toEqual(["flow_0", "flow_1"]);
    expect(customSingle.name).toBe("flow_2");
  });

  it("prevents collisions between explicit names and auto-generated names in both creation orders", () => {
    const m = new Model("NoCollisionModel");

    // 1. Explicit names registered BEFORE auto-generated names -> auto-generator skips reserved names
    const explicitX0 = m.continuous("x_0", { lb: 0, ub: 10 });
    const explicitX2 = m.continuous("x_2", { lb: 0, ub: 10 });
    const explicitP0 = m.bool("p_0");

    const autoX = m.continuous(2, { lb: 0, ub: 10 }); // should skip x_0 and x_2 -> x_1, x_3
    const autoP = m.bool(2); // should skip p_0 -> p_1, p_2

    expect(autoX.map((v) => v.name)).toEqual(["x_1", "x_3"]);
    expect(autoP.map((bv) => bv.name)).toEqual(["p_1", "p_2"]);

    // Explicit constraint names reserved before auto-generated constraints
    m.constraint(c`${explicitX0} <= 5`, "c_1");
    m.constraint(c`${explicitX2} <= 5`, "c_3");
    m.constraint(explicitP0.not(), "lc_1");

    // Auto-generated arithmetic constraints skip c_1 and c_3 -> c_2, c_4
    m.constraint(c`${autoX[0]} <= 8`);
    m.constraint(c`${autoX[1]} <= 9`);
    expect(m.constrs.map((con) => con.name)).toEqual(["c_1", "c_3", "c_2", "c_4"]);

    // Auto-generated logical constraint skips lc_1 -> lc_2
    m.constraint(autoP[0].or(autoP[1]));
    expect(m.logicalConstraints.map((lc) => lc.name)).toEqual(["lc_1", "lc_2"]);

    // 2. Explicit names registered AFTER auto-generated names -> rejected with clear error
    expect(() => m.continuous("x_1")).toThrow(/Variable with name 'x_1' already exists in model/);
    expect(() => m.bool("p_1")).toThrow(/Variable with name 'p_1' already exists in model/);
    expect(() => m.constraint(c`${explicitX0} >= 0`, "c_2")).toThrow(
      /Constraint with name 'c_2' already exists in model/
    );
    expect(() => m.constraint(explicitP0, "lc_2")).toThrow(
      /Constraint with name 'lc_2' already exists in model/
    );
  });

  it("orders quadratic cross-term factors deterministically by model registration order regardless of Var instantiation order", () => {
    // Instantiate vA then vB
    const vA1 = new Var({ name: "alpha", lb: 0, ub: 10 });
    const vB1 = new Var({ name: "beta", lb: 0, ub: 10 });
    const m1 = new Model("QuadOrder1");
    m1.add([vA1, vB1]);
    m1.objective(maximize(expr`${vA1} * ${vB1}`));

    // Instantiate vB then vA (reverse global Var.id order), but register in the same model order
    const vB2 = new Var({ name: "beta", lb: 0, ub: 10 });
    const vA2 = new Var({ name: "alpha", lb: 0, ub: 10 });
    const m2 = new Model("QuadOrder2");
    m2.add([vA2, vB2]);
    m2.objective(maximize(expr`${vA2} * ${vB2}`));

    expect(m1.toLpString()).toBe(m2.toLpString());
  });

  it("preserves options.name when positional name argument is undefined", () => {
    const m = new Model("OptionsNameTest");
    const demand = m.continuous(undefined, { name: "demand", lb: 0, ub: 50 });
    const count = m.integer(undefined, { name: "count", lb: 0, ub: 10 });
    const active = m.binary(undefined, { name: "active" });
    const flag = m.bool(undefined, { name: "flag" });

    expect(demand.name).toBe("demand");
    expect(count.name).toBe("count");
    expect(active.name).toBe("active");
    expect(flag.name).toBe("flag");
    expect(m.getVarByName("demand")).toBe(demand);
    expect(m.getVarByName("count")).toBe(count);
    expect(m.getVarByName("active")).toBe(active);
    expect(m.getBoolVarByName("flag")).toBe(flag);
  });

  it("does not advance indicator constraint counter when indicator derivation fails and prevents cross-model Var renaming", () => {
    // Failed indicator derivation does not advance c counter
    const mInd = new Model("IndicatorRetry");
    const uInd = mInd.continuous("u", { lb: 0 }); // unbounded ub
    const zInd = mInd.binary("z");
    expect(() => mInd.indicator(zInd, c`${uInd} <= 5`)).toThrow(/lacks a finite upper bound/i);
    uInd.ub = 20;
    const [indRow] = mInd.indicator(zInd, c`${uInd} <= 5`);
    expect(indRow.name).toBe("ind_z_c_1");

    // Adding an already-registered unnamed Var to a second model is rejected without renaming it
    const sharedVar = new Var({ lb: 0, ub: 10 });
    const mOwner = new Model("OwnerModel");
    mOwner.add(sharedVar);
    expect(sharedVar.name).toBe("x_0");
    expect(mOwner.getVarByName("x_0")).toBe(sharedVar);

    const mOther = new Model("OtherModel");
    mOther.continuous(); // consumes x_0 in OtherModel
    expect(() => mOther.add(sharedVar)).toThrow(/already belongs to model "OwnerModel"/i);
    expect(sharedVar.name).toBe("x_0");
    expect(mOwner.getVarByName("x_0")).toBe(sharedVar);
  });
});


