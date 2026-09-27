import { describe, it, expect } from "vitest";
import { Var } from "../src/modeler/variable.js";

describe("Decision Variable (Var)", () => {
  it("initializes Continuous variable with default bounds [0, Infinity]", () => {
    const v = new Var({ name: "x" });
    expect(v.name).toBe("x");
    expect(v.type).toBe("Continuous");
    expect(v.lb).toBe(0);
    expect(v.ub).toBe(Infinity);
    expect(v.value).toBe(null);
    expect(v.x).toBe(null);
    expect(v.varValue).toBe(null);
  });

  it("initializes Binary variable with fixed bounds [0, 1]", () => {
    const v = new Var({ name: "b", type: "Binary" });
    expect(v.type).toBe("Binary");
    expect(v.lb).toBe(0);
    expect(v.ub).toBe(1);
  });

  it("supports custom lower and upper bounds including negative numbers", () => {
    const v = new Var({ name: "z", lb: -100, ub: 250, type: "Integer" });
    expect(v.lb).toBe(-100);
    expect(v.ub).toBe(250);
    expect(v.type).toBe("Integer");
  });

  it("supports arithmetic operator methods returning LinExpr", () => {
    const v = new Var({ name: "x" });
    const negated = v.neg();
    expect(negated.terms.get(v)).toBe(-1);

    const scaled = v.mul(4.5);
    expect(scaled.terms.get(v)).toBe(4.5);

    const added = v.add(10);
    expect(added.terms.get(v)).toBe(1);
    expect(added.constant).toBe(10);
  });
});
