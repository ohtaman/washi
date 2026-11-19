---
name: washi
description: Formulate, inspect, solve, and verify mathematical optimization (LP, MILP/MIP, convex QP, CP/LCG) and SMT satisfiability or unsat-core models in TypeScript and JavaScript using @ohtaman/washi (HiGHS, Pumpkin, Z3, GLPK) for shift scheduling, timetabling, resource allocation, bin packing, routing, portfolio optimization, and rule conflict diagnosis.
---

# WaSHI Modeling & Verification Skill

Use this skill when building, debugging, or verifying mathematical optimization (LP, MIP, convex QP, CP/LCG) or satisfiability (SMT / SAT) models with `@ohtaman/washi`. For the full API reference and browser/bundler deployment rules, see [`docs/getting-started/ai-agents.md`](https://github.com/ohtaman/washi/blob/main/docs/getting-started/ai-agents.md) (available locally at `node_modules/@ohtaman/washi/docs/getting-started/ai-agents.md` in consumer projects or `docs/getting-started/ai-agents.md` in the repository).

---

## 1. Problem & Solver Selection

Select the solver engine and execution method that match the problem class:

| Problem Class | Recommended Solver | Setup & Import | Execution Method |
| :--- | :--- | :--- | :--- |
| **LP / MIP / Convex QP** (including `m.indicator()` Big-M and `initialValue` warm starts) | **HiGHS** (default) | Built-in (`import { Model } from "@ohtaman/washi"`) | `await m.solve()` |
| **CP/LCG Bounded Integer, Scheduling & Global Constraints** (`distinct`, `disjoint`, `cumulative`, `allowed`, `at`, `max`/`min`/`abs`, `!=`, `unsatCore` without `COOP`/`COEP`) | **Pumpkin** plugin (bundled WASM) | `import "@ohtaman/washi/solvers/pumpkin"` | `await m.solve({ solver: "pumpkin" })` or `await m.check({ solver: "pumpkin" })` |
| **SMT Propositional Logic** (`BoolVar`, `and`, `or`, `not`, `implies`, `xor`) | **HiGHS** (auto 0-1 MIP), **Pumpkin** (bounded int), or **Z3** (native SMT incl. `Continuous`) | Built-in for HiGHS; `import "@ohtaman/washi/solvers/pumpkin"`; `npm install z3-solver` + `import "@ohtaman/washi/solvers/z3"` for Z3 | `await m.solve()` or `await m.check()` |
| **Infeasibility / Conflict Diagnosis** (`conflicts` / `unsatCore`) | **HiGHS** (elastic slack `conflicts`), **Pumpkin** (zero-`COOP`/`COEP` `unsatCore`), or **Z3** (`unsatCore`) | Built-in for HiGHS; `import "@ohtaman/washi/solvers/pumpkin"`; `import "@ohtaman/washi/solvers/z3"` | `await m.check()` |
| **LP / MIP with GLPK** (GPL-3.0; no QP or `initialValue`) | **GLPK** plugin | `npm install glpk.js` + `import "@ohtaman/washi/solvers/glpk"` | `await m.solve({ solver: "glpk" })` |

- **Browser runtime notes**:
  - HiGHS, Pumpkin, and GLPK load local `.wasm` and Worker assets relative to the bundle (never falling back to an external CDN) and work without `COOP`/`COEP`.
  - Z3 uses `SharedArrayBuffer` pthreads and requires `window.isSecureContext === true` and `window.crossOriginIsolated === true` (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`).

---

## 2. Algebraic Formulation Workflow

1. **Define decision variables on `Model`**:
   - Numeric (`Var`): `m.continuous(nameOrDims, { lb, ub, initialValue })`, `m.integer(...)`, `m.binary(...)`
   - Propositional boolean (`BoolVar`): `m.bool(nameOrDims)`
   - Indexed containers: pass a count (`number` -> `Var[]` / `Var[][]`) or key array (`readonly string[]` -> `Record<K, Var>` / `Record<R, Record<C, Var>>`).
   - Provide finite `lb` and `ub` bounds whenever known—especially on variables used in `m.indicator()` so WaSHI can automatically derive a tight Big-M when `M` is omitted.
2. **Build expressions (`expr`, `sum`, `dot`, `max`, `min`, `abs`, `at`)**:
   - Linear expression (`LinExpr`): `` expr`30 * ${x} + 50 * ${y} - 10` ``, `` expr`dot(${profit}, ${qty}) - 20 * ${lineOpen}` ``
   - Piecewise-linear & 0-based element lookup: `abs(...)`, `max(...)`, `min(...)`, `at(array, index)` usable inside `expr` (including element-wise containers like `` expr`sum(abs(${w} - ${target}))` `` and `` expr`max(abs(${pred} - ${actual}))` ``) or standalone. Convex directions (`minimize`/`<=` on `max`/`abs`, `maximize`/`>=` on `min`) lower to pure LP epigraphs with zero binaries on HiGHS/GLPK; non-convex/equality contexts require finite bounds in MIP and map natively to Pumpkin (`maximum`/`minimum`/`absolute`/`element`) and Z3 (`If`).
   - Quadratic expression (`QuadExpr`, **objectives only**): `` expr`${x}^2 + 2 * ${x} * ${y} + ${y}^2` ``, `` expr`sum((${xVec} - ${target})^2)` `` (purely continuous models on HiGHS; MIQP with integer/binary/boolean variables is not supported)
   - Constraint (`Constraint`): `` expr`${x} + 2 * ${y} <= 40` ``, `` expr`sum(${qty}) <= 100` `` (supports `<=`, `>=`, `==`, `=`, plus discrete integer-only `<`, `>`, `!=` and `.lt()`, `.gt()`, `.ne()`).
   - Vector & Record aggregations: `sum(containerOrItems, mapper?)` and `dot(a, b)` (both usable inside `expr` or standalone; `sum` accepts 1D/2D `Array`, `Iterable`, and `Record` directly without `Object.values()`, plus element-wise container arithmetic `+`, `-`, `*`, `/`, `^2` inside `expr`; `dot` computes the 1D inner product or 2D Frobenius inner product)
   - CP global constraints & propositional logic: `distinct(...)`, `disjoint(tasks)`, `cumulative(tasks, capacity)`, `allowed(vars, tuples)` return composable `BoolExpr`s alongside `and(...)`, `or(...)`, `not(...)`, `implies(a, b)`, `xor(a, b)` (solved natively on Z3 and Pumpkin, and auto-linearized into MIP on HiGHS/GLPK; `cumulative` enforces a MIP horizon memory guard above 5,000 span / 25,000 pulse vars recommending `{ solver: "pumpkin" }`).
3. **Register objective and named constraints**:
   - Constructing an `expr` or `.le()` / `.ge()` / `.eq()` / `.lt()` / `.gt()` / `.ne()` object does **not** attach it to the model.
   - Register the objective with `m.objective(maximize(e))` or `m.objective(minimize(e))`.
   - Register every constraint with a descriptive name: `const limit = m.constraint(c, "resource_limit")` (returns the registered `Constraint` / `BoolExpr`, or array for batch inputs) or `m.indicator(binVar, c, { activeValue: 1, name: "cap_when_open" })` (which uses tight Big-M on HiGHS/GLPK and `toLpString()`, while lowering natively via `implied_by` on Pumpkin and `ctx.Implies` on Z3 when `options.M` is omitted). Descriptive names are essential for LP inspection and conflict diagnosis (`conflicts` / `unsatCore`).

---

## 3. Model Inspection (`toLpString`)

Before solving or when debugging formulation bugs:

- **`m.toLpString()`**: Automatically validates model integrity (variable ownership across `Model` instances, bound sanity `lb <= ub`, finite `initialValue` within bounds/integrality tolerance `1e-6`, and finite objective/constraint coefficients) and exports the numeric LP / MIP / QP formulation in standard CPLEX LP format (`Maximize` / `Minimize`, `Subject To`, `Bounds`, `General`, `Binary`, `End`). Inspect this string to confirm objective sense, signs, coefficients, and right-hand sides match the mathematical specification.

---

## 4. Execution & Mandatory Self-Verification

Never report a model solution as final without executing the verification step:

1. **After `const status = await m.solve(options?)`**:
   - Verify `status === "Optimal"` (or `status === "Feasible"` / `m.hasPrimalSolution === true` when solver limits apply).
   - Call `const report = m.verify()` and assert `report.valid === true`.
   - If `report.valid === false`, inspect `report.violations`, `report.missingVariables`, `report.uncheckedConstraints`, and `report.maxViolation`.
   - Note: `m.verify()` independently checks variable finiteness, variable bounds (`lb`/`ub`), integrality (`Integer`, `Binary`, `BoolVar`), linear constraint residuals, and logical constraints. It does **not** recompute `m.objectiveValue` or verify natural-language problem coverage.
2. **When a model is infeasible (`"Infeasible"` or `"Unsat"`)**:
   - Run `const res = await m.check()` (diagnoses with built-in HiGHS via single-solve elastic slack relaxation), `const res = await m.check({ solver: "pumpkin" })` (for `unsatCore` on bounded integer/boolean models without `COOP`/`COEP` requirements), or `const res = await m.check({ solver: "z3" })` (for exact SMT `unsatCore` including `Continuous`/fractional constraints).
   - When `res.status === "Unsat"`, inspect `res.conflicts` (also stored on `m.conflicts`). On HiGHS, `conflicts` reports the subset of constraints requiring relaxation to restore feasibility (with `unsatCore: undefined` for semantic rigor). On Z3 and Pumpkin, both `unsatCore` and `conflicts` report the contradictory constraint subset.
   - Because Z3 and Pumpkin assert variable bounds (`lb`/`ub`) and binary `{0, 1}` domains directly while tracking named constraints, `res.conflicts` returns a subset of registered constraint names that conflicts *together with the model's fixed variable bounds/domains* (not guaranteed minimal).

---

## 5. Executable Workflow Recipes

### Recipe 1: MIP Formulation, `toLpString()` Inspection & `verify()` Verification

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

  m.objective(maximize(expr`dot(${profit}, ${qty}) - 20 * ${lineOpen}`));
  m.constraint(expr`dot(${woodPerUnit}, ${qty}) <= 40`, "wood_limit");
  m.constraint(expr`dot(${laborPerUnit}, ${qty}) <= 50`, "labor_limit");
  m.indicator(lineOpen, expr`sum(${qty}) <= 0`, {
    activeValue: 0,
    name: "closed_line_zero_output",
  });

  // 1. Pre-solve integrity validation & LP formulation inspection
  const lpText = m.toLpString();

  // 2. Solve with default HiGHS solver
  const status = await m.solve();

  // 3. Mandatory independent solution verification
  const report = m.verify();

  return {
    status,
    lpText,
    objectiveValue: m.objectiveValue,
    quantities: { desk: qty.desk.value, chair: qty.chair.value },
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
  const report = m.verify();

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
  const report = satModel.verify();

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

### Recipe 4: Pumpkin CP Scheduling (`disjoint`, `distinct`) & Zero-COOP/COEP `unsatCore` Verification

```ts
import { Model, expr, disjoint, distinct, implies, minimize } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export async function solveAndDiagnoseWithPumpkin() {
  // Part A: Bounded-integer CP scheduling with native global propagators
  const cpModel = new Model("WorkshopSchedule", { solver: "pumpkin" });
  const start = cpModel.integer(["cut", "weld", "paint"] as const, { lb: 0, ub: 20, prefix: "start" });
  const bench = cpModel.integer(["cut", "weld", "paint"] as const, { lb: 1, ub: 3, prefix: "bench" });

  cpModel.constraint(
    disjoint([
      { start: start.cut, duration: 4 },
      { start: start.weld, duration: 3 },
      { start: start.paint, duration: 2 },
    ]),
    "single_line"
  );
  cpModel.constraint(expr`${start.cut} + 4 <= ${start.weld}`, "cut_before_weld");
  cpModel.constraint(expr`${start.weld} + 3 <= ${start.paint}`, "weld_before_paint");
  cpModel.constraint(distinct(bench), "unique_benches");
  cpModel.objective(minimize(expr`${start.paint} + 2`));

  const status = await cpModel.solve();
  const report = cpModel.verify();

  // Part B: Zero-COOP/COEP unsatCore diagnosis on bounded integers & booleans
  const unsatModel = new Model("PolicyConflict", { solver: "pumpkin" });
  const vip = unsatModel.bool("vip");
  const discount = unsatModel.integer("discount", { lb: 0, ub: 50 });

  unsatModel.constraint(vip, "customer_is_vip");
  unsatModel.constraint(implies(vip, expr`${discount} >= 20`), "vip_min_discount");
  unsatModel.constraint(expr`${discount} <= 10`, "campaign_cap");

  const unsatRes = await unsatModel.check();

  return {
    status,
    makespan: cpModel.objectiveValue,
    starts: { cut: start.cut.value, weld: start.weld.value, paint: start.paint.value },
    benches: { cut: bench.cut.value, weld: bench.weld.value, paint: bench.paint.value },
    valid: report.valid,
    unsatStatus: unsatRes.status,
    conflicts: unsatRes.conflicts,
    unsatCore: unsatRes.unsatCore,
  };
}
```

---

## 6. Guardrails & Common Pitfalls

- **No quadratic constraints or MIQP**: Quadratic terms (`${x}^2`, `${x} * ${y}`) are only valid in `m.objective(...)` (using them in `m.constraint(...)` throws `"Quadratic constraints are not supported"`), and built-in HiGHS requires Convex QP models to contain only continuous variables (`m.continuous`).
- **Do not confuse `LinExpr` and `Constraint`**: `m.objective(maximize(...))` requires a `LinExpr`, `QuadExpr`, `Var`, or `number` (never a `Constraint`). `m.constraint(...)` requires a `Constraint` (with `<=`, `>=`, `==`, `=`, or integer-only `<`, `>`, `!=`) or `BoolExpr` (`distinct`, `disjoint`, `cumulative`, `allowed`, `and`, `or`, `not`, `implies`, `xor`), never a bare `LinExpr`.
- **Do not mutate during async solve/check**: Modifying variables, bounds, constraints, or the objective while `await m.solve()` or `await m.check()` is pending invalidates the in-flight run and rejects the promise.
- **Do not use retired aliases**: Always use `expr` (not `c`), `m.constraint(...)` (not `m.constrain` or `m.add`), `m.objective(maximize(...))` / `m.objective()` (not `m.maximize`, `m.setObjective`, or `m.objectiveExpr`), `await m.solve()` (not `m.optimize`), `m.verify()` (not `m.validateSolution()`), `m.column(...)` (not `m.addColumn(...)`), `.le()` / `.ge()` / `.eq()` / `.lt()` / `.gt()` / `.ne()` (not `.lessThanOrEqual()`), `.value` (not `m.getValues(...)` or `.getValue()`), `m.variables` / `m.constraints` as `ReadonlyMap` with `.get(...)` / `.size` (not `m.vars`, `m.constrs`, `m.boolVars`, `m.logicalConstraints`, `m.numVars`, `m.numConstrs`, or `get*ByName()`), and `relativeGap` / `absoluteGap` (not `relGap` / `mipGap` / `absGap`). Also never call retired `m.validateIntegrity()` (integrity validation runs automatically inside `solve()`, `check()`, and `toLpString()`).
- **Practical OR formulation guardrails**:
  - **Prefer inequalities (`>=` / `<=`) over `==`** for demand coverage and capacity limits when costs are non-negative; reserve `==` for flow conservation or normalization identities.
  - **Provide finite `lb` and `ub` bounds** on variables inside `m.indicator(...)` and omit `M` so WaSHI automatically derives the tightest valid Big-M instead of a loose `1e6` fallback.
  - **Use soft constraints (non-negative slack variables)** with tiered objective penalties for non-rigid business targets (preferred staffing, safety stock, day-off requests) so minor data contention produces a prioritized trade-off rather than `"Infeasible"`.
