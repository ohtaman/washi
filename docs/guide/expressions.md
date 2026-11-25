# Expressions (`expr`, `sum`, `dot`)

Mathematical expressions combine decision variables and numeric coefficients into linear, quadratic, or piecewise-linear formulas.
Because JavaScript and TypeScript lack operator overloading, WaSHI provides the `expr` tagged template literal together with `sum()` and `dot()`.
This lets you write readable algebraic formulas while preserving full static type safety.

| Approach | Example | Infix readability | Type safety & IDE rename | Indexed variables (`flow[i][j]`) |
| :--- | :--- | :--- | :--- | :--- |
| Method chaining | `x.mul(30).add(y.mul(50)).le(40)` | Low | Yes | Yes |
| Raw string parsing | `parseConstraint("30 * x + 50 * y <= 40", resolver)` | High | No (runtime string lookup) | Fragile (string concatenation) |
| **Tagged template (`expr`)** | `` expr`30 * ${x} + 50 * ${y} <= 40` `` | **High** | **Yes (actual TS references)** | **Yes (bound by object reference)** |

---

## Tagged Template Literal (`expr`)

Similar to parameterized SQL templates, `expr` separates operator text (`+`, `-`, `*`, `/`, `^2`, `<=`, `>=`, `==`, and more) from interpolated `${...}` values.
You can interpolate `Var`, `LinExpr`, `QuadExpr`, or finite `number` values directly, as well as containers (`Array`, `Iterable`, `Record`) and mapping callbacks inside `sum()` or `dot()`.
Because variables bind by object reference rather than string lookup, you avoid name collisions and keep IDE refactoring intact.

Use `expr` for both arithmetic expressions (`LinExpr | QuadExpr`) and comparison constraints (`Constraint`):

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// 1. Linear combination: 3*x + 5*y - 10
const linearExpr = expr`3 * ${x} + 5 * ${y} - 10`;

// 2. Quadratic expression: x * y + 2 * x^2
const quadExpr = expr`${x} * ${y} + 2 * ${x} * ${x}`;

// 3. Comparison constraint:
const balanceConstraint = expr`${x} + 2 * ${y} <= 40`;
```

### Supported Syntax in `expr`

- **Addition & subtraction**: `${x} + ${y} - 5`
- **Scalar multiplication & division**: `4 * ${x}`, `${x} / 2`
- **Quadratic terms & powers**: `${x} * ${y}`, `2 * ${x} * ${x}`, `${x}^2`, `${x}**2`
- **Unary signs & parentheses**: `-${x} + 10`, `+${x}`, `2 * (${x} + ${y})`
- **Aggregations**: `sum(${xVec})`, `dot(${costs}, ${xVec})`, `sum(${rows}, ${(r) => grid[r][col]})`
- **Piecewise-linear & element lookup**: `max(${xVec}) <= 15`, `sum(abs(${w} - ${target}))`, `at(${costs}, ${idx})` (see [Piecewise-Linear & Element Expressions](#piecewise-linear-element-expressions-max-min-abs-at))
- **Element-wise container arithmetic**: `sum((${price} - ${cost}) * ${qty})`, `sum((${xVec} - ${target})^2)`, `dot(${price} - ${cost}, ${qty})`
- **Nested expressions**: Interpolates variables, numbers, nested `LinExpr` or `QuadExpr` objects, and containers inside `sum` or `dot`.

> [!NOTE]
> - **Comparisons (`<=`, `>=`, `==`, and integer `<`, `>`, `!=`)** return a `Constraint` object.
> - **Arithmetic expressions** return a `LinExpr` (degree 1) or `QuadExpr` (degree 2). Embedded containers must be reduced to a scalar via `sum(...)`, `dot(..., ...)`, `max(...)`, or `min(...)`.
> - **Unsupported nonlinearities**: Polynomial terms of degree $> 2$ (such as `${x}^3`) and quadratic constraints (such as `${x} * ${y} <= 10`) throw an error. (Piecewise-linear `max`, `min`, `abs`, and `at` expressions are supported separately below.)

---

## High-Performance Summation (`sum`)

Use `sum()` to sum 1D or 2D `Array`, `Iterable`, or `Record` containers directly, either inside `` expr`sum(...)` `` or as a standalone helper.
`sum()` runs in $O(N)$ linear time without repeated expression copying:

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

> [!TIP]
> **Avoid $O(N^2)$ `expr` Re-Assignment Inside Loops**: `LinExpr` objects are immutable.
> Writing ``total = expr`${total} + ${x[i]}` `` inside a loop copies every existing term on each iteration, costing $O(N^2)$ time and memory.
> Pass containers to `sum()` or `dot()` for $O(N)$ construction instead.

---

## Dot Product (`dot`)

`dot(a, b)` computes a weighted linear combination of numeric coefficients (`number`) and variables or linear expressions (`Var | LinExpr`).
It works both inside `` expr`dot(${a}, ${b})` `` and as a standalone function, in either operand order (`dot(coeffs, vars)` or `dot(vars, coeffs)`).

Supported 1D and 2D container shapes:
- **1D Arrays**: `number[]` $\times$ `(Var | LinExpr)[]`
- **1D Records**: `Record<K, number>` $\times$ `Record<K, Var | LinExpr>`
- **2D Arrays**: `number[][]` $\times$ `(Var | LinExpr)[][]`
- **2D Records**: `Record<R, Record<C, number>>` $\times$ `Record<R, Record<C, Var | LinExpr>>`
- **2D Mixed**: `Array<Record<C, ...>>` or `Record<R, Array<...>>`

Mismatched array lengths, missing keys, or invalid leaves throw an error identifying the exact path (for example, `at '[0].StoreB'`).

### 1D Vector Dot Product

```typescript
import { expr, dot } from "@ohtaman/washi";

const profits = { desk: 30, chair: 50 };
const vars = m.integer(["desk", "chair"] as const);

// Computes 30 * vars.desk + 50 * vars.chair inside expr
const totalProfit = expr`dot(${profits}, ${vars})`;
```

### 2D Matrix Inner Product (Frobenius Inner Product)

```typescript
const factories = ["Tokyo", "Osaka"] as const;
const stores = ["StoreA", "StoreB"] as const;

const costs = {
  Tokyo: { StoreA: 4, StoreB: 7 },
  Osaka: { StoreA: 8, StoreB: 3 },
};

const ship = m.continuous(factories, stores, { lb: 0 });

// Total shipping cost across all routes:
const totalShippingCost = expr`dot(${costs}, ${ship})`;
```

> [!NOTE]
> **2D `dot(A, B)` is the Frobenius Inner Product**: For 2D matrices or nested records, `dot(A, B)` returns the scalar sum of element-wise products $\langle A, B \rangle_F = \sum_{i,j} A_{i,j} B_{i,j}$.
> It does **not** compute matrix multiplication $(AB)_{i,k} = \sum_j A_{i,j} B_{j,k}$.

---

## Composing Aggregations in `expr`

Keep `sum(...)`, `dot(..., ...)`, and comparisons inside the `expr` template string rather than pre-evaluating standalone calls or `Object.values()`:

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

WaSHI supports Convex Quadratic Programming (QP) objectives via HiGHS.
You can write quadratic terms with `expr` or assemble them programmatically using `QuadExpr` and `.mul()`.

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
> **Convexity Requirement ($\mathbf{Q} \succeq 0$)**: When minimizing a quadratic objective, HiGHS requires the symmetric quadratic matrix $\mathbf{Q}$ to be **positive semi-definite (PSD, $\mathbf{Q} \succeq 0$)**.
> When maximizing, $\mathbf{Q}$ must be **negative semi-definite ($\mathbf{Q} \preceq 0$)**.
> Sums of squares ($\sum_i (x_i - t_i)^2$) and variance quadratic forms $\mathbf{w}^\top \boldsymbol{\Sigma} \mathbf{w}$ (with a valid covariance matrix $\boldsymbol{\Sigma}$) are guaranteed convex ($\mathbf{Q} \succeq 0$).
> Indefinite products of continuous variables (such as minimizing $x \cdot y$) are non-convex and rejected by the solver.
> To linearize the product of two binary variables $x_A \cdot x_B$ in MILP, see [Formulation Patterns & Tips](./formulation-tips.md#product-of-two-binary-variables).

---

## Piecewise-Linear & Element Expressions (`max`, `min`, `abs`, `at`)

WaSHI provides backend-agnostic piecewise-linear functions (`max`, `min`, `abs`) and 0-based variable indexing (`at`).
They work both inside `` expr`...` `` and as standalone helpers imported from `@ohtaman/washi`:

```typescript
import { Model, expr, minimize, abs, max, min, at } from "@ohtaman/washi";

const m = new Model();
const w = m.continuous(3, { lb: 0, ub: 20, prefix: "w" });
const target = [4, 7, 10];
const route = m.integer("route", { lb: 0, ub: 2 });
const routeCost = [18, 12, 25];

// Convex max/abs terms lower to linear inequalities with zero binary variables (at() uses binary selectors on HiGHS/GLPK):
m.objective(
  minimize(expr`sum(abs(${w} - ${target})) + at(${routeCost}, ${route})`)
);
m.constraint(expr`max(${w}) <= 15`, "peak_cap");

// Nested composition and programmatic helpers also work:
const maxErr = max(expr`abs(${w[0]} - 4)`, abs(expr`${w[1]} - 7`));
m.constraint(expr`${maxErr} <= 3`);
```

### Element-Wise Container Support

Inside `expr`, `abs(${arr} - ${target})` expands element-wise over matching 1D or 2D `Array`, `Iterable`, and `Record` containers.
This lets you write expressions such as `` expr`sum(abs(${w} - ${target}))` `` and `` expr`max(abs(${pred} - ${actual}))` `` directly.

### How Each Solver Handles `max`, `min`, and `abs`

In **convex directions**—minimizing or upper-bounding (`<=`) `max` and `abs`, or maximizing or lower-bounding (`>=`) `min`—HiGHS and GLPK use a continuous auxiliary variable with simple linear inequalities.
This *epigraph* formulation requires **zero binary variables** and works even on unbounded continuous variables.

In **non-convex or equality contexts** (`minimize(min(...))`, `maximize(abs(...))`, `max(...) >= rhs`, `abs(...) == rhs`), solvers differ as follows:

- **HiGHS & GLPK**: Use an exact discrete MIP encoding, so every participating variable must have finite bounds.
- **Pumpkin**: Solves these natively over bounded integer variables.
- **Z3**: Represents them with native conditional (`If`) expressions.

### 0-Based Element Lookup (`at(array, index)`)

`at(array, index)` models the classic Constraint Programming `Element` constraint, where the array index itself is a decision variable (`array[index]`).
The `index` expression must be integer-valued, and all backends automatically enforce $0 \le \text{index} < \text{array.length}$.
Pumpkin and Z3 handle `at()` natively, while HiGHS and GLPK encode it with binary selector variables (requiring finite bounds on any variable entries in `array`).

---

## Evaluating Expressions After Solving (`.value`)

Both `LinExpr` and `QuadExpr` expose a `.value` getter returning `number | null`.
Once a model has been solved and every referenced variable has a finite value, you can evaluate any sub-expression directly:

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

If the model has not been solved, or if any referenced variable has `value === null`, `.value` returns `null`.

---

## Fluent Arithmetic & Relational Methods

In addition to `expr`, `Var`, `LinExpr`, and `QuadExpr` provide immutable fluent methods for programmatic expression building:

| Method | Supported On | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `.add(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` or `QuadExpr` | Adds a number, `Var`, `LinExpr`, or `QuadExpr`. |
| `.sub(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` or `QuadExpr` | Subtracts a number, `Var`, `LinExpr`, or `QuadExpr`. |
| `.mul(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` or `QuadExpr` | Multiplies by a scalar `number`, or multiplies two linear expressions into a `QuadExpr` (a `QuadExpr` with quadratic terms only allows scalar multiplication; degree $> 2$ throws). |
| `.div(divisor)` | `LinExpr`, `QuadExpr` | `LinExpr` or `QuadExpr` | Divides by a non-zero finite scalar `number`. |
| `.neg()` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` or `QuadExpr` | Negates all terms ($-e$). |
| `.le(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | Builds a $\le$ constraint (`lhs <= rhs`; both sides must have no quadratic terms). |
| `.ge(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | Builds a $\ge$ constraint (`lhs >= rhs`; both sides must have no quadratic terms). |
| `.eq(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | Builds an $=$ equality constraint (`lhs == rhs`; both sides must have no quadratic terms). |
| `.lt(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | Builds a discrete $<$ constraint (`lhs - rhs <= -1`; integer-valued expressions without quadratic terms only). |
| `.gt(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | Builds a discrete $>$ constraint (`lhs - rhs >= 1`; integer-valued expressions without quadratic terms only). |
| `.ne(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | Builds a discrete $\ne$ constraint (`lhs != rhs`; integer-valued expressions without quadratic terms only). |
