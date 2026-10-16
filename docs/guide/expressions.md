# Expressions (`expr`, `c`, `sum`, `dot`)

Mathematical expressions are linear or quadratic combinations of decision variables and numeric coefficients.

In JavaScript and TypeScript without native operator overloading, WaSHI provides **tagged template literals (`expr`, `c`)**, high-performance **`sum()`**, and matrix/vector **`dot()`** to make algebraic modeling clean and expressive.

---

## ✍️ Tagged Template Literals (`expr` and `c`)

Use `expr` for arithmetic expressions (`LinExpr | QuadExpr`) and `c` for relational constraints (`Constraint`):

```typescript
import { Model, expr, c } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// 1. Linear combination: 3*x + 5*y - 10
const linearExpr = expr`3 * ${x} + 5 * ${y} - 10`;

// 2. Quadratic expression: x * y + 2 * x^2
const quadExpr = expr`${x} * ${y} + 2 * ${x} * ${x}`;

// 3. Relational constraint (using c):
const balanceConstraint = c`${x} + 2 * ${y} <= 40`;
```

### Supported Syntax in `expr`
- **Addition & Subtraction**: `${x} + ${y} - 5`
- **Scalar Multiplication**: `4 * ${x}`, `${x} * 4`
- **Variable Multiplication (Quadratic terms)**: `${x} * ${y}`, `2 * ${x} * ${x}`
- **Powers & Exponentiation**: `${x}^2`, `${x}**2`
- **Unary Negation**: `-${x} + 10`
- **Parentheses**: `2 * (${x} + ${y})`
- **Nested Expressions**: `expr` seamlessly interpolates variables, numbers, `sum()` results, and nested expressions.

> [!NOTE]
> For relational comparisons (`<=`, `>=`, `==`), use the `c` tagged template (e.g., ``c`${x} + 2 * ${y} <= 40` ``) which returns a first-class `Constraint`. Calling `expr` with comparison operators strictly throws an Error directing callers to `c`.
> `expr` uniformly handles linear and quadratic expressions (up to degree 2). If quadratic terms are present, `expr` returns a `QuadExpr`; otherwise, it returns a `LinExpr`. Polynomial terms of degree $> 2$ (e.g. ``${x} * ${y} * ${z}``, ``${x}^3``) and non-linear constraints (e.g. ``${x} * ${y} <= 10``) are rejected because standard MILP/LP/QP formulations only support linear constraints and quadratic objectives.

---

## ⚡ High-Performance Summation (`sum`)

For iterating over large collections of variables or indices:

```typescript
import { sum } from "@ohtaman/washi";

const items = ["A", "B", "C"];
const weights = { A: 10, B: 20, C: 30 };
const x = m.binary(items);

// 1. Transform elements with a mapping callback:
const totalWeight = sum(items, (item) => x[item].mul(weights[item]));

// 2. Direct array summation:
const count = sum(Object.values(x));
```

`sum()` runs in $O(N)$ linear time without AST overhead.

---

## 🎯 Dot Product (`dot`)

The `dot(a, b)` helper computes linear combinations of numeric coefficients (`number`) and variables or linear expressions (`Var | LinExpr`) in either operand order (`dot(coeffs, vars)` or `dot(vars, coeffs)`).

Supported 1D and 2D container shapes:
- **1D Arrays**: `number[]` $\times$ `(Var | LinExpr)[]`
- **1D Records**: `Record<K, number>` $\times$ `Record<K, Var | LinExpr>`
- **2D Arrays**: `number[][]` $\times$ `(Var | LinExpr)[][]`
- **2D Records**: `Record<R, Record<C, number>>` $\times$ `Record<R, Record<C, Var | LinExpr>>`
- **2D Mixed**: `Array<Record<C, ...>>` or `Record<R, Array<...>>`

Mismatched array lengths, missing dictionary keys, or non-finite/non-linear leaves throw an explicit error indicating the offending path (e.g., `at '[0].StoreB'`).

### 1D Vector Dot Product
```typescript
import { dot } from "@ohtaman/washi";

const profits = { desk: 30, chair: 50 };
const vars = m.integer(["desk", "chair"]);

// Computes 30 * vars.desk + 50 * vars.chair
const totalProfit = dot(profits, vars);
```

### 2D Matrix Dot Product
Works directly with 2D arrays (`m.continuous(rows, cols)`), nested dictionaries (`m.continuous(rowKeys, colKeys)`), or mixed 2D containers:

```typescript
const factories = ["Tokyo", "Osaka"];
const stores = ["StoreA", "StoreB"];

const costs = {
  Tokyo: { StoreA: 4, StoreB: 7 },
  Osaka: { StoreA: 8, StoreB: 3 },
};

const ship = m.continuous(factories, stores);

// Total shipping cost in one line:
m.objective(minimize(dot(costs, ship)));
```

---

## 🧮 Quadratic Expressions (`QuadExpr` & `expr`)

WaSHI natively supports Convex Quadratic Programming (QP) with the HiGHS solver. Quadratic objectives can be written uniformly using the `expr` template literal, or algebraically using `QuadExpr` and `.mul()`:

### 1. Using `expr` (Recommended)
You can write quadratic formulas naturally with `*`, `^2`, or `**2`:

```typescript
import { Model, expr, c, minimize } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// Quadratic objective using expr:
m.objective(minimize(expr`3 * ${x} + ${x}^2 + ${y}^2`));

// Linear constraint using c:
m.constraint(c`${x} + ${y} >= 4`);
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
