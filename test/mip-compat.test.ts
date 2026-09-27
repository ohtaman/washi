import { describe, it, expect } from "vitest";
import {
  MipModel,
  MAXIMIZE,
  MINIMIZE,
  INTEGER,
  BINARY,
  CONTINUOUS,
  maximize,
  minimize,
  xsum,
} from "../src/modeler/index.js";

describe("python-mip Compatibility Layer", () => {
  it("creates variables using add_var and types", () => {
    const m = new MipModel("TestMip");
    const v1 = m.add_var({ name: "int_var", var_type: INTEGER, lb: 1, ub: 10 });
    const v2 = m.add_var({ name: "bin_var", var_type: BINARY });
    const v3 = m.add_var({ name: "cont_var", var_type: CONTINUOUS });

    expect(v1.type).toBe("Integer");
    expect(v1.lb).toBe(1);
    expect(v2.type).toBe("Binary");
    expect(v2.ub).toBe(1);
    expect(v3.type).toBe("Continuous");
  });

  it("solves optimization problem with python-mip objective property setter", async () => {
    const m = new MipModel("MipKnapsack", MAXIMIZE);

    const x1 = m.add_var({ name: "x1", var_type: BINARY });
    const x2 = m.add_var({ name: "x2", var_type: BINARY });
    const x3 = m.add_var({ name: "x3", var_type: BINARY });

    // Objective
    m.objective_spec = maximize(x1.mul(10).add(x2.mul(15)).add(x3.mul(25)));

    // Constraints using add_constr
    m.add_constr(x1.mul(2).add(x2.mul(3)).add(x3.mul(5)).le(7));

    await m.optimize();

    expect(m.status).toBe("Optimal");
    expect(m.objective_value).toBe(35); // x2 (3, 15) + x3 (5, 25) ? wt 8 > 7. Actually x1 (2, 10) + x3 (5, 25) = wt 7, val 35!
    expect(x1.x).toBe(1);
    expect(x2.x).toBe(0);
    expect(x3.x).toBe(1);
  });
});
