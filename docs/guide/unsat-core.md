# Conflict Diagnosis (`unsatCore`), Validation & Debugging

When building real-world optimization and rule systems, you need to diagnose infeasible models, verify returned solutions, and inspect or unit-test formulations cleanly.

WaSHI provides a unified verification and debugging toolkit for all three:
- **Conflict diagnosis (`m.check()`)**: Pinpoint contradictory constraints via built-in HiGHS elastic relaxation, bundled Pumpkin Unsat Core, or Z3 Unsat Core.
- **Solution verification & LP inspection (`m.verify()`, `m.toLpString()`)**: Independently verify variable bounds, integrality, and constraints, and export CPLEX `.lp` text to inspect generated equations.
- **Fast unit testing (`MockSolver`)**: Test application model-building and post-processing logic in CI without loading WebAssembly.

---

## Conflict Diagnosis (`unsatCore` / `conflicts`)

When an optimization run (`m.solve()`) returns **`"Infeasible"`**, the status alone tells you that no solution satisfies every constraint—not *which* rules conflict with each other.
By calling **`await m.check({ solver: "pumpkin" })`** (for bounded integer and boolean models without `COOP`/`COEP` headers or external peer dependencies) or **`await m.check({ solver: "z3" })`** (for models including `Continuous` variables or fractional arithmetic), WaSHI computes an **Unsatisfiable Core (`unsatCore`)**—a conflicting subset of named constraints that cannot be satisfied simultaneously:

```typescript
import { Model, expr } from "@ohtaman/washi";
// Register the Z3 solver plugin (for Continuous / real-valued SMT models)
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
> - **Use `m.check({ solver: "pumpkin" })` or `m.check({ solver: "z3" })` for Unsat Core extraction**: `m.solve()` runs optimization, whereas `m.check()` runs assumption-tracked satisfiability checking (Pumpkin assumption core or `Z3.Solver.assertAndTrack`) and populates `result.conflicts` / `m.conflicts` (and alias `m.unsatCore`).
> - **Name your constraints**: Variable bounds (`lb`, `ub`) act as background domain declarations. To include a bound or business rule in the reported `unsatCore` list, register it as a named constraint via `m.constraint(expr`...`, "rule_name")`.

### Workflow: Infeasibility Diagnosis with HiGHS, Pumpkin, or Z3

Because WaSHI models are solver-independent, you can choose from three diagnosis strategies:
1. **Built-in HiGHS & GLPK (default)**: `await m.check()` uses a single-solve elastic slack formulation ($\min \sum s_i$) to identify which constraints required relaxation (`diag.conflicts`), requiring no extra imports.
2. **Bundled Pumpkin CP/LCG Solver**: `await m.check({ solver: "pumpkin" })` (after `import "@ohtaman/washi/solvers/pumpkin"`) extracts a scale-invariant `unsatCore` / `conflicts` over bounded integer and boolean models with **zero external dependencies** and **zero browser `COOP` / `COEP` headers**.
3. **Z3 SMT Solver**: `await m.check({ solver: "z3" })` uses SMT tracking to extract an exact unsatisfiable core (`diag.unsatCore` / `diag.conflicts`), including models with `Continuous` variables or fractional arithmetic.

```typescript
const status = await m.solve(); // Fast MIP solve with default HiGHS

if (status === "Infeasible") {
  // Option 1: Built-in single-solve elastic diagnosis with HiGHS
  const diag = await m.check();
  console.error("Model is infeasible due to conflicting rules:", diag.conflicts);

  // Option 2: Bundled zero-COOP/COEP unsat core with Pumpkin (bounded int/bool models; requires import "@ohtaman/washi/solvers/pumpkin")
  // const pumpkinDiag = await m.check({ solver: "pumpkin" });
  // console.error("Pumpkin Unsat Core:", pumpkinDiag.unsatCore);

  // Option 3: Exact SMT unsat core diagnosis with Z3 (supports Continuous/real vars; requires import "@ohtaman/washi/solvers/z3")
  // const z3Diag = await m.check({ solver: "z3" });
  // console.error("Z3 Unsat Core:", z3Diag.unsatCore);
}
```

### Comparing Pumpkin `unsatCore`, Z3 `unsatCore`, and HiGHS Elastic Slack `conflicts`

| Property | Pumpkin (`m.check({ solver: "pumpkin" })`) | Z3 (`m.check({ solver: "z3" })`) | HiGHS / GLPK (`m.check()`) |
| :--- | :--- | :--- | :--- |
| **Setup & Dependencies** | **Bundled** (`@ohtaman/washi/solvers/pumpkin`, zero peer deps) | Optional peer dependency (`z3-solver`) | **Built-in** (HiGHS) / optional `glpk.js` |
| **Browser Headers** | **None** (`COOP` / `COEP` not required) | Requires `COOP` / `COEP` (`SharedArrayBuffer`) | **None** |
| **Supported Variables** | Bounded `Integer`, `Binary`, `BoolVar` | `Continuous`, `Integer`, `Binary`, `BoolVar` | `Continuous`, `Integer`, `Binary`, `BoolVar` |
| **Algorithm** | LCG conflict analysis under constraint assumptions | SMT assumption tracking (`assertAndTrack`) | Single-solve $L_1$ elastic slack relaxation ($\min \sum s_i$) |
| **Populated Fields** | Both `result.unsatCore` and `result.conflicts` | Both `result.unsatCore` and `result.conflicts` | `result.conflicts` (`unsatCore` is `undefined`) |
| **Semantic Meaning** | A **contradictory subset** of rules that cannot all hold together | A **contradictory subset** of rules that cannot all hold together | A **minimum-violation repair set** of constraints whose relaxation restores feasibility |
| **Unit-Scaling Sensitivity** | **Scale-invariant** (pure logical/integer contradiction) | **Scale-invariant** (pure logical/algebraic contradiction) | **Scale-sensitive** (minimizing unweighted $\sum s_i$ prefers relaxing a headcount constraint by `2` units over a budget constraint by `10,000` dollars) |

> [!TIP]
> When diagnosing models that mix constraints of vastly different magnitudes (e.g., headcount $\le 8$ alongside budget $\le 50{,}000$), use **`m.check({ solver: "pumpkin" })`** (for bounded integer/boolean models without `COOP`/`COEP`) or **`m.check({ solver: "z3" })`** (when `Continuous` variables or fractional thresholds are present) if you want a scale-invariant set of mutually contradictory rules, or normalize constraint scales when relying on unweighted $L_1$ slack relaxation.

---

## Independent Solution Verification (`m.verify()`)

After solving a model (or supplying a custom candidate map via `values`), you can independently verify that all variable bounds, integer/binary domains, linear constraints, and logical SMT formulas hold against the original model definitions:

```typescript
const status = await m.solve();

if (m.hasPrimalSolution) {
  const report = m.verify({
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

### `VerificationReport` Summary

| Property | Type | Description |
| :--- | :--- | :--- |
| `valid` | `boolean` | `true` iff `complete === true`, `uncheckedConstraints.length === 0`, and `violations.length === 0`. |
| `complete` | `boolean` | `true` when all variables, Boolean variables, linear constraints, and logical constraints were evaluated. |
| `maxViolation` | `number` | Largest numeric violation magnitude across all evaluated bounds, integrality checks, and constraints. |
| `violations` | `VerificationViolation[]` | Flat list of violations (`"missing_value"`, `"non_finite_value"`, `"invalid_boolean_value"`, `"lower_bound"`, `"upper_bound"`, `"integrality"`, `"linear_constraint"`, `"logical_constraint"`, `"unchecked_constraint"`). |
| `violationsByName` | `Record<string, VerificationViolation[]>` | Violations grouped by variable or constraint name. |
| `uncheckedConstraints` | `string[]` | Names of constraints that could not be evaluated. |
| `missingVariables` | `string[]` | Names of numeric or Boolean variables whose values were `null` or `undefined`. |
| `summary` | `VerificationSummary` | Counts of checked vs. total variables, Boolean variables, linear constraints, and logical constraints. |

---

## Inspecting the LP Formulation (`m.toLpString()`)

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

## Unit Testing Application Logic with `MockSolver`

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
