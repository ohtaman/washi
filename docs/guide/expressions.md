# Expressions (`expr`, `sum`, `dot`)

Mathematical expressions are linear or quadratic combinations of decision variables and numeric coefficients.

In JavaScript and TypeScript—which do not support operator overloading—WaSHI provides the **unified tagged template literal (`expr`)**, **`sum()`**, and matrix/vector **`dot()`** to construct algebraic expressions with full static type safety.

| Approach | Example | Infix readability | Type safety & IDE rename | Indexed variables (`flow[i][j]`) |
| :--- | :--- | :--- | :--- | :--- |
| Method chaining | `x.mul(30).add(y.mul(50)).le(40)` | Low | Yes | Yes |
| Raw string parsing | `parseConstraint("30 * x + 50 * y <= 40", resolver)` | High | No (runtime string lookup) | Fragile (string concatenation) |
| **Tagged template (`expr`)** | `` expr`30 * ${x} + 50 * ${y} <= 40` `` | **High** | **Yes (actual TS references)** | **Yes (bound by object reference)** |

---

## Tagged Template Literal (`expr`)

Similar to parameterized `sql` tagged templates, `expr` receives static operator text (`+`, `-`, `*`, `^2`, `<=`, `>=`, `==`) separately from interpolated `${...}` values (`Var`, `LinExpr`, `QuadExpr`, or finite `number`). Variables are bound by object reference rather than resolved by string name, avoiding naming collisions and preserving TypeScript type checking and IDE refactoring.

Use `expr` for both arithmetic expressions (`LinExpr | QuadExpr`) and relational constraints (`Constraint`):

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// 1. Linear combination: 3*x + 5*y - 10
const linearExpr = expr`3 * ${x} + 5 * ${y} - 10`;

// 2. Quadratic expression: x * y + 2 * x^2
const quadExpr = expr`${x} * ${y} + 2 * ${x} * ${x}`;

// 3. Relational constraint:
const balanceConstraint = expr`${x} + 2 * ${y} <= 40`;
```

### Supported Syntax in `expr`
- **Addition & Subtraction**: `${x} + ${y} - 5`
- **Scalar Multiplication & Division**: `4 * ${x}`, `${x} / 2`
- **Variable Multiplication (Quadratic terms)**: `${x} * ${y}`, `2 * ${x} * ${x}`
- **Powers & Exponentiation**: `${x}^2`, `${x}**2`
- **Unary Plus & Negation**: `-${x} + 10`, `+${x}`
- **Parentheses**: `2 * (${x} + ${y})`
- **Aggregations (`sum` & `dot`)**: `sum(${xVec}) <= 100`, `dot(${costs}, ${xVec})`, `sum(${rows}, ${(r) => grid[r][col]})`
- **Piecewise-Linear & Element Functions (`max`, `min`, `abs`, `at`)**: `max(${xVec}) <= 15`, `sum(abs(${w} - ${target}))`, `at(${costs}, ${idx})` (see [Piecewise-Linear & Element Expressions](#piecewise-linear-element-expressions-max-min-abs-at))
- **Element-Wise Container Arithmetic**: `sum((${price} - ${cost}) * ${qty})`, `sum((${xVec} - ${target})^2)`, `dot(${price} - ${cost}, ${qty})`
- **Nested Expressions**: `expr` interpolates variables, numbers, `Array` / `Record` containers (inside `sum` or `dot`), and nested `LinExpr` / `QuadExpr` objects.

> [!NOTE]
> - **Comparisons (`<=`, `>=`, `==`)** return a `Constraint` object.
> - **Arithmetic expressions** return a `LinExpr` (linear) or `QuadExpr` (degree 2). Embedded arrays or records must be reduced with `sum(...)` or `dot(..., ...)`.
> - **Unsupported nonlinearities**: Degree $> 2$ terms (e.g., `${x}^3`) and nonlinear constraints (e.g., `${x} * ${y} <= 10`) throw an error.

---

## High-Performance Summation (`sum`)

Sum 1D or 2D `Array`, `Iterable`, or `Record` containers directly inside `` expr`sum(...)` `` or via the standalone `sum()` helper:

```typescript
import { expr, sum } from "@ohtaman/washi";

const items = ["A", "B", "C"] as const;
const weights = { A: 10, B: 20, C: 30 };
const x = m.binary(items);

// 1. Direct Record or Array summation inside expr (no Object.values() needed):
m.constraint(expr`sum(${x}) <= 2`, "max_selected");

// 2. Element-wise arithmetic inside expr`sum(...)`:
const weightedExpr = expr`sum(${weights} * ${x})`;

// 3. Transform elements with a mapping callback (standalone or inside expr):
const totalWeight = sum(items, (item) => x[item].mul(weights[item]));

// 4. Standalone 1D/2D Record or Array summation:
const count = sum(x);
```

`sum()` runs in $O(N)$ linear time without AST parsing overhead.

> [!TIP]
> **Avoid $O(N^2)$ `expr` Re-Assignment Inside Loops**: Because `LinExpr` and `expr` results are immutable, accumulating terms one by one via ``total = expr`${total} + ${x[i]}` `` inside a loop copies all previously accumulated terms on every iteration ($O(N^2)$ time and memory). Pass arrays or records to `sum(x)` or `dot(coeffs, x)` for $O(N)$ construction.

---

## Dot Product (`dot`)

The `dot(a, b)` helper (usable both inside `` expr`dot(${a}, ${b})` `` and as a standalone function `dot(a, b)`) computes linear combinations of numeric coefficients (`number`) and variables or linear expressions (`Var | LinExpr`) in either operand order (`dot(coeffs, vars)` or `dot(vars, coeffs)`).

Supported 1D and 2D container shapes:
- **1D Arrays**: `number[]` $\times$ `(Var | LinExpr)[]`
- **1D Records**: `Record<K, number>` $\times$ `Record<K, Var | LinExpr>`
- **2D Arrays**: `number[][]` $\times$ `(Var | LinExpr)[][]`
- **2D Records**: `Record<R, Record<C, number>>` $\times$ `Record<R, Record<C, Var | LinExpr>>`
- **2D Mixed**: `Array<Record<C, ...>>` or `Record<R, Array<...>>`

Mismatched array lengths, missing dictionary keys, or non-finite/non-linear leaves throw an explicit error indicating the offending path (e.g., `at '[0].StoreB'`).

### 1D Vector Dot Product
```typescript
import { expr, dot } from "@ohtaman/washi";

const profits = { desk: 30, chair: 50 };
const vars = m.integer(["desk", "chair"] as const);

// Computes 30 * vars.desk + 50 * vars.chair inside expr (or via standalone dot(profits, vars))
const totalProfit = expr`dot(${profits}, ${vars})`;
```

### 2D Matrix Inner Product (Frobenius Inner Product)
Works directly with 2D arrays (`m.continuous(rows, cols)`), nested dictionaries (`m.continuous(rowKeys, colKeys)`), or mixed 2D containers:

```typescript
const factories = ["Tokyo", "Osaka"] as const;
const stores = ["StoreA", "StoreB"] as const;

const costs = {
  Tokyo: { StoreA: 4, StoreB: 7 },
  Osaka: { StoreA: 8, StoreB: 3 },
};

const ship = m.continuous(factories, stores, { lb: 0 });

// Total shipping cost across all routes (equivalent to expr`sum(${costs} * ${ship})`):
const totalShippingCost = expr`dot(${costs}, ${ship})`;
```

> [!NOTE]
> **2D `dot(A, B)` is the Frobenius Inner Product**: For 2D matrices or nested records, `dot(A, B)` computes the scalar **Frobenius inner product** $\langle A, B \rangle_F = \sum_{i,j} A_{i,j} B_{i,j}$ (the sum of element-wise products across all rows and columns, equivalent to `` expr`sum(${A} * ${B})` ``), **not** the matrix-matrix product $(AB)_{i,k} = \sum_j A_{i,j} B_{j,k}$.

---

## Composing Aggregations in `expr`

Keep operators, `sum(...)`, `dot(..., ...)`, and comparisons (`<=`, `>=`, `==`) in the template string, and interpolate containers directly via `${...}` rather than pre-evaluating standalone `sum()`/`dot()` or `Object.values()`:

```typescript
// Verbose: nested standalone calls and Object.values()
const totalProfit1 = expr`${dot(profits, vars)}`;
const cap1 = expr`${sum(Object.values(vars))} <= 100`;

// Recommended: direct sum() and dot() inside expr
const totalProfit2 = expr`dot(${profits}, ${vars})`;
const cap2 = expr`sum(${vars}) <= 100`;
```

| Operation | Mathematical Formula | WaSHI Expression |
| :--- | :--- | :--- |
| **Total sum** (1D/2D `Array` or `Record`) | $\sum_i x_i \le C$ | `` m.constraint(expr`sum(${x}) <= ${C}`) `` |
| **Inner product** (1D vector or 2D Frobenius) | $\sum_i c_i x_i \le B$ | `` m.constraint(expr`dot(${c}, ${x}) <= ${B}`) `` |
| **Element-wise difference & product** | $\sum_i (p_i - c_i) \cdot x_i$ | `` expr`sum((${price} - ${cost}) * ${x})` `` |
| **Sum of squared deviations (QP)** | $\sum_i (x_i - t_i)^2$ | `` expr`sum((${x} - ${target})^2)` `` |
| **Element-wise constraints** ($\forall i \in I$) | $a_i x_i \le b_i \quad (\forall i)$ | `` m.constraint(items.map((i) => expr`${a[i]} * ${x[i]} <= ${b[i]}`)) `` |
| **2D row sums** (for each row $f$) | $\sum_s X_{f,s} \le S_f \quad (\forall f)$ | `` m.constraint(factories.map((f) => expr`sum(${ship[f]}) <= ${supply[f]}`)) `` |
| **2D column sums** (for each column $s$) | $\sum_f X_{f,s} \ge D_s \quad (\forall s)$ | `` m.constraint(stores.map((s) => expr`sum(${factories}, ${(f) => ship[f][s]}) >= ${demand[s]}`)) `` |

---

## Quadratic Expressions (`QuadExpr` & `expr`)

WaSHI supports Convex Quadratic Programming (QP) objectives via the HiGHS solver. Quadratic expressions can be written using the `expr` template literal or constructed programmatically with `QuadExpr` and `.mul()`.

### 1. Using `expr` (Recommended)
Write quadratic terms with `*`, `^2`, or `**2`:

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// Quadratic objective using expr:
m.objective(minimize(expr`3 * ${x} + ${x}^2 + ${y}^2`));

// Linear constraint using expr:
m.constraint(expr`${x} + ${y} >= 4`);
```

### 2. Method Chaining with `.mul()` or `QuadExpr`
You can also construct quadratic expressions programmatically:

```typescript
import { Model, QuadExpr, minimize } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// 1. Construct quadratic terms with .mul() (x * y + 2 * x^2)
const quad = x.mul(y).add(x.mul(x).mul(2));

// 2. Build portfolio variance objective: w^T * Sigma * w
const assets = ["Tech", "Bonds"] as const;
const w = m.continuous(assets, { lb: 0, ub: 1 });

let risk = new QuadExpr();
risk = risk.add(w.Tech.mul(w.Tech).mul(0.04));
risk = risk.add(w.Tech.mul(w.Bonds).mul(0.005));
risk = risk.add(w.Bonds.mul(w.Bonds).mul(0.01));

m.objective(minimize(risk));
```

> [!NOTE]
> **Convexity Requirement ($\mathbf{Q} \succeq 0$)**: QP solvers (including HiGHS) require the quadratic objective matrix $\mathbf{Q}$ to be **positive semi-definite (PSD)** when minimizing (or negative semi-definite when maximizing). Sum-of-squares terms ($\sum_i (x_i - t_i)^2$) and covariance matrices ($\mathbf{w}^\top \boldsymbol{\Sigma} \mathbf{w}$) are guaranteed PSD, whereas indefinite products over continuous variables (such as minimizing $x \cdot y$) are non-convex and rejected by the solver. *(To linearize the product of two binary variables $x_A \cdot x_B$ in MILP, see [Formulation Patterns & Tips](./formulation-tips.md#product-of-two-binary-variables).)*

---

## Piecewise-Linear & Element Expressions (`max`, `min`, `abs`, `at`)

WaSHI provides backend-agnostic scalar piecewise-linear (`max`, `min`, `abs`) and 0-based variable-indexed lookup (`at`) primitives that work directly inside `` expr`...` `` or as standalone helpers imported from `@ohtaman/washi`:

```typescript
import { Model, expr, minimize, abs, max, min, at } from "@ohtaman/washi";

const m = new Model();
const w = m.continuous(3, { lb: 0, ub: 20, prefix: "w" });
const target = [4, 7, 10];
const route = m.integer("route", { lb: 0, ub: 2 });
const routeCost = [18, 12, 25];

// Convex LP epigraph (zero binary variables on HiGHS / GLPK):
m.objective(
  minimize(expr`sum(abs(${w} - ${target})) + at(${routeCost}, ${route})`)
);
m.constraint(expr`max(${w}) <= 15`, "peak_cap");

// Nested composition and programmatic helpers also work:
const maxErr = max(expr`abs(${w[0]} - 4)`, abs(expr`${w[1]} - 7`));
m.constraint(expr`${maxErr} <= 3`);
```

- **Element-wise container support**: Inside `expr`, `abs(${arr} - ${target})` evaluates element-wise across matching 1D/2D `Array`, `Iterable`, or `Record` containers so patterns like `` expr`sum(abs(${w} - ${target}))` `` and `` expr`max(abs(${pred} - ${actual}))` `` work naturally.
- **Polarity-aware MIP lowering vs native CP/SMT**:
  - In convex directions on HiGHS and GLPK (`minimize` or `<=` on `max`/`abs`, `maximize` or `>=` on `min`), WaSHI emits pure continuous LP epigraph constraints with **zero binary variables** (even on unbounded `Continuous` variables).
  - In non-convex or equality contexts (`minimize(min(...))`, `maximize(abs(...))`, `max(...) >= rhs`, `abs(...) == rhs`), HiGHS and GLPK emit bounded MIP formulations (requiring finite variable bounds), Pumpkin lowers via native `maximum`/`minimum`/`absolute` propagators over bounded integers, and Z3 uses native `If` (`ITE`).
- **0-based element lookup (`at(array, index)`)**: Models the classic CP `Element` constraint (`array[index]`). Requires an integer-valued `index` expression and automatically enforces $0 \le \text{index} < \text{array.length}$ across all solvers (native `element` propagator on Pumpkin, nested `If` + bounds guards on Z3, and binary convex-hull linearization on HiGHS/GLPK).

---

## Evaluating Expressions After Solving (`.value`)

Both `LinExpr` and `QuadExpr` expose a `.value` getter (`number | null`). Once a model has been solved and all referenced variables have finite primal values, you can evaluate any sub-expression directly:

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model();
const x = m.integer("x", { lb: 0 });
const y = m.integer("y", { lb: 0 });

const revenue = expr`30 * ${x} + 50 * ${y}`;
const laborUsed = expr`2 * ${x} + ${y}`;

m.objective(maximize(revenue));
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_cap");
m.constraint(expr`${laborUsed} <= 50`, "labor_cap");

await m.solve();

console.log("Total Revenue:", revenue.value);   // 1100 (x = 20, y = 10)
console.log("Labor Used:", laborUsed.value);    // 50
```

If the model has not been solved (or any variable in the expression has `value === null`), `.value` returns `null`.

---

## Fluent Arithmetic & Relational Methods

In addition to `expr`, `Var`, `LinExpr`, and `QuadExpr` provide immutable fluent methods for programmatic expression building:

| Method | Supported On | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `.add(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` or `QuadExpr` | Adds a number, `Var`, `LinExpr`, or `QuadExpr`. |
| `.sub(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` or `QuadExpr` | Subtracts a number, `Var`, `LinExpr`, or `QuadExpr`. |
| `.mul(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` or `QuadExpr` | Multiplies by a scalar `number`, or multiplies two linear terms into a `QuadExpr`. |
| `.div(divisor)` | `LinExpr`, `QuadExpr` | `LinExpr` or `QuadExpr` | Divides by a non-zero finite scalar `number`. |
| `.neg()` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` or `QuadExpr` | Negates all terms ($-e$). |
| `.le(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | Builds a $\le$ constraint (`lhs <= rhs`; linear LHS required). |
| `.ge(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | Builds a $\ge$ constraint (`lhs >= rhs`; linear LHS required). |
| `.eq(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | Builds an $==$ equality constraint (`lhs == rhs`; linear LHS required). |
| `.lt(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | Builds a discrete $<$ constraint (`lhs - rhs <= -1`; integer-valued expressions only). |
| `.gt(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | Builds a discrete $>$ constraint (`lhs - rhs >= 1`; integer-valued expressions only). |
| `.ne(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | Builds a discrete $\ne$ constraint (`lhs != rhs`; integer-valued expressions only). |
