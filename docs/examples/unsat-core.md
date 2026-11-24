# Conflict Diagnosis (Unsat Core)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Infeasibility Diagnosis / Unsat Core | Z3 (`@ohtaman/washi/solvers/z3`) | `m.integer()`, `m.continuous()`, `implies()`, `m.constraint()`, `expr`, `m.check()`, `m.conflicts` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=conflict_diagnosis_unsat">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts">Source Code</a></li></ul> |

When business rules, budgets, and operational policies grow complex, constraints can easily conflict. Because a standard optimization call (`m.solve()`) only reports `"Infeasible"`, WaSHI provides `m.check()` to pinpoint conflicting rules without manual trial-and-error.

This example shows how to isolate the conflicting constraint subset using Z3 Unsat Core extraction.

## The Conflicting Scenario

A tech team is staffing a customer project:
1. Each engineer costs $8,000 against the project budget (`budget_limit`).
2. The customer requires rush delivery (`rush_required`).
3. Rush delivery mandates at least 8 engineers (`rush_staffing_rule`).
4. The board has imposed a strict budget cap of $50,000 (`strict_board_budget_cap`).
5. Labor law requires at least 1 employee on staff (`minimum_one_employee`).

Notice that:

$$8 \text{ engineers} \times \$8,000 = \$64,000 > \$50,000 \text{ budget!}$$

## Implementation in WaSHI

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

  // Rule 4: Board budget cap of $50,000 (Conflict!)
  m.constraint(expr`${budget} <= 50000`, "strict_board_budget_cap");

  // Rule 5: Innocent bystander rule
  m.constraint(expr`${engineers} >= 1`, "minimum_one_employee");

  // Run diagnosis
  const res = await m.check({ solver: "z3" });

  console.log(`Status: ${res.status}`); // Status: Unsat
  console.log("Z3 Unsat Core (scale-invariant):", m.conflicts);
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

- **Choosing Between Pumpkin, Z3, and HiGHS for Conflict Diagnosis**:
  - **Pumpkin (`m.check({ solver: "pumpkin" })`)**: Bundled (`@ohtaman/washi/solvers/pumpkin`) with no `COOP` / `COEP` headers required. Works on discrete models where all variables are bounded integers or booleans (e.g., if `budget` is `m.integer(...)`), and ignores unit-scale differences.
  - **Z3 (`m.check({ solver: "z3" })`)**: Supports `Continuous` variables (like `budget` above) and decimals. Returns all four conflicting rules while excluding `minimum_one_employee`, regardless of unit scale.
  - **HiGHS (`m.check({ solver: "highs" })`)**: Minimizes the total numeric amount by which constraints must be relaxed. Because relaxing `rush_required` takes `1` unit whereas relaxing the budget cap takes `14,000` dollars, HiGHS flags `rush_required`.
