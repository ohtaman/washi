# Expressions (`expr`, `sum`, `dot`)

Mathematical expressions are linear or quadratic combinations of decision variables and numeric coefficients.

In JavaScript and TypeScript—which do not support operator overloading—WaSHI provides the **unified tagged template literal (`expr`)**, **`sum()`**, and matrix/vector **`dot()`** to construct algebraic expressions without losing static type safety.

| Approach | Example | Infix readability | Type safety & IDE rename | Indexed variables (`flow[i][j]`) |
| :--- | :--- | :--- | :--- | :--- |
| Method chaining | `x.mul(30).add(y.mul(50)).le(40)` | Low | Yes | Yes |
| Raw string parsing | `parseConstraint("30 * x + 50 * y <= 40", resolver)` | High | No (runtime string lookup) | Fragile (string concatenation) |
| **Tagged template (`expr`)** | `` expr`30 * ${x} + 50 * ${y} <= 40` `` | **High** | **Yes (actual TS references)** | **Yes (bound by object reference)** |

---

## ✍️ Tagged Template Literal (`expr`)

Similar to parameterized `sql` tagged templates, `expr` receives the static operator text (`+`, `-`, `*`, `^2`, `<=`, `>=`, `==`) separately from the interpolated `${...}` values (`Var`, `LinExpr`, `QuadExpr`, or finite `number`). Variables are bound by object reference rather than resolved by string name, avoiding naming collisions and preserving TypeScript type checking and IDE refactoring.

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
- **Aggregations (`sum` & `dot`)**: `sum(${qty}) <= 100`, `dot(${profit}, ${qty}) - 20 * ${lineOpen}`, `sum(${factories}, ${(f) => ship[f][s]}) >= ${demand[s]}`
- **Element-Wise Container Arithmetic**: `sum((${price} - ${cost}) * ${qty})`, `sum((${x} - ${target})^2)`, `dot(${price} - ${cost}, ${qty})`
- **Nested Expressions**: `expr` seamlessly interpolates variables, numbers, `Array` / `Record` containers (inside `sum` or `dot`), and nested expressions.

> [!NOTE]
> For relational comparisons (`<=`, `>=`, `==`), `expr` (e.g., ``expr`${x} + 2 * ${y} <= 40` ``) returns a first-class `Constraint`.
> For arithmetic expressions without comparison operators, `expr` uniformly handles linear and quadratic expressions (up to degree 2): if quadratic terms are present, `expr` returns a `QuadExpr`; otherwise, it returns a `LinExpr`. Interpolated `Array` or `Record` containers must be reduced to a scalar via `sum(...)` or `dot(..., ...)`. Polynomial terms of degree $> 2$ (e.g. ``${x} * ${y} * ${z}``, ``${x}^3``) and non-linear constraints (e.g. ``${x} * ${y} <= 10``) are rejected because standard MILP/LP/QP formulations only support linear constraints and quadratic objectives.

---

## ⚡ High-Performance Summation (`sum`)

For summing 1D/2D `Array`, `Iterable`, or `Record` containers—either directly inside `` expr`sum(...)` `` or via the standalone `sum()` helper:

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

`sum()` runs in $O(N)$ linear time without AST overhead.

> [!TIP]
> **Avoid $O(N^2)$ `expr` Re-Assignment Inside Loops**: Because `LinExpr` and `expr` are immutable, accumulating terms via `total = expr`${total} + ${x[i]}`` inside a large loop copies all previously accumulated terms on every iteration ($O(N^2)$ time and memory). Always pass arrays or records to `sum(x)` or `dot(coeffs, x)` for $O(N)$ construction.

---

## 🎯 Dot Product (`dot`)

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

// Total shipping cost in one line (equivalent to expr`sum(${costs} * ${ship})`):
m.objective(minimize(expr`dot(${costs}, ${ship})`));
```

> [!NOTE]
> **2D `dot(A, B)` is the Frobenius Inner Product**: For 2D matrices or nested records, `dot(A, B)` computes the scalar **Frobenius inner product** $\langle A, B \rangle_F = \sum_{i,j} A_{i,j} B_{i,j}$ (the sum of element-wise products across all rows and columns, equivalent to `` expr`sum(${A} * ${B})` ``), **not** the matrix-matrix product $(AB)_{i,k} = \sum_j A_{i,j} B_{j,k}$.

---

## Formulation Patterns

By combining `expr`, `sum(...)`, `dot(..., ...)`, and `.map()`, you can express common optimization patterns directly without manual loops or `Object.values()`.

### 1. Separating Syntax and Data in `expr`

Write mathematical operators, `sum(...)`, `dot(..., ...)`, and comparisons (`<=`, `>=`, `==`) in the template string, and interpolate variables and data containers via `${...}`:

```typescript
// Nested calls and Object.values() (verbose)
m.objective(maximize(expr`${dot(profit, qty)} - 20 * ${lineOpen}`));
m.indicator(lineOpen, expr`${sum(Object.values(qty))} <= 0`, { activeValue: 0 });

// Direct sum() and dot() inside expr (recommended)
m.objective(maximize(expr`dot(${profit}, ${qty}) - 20 * ${lineOpen}`));
m.indicator(lineOpen, expr`sum(${qty}) <= 0`, { activeValue: 0 });
```

### 2. Common Aggregation & Constraint Patterns

| Pattern | Mathematical Formula | WaSHI Expression |
| :--- | :--- | :--- |
| **Total sum** (1D/2D `Array` or `Record`) | $\sum_i x_i \le C$ | `` m.constraint(expr`sum(${x}) <= ${C}`) `` |
| **Inner product** (1D vector or 2D Frobenius) | $\sum_i c_i x_i \le B$ | `` m.constraint(expr`dot(${c}, ${x}) <= ${B}`) `` |
| **Element-wise margin / net sum** | $\sum_i (p_i - c_i) \cdot x_i$ | `` expr`sum((${price} - ${cost}) * ${x})` `` |
| **Least-squares QP objective** | $\sum_i (x_i - t_i)^2$ | `` expr`sum((${x} - ${target})^2)` `` |
| **Batch constraints** (for all $i \in I$) | $a_i x_i \le b_i \quad (\forall i)$ | `` m.constraint(items.map((i) => expr`${a[i]} * ${x[i]} <= ${b[i]}`)) `` |
| **2D row sums** (for each row $f$) | $\sum_s X_{f,s} \le S_f \quad (\forall f)$ | `` m.constraint(factories.map((f) => expr`sum(${ship[f]}) <= ${supply[f]}`)) `` |
| **2D column sums** (for each col $s$) | $\sum_f X_{f,s} \ge D_s \quad (\forall s)$ | `` m.constraint(stores.map((s) => expr`sum(${factories}, ${(f) => ship[f][s]}) >= ${demand[s]}`)) `` |

### 3. Example: Transportation Problem

```typescript
const factories = ["Tokyo", "Osaka"] as const;
const stores = ["S1", "S2", "S3"] as const;
const ship = m.continuous(factories, stores, { lb: 0 });

// Objective: minimize total shipping cost across all routes
m.objective(minimize(expr`dot(${costMat}, ${ship})`));

// Supply limit per factory (row sum)
m.constraint(factories.map((f) => expr`sum(${ship[f]}) <= ${supply[f]}`));

// Demand fulfillment per store (column sum)
m.constraint(
  stores.map((s) => expr`sum(${factories}, ${(f) => ship[f][s]}) >= ${demand[s]}`)
);
```

---

## 🧮 Quadratic Expressions (`QuadExpr` & `expr`)

WaSHI natively supports Convex Quadratic Programming (QP) with the HiGHS solver. Quadratic objectives can be written uniformly using the `expr` template literal, or algebraically using `QuadExpr` and `.mul()`:

### 1. Using `expr` (Recommended)
You can write quadratic formulas naturally with `*`, `^2`, or `**2`:

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
Alternatively, you can construct quadratic expressions programmatically:

```typescript
import { Model, QuadExpr, minimize } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// 1. Construct quadratic terms with .mul()
// Represents x * y + 2 * x^2
const quad = x.mul(y).add(x.mul(x).mul(2));

// 2. Build portfolio risk objective: w^T * Sigma * w
const assets = ["Tech", "Bonds"];
const w = m.continuous(assets, { lb: 0, ub: 1 });

let risk = new QuadExpr();
risk = risk.add(w.Tech.mul(w.Tech).mul(0.04));
risk = risk.add(w.Tech.mul(w.Bonds).mul(0.005));
risk = risk.add(w.Bonds.mul(w.Bonds).mul(0.01));

m.objective(minimize(risk));
```

### 3. Practical QP & Bilinear Formulation Notes

- **Convexity Requirement ($\mathbf{Q} \succeq 0$)**: Standard QP solvers (including HiGHS) require the quadratic objective matrix $\mathbf{Q}$ to be **positive semi-definite (PSD)** when minimizing (or negative semi-definite when maximizing). Sum-of-squares objectives ($\sum_i (x_i - t_i)^2$) and covariance matrices ($\mathbf{w}^\top \boldsymbol{\Sigma} \mathbf{w}$) are guaranteed PSD. Indefinite products (such as minimizing $x \cdot y$ over continuous variables) are non-convex and will be rejected by the solver.
- **Linearizing Binary Products ($x_A \cdot x_B$) in MILP**: If your model has integer/binary variables and needs the product of two binary decisions $x_A, x_B \in \{0, 1\}$ (e.g., a bundle bonus or interaction cost when both $A$ and $B$ are chosen), linearize the product $z_{AB} = x_A \cdot x_B$ using an auxiliary variable $z_{AB} \in [0, 1]$ and the standard McCormick / Fortet inequalities:

$$z_{AB} \le x_A, \quad z_{AB} \le x_B, \quad z_{AB} \ge x_A + x_B - 1$$

```typescript
const xA = m.binary("xA");
const xB = m.binary("xB");
// Continuous [0, 1] is automatically forced to {0, 1} when xA, xB are binary
const bothAB = m.continuous("both_AB", { lb: 0, ub: 1 });

m.constraint(expr`${bothAB} <= ${xA}`, "and_upper_A");
m.constraint(expr`${bothAB} <= ${xB}`, "and_upper_B");
m.constraint(expr`${bothAB} >= ${xA} + ${xB} - 1`, "and_lower_AB");
```

---

## 📊 Evaluating Expressions After Solving (`.value`)

Both `LinExpr` and `QuadExpr` expose a `.value` getter (`number | null`). Once a model has been solved and all referenced variables have finite primal values, you can evaluate any sub-expression—such as total department cost, portfolio return, or resource utilization—directly without manual arithmetic:

```typescript
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

## 🔗 Fluent Arithmetic & Relational Methods

In addition to `expr`, `Var`, `LinExpr`, and `QuadExpr` provide immutable fluent methods for programmatic expression building:

| Method | Supported On | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `.add(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` or `QuadExpr` | Adds a number, `Var`, `LinExpr`, or `QuadExpr`. |
| `.sub(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` or `QuadExpr` | Subtracts a number, `Var`, `LinExpr`, or `QuadExpr`. |
| `.mul(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` or `QuadExpr` | Multiplies by a scalar `number`, or multiplies two linear terms into a `QuadExpr`. |
| `.div(divisor)` | `LinExpr`, `QuadExpr` | `LinExpr` or `QuadExpr` | Divides by a non-zero finite scalar `number`. |
| `.neg()` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` or `QuadExpr` | Negates all terms ($-e$). |
| `.le(rhs)` | `Var`, `LinExpr` | `Constraint` | Builds a $\le$ constraint (`lhs <= rhs`). |
| `.ge(rhs)` | `Var`, `LinExpr` | `Constraint` | Builds a $\ge$ constraint (`lhs >= rhs`). |
| `.eq(rhs)` | `Var`, `LinExpr` | `Constraint` | Builds an $==$ equality constraint (`lhs == rhs`). |

