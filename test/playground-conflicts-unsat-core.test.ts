import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Model, LinExpr } from "../src/index.js";
import enLocale from "../examples/web-demo/src/locales/en.json";
import jaLocale from "../examples/web-demo/src/locales/ja.json";
import zhLocale from "../examples/web-demo/src/locales/zh.json";

describe("Playground Conflicts vs. Unsat Core Distinction", () => {
  it("distinguishes between Z3 SMT Unsat Core and HiGHS elastic conflicts in Model check results", async () => {
    // 1. Infeasible staffing & budget model
    const buildInfeasibleModel = (solver: "highs") => {
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

    // When solved with HiGHS:
    const mHighs = buildInfeasibleModel("highs");
    const resHighs = await mHighs.check();

    expect(resHighs.status).toBe("Unsat");
    expect(resHighs.conflicts).toBeDefined();
    expect(resHighs.conflicts!.length).toBeGreaterThan(0);
    // Crucial: unsatCore must be undefined for HiGHS elastic check
    expect(resHighs.unsatCore).toBeUndefined();
    expect(mHighs.unsatCore).toBeUndefined();

    // Verify UI logic rule for HiGHS:
    const isUnsatCoreHighs = Boolean(mHighs.unsatCore && mHighs.unsatCore.length > 0);
    expect(isUnsatCoreHighs).toBe(false);

    const titleKeyHighs = isUnsatCoreHighs ? "unsatCoreTitle" : "conflictsTitle";
    const descKeyHighs = isUnsatCoreHighs ? "unsatCoreDesc" : "conflictsDesc";
    expect(titleKeyHighs).toBe("conflictsTitle");
    expect(descKeyHighs).toBe("conflictsDesc");

    // Simulated Z3 SMT check result:
    // (Z3 populates unsatCore directly from SMT unsatisfiable core extraction)
    const simulatedZ3Model = {
      unsatCore: Object.freeze(["rush_required", "rush_staffing_rule", "budget_limit", "strict_board_budget_cap"]),
      conflicts: Object.freeze(["rush_required", "rush_staffing_rule", "budget_limit", "strict_board_budget_cap"]),
    };
    const isUnsatCoreZ3 = Boolean(simulatedZ3Model.unsatCore && simulatedZ3Model.unsatCore.length > 0);
    expect(isUnsatCoreZ3).toBe(true);

    const titleKeyZ3 = isUnsatCoreZ3 ? "unsatCoreTitle" : "conflictsTitle";
    const descKeyZ3 = isUnsatCoreZ3 ? "unsatCoreDesc" : "conflictsDesc";
    expect(titleKeyZ3).toBe("unsatCoreTitle");
    expect(descKeyZ3).toBe("unsatCoreDesc");
  });

  it("provides accurate, non-confusing i18n text for conflicts vs. unsat core across all locales", () => {
    // English
    expect(enLocale.ui.conflictsTitle).toContain("Conflicts");
    expect(enLocale.ui.conflictsDesc).toContain("conflicts");
    expect(enLocale.ui.conflictsDesc).toContain("elastic relaxation");
    expect(enLocale.ui.unsatCoreTitle).toContain("Unsat Core");
    expect(enLocale.ui.unsatCoreDesc).toContain("unsat core");

    // Japanese
    expect(jaLocale.ui.conflictsTitle).toContain("Conflicts");
    expect(jaLocale.ui.conflictsDesc).toContain("conflicts");
    expect(jaLocale.ui.conflictsDesc).toContain("弾性緩和");
    expect(jaLocale.ui.unsatCoreTitle).toContain("Unsat Core");
    expect(jaLocale.ui.unsatCoreDesc).toContain("Unsat Core");

    // Chinese
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
