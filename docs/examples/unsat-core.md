# Conflict Diagnosis (Unsat Core)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Infeasibility Diagnosis / Unsat Core | Z3 (`@ohtaman/washi/solvers/z3`) | `m.integer()`, `m.continuous()`, `implies()`, `m.constraint()`, `expr`, `m.check()`, `m.conflicts` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=conflict_diagnosis_unsat">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts">Source Code</a></li></ul> |

A standard optimization call (`m.solve()`) only reports `"Infeasible"` when constraints clash. Calling `m.check()` returns `"Unsat"` along with conflicting constraint names: SMT/CP solvers such as Z3 and Pumpkin extract an **Unsat Core** (a mutually inconsistent subset), whereas MIP solvers such as HiGHS return an **Elastic Repair Set**.

This example diagnoses a staffing-vs-budget conflict with Z3 and HiGHS and reads the result from `res.conflicts` (also stored on `m.conflicts`). Here Z3 excludes the unrelated rule, though in general a returned Unsat Core is not guaranteed to be minimal.

## The Conflicting Scenario

A tech team is staffing a customer project:
1. Each engineer costs $8,000, and total staffing cost must stay within the project budget (`budget_limit`).
2. The customer requires rush delivery (`rush_required`).
3. Rush delivery mandates at least 8 engineers (`rush_staffing_rule`).
4. The board sets a strict budget cap of $50,000 (`strict_board_budget_cap`).
5. Labor law requires at least 1 engineer on staff (`minimum_one_employee`).

These rules contradict each other:

$$8 \text{ engineers} \times \$8,000 = \$64,000 > \$50,000$$

## Implementation in WaSHI

> [!NOTE]
> **Z3 Prerequisites:** Importing `@ohtaman/washi/solvers/z3` requires the optional `z3-solver` peer dependency (`npm install z3-solver`). Running Z3 in a browser also requires Cross-Origin Isolation (`COOP` / `COEP`) headers — see [Cross-Origin Isolation](../getting-started/cross-origin.md).

<CodeRunner preset="conflict_diagnosis_unsat">

```typescript
import { Model, implies, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

async function diagnoseConflicts() {
  const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });

  const engineers = m.integer("engineers", { lb: 0, ub: 20 });
  const budget = m.continuous("budget", { lb: 0, ub: 100000 });
  const rushDelivery = m.bool("rushDelivery");

  // Rule 1: Each engineer costs $8,000
  m.constraint(expr`8000 * ${engineers} <= ${budget}`, "budget_limit");

  // Rule 2: Customer requires rush delivery
  m.constraint(rushDelivery, "rush_required");

  // Rule 3: Rush delivery requires at least 8 engineers
  m.constraint(implies(rushDelivery, expr`${engineers} >= 8`), "rush_staffing_rule");

  // Rule 4: Board budget cap of $50,000 (conflicts with Rules 1-3)
  m.constraint(expr`${budget} <= 50000`, "strict_board_budget_cap");

  // Rule 5: Innocent bystander rule
  m.constraint(expr`${engineers} >= 1`, "minimum_one_employee");

  // Run diagnosis
  const res = await m.check({ solver: "z3" });

  console.log(`Status: ${res.status}`); // Status: Unsat
  console.log("Z3 Unsat Core (scale-invariant):", res.conflicts); // also available via m.conflicts
  // ["budget_limit", "rush_required", "rush_staffing_rule", "strict_board_budget_cap"]

  // Built-in HiGHS can also diagnose conflicts by finding constraints to relax:
  const highsDiag = await m.check({ solver: "highs" });
  console.log("HiGHS Elastic Repair Set:", highsDiag.conflicts);
  // ["rush_required"]
}

diagnoseConflicts();
```

</CodeRunner>

## Practical Notes

### Z3 (`m.check({ solver: "z3" })`)

Z3 supports continuous variables (`m.continuous()`, such as `budget` above) and decimal coefficients. It returns all four conflicting rules while excluding `minimum_one_employee`, regardless of numeric scale.

### Pumpkin (`m.check({ solver: "pumpkin" })`)

Pumpkin is bundled via `@ohtaman/washi/solvers/pumpkin` and needs neither `z3-solver` nor browser `COOP` / `COEP` headers. If every variable is a bounded integer or boolean (for example, changing `budget` to `m.integer()`), Pumpkin also extracts a scale-invariant Unsat Core.

### HiGHS (`m.check({ solver: "highs" })`)

Rather than an Unsat Core, HiGHS returns an **Elastic Repair Set** — constraints whose total slack (relaxation) needed to restore feasibility is minimized. It populates `conflicts` and leaves `unsatCore` as `undefined`, whereas Z3 and Pumpkin populate both. Because relaxing `rush_required` takes `1` unit while relaxing the budget cap takes `$14,000`, HiGHS flags `rush_required`.
