import { describe, it, expect } from "vitest";
import {
  Model,
  Var,
  LinExpr,
  Constraint,
  QuadExpr,
  expr,
  maximize,
  minimize,
  sum,
  dot,
  and,
  or,
  not,
  implies,
  xor,
  parseExpr,
  parseConstraint,
} from "../src/index.js";

describe("Unified Tagged Template Literal Syntax (expr)", () => {
  it("parses linear expression with variables and numbers via expr`...`", () => {
    const m = new Model("TestModel");
    const x = m.continuous("x");
    const y = m.continuous("y");

    // expr`30 * ${x} + 40 * ${y} + 15`
    const e = expr`30 * ${x} + 40 * ${y} + 15` as LinExpr;

    expect(e.terms.get(x)).toBe(30);
    expect(e.terms.get(y)).toBe(40);
    expect(e.constant).toBe(15);
  });

  it("handles negative terms and subtractions in expr`...`", () => {
    const m = new Model("TestModel");
    const x = m.continuous("x");
    const y = m.continuous("y");

    // expr`${x} - 5 * ${y} - 20`
    const e = expr`${x} - 5 * ${y} - 20` as LinExpr;

    expect(e.terms.get(x)).toBe(1);
    expect(e.terms.get(y)).toBe(-5);
    expect(e.constant).toBe(-20);
  });

  it("parses inequality constraints via expr`... <= ...`", () => {
    const m = new Model("TestModel");
    const x = m.continuous("x");
    const y = m.continuous("y");

    // expr`${x} + 2 * ${y} <= 10`
    const constr = expr`${x} + 2 * ${y} <= 10` as Constraint;

    expect(constr).toBeInstanceOf(Constraint);
    expect(constr.sense).toBe("<=");
    expect(constr.rhs).toBe(10);
    expect(constr.lhs.terms.get(x)).toBe(1);
    expect(constr.lhs.terms.get(y)).toBe(2);
  });

  it("parses greater-than-or-equal constraints via expr`... >= ...`", () => {
    const m = new Model("TestModel");
    const x = m.continuous("x");
    const y = m.continuous("y");

    // expr`3 * ${x} - ${y} >= 5`
    const constr = expr`3 * ${x} - ${y} >= 5` as Constraint;

    expect(constr).toBeInstanceOf(Constraint);
    expect(constr.sense).toBe(">=");
    expect(constr.rhs).toBe(5);
    expect(constr.lhs.terms.get(x)).toBe(3);
    expect(constr.lhs.terms.get(y)).toBe(-1);
  });

  it("parses equality constraints with variables on both sides via expr`... == ...`", () => {
    const m = new Model("TestModel");
    const x = m.continuous("x");
    const y = m.continuous("y");

    // expr`${x} == 2 * ${y} + 4` => x - 2*y == 4
    const constr = expr`${x} == 2 * ${y} + 4` as Constraint;

    expect(constr).toBeInstanceOf(Constraint);
    expect(constr.sense).toBe("==");
    expect(constr.rhs).toBe(4);
    expect(constr.lhs.terms.get(x)).toBe(1);
    expect(constr.lhs.terms.get(y)).toBe(-2);
  });

  it("solves an optimization problem formulated cleanly using unified expr`...` without casts", async () => {
    const m = new Model("ProductionPlanningTTL");
    const chairs = m.integer("chairs", { lb: 0 });
    const tables = m.integer("tables", { lb: 0 });

    // Objective: Maximize profit 45 * chairs + 80 * tables (no casts required)
    m.objective(maximize(expr`45 * ${chairs} + 80 * ${tables}`));

    // Constraints via expr`...` (no casts required)
    m.constraint(expr`5 * ${chairs} + 20 * ${tables} <= 400`, "mahogany");
    m.constraint(expr`10 * ${chairs} + 15 * ${tables} <= 450`, "labor");

    const status = await m.solve();

    expect(status).toBe("Optimal");
    expect(chairs.value).toBe(24);
    expect(tables.value).toBe(14);
    expect(m.objectiveValue).toBe(45 * 24 + 80 * 14); // 2200
  });

  it("handles decimal floating-point coefficients correctly", () => {
    const m = new Model();
    const x = m.continuous("x");
    const y = m.continuous("y");

    const constr = expr`0.25 * ${x} + 1.75 * ${y} <= 12.5` as Constraint;
    expect(constr.lhs.terms.get(x)).toBeCloseTo(0.25);
    expect(constr.lhs.terms.get(y)).toBeCloseTo(1.75);
    expect(constr.rhs).toBeCloseTo(12.5);
  });

  it("throws clear error on malformed constraint expressions", () => {
    const m = new Model();
    const x = m.continuous("x");
    const xResolver = (name: string) => (name === "x" ? x : undefined);

    // Missing comparison operator in parseConstraint
    expect(() => parseConstraint("2 * x + 5", xResolver)).toThrow(
      /Constraint must contain a comparison operator/
    );
    // Strict inequality operators are rejected
    expect(() => expr`${x} < 10`).toThrow(
      /Unexpected token '<'/
    );
    expect(() => expr`${x} > 10`).toThrow(
      /Unexpected token '>'/
    );
  });

  it("supports quadratic expressions and rejects degree > 2 or quadratic constraints in expr", () => {
    const m = new Model();
    const x = m.continuous("x");
    const y = m.continuous("y");
    const z = m.continuous("z");

    const q = expr`${x} * ${y} + 2 * ${x} * ${x}`;
    expect(q).toBeInstanceOf(QuadExpr);
    if (q instanceof QuadExpr) {
      expect(q.getQuadCoeff(x, y)).toBe(1);
      expect(q.getQuadCoeff(x, x)).toBe(2);
    }

    const qPower = expr`${x}^2 + ${y}**2`;
    expect(qPower).toBeInstanceOf(QuadExpr);
    if (qPower instanceof QuadExpr) {
      expect(qPower.getQuadCoeff(x, x)).toBe(1);
      expect(qPower.getQuadCoeff(y, y)).toBe(1);
    }

    expect(() => expr`${x} * ${y} * ${z}`).toThrow(
      /non-linear term of degree > 2/
    );
    expect(() => expr`${x}^3`).toThrow(
      /non-linear term of degree > 2/
    );
    expect(() => expr`${x} * ${y} <= 10`).toThrow(
      /Quadratic constraints are not supported/
    );
  });

  it("parses linear, quadratic, and inline constraint expressions as documented in expressions guide", () => {
    const m = new Model();
    const x = m.continuous("x", { lb: 0 });
    const y = m.continuous("y", { lb: 0 });

    // 1. Linear combination: 3*x + 5*y - 10
    const linearExpr = expr`3 * ${x} + 5 * ${y} - 10` as LinExpr;
    expect(linearExpr).toBeInstanceOf(LinExpr);
    expect(linearExpr.terms.get(x)).toBe(3);
    expect(linearExpr.terms.get(y)).toBe(5);
    expect(linearExpr.constant).toBe(-10);

    // 2. Quadratic expression: x * y + 2 * x^2
    const quadExpr = expr`${x} * ${y} + 2 * ${x} * ${x}` as QuadExpr;
    expect(quadExpr).toBeInstanceOf(QuadExpr);
    expect(quadExpr.getQuadCoeff(x, y)).toBe(1);
    expect(quadExpr.getQuadCoeff(x, x)).toBe(2);

    // 3. Inline linear constraint in unified expr`...`
    const balanceConstraint = expr`${x} + 2 * ${y} <= 40` as Constraint;
    expect(balanceConstraint).toBeInstanceOf(Constraint);
    expect(balanceConstraint.sense).toBe("<=");
    expect(balanceConstraint.rhs).toBe(40);
    expect(balanceConstraint.lhs.terms.get(x)).toBe(1);
    expect(balanceConstraint.lhs.terms.get(y)).toBe(2);
  });

  it("preserves finite numeric interpolations including scientific notation, negative numbers, 0, and -0", () => {
    const m = new Model();
    const x = m.continuous("x");
    const y = m.continuous("y");

    const expExpr = expr`${1e-7} * ${x} + ${-2.5e-6} * ${y} + ${1e-9}` as LinExpr;
    expect(expExpr.terms.get(x)).toBe(1e-7);
    expect(expExpr.terms.get(y)).toBe(-2.5e-6);
    expect(expExpr.constant).toBe(1e-9);

    const negZeroExpr = expr`${-0}` as LinExpr;
    expect(Object.is(negZeroExpr.constant, -0)).toBe(true);

    const posZeroExpr = expr`${0}` as LinExpr;
    expect(Object.is(posZeroExpr.constant, 0)).toBe(true);

    const negPowerExpr = expr`${-2}^2 + ${3} * ${x}^${2}` as QuadExpr;
    expect(negPowerExpr).toBeInstanceOf(QuadExpr);
    expect(negPowerExpr.constant).toBe(4);
    expect(negPowerExpr.getQuadCoeff(x, x)).toBe(3);

    const expConstr = expr`${1e-7} * ${x} - ${5e-6} * ${y} <= ${2.5e-4}` as Constraint;
    expect(expConstr.lhs.terms.get(x)).toBe(1e-7);
    expect(expConstr.lhs.terms.get(y)).toBe(-5e-6);
    expect(expConstr.rhs).toBe(2.5e-4);

    // Small scientific coefficients below 1e-12 must not be discarded, including repeated sums and divisors
    const tinyTemplate = expr`1 + ${1e-13} * ${x} + ${1e-13} * ${x}` as LinExpr;
    expect(tinyTemplate.terms.get(x)).toBe(2e-13);
    expect(tinyTemplate.constant).toBe(1);

    const tinyDiv = expr`${x} / ${1e-13}` as LinExpr;
    expect(tinyDiv.terms.get(x)).toBeCloseTo(1e13, 0);

    const tinyQuad = expr`${1e-13} * ${x}^2 + ${1e-13} * ${x}^2` as QuadExpr;
    expect(tinyQuad.getQuadCoeff(x, x)).toBe(2e-13);

    // Implicit multiplication at numeric boundaries and unary negation of negative numbers
    const implicitProd = expr`2${3}` as LinExpr;
    expect(implicitProd.constant).toBe(6);
    const doubleNeg = expr`-${-5}` as LinExpr;
    expect(doubleNeg.constant).toBe(5);
  });

  it("parses valid textual decimal and scientific notation literals", () => {
    const m = new Model();
    const x = m.continuous("x");
    const y = m.continuous("y");
    const resolver = (name: string) => (name === "x" ? x : name === "y" ? y : undefined);

    const parsed = parseExpr("1e-7 * x + .5 * y - 2.5E+3", resolver) as LinExpr;
    expect(parsed.terms.get(x)).toBe(1e-7);
    expect(parsed.terms.get(y)).toBe(0.5);
    expect(parsed.constant).toBe(-2500);

    const tinyParsed = parseExpr("1e-13 * x + 1e-13 * x", resolver) as LinExpr;
    expect(tinyParsed.terms.get(x)).toBe(2e-13);

    const residualParsed = parseExpr("1e12 * x - 999999999999.5 * x", resolver) as LinExpr;
    expect(residualParsed.terms.get(x)).toBe(0.5);

    const exactCancelledProduct = parseExpr("(x + 1e-13) * (x - 1e-13) - x^2", resolver) as LinExpr;
    expect(exactCancelledProduct.terms.size).toBe(0);
    expect(exactCancelledProduct.value).toBeCloseTo(-1e-26, 40);

    const zeroScientific = parseExpr("0e-400 * x + 0.00 * y", resolver) as LinExpr;
    expect(zeroScientific.terms.size).toBe(0);

    const constr = parseConstraint("1.5e-4 * x + .25e2 * y <= 1E3", resolver);
    expect(constr.lhs.terms.get(x)).toBe(1.5e-4);
    expect(constr.lhs.terms.get(y)).toBe(25);
    expect(constr.rhs).toBe(1000);

    // Implicit multiplication before variable names starting with e/E
    const energy = m.continuous("energy");
    const E_max = m.continuous("E_max");
    const eResolver = (name: string) =>
      name === "energy" ? energy : name === "E_max" ? E_max : resolver(name);
    const eIdentExpr = parseExpr("2energy + 0.5E_max", eResolver) as LinExpr;
    expect(eIdentExpr.terms.get(energy)).toBe(2);
    expect(eIdentExpr.terms.get(E_max)).toBe(0.5);
  });

  it("rejects malformed numeric literals, incomplete exponents, trailing tokens, and invalid interpolations", () => {
    const m = new Model();
    const x = m.continuous("x");
    const b = m.bool("b");
    const emptyResolver = () => undefined;
    const xResolver = (name: string) => (name === "x" ? x : undefined);

    for (const malformed of [
      "1.2.3",
      "1..2",
      ".",
      "1.",
      ".5.2",
      "1e",
      "1E",
      "1e+",
      "1e-",
      "1e2.3",
      "1e2e3",
      "1.e5",
    ]) {
      expect(() => parseExpr(malformed, emptyResolver)).toThrow(/Invalid numeric literal/);
    }

    expect(() => parseExpr("1e309", emptyResolver)).toThrow(/overflows finite floating-point range/);
    expect(() => parseExpr("1e-324 * x", xResolver)).toThrow(/underflows to zero/);
    expect(() => parseExpr("1e-200^2", emptyResolver)).toThrow(/underflows to zero/);
    expect(() => expr`${1e-200}^2`).toThrow(/underflows to zero/);
    expect(() => expr`${Number.MIN_VALUE} * ${x} / 2`).toThrow(/underflows to zero/);
    expect(() => expr`${Number.MIN_VALUE} * ${x}^2 / 2`).toThrow(/underflows to zero/);
    expect(() => parseExpr("x + 1 )", xResolver)).toThrow(/Unexpected token '\)'/);
    expect(() => parseConstraint("x <= 10 <= 20", xResolver)).toThrow(/Unexpected token '<='/);

    expect(() => expr`${NaN} * ${x}`).toThrow(/interpolated numbers must be finite/);
    expect(() => expr`${Infinity} * ${x}`).toThrow(/interpolated numbers must be finite/);
    expect(() => expr`${x} <= ${-Infinity}`).toThrow(/interpolated numbers must be finite/);

    // Signed zero preserved through scalar multiplication
    expect(Object.is((expr`${-0} * 1` as LinExpr).constant, -0)).toBe(true);
    expect(Object.is(new LinExpr(new Map(), -0).mul(1).constant, -0)).toBe(true);
    expect(Object.is(new QuadExpr(new Map(), new Map(), -0).mul(1).constant, -0)).toBe(true);

    // Symmetric tiny-constant multiplication across Var, LinExpr, and QuadExpr
    const tinyLin = new LinExpr(new Map(), 1e-13);
    const tinyQuad = new QuadExpr(new Map(), new Map(), 1e-13);
    expect(tinyLin.mul(x).linearTerms.get(x)).toBe(1e-13);
    expect(x.mul(tinyLin).linearTerms.get(x)).toBe(1e-13);
    expect(tinyQuad.mul(x).linearTerms.get(x)).toBe(1e-13);
    expect(x.mul(tinyQuad).linearTerms.get(x)).toBe(1e-13);

    // Non-finite scalar products on zero-constant expressions and non-finite term additions must propagate
    expect(Number.isNaN(new LinExpr().mul(NaN).constant)).toBe(true);
    expect(Number.isNaN(x.sub(x).mul(Infinity).constant)).toBe(true);
    expect(Number.isNaN(new QuadExpr().mul(NaN).constant)).toBe(true);
    expect(x.mul(Infinity).add(x.mul(1)).terms.get(x)).toBe(Infinity);
    expect(Number.isNaN(x.mul(NaN).add(x.mul(1)).terms.get(x))).toBe(true);
    expect(Number.isNaN(new QuadExpr(new Map([[x, NaN]])).add(x.mul(1)).linearTerms.get(x))).toBe(true);
    expect(() => expr`${new LinExpr().mul(NaN)} + ${x}`).toThrow(/Invalid non-finite constant/);
    expect(() => expr`${x.mul(Infinity).add(x.mul(1))}`).toThrow(/Invalid non-finite coefficient/);
    expect(() => expr`${x.mul(NaN).add(x.mul(1))}`).toThrow(/Invalid non-finite coefficient/);

    // Post-normalization overflow in constraints
    expect(() => expr`${Number.MAX_VALUE} <= ${-Number.MAX_VALUE}`).toThrow(
      /Invalid non-finite right-hand side/
    );
    expect(() => expr`${Number.MAX_VALUE} * ${x} <= ${-Number.MAX_VALUE} * ${x}`).toThrow(
      /Invalid non-finite coefficient/
    );

    // Collision-free placeholder identifiers in literal template text
    expect(() => expr`${2} + __num_0__`).toThrow(/Unknown variable '__num_0__'/);
    expect(() => expr`${2} + __washi_num_0__`).toThrow(/Unknown variable '__washi_num_0__'/);
    expect(() => expr`${x} + __ph_0__`).toThrow(/Unknown variable '__ph_0__'/);
    expect(() => expr`${x} + __washi_ph_0__`).toThrow(/Unknown variable '__washi_ph_0__'/);

    expect(() => expr`${null as unknown as number} * ${x}`).toThrow(/Unsupported interpolation value/);
    expect(() => expr`${undefined as unknown as number} * ${x}`).toThrow(/Unsupported interpolation value/);
    expect(() => expr`${"x" as unknown as number} + 1`).toThrow(/Unsupported interpolation value/);
    expect(() => expr`${b as unknown as Var} + 1`).toThrow(/Unsupported interpolation value/);
    expect(() => expr`${new LinExpr(new Map(), NaN)} + ${x}`).toThrow(/Invalid non-finite constant/);
    expect(() => expr`2 * ${expr`${x} <= 5`}`).toThrow(
      /Cannot interpolate a constraint comparison/
    );
  });

  it("enforces transactional context validation for unified expr`...` across objectives, constraints, indicators, sum, and logic", async () => {
    const m = new Model("ContextValidation");
    const x = m.continuous("x", { lb: 0, ub: 10 });
    const y = m.continuous("y", { lb: 0, ub: 10 });
    const z = m.binary("z");
    const p = m.bool("p");

    // Set initial valid model state and solve
    m.objective(maximize(expr`3 * ${x} + 2 * ${y}`));
    m.constraint(expr`${x} + ${y} <= 8`, "cap");
    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(m.objectiveValue).toBeCloseTo(24);
    expect(m.constraints).toHaveLength(1);

    // 1. Objective contexts must reject Constraint inputs immediately without mutating model state
    expect(() => maximize(expr`${x} <= 5`)).toThrow(/Cannot use a Constraint as an objective/);
    expect(() => minimize(expr`${x} >= 2`)).toThrow(/Cannot use a Constraint as an objective/);
    expect(() => maximize("x <= 5")).toThrow(/Cannot use a comparison constraint as an objective/);
    expect(() => minimize("x == 5")).toThrow(/Cannot use a comparison constraint as an objective/);
    expect(() => m.objective({ expr: expr`${x} <= 5`, sense: "maximize" })).toThrow(
      /Cannot use a Constraint as an objective/
    );
    expect(() => {
      m.objectiveExpr = expr`${x} <= 5`;
    }).toThrow(/Cannot use a Constraint as an objective/);
    expect(() => m.objective({ expr: "x <= 5" as any, sense: "minimize" })).toThrow(
      /Cannot use a comparison constraint as an objective/
    );

    // Verify objective and solved state were NOT corrupted
    expect(m.sense).toBe("Maximize");
    expect(m.objectiveValue).toBeCloseTo(24);
    expect(x.value).toBeCloseTo(8);

    // 2. Constraint and indicator contexts must reject arithmetic expressions without comparison operators
    expect(() => m.constraint(expr`2 * ${x} + ${y}`, "bad_constr")).toThrow(
      /Constraint must contain a comparison operator/
    );
    expect(() => m.constraint([expr`2 * ${x} + ${y}`])).toThrow(
      /Constraint must contain a comparison operator/
    );
    expect(() => m.indicator(z, expr`2 * ${x} + ${y}`)).toThrow(
      /Invalid constraint expression passed to indicator\(\)\. Expression must include a comparison operator/
    );

    // Verify constraints and solved state were NOT corrupted
    expect(m.constraints).toHaveLength(1);
    expect(m.objectiveValue).toBeCloseTo(24);

    // 3. sum() must reject Constraint and non-zero QuadExpr in callback and array forms
    expect(() => sum([1, 2], (i) => expr`${x} <= ${i}`)).toThrow(
      /Cannot sum a constraint comparison/
    );
    expect(() => sum([expr`${x} <= 1`])).toThrow(
      /Cannot sum a constraint comparison/
    );
    expect(() => sum([1, 2], (i) => expr`${i} * ${x}^2`)).toThrow(
      /Quadratic expressions are not supported in sum/
    );

    // 4. Propositional logic combinators must accept comparison expr`...` and reject arithmetic expr`...`
    const validLogic = implies(p, expr`${x} >= 4`);
    expect(validLogic.op).toBe("implies");

    expect(() => implies(p, expr`2 * ${x}`)).toThrow(
      /Cannot use an arithmetic expression without a comparison operator/
    );
    expect(() => and(p, expr`2 * ${x}`)).toThrow(
      /Cannot use an arithmetic expression without a comparison operator/
    );
    expect(() => or(p, expr`2 * ${x}`)).toThrow(
      /Cannot use an arithmetic expression without a comparison operator/
    );
    expect(() => not(expr`2 * ${x}`)).toThrow(
      /Cannot use an arithmetic expression without a comparison operator/
    );
    expect(() => xor(p, expr`2 * ${x}`)).toThrow(
      /Cannot use an arithmetic expression without a comparison operator/
    );
    expect(() => p.and(expr`2 * ${x}`)).toThrow(
      /Cannot use an arithmetic expression without a comparison operator/
    );
    expect(() => p.implies(expr`2 * ${x}`)).toThrow(
      /Cannot use an arithmetic expression without a comparison operator/
    );
  });

  it("supports direct arithmetic, comparison, and logical method chaining on expr`...` results and .kind narrowing without casts", () => {
    const m = new Model("ChainingOnExpr");
    const x = m.continuous("x", { lb: 0, ub: 10 });
    const y = m.continuous("y", { lb: 0, ub: 10 });
    const p = m.bool("p");

    // Direct arithmetic chaining on stored expr result: const cost = expr`${x} + 1`; cost.add(2)
    const cost = expr`${x} + 1`;
    const totalCost = cost.add(2).sub(expr`0.5 * ${y}`).mul(2).div(2);
    expect(totalCost.kind).toBe("linear");
    if (totalCost.kind === "linear") {
      expect(totalCost.terms.get(x)).toBe(1);
      expect(totalCost.terms.get(y)).toBe(-0.5);
      expect(totalCost.constant).toBe(3);
    }

    // Method-DSL operands accepting ParsedExpr directly
    const varPlusExpr = x.add(cost);
    expect(varPlusExpr.kind).toBe("linear");
    if (varPlusExpr.kind === "linear") {
      expect(varPlusExpr.terms.get(x)).toBe(2);
      expect(varPlusExpr.constant).toBe(1);
    }

    // Direct comparison chaining on stored expr result
    const c1 = cost.le(10, "cost_le");
    expect(c1.kind).toBe("constraint");
    expect(c1.sense).toBe("<=");
    expect(c1.rhs).toBe(9);
    expect(c1.lhs.terms.get(x)).toBe(1);

    const c2 = x.ge(cost, "x_ge_cost");
    expect(c2.sense).toBe(">=");
    expect(c2.rhs).toBe(1);

    // Direct common expression members on stored expr result: value, clone(), constant
    x.value = 3;
    expect(cost.constant).toBe(1);
    expect(cost.value).toBe(4);
    const clonedCost = cost.clone();
    expect(clonedCost.constant).toBe(1);
    expect(clonedCost.value).toBe(4);

    // Direct logical chaining and clone() on stored constraint expr result
    const guard = expr`${x} >= 4`;
    const logic = guard.implies(p);
    expect(logic.op).toBe("implies");
    const clonedGuard = guard.clone();
    expect(clonedGuard.kind).toBe("constraint");

    // Runtime guards when chaining arithmetic/comparison/value/constant on a Constraint or logical methods on an arithmetic Expr
    expect(() => guard.add(1)).toThrow(/Cannot perform arithmetic on a Constraint/);
    expect(() => guard.sub(1)).toThrow(/Cannot perform arithmetic on a Constraint/);
    expect(() => guard.mul(2)).toThrow(/Cannot perform arithmetic on a Constraint/);
    expect(() => guard.div(2)).toThrow(/Cannot perform arithmetic on a Constraint/);
    expect(() => guard.neg()).toThrow(/Cannot perform arithmetic on a Constraint/);
    expect(() => guard.le(5)).toThrow(/Cannot compare a Constraint/);
    expect(() => guard.value).toThrow(/Cannot read numeric value of a Constraint/);
    expect(() => guard.constant).toThrow(/Cannot read numeric constant of a Constraint/);
    expect(() => x.add(guard)).toThrow(/Cannot perform arithmetic on a Constraint/);
    expect(() => x.le(guard)).toThrow(/Cannot compare against a Constraint/);
    expect(() => cost.and(p)).toThrow(/Cannot use an arithmetic expression without a comparison operator/);
    expect(() => cost.implies(p)).toThrow(/Cannot use an arithmetic expression without a comparison operator/);
    expect(() => expr`${x}^2`.le(10)).toThrow(/Quadratic expressions are not supported in linear constraints/);
    expect(() => expr`${x}^2`.and(p)).toThrow(/Cannot use an arithmetic expression without a comparison operator/);
    expect(() => dot([1], [guard as any])).toThrow(
      /Cannot multiply number by non-variable\/expression operand in dot/
    );
    const foreignConstraint = {
      kind: "constraint",
      id: 1,
      name: "c_1",
      sense: "<=",
      lhs: new LinExpr(),
      rhs: 5,
      mul: () => {},
      le: () => {},
    };
    expect(() => dot([1], [foreignConstraint as any])).toThrow(
      /Cannot multiply number by non-variable\/expression operand in dot/
    );
    for (const op of ["add", "sub", "mul", "div"] as const) {
      expect(() => cost[op](foreignConstraint as any)).toThrow(
        /Cannot perform arithmetic on a Constraint/
      );
      expect(() => expr`${x}^2`[op](foreignConstraint as any)).toThrow(
        /Cannot perform arithmetic on a Constraint/
      );
    }
    const senseLhsDot = dot({ sense: 2, lhs: 3 }, { sense: x, lhs: y });
    expect(senseLhsDot.terms.get(x)).toBe(2);
    expect(senseLhsDot.terms.get(y)).toBe(3);
    expect(() => and({ sense: "<=", lhs: new LinExpr(), rhs: 5 } as any)).toThrow(
      /Invalid operand passed to logical operator/
    );

    // Structural objective validation rejects partial objects and normalizes complete structural objects without clone()
    expect(() => maximize({ terms: new Map() } as any)).toThrow(/Invalid expression passed to maximize/);
    expect(() => minimize({ quadTerms: new Map() } as any)).toThrow(/Invalid expression passed to minimize/);
    expect(() => m.objective({ expr: { terms: new Map() } as any, sense: "Maximize" })).toThrow(/Invalid objective expression/);
    expect(() => m.objective({ expr: { quadTerms: new Map() } as any, sense: "Minimize" })).toThrow(/Invalid objective expression/);

    const structuralLin = { terms: new Map([[x, 2]]), constant: 5 };
    m.objective(maximize(structuralLin as any));
    expect(m.objectiveExpr.constant).toBe(5);
  });

  it("supports sum(), dot(), and element-wise container arithmetic (+, -, *, /, ^2) in expr`...`", async () => {
    const m = new Model("TemplateContainerOps");
    const items = ["desk", "chair"] as const;
    const qty = m.integer(items, { lb: 0, ub: 30, prefix: "qty" });
    const lineOpen = m.binary("line_open");

    const price = { desk: 45, chair: 30 };
    const cost = { desk: 15, chair: 10 };
    const tax = { desk: 0.9, chair: 0.95 };
    const wood = { desk: 2, chair: 1 };

    // 1. Direct Record sum inside indicator and linear constraint without Object.values()
    m.indicator(lineOpen, expr`sum(${qty}) <= 0`, { activeValue: 0, name: "shut_line" });
    m.constraint(expr`sum(${qty}) >= 4`, "min_batch");

    // 2. Direct dot() inside expr for constraints and objectives (both operand orders)
    const dotConstr = expr`dot(${wood}, ${qty}) <= 40` as Constraint;
    expect(dotConstr.sense).toBe("<=");
    expect(dotConstr.rhs).toBe(40);
    expect(dotConstr.lhs.terms.get(qty.desk)).toBe(2);
    expect(dotConstr.lhs.terms.get(qty.chair)).toBe(1);
    m.constraint(dotConstr, "wood_cap");

    const dotRev = expr`dot(${qty}, ${wood})` as LinExpr;
    expect(dotRev.terms.get(qty.desk)).toBe(2);
    expect(dotRev.terms.get(qty.chair)).toBe(1);

    // 3. Element-wise arithmetic inside sum(...) and dot(..., ...)
    // (45 - 15) * 0.9 = 27 for desk; (30 - 10) * 0.95 = 19 for chair
    const netMarginExpr = expr`sum((${price} - ${cost}) * ${tax} * ${qty}) - 20 * ${lineOpen}` as LinExpr;
    expect(netMarginExpr.terms.get(qty.desk)).toBeCloseTo(27);
    expect(netMarginExpr.terms.get(qty.chair)).toBeCloseTo(19);
    expect(netMarginExpr.terms.get(lineOpen)).toBe(-20);

    const dotSubExpr = expr`dot(${price} - ${cost}, ${qty})` as LinExpr;
    expect(dotSubExpr.terms.get(qty.desk)).toBe(30);
    expect(dotSubExpr.terms.get(qty.chair)).toBe(20);

    const divExpr = expr`sum(${qty} / ${wood}) + sum(-${qty}) + sum(+${qty}) + sum(2 * ${qty} + 5)` as LinExpr;
    // (0.5 - 1 + 1 + 2) = 2.5 for desk; (1 - 1 + 1 + 2) = 3 for chair; constant = 5 + 5 = 10
    expect(divExpr.terms.get(qty.desk)).toBeCloseTo(2.5);
    expect(divExpr.terms.get(qty.chair)).toBeCloseTo(3);
    expect(divExpr.constant).toBe(10);

    m.objective(maximize(netMarginExpr));
    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(lineOpen.value).toBe(1);
    // Max under 2*desk + chair <= 40, ub=30: chair=30 (margin 19*30=570), desk=5 (margin 27*5=135) -> 705 - 20 = 685
    expect(qty.chair.value).toBe(30);
    expect(qty.desk.value).toBe(5);
    expect(m.objectiveValue).toBeCloseTo(685);
  });

  it("supports 2D Frobenius inner product dot(), 2D element-wise sum(), Set/generator iterables, and 2-arg sum(items, mapFn) in expr`...`", async () => {
    const m = new Model("TransportationExpr");
    const factories = ["Tokyo", "Osaka"] as const;
    const stores = ["S1", "S2"] as const;
    const ship = m.continuous(factories, stores, { lb: 0 });
    const costMat = {
      Tokyo: { S1: 2, S2: 5 },
      Osaka: { S1: 4, S2: 1 },
    };
    const supply = { Tokyo: 40, Osaka: 60 };
    const demand = { S1: 30, S2: 50 };

    // 2D Frobenius inner product via dot() and element-wise sum() produce identical linear expressions
    const objDot = expr`dot(${costMat}, ${ship})` as LinExpr;
    const objElem = expr`sum(${costMat} * ${ship})` as LinExpr;
    for (const f of factories) {
      for (const s of stores) {
        expect(objDot.terms.get(ship[f][s])).toBe(costMat[f][s]);
        expect(objElem.terms.get(ship[f][s])).toBe(costMat[f][s]);
      }
    }

    // Row sums: sum(ship[f]) <= supply[f]
    m.constraint(factories.map((f) => expr`sum(${ship[f]}) <= ${supply[f]}`));

    // Column sums via 2-argument mapper inside expr: sum(factories, f => ship[f][s]) >= demand[s]
    m.constraint(
      stores.map((s) => expr`sum(${factories}, ${(f: (typeof factories)[number]) => ship[f][s]}) >= ${demand[s]}`)
    );

    m.objective(minimize(objDot));
    const status = await m.solve();
    expect(status).toBe("Optimal");
    // Optimal: Tokyo -> S1: 30 (cost 60), Osaka -> S2: 50 (cost 50) => total 110
    expect(ship.Tokyo.S1.value).toBeCloseTo(30);
    expect(ship.Osaka.S2.value).toBeCloseTo(50);
    expect(m.objectiveValue).toBeCloseTo(110);

    // Count-based 2-arg sum inside expr (both literal and interpolated count) and Set/Generator iterables
    const vec = m.continuous(3, { lb: 0, prefix: "v" });
    const countLitSum = expr`sum(3, ${(i: number) => vec[i].mul(i + 1)})` as LinExpr;
    const countInterpSum = expr`sum(${3}, ${(i: number) => expr`${i + 2} * ${vec[i]}`})` as LinExpr;
    expect(countLitSum.terms.get(vec[0])).toBe(1);
    expect(countLitSum.terms.get(vec[2])).toBe(3);
    expect(countInterpSum.terms.get(vec[0])).toBe(2);
    expect(countInterpSum.terms.get(vec[2])).toBe(4);

    const setSum = expr`sum(${new Set(vec)})` as LinExpr;
    expect(setSum.terms.get(vec[0])).toBe(1);
    expect(setSum.terms.get(vec[1])).toBe(1);
    expect(setSum.terms.get(vec[2])).toBe(1);

    function* genVars() {
      yield vec[0];
      yield vec[2];
    }
    const genSum = expr`sum(${genVars()})` as LinExpr;
    expect(genSum.terms.get(vec[0])).toBe(1);
    expect(genSum.terms.has(vec[1])).toBe(false);
    expect(genSum.terms.get(vec[2])).toBe(1);

    // Records with reserved property names ('id', 'terms', 'quadTerms', 'sense', 'lhs') and uncast ParsedExpr leaves
    const specialVars = m.continuous(["id", "terms", "quadTerms", "sense", "lhs"] as const);
    const specialCoeffs = { id: 1, terms: 2, quadTerms: 3, sense: 4, lhs: 5 };
    const specialSum = expr`sum(${specialCoeffs} * ${specialVars})` as LinExpr;
    const specialDot = expr`dot(${specialCoeffs}, ${specialVars})` as LinExpr;
    expect(specialSum.terms.get(specialVars.id)).toBe(1);
    expect(specialSum.terms.get(specialVars.sense)).toBe(4);
    expect(specialDot.terms.get(specialVars.quadTerms)).toBe(3);
    expect(specialDot.terms.get(specialVars.lhs)).toBe(5);

    const parsedRecord = { a: expr`2 * ${vec[0]}`, b: expr`3 * ${vec[1]}` };
    expect(sum(parsedRecord).terms.get(vec[0])).toBe(2);
    expect((expr`sum(${parsedRecord})` as LinExpr).terms.get(vec[1])).toBe(3);
    const parenMapperSum = expr`sum((${factories}), ${(f: (typeof factories)[number]) => ship[f].S1})` as LinExpr;
    expect(parenMapperSum.terms.get(ship.Tokyo.S1)).toBe(1);
    expect(parenMapperSum.terms.get(ship.Osaka.S1)).toBe(1);
  });

  it("solves a least-squares convex QP using element-wise squared error expr`sum((${x} - ${target})^2)`", async () => {
    const m = new Model("LeastSquaresQP");
    const x = m.continuous(3, { lb: 0, ub: 10, prefix: "x" });
    const target = [2, 5, 8];
    const weights = [1, 2, 1];

    // Weighted squared deviation: 1*(x0 - 2)^2 + 2*(x1 - 5)^2 + 1*(x2 - 8)^2
    const qpObj = expr`sum(${weights} * (${x} - ${target})^2)` as QuadExpr;
    expect(qpObj).toBeInstanceOf(QuadExpr);
    expect(qpObj.getQuadCoeff(x[0], x[0])).toBe(1);
    expect(qpObj.getQuadCoeff(x[1], x[1])).toBe(2);
    expect(qpObj.getQuadCoeff(x[2], x[2])).toBe(1);
    expect(qpObj.linearTerms.get(x[0])).toBe(-4);
    expect(qpObj.linearTerms.get(x[1])).toBe(-20);
    expect(qpObj.linearTerms.get(x[2])).toBe(-16);
    expect(qpObj.constant).toBe(4 + 50 + 64);

    m.objective(minimize(qpObj));
    const status = await m.solve();
    expect(status).toBe("Optimal");
    expect(x[0].value).toBeCloseTo(2, 4);
    expect(x[1].value).toBeCloseTo(5, 4);
    expect(x[2].value).toBeCloseTo(8, 4);
    expect(m.objectiveValue).toBeCloseTo(0, 4);
  });

  it("validates top-level scalar invariant, container shapes, argument counts, and error conditions in expr`...`", () => {
    const m = new Model("ContainerValidation");
    const x = m.continuous("x");
    const vec2 = m.continuous(2, { prefix: "v2" });
    const vec3 = m.continuous(3, { prefix: "v3" });
    const recAB = m.continuous(["a", "b"] as const, { prefix: "ab" });
    const recAC = m.continuous(["a", "c"] as const, { prefix: "ac" });

    // 1. Unreduced container at top-level or on either side of a comparison throws
    expect(() => expr`${vec2}`).toThrow(/Container expression \(Array or Record\) cannot be used directly/);
    expect(() => expr`2 * ${vec2} + 1`).toThrow(/Container expression \(Array or Record\) cannot be used directly/);
    expect(() => expr`${vec2} <= 10`).toThrow(/Container expression \(Array or Record\) cannot be used directly/);
    expect(() => expr`10 <= ${recAB}`).toThrow(/Container expression \(Array or Record\) cannot be used directly/);
    expect(() => expr`${[1, 2]} * ${vec2} <= 40`).toThrow(
      /Container expression \(Array or Record\) cannot be used directly/
    );

    // 2. Shape, key, and dimension mismatches in element-wise operations
    expect(() => expr`sum(${vec2} + ${vec3})`).toThrow(/Array length mismatch in template expression at 'root'/);
    expect(() => expr`sum(${[[vec2[0]], [vec2[1]]]} + ${[[1, 2], [3, 4]]})`).toThrow(
      /Array length mismatch in template expression at '\[0\]'/
    );
    expect(() => expr`sum(${recAB} + ${recAC})`).toThrow(/Key mismatch in template expression at 'root'/);
    expect(() => expr`sum(${vec2} + ${recAB})`).toThrow(/Type mismatch in template expression at 'root'/);
    expect(() => expr`sum(${vec2} + ${{ 0: 1, 2: 2 }})`).toThrow(
      /Key mismatch in template expression at 'root': missing indices \[1\]/
    );
    expect(() => expr`sum(${vec3} + ${{ 0: 1, 1: 2 }})`).toThrow(
      /Array length mismatch in template expression at 'root': array has length 3, but object has 2 indices/
    );
    expect(() => expr`sum(${vec2} + ${[vec2, vec2]})`).toThrow(
      /Dimension mismatch in template expression at '\[0\]': cannot combine scalar element with sub-container/
    );

    // 3. Invalid arguments to sum() and dot()
    expect(() => expr`sum()`).toThrow(/sum\(\) in template expression requires at least 1 argument/);
    expect(() => expr`sum(5)`).toThrow(/sum\(\) requires a container/);
    expect(() => expr`sum(${x})`).toThrow(/sum\(\) requires a container/);
    expect(() => expr`sum(${vec2}, 123)`).toThrow(/Second argument to sum\(\) must be a mapping function/);
    expect(() => expr`sum(${vec2}, ${(v: Var) => v}, 3)`).toThrow(/sum\(\) in template expression accepts at most 2 arguments/);
    expect(() => expr`sum(2, ${(i: number) => i}, 3)`).toThrow(/sum\(\) in template expression accepts at most 2 arguments/);
    expect(() => expr`sum(${x}, ${(i: number) => i})`).toThrow(/Invalid first argument in sum\(itemsOrCount, mapFn\)/);
    expect(() => expr`sum(-2, ${(i: number) => i})`).toThrow(/sum\(count, mapFn\) requires a non-negative integer count/);

    expect(() => expr`dot()`).toThrow(/dot\(\) in template expression requires exactly 2 arguments/);
    expect(() => expr`dot(${vec2})`).toThrow(/dot\(\) in template expression requires exactly 2 arguments/);
    expect(() => expr`dot(${[1, 2]}, ${vec2}, ${vec2})`).toThrow(
      /dot\(\) in template expression requires exactly 2 arguments/
    );
    expect(() => expr`dot(${x}, 2)`).toThrow(
      /dot\(\) in template expression requires 1D or 2D Array or Record containers/
    );
    expect(() => expr`dot(${new Set([1, 2])}, ${vec2})`).toThrow(
      /dot\(\) requires Array or Record containers/
    );

    // 4. Function interpolation outside sum(items, mapFn)
    expect(() => expr`${(i: number) => i}`).toThrow(
      /Function interpolation is only supported as the second argument of sum/
    );

    // 5. Constraint comparisons inside sum() or dot()
    expect(() => expr`sum(${x} <= 10)`).toThrow(/Cannot sum a constraint comparison/);
    expect(() => expr`sum((${x} <= 10))`).toThrow(/Cannot sum a constraint comparison/);
    expect(() => expr`sum(${[expr`${x} <= 1`]})`).toThrow(/Cannot sum a constraint comparison/);
    expect(() => expr`dot(${x} <= 10, ${vec2})`).toThrow(/Cannot use a constraint comparison/);

    // 6. Degree > 2, quadratic constraints, division by zero, symbol keys, and 3D containers
    expect(() => expr`sum(${vec2} * ${vec2} * ${vec2})`).toThrow(/non-linear term of degree > 2/);
    expect(() => expr`sum(${vec2}^3)`).toThrow(/non-linear term of degree > 2/);
    expect(() => expr`sum((${vec2} - ${[1, 2]})^2) <= 10`).toThrow(/Quadratic constraints are not supported/);
    expect(() => expr`sum(${vec2} / ${[1, 0]})`).toThrow(/Division by zero/);

    const sym = Symbol("k");
    expect(() => expr`sum(${{ [sym]: x } as any})`).toThrow(/Symbol keys are not supported/);
    expect(() => expr`sum(${[[[x]]] as any})`).toThrow(/Nested containers deeper than 2D/);
    expect(() => expr`sum(2 * ${[[[x]]] as any})`).toThrow(/Nested containers deeper than 2D/);
  });
});





