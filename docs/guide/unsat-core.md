# Conflict Diagnosis (`unsatCore`), Validation & Debugging

When a model has no feasible solution (`"Infeasible"`), or when you want to verify solver output before using it in production, WaSHI provides four diagnostic and debugging tools:

- **Conflict diagnosis (`m.check()`)**: Pinpoints which named constraints cause infeasibility.
- **Solution verification (`m.verify()`)**: Independently checks variable bounds, integrality, and all constraints.
- **Formulation inspection (`m.toLpString()`)**: Exports CPLEX `.lp` text to inspect signs, coefficients, and names.
- **Deterministic testing (`MockSolver`)**: Returns fixed results in unit tests without loading WebAssembly.

---

## Finding Conflicting Constraints (`m.check()`)

When `m.solve()` returns `"Infeasible"`, it proves that no solution satisfies every rule, but does not tell you *which* rules clash.
To diagnose the cause, call `m.check()`.
A logical **Unsat Core** is a subset of named constraints that cannot hold simultaneously—even if every other named constraint in the model were removed (keeping variable bounds), those rules would still conflict.

Pass `{ solver: "pumpkin" }` for models with only bounded integer and Boolean variables, or `{ solver: "z3" }` for models with `Continuous` variables or non-integer coefficients/constants:

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
  console.log("Conflicting constraints:", result.unsatCore); // also available via m.conflicts
  // Output: ["minimum_regulatory_reserve", "budget_ceiling"]
}
```

In this example, `routine_operating_cost` is excluded because only `minimum_regulatory_reserve` and `budget_ceiling` directly contradict each other.

> [!IMPORTANT]
> - **Use `m.check()` for diagnosis**: When a model is infeasible, `m.solve()` only returns `"Infeasible"` without identifying the conflicting rules. When `m.check()` returns `"Unsat"`, it populates `conflicts` on all solvers, plus `unsatCore` on Pumpkin and Z3 (`undefined` on HiGHS/GLPK).
> - **Name every rule you want diagnosed**: Variable `lb`/`ub` bounds are unnamed and never appear in `conflicts`. Register any bound you want diagnosed with ``m.constraint(expr`...`, "rule_name")``.

### Choosing a Diagnosis Solver

After `m.solve()` returns `"Infeasible"`, choose among three backends based on your variable types and scale sensitivity:

| Criterion | Pumpkin (`m.check({ solver: "pumpkin" })`) | Z3 (`m.check({ solver: "z3" })`) | HiGHS / GLPK (`m.check()` / `{ solver: "glpk" }`) |
| :--- | :--- | :--- | :--- |
| **Best for** | Bounded integer & Boolean models | Models with `Continuous` or non-integer values | General LP / MIP models (HiGHS needs zero extra imports) |
| **Setup** | Bundled (no extra import) | Optional (`z3-solver` + `@ohtaman/washi/solvers/z3`) | Bundled (HiGHS, default) / optional (`glpk.js`) |
| **Browser headers** | None | Requires `COOP` / `COEP` headers | None |
| **Result fields** | `unsatCore` and `conflicts` | `unsatCore` and `conflicts` | `conflicts` only (`unsatCore` is `undefined`) |
| **What it returns** | Unsat Core (mutually incompatible rules) | Unsat Core (mutually incompatible rules) | Elastic-relaxation set (rules to relax to restore feasibility) |
| **Unit-scale sensitivity** | Scale-invariant | Scale-invariant | Scale-sensitive (prefers relaxing smaller-scale constraints) |

```typescript
// Import Z3 at the top of your file if needed (HiGHS and Pumpkin require no extra import):
// import "@ohtaman/washi/solvers/z3";

const status = await m.solve();

if (status === "Infeasible") {
  // Option 1: Built-in HiGHS (no extra imports; scale-sensitive)
  const diag = await m.check();
  console.error("Constraints to relax:", diag.conflicts);

  // Option 2: Bundled Pumpkin (bounded int/bool; scale-invariant Unsat Core)
  // const pumpkinDiag = await m.check({ solver: "pumpkin" });
  // console.error("Pumpkin Unsat Core:", pumpkinDiag.unsatCore);

  // Option 3: Z3 (supports Continuous/decimal variables; requires z3-solver)
  // const z3Diag = await m.check({ solver: "z3" });
  // console.error("Z3 Unsat Core:", z3Diag.unsatCore);
}
```

> [!TIP]
> **Why HiGHS / GLPK are scale-sensitive**: In HiGHS and GLPK, `m.check()` introduces non-negative relaxation slacks to each constraint (including auto-named ones)—subtracting on `<=`, adding on `>=`, and both on `==`—and minimizes their **unweighted sum**.
> When constraints mix very different numeric scales—such as headcount $\le 8$ alongside budget $\le 50{,}000$—relaxing the smaller-scale constraint adds far less to the total slack, so HiGHS/GLPK tends to flag it first.
> Normalize your constraint units to reduce scale bias in elastic relaxation, or use `pumpkin` or `z3` when you need a scale-invariant Unsat Core.

---

## Verifying Solutions (`m.verify()`)

After solving a model, call `m.verify()` to check that every bound, integrality rule, linear constraint, and logical constraint holds within tolerance.
You can also pass a plain object via `values` (not a `Map`), such as `m.verify({ values: { x: 1, y: 2 } })`, to validate an externally produced assignment:

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

To inspect coefficients, signs, or constraint names, call `m.toLpString()` to export the model in standard CPLEX `.lp` format.
It exports numeric variables, linear/quadratic objectives, linear constraints, and lowered `max`/`min`/`abs`/`at`/`!=` expressions, while omitting propositional `BoolVar`s and logical constraints:

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

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

In unit tests for application code that builds or reads a `Model`, pass `MockSolver` to return fixed results immediately without loading WebAssembly:

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
