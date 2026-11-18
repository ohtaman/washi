import { afterAll, describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Model } from "../src/index.js";
import "../src/modeler/solvers/pumpkin/index.js";
import "../src/modeler/solvers/z3/index.js";
import { killZ3Threads } from "../src/modeler/solvers/z3/index.js";
import enLocale from "../examples/web-demo/src/locales/en.json";
import jaLocale from "../examples/web-demo/src/locales/ja.json";
import zhLocale from "../examples/web-demo/src/locales/zh.json";

describe("Playground Conflicts vs. Unsat Core Distinction", () => {
  afterAll(async () => {
    await killZ3Threads();
  });

  it("distinguishes between Z3 SMT Unsat Core and HiGHS elastic conflicts in Model check results", async () => {
    const buildInfeasibleModel = (solver: "highs" | "z3") => {
      const m = new Model({ name: "ConflictDiagnosis", solver });
      const engineers = m.integer("engineers", { lb: 0, ub: 20 });
      const budget = m.continuous("budget", { lb: 0, ub: 100000 });
      const rush = m.bool("rushDelivery");

      m.constraint(engineers.mul(8000).le(budget), "budget_limit");
      m.constraint(rush, "rush_required");
      m.constraint(rush.implies(engineers.ge(8)), "rush_staffing_rule");
      m.constraint(budget.le(50000), "strict_board_budget_cap");
      m.constraint(engineers.ge(1), "minimum_one_employee");
      return m;
    };

    const mHighs = buildInfeasibleModel("highs");
    const resHighs = await mHighs.check();
    expect(resHighs.status).toBe("Unsat");
    expect(resHighs.conflicts).toBeDefined();
    expect(resHighs.conflicts!.length).toBeGreaterThan(0);
    expect(resHighs.unsatCore).toBeUndefined();
    expect(mHighs.unsatCore).toBeUndefined();

    const mZ3 = buildInfeasibleModel("z3");
    const resZ3 = await mZ3.check();
    expect(resZ3.status).toBe("Unsat");
    expect(resZ3.unsatCore).toEqual(
      expect.arrayContaining([
        "budget_limit",
        "rush_required",
        "rush_staffing_rule",
        "strict_board_budget_cap",
      ])
    );
    expect(resZ3.unsatCore).not.toContain("minimum_one_employee");
    expect(resZ3.conflicts).toEqual(resZ3.unsatCore);
    expect(mZ3.unsatCore).toEqual(resZ3.unsatCore);
  });

  it("extracts exact Pumpkin CP Unsat Core over bounded integer and boolean constraints", async () => {
    const mPumpkin = new Model({ name: "PumpkinConflictDiagnosis", solver: "pumpkin" });
    const engineers = mPumpkin.integer("engineers", { lb: 0, ub: 20 });
    const budget = mPumpkin.integer("budget", { lb: 0, ub: 100000 });
    const rush = mPumpkin.bool("rushDelivery");

    mPumpkin.constraint(engineers.mul(8000).le(budget), "budget_limit");
    mPumpkin.constraint(rush, "rush_required");
    mPumpkin.constraint(rush.implies(engineers.ge(8)), "rush_staffing_rule");
    mPumpkin.constraint(budget.le(50000), "strict_board_budget_cap");
    mPumpkin.constraint(engineers.ge(1), "minimum_one_employee");

    const resPumpkin = await mPumpkin.check({ solver: "pumpkin" });
    expect(resPumpkin.status).toBe("Unsat");
    expect(resPumpkin.unsatCore).toEqual(
      expect.arrayContaining([
        "budget_limit",
        "rush_required",
        "rush_staffing_rule",
        "strict_board_budget_cap",
      ])
    );
    expect(resPumpkin.unsatCore).not.toContain("minimum_one_employee");
    expect(resPumpkin.conflicts).toEqual(resPumpkin.unsatCore);
    expect(mPumpkin.unsatCore).toEqual(resPumpkin.unsatCore);
  });

  it("provides accurate, non-confusing i18n text for conflicts vs. unsat core across all locales", () => {
    expect(enLocale.ui.conflictsTitle).toContain("Conflicts");
    expect(enLocale.ui.conflictsDesc).toContain("conflicts");
    expect(enLocale.ui.conflictsDesc).toContain("elastic relaxation");
    expect(enLocale.ui.unsatCoreTitle).toContain("Unsat Core");
    expect(enLocale.ui.unsatCoreDesc).toContain("unsat core");

    expect(jaLocale.ui.conflictsTitle).toContain("Conflicts");
    expect(jaLocale.ui.conflictsDesc).toContain("conflicts");
    expect(jaLocale.ui.conflictsDesc).toContain("弾性緩和");
    expect(jaLocale.ui.unsatCoreTitle).toContain("Unsat Core");
    expect(jaLocale.ui.unsatCoreDesc).toContain("Unsat Core");

    expect(zhLocale.ui.conflictsTitle).toContain("Conflicts");
    expect(zhLocale.ui.conflictsDesc).toContain("conflicts");
    expect(zhLocale.ui.conflictsDesc).toContain("弹性松弛");
    expect(zhLocale.ui.unsatCoreTitle).toContain("Unsat Core");
    expect(zhLocale.ui.unsatCoreDesc).toContain("Unsat Core");
  });

  it("has corresponding HTML elements with proper IDs in demo/index.html", () => {
    const indexPath = path.resolve(__dirname, "../examples/web-demo/demo/index.html");
    const html = fs.readFileSync(indexPath, "utf-8");

    expect(html).toContain('id="unsat-core-title"');
    expect(html).toContain('id="unsat-core-desc"');
    expect(html).toContain('id="unsat-core-box"');
    expect(html).toContain('id="unsat-core-list"');
  });
});
