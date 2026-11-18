# Pumpkin Constraint Programming Solver

**Pumpkin** is a Lazy Clause Generation (LCG) constraint programming solver developed by ConSol Lab (TU Delft) in pure Rust. WaSHI bundles Pumpkin (`v0.5.0`) compiled directly to WebAssembly (`@ohtaman/washi/solvers/pumpkin`) with zero external runtime dependencies.

Unlike multi-threaded WASM engines, Pumpkin runs in a single-threaded WebAssembly instance inside a Web Worker (or directly in Node.js) and **does not require Cross-Origin Isolation (`COOP` / `COEP`) headers** in browsers.

---

## When to Choose Pumpkin

1. **Disjunctive Scheduling & Combinatorial Integer Models**:
   Job-shop scheduling, routing/precedence logic, and integer feasibility models with boolean implications where LCG clause learning outperforms traditional LP relaxations.
2. **Unsat Core Conflict Diagnosis Without COOP / COEP Headers**:
   Use `await model.check({ solver: "pumpkin" })` in standard browser environments (including third-party iframes and static hosts without `SharedArrayBuffer`) to extract conflicting named constraints (`unsatCore` / `conflicts`).
3. **Zero-Config Bundled Execution**:
   Importing `@ohtaman/washi/solvers/pumpkin` requires no additional `npm install` peer dependencies—`pumpkin.wasm` (`~906 kB`) is bundled alongside `@ohtaman/washi`.

> [!TIP]
> **Pumpkin vs. HiGHS vs. Z3**:
> - Use **HiGHS** (`{ solver: "highs" }`) for Continuous LPs, Convex QPs, or large linear-relaxation-dominated MILPs.
> - Use **Pumpkin** (`{ solver: "pumpkin" }`) for bounded integer + propositional logic models and zero-`COOP`/`COEP` `unsatCore` extraction.
> - Use **Z3** (`{ solver: "z3" }`) when you need continuous variables inside `implies(...)` / `not(...)` or arbitrary real-valued SMT arithmetic.

---

## Basic Usage

```typescript
import { Model, expr, implies, minimize, not } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const model = new Model("SchedulingStep", { solver: "pumpkin" });

const s1 = model.integer("start_job1", { lb: 0, ub: 20 });
const s2 = model.integer("start_job2", { lb: 0, ub: 20 });
const job1First = model.bool("job1_first");

model.constraint(implies(job1First, expr`${s1} + 6 <= ${s2}`), "job1_before_job2");
model.constraint(implies(not(job1First), expr`${s2} + 4 <= ${s1}`), "job2_before_job1");

model.objective(minimize(expr`${s1} + ${s2}`));
await model.solve();

console.log(`Status: ${model.status}, s1=${s1.value}, s2=${s2.value}`);
```

---

## Satisfiability & Unsat Core Diagnosis (`model.check()`)

Call `await model.check()` to verify satisfiability over integer linear constraints and nested propositional logic (`and`, `or`, `not`, `implies`, `xor`), and isolate conflicting named rules (`conflicts` / `unsatCore`) when unsatisfiable:

```typescript
import { Model, expr, implies } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

const model = new Model("PolicyConflict", { solver: "pumpkin" });
const vip = model.bool("vip");
const seats = model.integer("seats", { lb: 0, ub: 20 });

model.constraint(vip, "vip_active");
model.constraint(implies(vip, expr`${seats} >= 8`), "vip_seats");
model.constraint(expr`${seats} <= 5`, "room_cap");

const result = await model.check();
if (result.status === "Unsat") {
  console.log("Conflicting rules:", result.conflicts); // also on result.unsatCore / model.unsatCore
}
```

---

## Domain & API Preconditions

Pumpkin is strictly a **bounded integer & boolean CP/LCG solver**. Unsupported constructs are rejected with explicit errors rather than silent rounding or fallbacks:

- **Bounded integer / binary / boolean variables only**: All `Var` instances must be finite integers (`Integer` or `Binary`) with `lb` and `ub` within `[-(2^30 - 1), 2^30 - 1]`. Unbounded integers (`-Infinity` / `Infinity`) and `Continuous` variables throw an explicit error.
- **Integer linear arithmetic**: Constraint coefficients, adjusted RHS values (`rhs - lhs.constant`), and scaled variable bounds must be exact integers within safe signed 32-bit range (`|rhs| + sum_i max(|c_i * lb_i|, |c_i * ub_i|) <= 2^31 - 2`). Objective constants (`f64`) may be fractional.
- **Warm-start hints (`initialValue`)**: Optional primal initial values (`supportsWarmStart: true`) are supported on bounded `Integer` and `Binary` variables in both `solve()` and `check()`, applied as non-binding branching hints via Pumpkin's `WarmStart` brancher (with `Var.initialValue` kept distinct from solved `Var.value`).
- **Unsupported features**: `QuadExpr` objectives/constraints and `relax: true` throw explicit errors. Dedicated global CP constraints (such as `distinct` / `noOverlap`) are tracked separately for future releases.

---

## Browser Deployment & Custom WASM URL

By default, `@ohtaman/washi/solvers/pumpkin` resolves the bundled `pumpkin.wasm` and spawns `pumpkin-worker.js` in a background Web Worker when running under an HTTP(S) origin (falling back to main-thread execution on `file:` or opaque-origin sandboxed iframes).

To host `pumpkin.wasm` at a custom path or CDN:

```typescript
import { setPumpkinWasmUrl } from "@ohtaman/washi/solvers/pumpkin";

setPumpkinWasmUrl("/assets/wasm/pumpkin.wasm");
```

If `pumpkin.wasm` cannot be loaded or returns an HTML SPA fallback instead of a WebAssembly binary, Pumpkin rejects explicitly with the attempted URL and performs **no silent CDN fallback**.

### WebAssembly Asset Lifecycle & On-Demand Builds

Pumpkin's WebAssembly binary (`public/pumpkin.wasm`) and JS/TS runtime bindings (`runtime.js` / `runtime.d.ts`) are tracked via `pumpkin.config.json` with cryptographic SHA-256 verification:
- **Zero-Friction Verification**: Build and distribution pipelines run `node scripts/ensure-pumpkin-wasm.mjs`, verifying local assets in milliseconds before bundling.
- **On-Demand Release Download**: When assets are missing or updated, `ensure-pumpkin-wasm.mjs` downloads verified binaries from WaSHI's `pumpkin-v<version>` GitHub Release assets (`downloadUrl` in `pumpkin.config.json`).
- **Compiling from Source**: When upgrading Pumpkin or modifying `wasm/pumpkin`, install Rust with the `wasm32-unknown-unknown` target, optionally bump crate/config versions with `node scripts/ensure-pumpkin-wasm.mjs --set-version <version>`, run `npm run build:pumpkin-wasm`, and sync the rebuilt assets to the `pumpkin-v<version>` GitHub Release tag (`gh release upload pumpkin-v0.5.0 public/pumpkin.wasm src/modeler/solvers/pumpkin/runtime.js src/modeler/solvers/pumpkin/runtime.d.ts --clobber`, or create the release with `gh release create` / trigger `.github/workflows/build-pumpkin-wasm.yml` and commit the updated files from the `pumpkin-wasm-assets` artifact).
