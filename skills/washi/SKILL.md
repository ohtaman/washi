---
name: washi
description: Formulate, inspect, solve, and verify mathematical optimization (LP, MIP, convex QP) and SMT satisfiability or unsat-core models in TypeScript and JavaScript using @ohtaman/washi (HiGHS, Z3, GLPK).
---

# WaSHI Modeling & Verification Skill

Use this skill when building, debugging, or verifying mathematical optimization (LP, MIP, convex QP) or satisfiability (SMT / SAT) models with `@ohtaman/washi`. For the full API reference and browser/bundler deployment rules, see [`docs/getting-started/ai-agents.md`](https://github.com/ohtaman/washi/blob/main/docs/getting-started/ai-agents.md) (available locally at `node_modules/@ohtaman/washi/docs/getting-started/ai-agents.md` in consumer projects or `docs/getting-started/ai-agents.md` in the repository).

---

## 1. Problem & Solver Selection

Select the solver engine and execution method that match the problem class:

| Problem Class | Recommended Solver | Setup & Import | Execution Method |
| :--- | :--- | :--- | :--- |
| **LP / MIP / Convex QP** (including `m.indicator()` Big-M and `initialValue` warm starts) | **HiGHS** (default) | Built-in (`import { Model } from "@ohtaman/washi"`) | `await m.solve()` |
| **SMT Propositional Logic** (`BoolVar`, `and`, `or`, `not`, `implies`, `xor`) | **Z3** plugin | `npm install z3-solver` + `import "@ohtaman/washi/solvers/z3"` | `await m.check({ solver: "z3" })` or `await m.solve({ solver: "z3" })` |
| **Infeasibility / Conflict Diagnosis** (`conflicts` / `unsatCore`) | **Z3** plugin | `npm install z3-solver` + `import "@ohtaman/washi/solvers/z3"` | `await m.check({ solver: "z3" })` |
| **LP / MIP with GLPK** (GPL-3.0; no QP, SMT, or `initialValue`) | **GLPK** plugin | `npm install glpk.js` + `import "@ohtaman/washi/solvers/glpk"` | `await m.solve({ solver: "glpk" })` |

- **Browser runtime notes**:
  - HiGHS and GLPK load local `.wasm` and Worker assets relative to the bundle (never falling back to an external CDN).
  - Z3 uses `SharedArrayBuffer` pthreads and requires `window.isSecureContext === true` and `window.crossOriginIsolated === true` (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`).

---

## 2. Algebraic Formulation Workflow

1. **Define decision variables on `Model`**:
   - Numeric (`Var`): `m.continuous(nameOrDims, { lb, ub, initialValue })`, `m.integer(...)`, `m.binary(...)`
   - Propositional boolean (`BoolVar`, for Z3): `m.bool(nameOrDims)`
   - Indexed containers: pass a count (`number` -> `Var[]` / `Var[][]`) or key array (`readonly string[]` -> `Record<K, Var>` / `Record<R, Record<C, Var>>`).
   - Provide finite `lb` and `ub` bounds whenever known—especially on variables used in `m.indicator()` so WaSHI can automatically derive a tight Big-M when `M` is omitted.
2. **Build expressions (`expr`, `sum`, `dot`)**:
   - Linear expression (`LinExpr`): `` expr`30 * ${x} + 50 * ${y} - 10` ``
   - Quadratic expression (`QuadExpr`, **objectives only**): `` expr`${x}^2 + 2 * ${x} * ${y} + ${y}^2` ``
   - Linear constraint (`Constraint`): `` expr`${x} + 2 * ${y} <= 40` `` (supports `<=`, `>=`, `==`, `=`)
   - Vector aggregations: `sum(iterable, mapper?)` and `dot(a, b)`
   - Propositional logic (for Z3): `and(...)`, `or(...)`, `not(...)`, `implies(a, b)`, `xor(a, b)` (or fluent `.and()`, `.or()`, `.not()`, `.implies()`, `.xor()`)
3. **Register objective and named constraints**:
   - Constructing an `expr` or `.le()` / `.ge()` / `.eq()` object does **not** attach it to the model.
   - Register the objective with `m.objective(maximize(e))` or `m.objective(minimize(e))`.
   - Register every constraint with a descriptive name: `m.constraint(c, "resource_limit")` or `m.indicator(binVar, c, { activeValue: 1, name: "cap_when_open" })`. Descriptive names are essential for LP inspection and Z3 `unsatCore` conflict diagnosis.

---

## 3. Model Inspection (`validateIntegrity` & `toLpString`)

Before solving or when debugging formulation bugs:

- **`m.validateIntegrity()`**: Validates variable ownership (variables and constraints cannot be shared across `Model` instances), bound sanity (`lb <= ub`, finite `initialValue` within bounds/integrality tolerance `1e-6`), and finite objective/constraint coefficients.
- **`m.toLpString()`**: Calls `validateIntegrity()` and exports the numeric LP / MIP / QP formulation in standard CPLEX LP format (`Maximize` / `Minimize`, `Subject To`, `Bounds`, `General`, `Binary`, `End`). Inspect this string to confirm objective sense, signs, coefficients, and right-hand sides match the mathematical specification.

---

## 4. Execution & Mandatory Self-Verification

Never report a model solution as final without executing the verification step:

1. **After `const status = await m.solve(options?)`**:
   - Verify `status === "Optimal"` (or `status === "Feasible"` / `m.hasPrimalSolution === true` when solver limits apply).
   - Call `const report = m.validateSolution()` and assert `report.valid === true`.
   - If `report.valid === false`, inspect `report.violations`, `report.missingVariables`, `report.uncheckedConstraints`, and `report.maxViolation`.
   - Note: `m.validateSolution()` independently checks variable finiteness, variable bounds (`lb`/`ub`), integrality (`Integer`, `Binary`, `BoolVar`), linear constraint residuals, and logical constraints. It does **not** recompute `m.objectiveValue` or verify natural-language problem coverage.
2. **When a model is infeasible (`"Infeasible"` or `"Unsat"`)**:
   - Run `const res = await m.check({ solver: "z3" })`.
   - When `res.status === "Unsat"`, inspect `res.conflicts` (alias for `res.unsatCore`, also stored on `m.conflicts` / `m.unsatCore`).
   - Because Z3 asserts variable bounds (`lb`/`ub`) and binary `{0, 1}` domains directly while tracking named constraints, `res.conflicts` returns a subset of registered constraint names that conflicts *together with the model's fixed variable bounds/domains* (not guaranteed minimal).

---

## 5. Executable Workflow Recipes

### Recipe 1: MIP Formulation, `toLpString()` Inspection & `validateSolution()` Verification

```ts
import { Model, expr, dot, sum, maximize } from "@ohtaman/washi";

export async function solveAndVerifyMip() {
  const m = new Model("ProductionMIP");
  const products = ["desk", "chair"] as const;
  const profit = { desk: 30, chair: 50 };
  const woodPerUnit = { desk: 1, chair: 2 };
  const laborPerUnit = { desk: 2, chair: 1 };

  const qty = m.integer(products, { lb: 0, ub: 100 });
  const lineOpen = m.binary("lineOpen");

  m.objective(maximize(expr`${dot(profit, qty)} - 20 * ${lineOpen}`));
  m.constraint(expr`${dot(woodPerUnit, qty)} <= 40`, "wood_limit");
  m.constraint(expr`${dot(laborPerUnit, qty)} <= 50`, "labor_limit");
  m.indicator(lineOpen, expr`${sum(Object.values(qty))} <= 0`, {
    activeValue: 0,
    name: "closed_line_zero_output",
  });

  // 1. Pre-solve integrity & LP formulation inspection
  m.validateIntegrity();
  const lpText = m.toLpString();

  // 2. Solve with default HiGHS solver
  const status = await m.solve();

  // 3. Mandatory independent solution verification
  const report = m.validateSolution();

  return {
    status,
    lpText,
    objectiveValue: m.objectiveValue,
    quantities: m.getValues(qty),
    lineOpen: lineOpen.value,
    valid: report.valid,
    maxViolation: report.maxViolation,
  };
}
```

### Recipe 2: Convex Quadratic Programming (QP) & Verification

```ts
import { Model, expr, minimize } from "@ohtaman/washi";

export async function solveAndVerifyQp() {
  const m = new Model("AllocationQP");
  const x = m.continuous("x", { lb: 0 });
  const y = m.continuous("y", { lb: 0 });

  m.objective(minimize(expr`${x}^2 + ${y}^2`));
  m.constraint(expr`${x} + ${y} >= 4`, "target_total");

  const lpText = m.toLpString();
  const status = await m.solve();
  const report = m.validateSolution();

  return {
    status,
    lpText,
    objectiveValue: m.objectiveValue,
    x: x.value,
    y: y.value,
    valid: report.valid,
  };
}
```

### Recipe 3: Z3 Propositional Logic, `unsatCore` Conflict Diagnosis & Verification

```ts
import { Model, expr, implies } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

export async function diagnoseAndVerifyWithZ3() {
  // Part A: Diagnose conflicting rules with Z3 unsatCore / conflicts
  const unsatModel = new Model("PolicyConflict", { solver: "z3" });
  const vip = unsatModel.bool("vip");
  const discount = unsatModel.integer("discount", { lb: 0, ub: 50 });

  unsatModel.constraint(vip, "customer_is_vip");
  unsatModel.constraint(implies(vip, expr`${discount} >= 20`), "vip_min_discount");
  unsatModel.constraint(expr`${discount} <= 10`, "campaign_cap");

  const unsatRes = await unsatModel.check();

  // Part B: Relax the conflicting cap and verify the satisfiable assignment
  const satModel = new Model("PolicyResolved", { solver: "z3" });
  const vipSat = satModel.bool("vip");
  const discountSat = satModel.integer("discount", { lb: 0, ub: 50 });

  satModel.constraint(vipSat, "customer_is_vip");
  satModel.constraint(implies(vipSat, expr`${discountSat} >= 20`), "vip_min_discount");
  satModel.constraint(expr`${discountSat} <= 25`, "campaign_cap");

  const satRes = await satModel.check();
  const report = satModel.validateSolution();

  return {
    unsatStatus: unsatRes.status,
    conflicts: unsatRes.conflicts,
    unsatCore: unsatRes.unsatCore,
    satStatus: satRes.status,
    resolvedDiscount: discountSat.value,
    valid: report.valid,
  };
}
```

---

## 6. Guardrails & Common Pitfalls

- **No quadratic constraints**: Quadratic terms (`${x}^2`, `${x} * ${y}`) are only valid in `m.objective(...)`. Using them in `m.constraint(...)` throws `"Quadratic constraints are not supported"`.
- **Do not confuse `LinExpr` and `Constraint`**: `m.objective(maximize(...))` requires a `LinExpr`, `QuadExpr`, `Var`, or `number` (never a `Constraint`). `m.constraint(...)` requires a `Constraint` (with `<=`, `>=`, `==`, or `=`) or `BoolExpr` (never a bare `LinExpr`).
- **Do not mutate during async solve/check**: Modifying variables, bounds, constraints, or the objective while `await m.solve()` or `await m.check()` is pending invalidates the in-flight run and rejects the promise.
- **Do not use retired aliases**: Always use `expr` (not `c`), `m.constraint(...)` (not `m.constrain` or `m.add`), `m.objective(maximize(...))` (not `m.maximize` or `m.setObjective`), `await m.solve()` (not `m.optimize`), `.le()` / `.ge()` / `.eq()` (not `.lessThanOrEqual()`), `.value` / `m.getValues(...)` (not `.getValue()`), and `m.variables` / `m.constraints` (not `m.vars` / `m.constrs`).
