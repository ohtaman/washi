# Conflict Diagnosis (`unsatCore`), Validation & Debugging

When a model has no solution (`"Infeasible"`), or when you want to double-check solver output before using it in production, WaSHI provides four built-in tools:

- **Find conflicting constraints (`m.check()`)**: Pinpoint which named constraints contradict each other.
- **Verify solutions (`m.verify()`)**: Independently check that a solution satisfies all bounds, integrality rules, and constraints.
- **Inspect generated equations (`m.toLpString()`)**: Export the model as CPLEX `.lp` text to check signs, coefficients, and names.
- **Unit-test without WebAssembly (`MockSolver`)**: Return deterministic results instantly in CI.

---

## Finding Conflicting Constraints (`m.check()`)

When `m.solve()` returns `"Infeasible"`, it tells you that no solution satisfies every rule—not *which* rules conflict.
To find the conflicting constraints, call `m.check()` with `"pumpkin"` (for bounded integer and boolean models) or `"z3"` (for models with `Continuous` variables or decimal arithmetic):

```typescript
import { Model, expr } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model();
const x = m.continuous("reserve", { lb: 0 });

// Register named constraints
m.constraint(expr`${x} >= 100`, "minimum_regulatory_reserve");
m.constraint(expr`${x} <= 50`, "budget_ceiling");
m.constraint(expr`${x} >= 10`, "routine_operating_cost");

const result = await m.check({ solver: "z3" });

if (result.status === "Unsat") {
  console.log("Conflicting constraints:", m.conflicts);
  // Output: ["minimum_regulatory_reserve", "budget_ceiling"]
}
```

`routine_operating_cost` ($x \ge 10$) is excluded because only `minimum_regulatory_reserve` ($x \ge 100$) and `budget_ceiling` ($x \le 50$) directly contradict each other.

> [!IMPORTANT]
> - **Use `m.check()`, not `m.solve()`, for conflict diagnosis**: `m.solve()` optimizes an objective and only returns `"Infeasible"`. Call `m.check()` to populate `result.conflicts` / `m.conflicts` (also aliased as `result.unsatCore` / `m.unsatCore`).
> - **Name any rule you want to see in the output**: Variable bounds (`lb`, `ub`) do not have names, so they never appear in `conflicts` or `unsatCore`. If a bound might be part of a conflict, also register it as a named constraint via `m.constraint(expr`...`, "rule_name")`.

### Choosing a Diagnosis Solver

You can diagnose infeasibility after `m.solve()` with any of three backends:

| | Pumpkin (`m.check({ solver: "pumpkin" })`) | Z3 (`m.check({ solver: "z3" })`) | HiGHS / GLPK (`m.check()`) |
| :--- | :--- | :--- | :--- |
| **Best for** | Bounded integer & boolean models | Models with `Continuous` or decimal values | Quick check with zero extra imports |
| **Setup** | Bundled (`@ohtaman/washi/solvers/pumpkin`) | Optional (`z3-solver`) | Built-in (`HiGHS`) / optional (`glpk.js`) |
| **Browser headers** | None | Requires `COOP` / `COEP` headers | None |
| **Result fields** | `unsatCore` and `conflicts` | `unsatCore` and `conflicts` | `conflicts` only (`unsatCore` is `undefined`) |
| **What it returns** | A set of rules that cannot all hold together | A set of rules that cannot all hold together | A set of rules that, if relaxed, restores feasibility |
| **Unit-scale sensitivity** | Scale-invariant | Scale-invariant | Scale-sensitive (prefers relaxing smaller-numbered constraints) |

```typescript
// Import Pumpkin or Z3 at the top of your file if needed:
// import "@ohtaman/washi/solvers/pumpkin";
// import "@ohtaman/washi/solvers/z3";

const status = await m.solve();

if (status === "Infeasible") {
  // Option 1: Built-in HiGHS (no extra imports; scale-sensitive)
  const diag = await m.check();
  console.error("Constraints to relax:", diag.conflicts);

  // Option 2: Bundled Pumpkin (bounded int/bool; no COOP/COEP headers)
  // const pumpkinDiag = await m.check({ solver: "pumpkin" });
  // console.error("Pumpkin Unsat Core:", pumpkinDiag.unsatCore);

  // Option 3: Z3 (supports Continuous/decimal variables; requires z3-solver)
  // const z3Diag = await m.check({ solver: "z3" });
  // console.error("Z3 Unsat Core:", z3Diag.unsatCore);
}
```

> [!TIP]
> If your model mixes constraints with very different scales (for example, headcount $\le 8$ alongside budget $\le 50{,}000$), default `m.check()` (HiGHS) tends to flag the smaller-numbered constraint even when the larger one is the real issue. Use `pumpkin` or `z3` for scale-invariant diagnosis, or normalize your constraint scales.

---

## Verifying Solutions (`m.verify()`)

After solving a model (or passing custom values via `values`), call `m.verify()` to check that all variable bounds, integer requirements, linear constraints, and logical constraints hold within tolerance:

```typescript
const status = await m.solve();

if (m.hasPrimalSolution) {
  const report = m.verify({
    feasibilityTolerance: 1e-6, // Max allowed violation for bounds and linear constraints
    integralityTolerance: 1e-6, // Max distance from nearest integer for Integer/Binary vars
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

### `VerificationReport` Fields

| Property | Type | Description |
| :--- | :--- | :--- |
| `valid` | `boolean` | `true` when `complete === true`, `uncheckedConstraints` is empty, and `violations` is empty. |
| `complete` | `boolean` | `true` when every variable and constraint in the model was evaluated. |
| `maxViolation` | `number` | Largest numeric violation across all checked bounds, integrality rules, and constraints. |
| `violations` | `VerificationViolation[]` | List of detected violations (bounds, integrality, linear/logical constraints, or missing/invalid values). |
| `violationsByName` | `Record<string, VerificationViolation[]>` | Violations grouped by variable or constraint name. |
| `uncheckedConstraints` | `string[]` | Names of constraints that could not be evaluated. |
| `missingVariables` | `string[]` | Names of variables whose values were `null` or `undefined`. |
| `summary` | `VerificationSummary` | Counts of checked vs. total variables and constraints. |

---

## Inspecting the LP Formulation (`m.toLpString()`)

To verify coefficients, signs, or constraint names, call `m.toLpString()` to export the model in standard CPLEX `.lp` format:

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

## Unit Testing Without WebAssembly (`MockSolver`)

In unit tests for application code that builds or reads a `Model`, pass `MockSolver` to return fixed results instantaneously without loading WebAssembly:

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
