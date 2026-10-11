# Expressions (`expr`)

Mathematical expressions are linear or quadratic combinations of variables and numeric coefficients.

In JavaScript and TypeScript, operator overloading (`+`, `-`, `*`) is not supported natively. WaSHI provides **tagged template literals (`expr`)** and summation helpers (`quicksum`, `lpSum`) to give you clean, readable algebraic syntax.

---

## ✍️ Tagged Template Literals (`expr`)

The `expr` template tag allows you to write algebraic formulas naturally:

```typescript
import { Model, expr } from "@ohtaman/washi";

const model = new Model();
const x = model.addVar({ lb: 0 });
const y = model.addVar({ lb: 0 });

// Linear combination: 3*x + 5*y - 10
const linearExpr = expr`3 * ${x} + 5 * ${y} - 10`;

// Quadratic expression: x * y + 2 * x^2
const quadExpr = expr`${x} * ${y} + 2 * ${x} * ${x}`;
```

### Supported Syntaxes in `expr`
- **Addition & Subtraction**: `${x} + ${y} - 5`
- **Multiplication**: `4 * ${x}`, `${x} * 4`, `${x} * ${y}`
- **Unary Negation**: `-${x} + 10`
- **Parentheses**: `2 * (${x} + ${y})`
- **Nested Expressions**: `expr` accepts both `Variable` instances and existing `Expression` instances.

---

## ⚡ Summation Helpers (`quicksum` & `lpSum`)

When summing over large collections of variables (e.g. hundreds or thousands of variables in loops), string template parsing can introduce unnecessary overhead.

WaSHI provides high-performance $O(N)$ linear-time summation helpers:

### `quicksum`

```typescript
import { Model, quicksum } from "@ohtaman/washi";

const model = new Model();
const items = Array.from({ length: 1000 }, () => model.addVar({ lb: 0 }));
const costs = Array.from({ length: 1000 }, () => Math.random() * 10);

// Fast linear-time weighted summation: sum(costs[i] * items[i])
const totalCost = quicksum(items.map((x, i) => [costs[i], x]));
```

### `lpSum` (PuLP / python-mip compatible)

If you are migrating from Python's PuLP:

```typescript
import { lpSum } from "@ohtaman/washi";

// Unweighted sum of an array of variables: sum(items)
const totalItems = lpSum(items);
```

---

## 🧮 Quadratic Expressions

WaSHI natively supports Quadratic Programming (QP) with the HiGHS solver. You can formulate quadratic terms directly in `expr`:

```typescript
const x1 = model.addVar();
const x2 = model.addVar();

// Quadratic objective: 0.5 * (x1^2 + x2^2) + covariance terms
const variance = expr`0.5 * ${x1} * ${x1} + 0.5 * ${x2} * ${x2} + 0.2 * ${x1} * ${x2}`;

model.minimize(variance);
```
