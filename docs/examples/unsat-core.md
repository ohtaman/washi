# Conflict Diagnosis (Unsat Core)

| Problem Class | Solver | Key APIs | Links |
| :--- | :--- | :--- | :--- |
| Infeasibility Diagnosis / Unsat Core | Z3 (`@ohtaman/washi/solvers/z3`) | `m.check()`, `m.unsatCore` | <ul><li><a href="https://ohtaman.github.io/washi/demo/?preset=conflict_diagnosis_unsat">Open in Playground</a></li><li><a href="https://github.com/ohtaman/washi/blob/main/examples/node/05-unsat-core-diagnosis.ts">Source Code</a></li></ul> |

When business rules, budgets, and operational policies grow complex, constraints inevitably conflict. Traditional solvers simply report "Infeasible", leaving engineers to guess which of hundreds of rules caused the contradiction.

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
import { Model } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

async function diagnoseConflicts() {
  const m = new Model({ name: "ConflictDiagnosis", solver: "z3" });

  const engineers = m.addVar({ name: "engineers", type: "Integer", lb: 0, ub: 20 });
  const budget = m.addVar({ name: "budget", type: "Continuous", lb: 0, ub: 100000 });
  const rushDelivery = m.addBoolVar("rushDelivery");

  // Rule 1: Each engineer costs $8,000
  m.addConstraint(engineers.mul(8000).le(budget), "budget_limit");

  // Rule 2: Customer requires rush delivery
  m.addConstraint(rushDelivery, "rush_required");

  // Rule 3: Rush delivery requires at least 8 engineers
  m.addConstraint(rushDelivery.implies(engineers.ge(8)), "rush_staffing_rule");

  // Rule 4: Board budget cap of $50,000 (Conflict!)
  m.addConstraint(budget.le(50000), "strict_board_budget_cap");

  // Rule 5: Innocent bystander rule
  m.addConstraint(engineers.ge(1), "minimum_one_employee");

  // Run diagnosis
  const res = await m.check({ solver: "z3" });

  console.log(`Status: ${res.status}`);
  console.log("Conflicting Constraints (Unsat Core):", m.unsatCore);
}

diagnoseConflicts();
```

</CodeRunner>
