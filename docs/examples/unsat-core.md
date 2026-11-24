# Conflict Diagnosis (Unsat Core)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Infeasibility Diagnosis / Unsat Core | Z3 (`@ohtaman/washi/solvers/z3`) | `m.integer()`, `m.continuous()`, `implies()`, `m.constraint()`, `expr`, `m.check()`, `m.conflicts` | <ul><li><a href="https://washi.ohtaman.dev/demo/?preset=conflict_diagnosis_unsat">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts">Source Code</a></li></ul> |

A standard optimization call (`m.solve()`) only reports `"Infeasible"` when constraints clash. Calling `m.check()` returns `"Unsat"` and extracts an **Unsat Core** — a subset of named constraints that cannot all hold at once.

This example uses Z3 to isolate the conflicting rules in `m.conflicts` while ignoring unrelated constraints. Note that `unsatCore` / `m.conflicts` is not guaranteed to be minimal.

## The Conflicting Scenario

A tech team is staffing a customer project:
1. Each engineer costs $8,000 against the project budget (`budget_limit`).
2. The customer requires rush delivery (`rush_required`).
3. Rush delivery mandates at least 8 engineers (`rush_staffing_rule`).
4. The board sets a strict budget cap of $50,000 (`strict_board_budget_cap`).
5. Labor law requires at least 1 employee on staff (`minimum_one_employee`).

These rules contradict each other:

$$8 \text{ engineers} \times \$8,000 = \$64,000 > \$50,000 \text{ budget!}$$

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

### Z3 (`m.check({ solver: "z3" })`)

Z3 supports `Continuous` variables (such as `budget` above) and decimal coefficients. It returns all four conflicting rules while excluding `minimum_one_employee`, regardless of numeric scale.

### Pumpkin (`m.check({ solver: "pumpkin" })`)

Pumpkin is bundled via `@ohtaman/washi/solvers/pumpkin` and needs neither `z3-solver` nor browser `COOP` / `COEP` headers. If every variable is a bounded integer or boolean (for example, changing `budget` to `m.integer()`), Pumpkin also extracts a scale-invariant core.

### HiGHS (`m.check({ solver: "highs" })`)

HiGHS finds the smallest total numeric relaxation that restores feasibility. Because relaxing `rush_required` takes `1` unit while relaxing the budget cap takes `$14,000`, HiGHS flags `rush_required`.
