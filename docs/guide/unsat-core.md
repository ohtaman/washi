# Conflict Diagnosis (`unsatCore`) & Solution Validation

When building real-world optimization and configuration systems, two verification questions arise constantly:
1. **Why is my model infeasible?** Which specific business rules contradict each other?
2. **Does the solver's solution genuinely satisfy every constraint?** How do I verify tolerances, integrality, and formulations?

WaSHI provides built-in tools for both: **Unsat Core conflict diagnosis** via Z3 (`m.check()`), **independent solution validation** (`m.validateSolution()`), **LP formulation export** (`m.toLpString()`), and **fast unit testing** (`MockSolver`).

---

## 🔍 Conflict Diagnosis (`unsatCore` / `conflicts`)

When a model is **Infeasible**, traditional MIP solvers simply report that no solution exists without indicating *which* constraints are contradictory.
By calling **`await m.check({ solver: "z3" })`**, WaSHI uses Z3's `assertAndTrack` mechanism to compute an **Unsatisfiable Core (`unsatCore`)**—a conflicting subset of named constraints that cannot be satisfied simultaneously:

```typescript
import { Model, expr } from "@ohtaman/washi";
// Register the Z3 solver plugin
import "@ohtaman/washi/solvers/z3";

const m = new Model();

const x = m.continuous("reserve", { lb: 0 });

// Add named business requirements
m.constraint(expr`${x} >= 100`, "minimum_regulatory_reserve");
m.constraint(expr`${x} <= 50`, "budget_ceiling");
m.constraint(expr`${x} >= 10`, "routine_operating_cost");

const result = await m.check({ solver: "z3" });

if (result.status === "Unsat") {
  console.log("Contradictory constraints identified:");
  console.log(m.conflicts); // or result.conflicts / result.unsatCore / m.unsatCore
  // Output: ["minimum_regulatory_reserve", "budget_ceiling"]
}
```

Notice that `routine_operating_cost` is **not** in the core, because only `minimum_regulatory_reserve` ($x \ge 100$) and `budget_ceiling` ($x \le 50$) directly contradict each other.

> [!IMPORTANT]
> - **Use `m.check({ solver: "z3" })` for Unsat Core extraction**: `m.solve()` runs optimization (`Z3.Optimize`), whereas `m.check()` runs tracked satisfiability checking (`Z3.Solver.assertAndTrack`) and populates `result.conflicts` / `m.conflicts` (and alias `m.unsatCore`).
> - **Name your constraints**: Variable bounds (`lb`, `ub`) act as background domain declarations. To include a bound or business rule in the reported `unsatCore` list, register it as a named constraint via `m.constraint(expr`...`, "rule_name")`.

### Workflow: Optimize with HiGHS, Diagnose with Z3

Because WaSHI models are solver-independent, you can solve your optimization model with **HiGHS** first and automatically fall back to **Z3** `m.check()` if HiGHS reports `"Infeasible"`:

```typescript
const status = await m.solve(); // Fast MIP solve with default HiGHS

if (status === "Infeasible") {
  const diag = await m.check({ solver: "z3" });
  console.error("Model is infeasible due to conflicting rules:", diag.conflicts);
}
```

---

## ✅ Independent Solution Validation (`m.validateSolution()`)

After solving a model (or supplying a custom candidate map via `values`), you can independently verify that all variable bounds, integer/binary domains, linear constraints, and logical SMT formulas hold against the original model definitions:

```typescript
const status = await m.solve();

if (m.hasPrimalSolution) {
  const report = m.validateSolution({
    feasibilityTolerance: 1e-6,     // Max allowed violation for bounds and linear constraints
    integralityTolerance: 1e-6,     // Max distance from nearest integer for Integer/Binary vars
    evaluateLogicalConstraints: true,
  });

  console.log("Valid:", report.valid);
  console.log("Complete:", report.complete);
  console.log("Max violation:", report.maxViolation);
  console.log("Summary:", report.summary);

  if (!report.valid) {
    console.warn("Violations detected:", report.violations);
  }
}
```

### `SolutionValidationReport` Summary

| Property | Type | Description |
| :--- | :--- | :--- |
| `valid` | `boolean` | `true` iff `complete === true`, `uncheckedConstraints.length === 0`, and `violations.length === 0`. |
| `complete` | `boolean` | `true` when all variables, Boolean variables, linear constraints, and logical constraints were evaluated. |
| `maxViolation` | `number` | Largest numeric violation magnitude across all evaluated bounds, integrality checks, and constraints. |
| `violations` | `SolutionViolation[]` | Flat list of violations (`"missing_value"`, `"non_finite_value"`, `"invalid_boolean_value"`, `"lower_bound"`, `"upper_bound"`, `"integrality"`, `"linear_constraint"`, `"logical_constraint"`, `"unchecked_constraint"`). |
| `violationsByName` | `Record<string, SolutionViolation[]>` | Violations grouped by variable or constraint name. |
| `uncheckedConstraints` | `string[]` | Names of constraints that could not be evaluated. |
| `missingVariables` | `string[]` | Names of numeric or Boolean variables whose values were `null` or `undefined`. |
| `summary` | `SolutionValidationSummary` | Counts of checked vs. total variables, Boolean variables, linear constraints, and logical constraints. |

---

## 📄 Inspecting the LP Formulation (`m.toLpString()`)

When debugging coefficients, signs, or Big-M indicator expansions, call `m.toLpString()` to export the model in standard CPLEX/HiGHS `.lp` format:

```typescript
const m = new Model("DebugModel");
const x = m.integer("x", { lb: 0, ub: 10 });
m.objective(maximize(expr`5 * ${x}`));
m.constraint(expr`2 * ${x} <= 15`, "resource_limit");

console.log(m.toLpString());
/*
Maximize
 obj: 5 x
Subject To
 resource_limit: 2 x <= 15
Bounds
 0 <= x <= 10
Generals
 x
End
*/
```

---

## 🧪 Unit Testing Application Logic with `MockSolver`

When running unit tests for application code that builds or consumes a WaSHI `Model`, you can use the built-in `MockSolver` (`solver: "mock"`) to return deterministic results instantaneously without loading WebAssembly:

```typescript
import { Model, MockSolver, expr, maximize } from "@ohtaman/washi";

const mock = new MockSolver({
  status: "Optimal",
  objectiveValue: 420,
  values: { x: 10, y: 20 },
});

const m = new Model({ solver: mock });
const x = m.integer("x");
const y = m.integer("y");
m.objective(maximize(expr`10 * ${x} + 16 * ${y}`));

await m.solve();
console.log(m.objectiveValue); // 420
console.log(x.value, y.value); // 10, 20
```
