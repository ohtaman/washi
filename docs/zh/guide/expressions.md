# 代数表达式 (`expr`, `sum`, `dot`)

数学表达式是决策变量与数值系数的线性或二次组合。

在不支持运算符重载的 JavaScript 与 TypeScript 中，WaSHI 提供了**统一标签模板字面量 (`expr`)**、求和函数 **`sum()`** 以及向量/矩阵点积函数 **`dot()`**，让您在保持静态类型安全的前提下自然地编写代数公式。

| 方式 | 示例 | 中缀可读性 | 类型安全与 IDE 重命名 | 多维索引变量 (`flow[i][j]`) |
| :--- | :--- | :--- | :--- | :--- |
| 方法链 | `x.mul(30).add(y.mul(50)).le(40)` | 低 | 支持 | 支持 |
| 纯字符串解析 | `parseConstraint("30 * x + 50 * y <= 40", resolver)` | 高 | 不支持（运行时按名称查找） | 脆弱（需手动拼接字符串） |
| **标签模板 (`expr`)** | `` expr`30 * ${x} + 50 * ${y} <= 40` `` | **高** | **支持（真实 TS 引用）** | **支持（直接绑定对象引用）** |

---

## ✍️ 标签模板字面量 (`expr`)

类似于参数化的 `sql` 标签模板，`expr` 将静态运算符文本（`+`、`-`、`*`、`^2`、`<=`、`>=`、`==`）与插值 `${...}` 中的值（`Var`、`LinExpr`、`QuadExpr` 或有限 `number`）分开接收。变量通过对象引用直接绑定，而非按字符串名称解析，从而避免命名冲突，并完整保留 TypeScript 类型检查与 IDE 符号重命名能力。

算术表达式（`LinExpr | QuadExpr`）和关系比较约束（`Constraint`）均可使用 `expr` 构建：

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// 1. 线性组合：3*x + 5*y - 10
const linearExpr = expr`3 * ${x} + 5 * ${y} - 10`;

// 2. 二次表达式：x * y + 2 * x^2
const quadExpr = expr`${x} * ${y} + 2 * ${x} * ${x}`;

// 3. 关系比较约束：
const balanceConstraint = expr`${x} + 2 * ${y} <= 40`;
```

### `expr` 支持的语法
- **加法与减法**：`${x} + ${y} - 5`
- **标量乘法与除法**：`4 * ${x}`、`${x} / 2`
- **变量相乘（二次项）**：`${x} * ${y}`、`2 * ${x} * ${x}`
- **幂运算与平方**：`${x}^2`、`${x}**2`
- **一元正负号**：`-${x} + 10`、`+${x}`
- **圆括号分组**：`2 * (${x} + ${y})`
- **聚合函数 (`sum` & `dot`)**：`sum(${qty}) <= 100`、`dot(${profit}, ${qty}) - 20 * ${lineOpen}`、`sum(${factories}, ${(f) => ship[f][s]}) >= ${demand[s]}`
- **容器逐元素四则运算**：`sum((${price} - ${cost}) * ${qty})`、`sum((${x} - ${target})^2)`、`dot(${price} - ${cost}, ${qty})`
- **嵌套表达式**：`expr` 可无缝插值变量、数字、`Array` / `Record` 容器（在 `sum` 或 `dot` 内部）以及嵌套表达式。

> [!NOTE]
> 对于包含关系比较运算符（`<=`、`>=`、`==`）的式子，`expr`（例如 ``expr`${x} + 2 * ${y} <= 40` ``）会返回一等的 `Constraint` 对象。
> 对于不含比较运算符的算术表达式，`expr` 会统一处理线性与二次表达式（最高 2 次）：若包含二次项则返回 `QuadExpr`，否则返回 `LinExpr`。插值的 `Array` 或 `Record` 容器必须通过 `sum(...)` 或 `dot(..., ...)` 归约为标量。次数 $> 2$ 的多项式项（如 ``${x} * ${y} * ${z}``、``${x}^3``）以及非线性约束（如 ``${x} * ${y} <= 10``）会被拒绝，因为标准的 MILP/LP/QP 模型仅支持线性约束与最高二次的目标函数。

---

## ⚡ 高性能求和 (`sum`)

在对一维或二维 `Array`、`Iterable` 或 `Record`（字典）容器求和时，既可以在 `` expr`sum(...)` `` 内部直接书写，也可以调用独立的 `sum()` 辅助函数：

```typescript
import { expr, sum } from "@ohtaman/washi";

const items = ["A", "B", "C"] as const;
const weights = { A: 10, B: 20, C: 30 };
const x = m.binary(items);

// 1. 在 expr 内直接对 Record 或数组求和（无需 Object.values()）：
m.constraint(expr`sum(${x}) <= 2`, "max_selected");

// 2. 在 expr`sum(...)` 内进行逐元素算术运算：
const weightedExpr = expr`sum(${weights} * ${x})`;

// 3. 使用映射回调函数转换并汇总元素：
const totalWeight = sum(items, (item) => x[item].mul(weights[item]));

// 4. 独立 sum() 同样支持直接传入一维/二维 Record 或数组：
const count = sum(x);
```

`sum()` 在无 AST 解析开销的情况下以 $O(N)$ 线性时间运行。

> [!TIP]
> **避免在循环中用 `expr` 逐项累加（$O(N^2)$）**：由于 `LinExpr` 与 `expr` 的返回值是不可变的，在大规模循环中编写 ``total = expr`${total} + ${x[i]}` `` 会在每次迭代时复制已有的全部项，导致 $O(N^2)$ 的时间与内存开销。汇总大量变量时，请始终使用 `sum(x)` 或 `dot(coeffs, x)` 以保持 $O(N)$ 线性复杂度。

---

## 🎯 向量与矩阵点积 (`dot`)

`dot(a, b)`（既可在 `` expr`dot(${a}, ${b})` `` 内部使用，也可作为独立函数 `dot(a, b)` 调用）用于计算数值系数（`number`）与变量或线性表达式（`Var | LinExpr`）的线性组合，支持任意操作数顺序（`dot(coeffs, vars)` 或 `dot(vars, coeffs)`）。

支持的一维和二维容器结构：
- **一维数组**：`number[]` $\times$ `(Var | LinExpr)[]`
- **一维字典**：`Record<K, number>` $\times$ `Record<K, Var | LinExpr>`
- **二维数组**：`number[][]` $\times$ `(Var | LinExpr)[][]`
- **二维字典**：`Record<R, Record<C, number>>` $\times$ `Record<R, Record<C, Var | LinExpr>>`
- **二维混合容器**：`Array<Record<C, ...>>` 或 `Record<R, Array<...>>`

当数组长度不匹配、字典键缺失或叶节点包含非有限数值/非线性项时，`dot()` 会抛出指明具体出错路径（例如 `at '[0].StoreB'`）的错误。

### 一维向量点积
```typescript
import { expr, dot } from "@ohtaman/washi";

const profits = { desk: 30, chair: 50 };
const vars = m.integer(["desk", "chair"] as const);

// 在 expr 内计算 30 * vars.desk + 50 * vars.chair（等同于 dot(profits, vars)）
const totalProfit = expr`dot(${profits}, ${vars})`;
```

### 二维矩阵内积（Frobenius 内积）
直接支持二维数组（`m.continuous(rows, cols)`）、嵌套字典（`m.continuous(rowKeys, colKeys)`）或混合二维容器：

```typescript
const factories = ["Tokyo", "Osaka"] as const;
const stores = ["StoreA", "StoreB"] as const;

const costs = {
  Tokyo: { StoreA: 4, StoreB: 7 },
  Osaka: { StoreA: 8, StoreB: 3 },
};

const ship = m.continuous(factories, stores, { lb: 0 });

// 一行代码表达总运输成本（等同于 expr`sum(${costs} * ${ship})`）：
m.objective(minimize(expr`dot(${costs}, ${ship})`));
```

> [!NOTE]
> **二维 `dot(A, B)` 是 Frobenius 内积（Frobenius Inner Product）**：对于二维矩阵或嵌套字典，`dot(A, B)` 计算的是标量 **Frobenius 内积** $\langle A, B \rangle_F = \sum_{i,j} A_{i,j} B_{i,j}$（即所有行列对应元素乘积之和，等同于 `` expr`sum(${A} * ${B})` ``），而**不是**矩阵乘法 $(AB)_{i,k} = \sum_j A_{i,j} B_{j,k}$。

---

## ✨ 地道建模模式指南（零样板代码）

结合 `expr`、`sum(...)`、`dot(..., ...)` 与 `.map()`，您可以编写无需 `for` 循环、`Object.values()` 或嵌套 `${sum(...)}` 的精炼优化模型。

### 1. `expr` 的黄金法则
> **将数学运算符、`sum(...)`、`dot(..., ...)` 和比较符号（`<=`、`>=`、`==`）写在模板字符串中；将变量、常数和容器（数组/字典）放在 `${...}` 内。**

```typescript
// ❌ 繁琐写法：嵌套模板标签与 Object.values()
m.objective(maximize(expr`${dot(profit, qty)} - 20 * ${lineOpen}`));
m.indicator(lineOpen, expr`${sum(Object.values(qty))} <= 0`, { activeValue: 0 });

// ✅ 地道写法：在 expr 中直接书写 sum() 与 dot()
m.objective(maximize(expr`dot(${profit}, ${qty}) - 20 * ${lineOpen}`));
m.indicator(lineOpen, expr`sum(${qty}) <= 0`, { activeValue: 0 });
```

### 2. 一行惯用法速查表

| 建模目标 | 数学公式 | WaSHI 地道写法 |
| :--- | :--- | :--- |
| **全体求和**（1D/2D 数组或字典） | $\sum_i x_i \le C$ | `` m.constraint(expr`sum(${x}) <= ${C}`) `` |
| **内积**（1D 向量或 2D Frobenius 内积） | $\sum_i c_i x_i \le B$ | `` m.constraint(expr`dot(${c}, ${x}) <= ${B}`) `` |
| **逐元素差/积求和**（如净毛利） | $\sum_i (p_i - c_i) \cdot x_i$ | `` expr`sum((${price} - ${cost}) * ${x})` `` |
| **最小二乘（QP 目标函数）** | $\sum_i (x_i - t_i)^2$ | `` expr`sum((${x} - ${target})^2)` `` |
| **批量逐元素约束**（对所有 $i \in I$） | $a_i x_i \le b_i \quad (\forall i)$ | `` m.constraint(items.map((i) => expr`${a[i]} * ${x[i]} <= ${b[i]}`)) `` |
| **二维变量按行求和**（各工厂供应上限） | $\sum_s X_{f,s} \le S_f \quad (\forall f)$ | `` m.constraint(factories.map((f) => expr`sum(${ship[f]}) <= ${supply[f]}`)) `` |
| **二维变量按列求和**（各门店需求满足） | $\sum_f X_{f,s} \ge D_s \quad (\forall s)$ | `` m.constraint(stores.map((s) => expr`sum(${factories}, ${(f) => ship[f][s]}) >= ${demand[s]}`)) `` |

### 3. Before / After：运输问题（Transportation Problem）

```typescript
const factories = ["Tokyo", "Osaka"] as const;
const stores = ["S1", "S2", "S3"] as const;
const ship = m.continuous(factories, stores, { lb: 0 });

// 目标函数：最小化所有路线的总运输成本
m.objective(minimize(expr`dot(${costMat}, ${ship})`));

// 每个工厂的供应上限（按行求和）
m.constraint(factories.map((f) => expr`sum(${ship[f]}) <= ${supply[f]}`));

// 每个门店的需求满足（按列求和）
m.constraint(
  stores.map((s) => expr`sum(${factories}, ${(f) => ship[f][s]}) >= ${demand[s]}`)
);
```

---

## 🧮 二次表达式 (`QuadExpr` 与 `expr`)

WaSHI 通过 HiGHS 求解器原生支持凸二次规划（Convex QP）。二次目标函数既可以使用 `expr` 模板字面量统一编写，也可以使用 `QuadExpr` 与 `.mul()` 通过方法链构建：

### 1. 使用 `expr`（推荐）
您可以使用 `*`、`^2` 或 `**2` 自然地书写二次公式：

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// 使用 expr 定义二次目标函数：
m.objective(minimize(expr`3 * ${x} + ${x}^2 + ${y}^2`));

// 使用 expr 定义线性约束条件：
m.constraint(expr`${x} + ${y} >= 4`);
```

### 2. 使用 `.mul()` 或 `QuadExpr` 方法链
您也可以通过编程方式构建二次表达式：

```typescript
import { Model, QuadExpr, minimize } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// 1. 使用 .mul() 构建二次项
// 表示 x * y + 2 * x^2
const quad = x.mul(y).add(x.mul(x).mul(2));

// 2. 构建投资组合风险目标函数：w^T * Sigma * w
const assets = ["Tech", "Bonds"];
const w = m.continuous(assets, { lb: 0, ub: 1 });

let risk = new QuadExpr();
risk = risk.add(w.Tech.mul(w.Tech).mul(0.04));
risk = risk.add(w.Tech.mul(w.Bonds).mul(0.005));
risk = risk.add(w.Bonds.mul(w.Bonds).mul(0.01));

m.objective(minimize(risk));
```

### 3. 二次规划（QP）与二元变量乘积线性化实战要点

- **凸性要求（半正定矩阵 $\mathbf{Q} \succeq 0$）**：包括 HiGHS 在内的标准 QP 求解器要求最小化目标中的二次型矩阵 $\mathbf{Q}$ 必须为**半正定（PSD）**（最大化时为半负定）。平方和（$\sum_i (x_i - t_i)^2$）与协方差矩阵（$\mathbf{w}^\top \boldsymbol{\Sigma} \mathbf{w}$）天然满足半正定性；而连续变量之间的不定乘积（如直接最小化 $x \cdot y$）属于非凸问题，会被求解器拒绝。
- **在 MILP 中线性化二元变量乘积（$x_A \cdot x_B$）**：若模型包含整数或二元变量，且需要表达两个二元决策 $x_A, x_B \in \{0, 1\}$ 同时为 1 时的协同收益或交互成本（$z_{AB} = x_A \cdot x_B$），应引入辅助变量 $z_{AB} \in [0, 1]$ 及以下三条线性不等式（McCormick / Fortet 线性化），从而作为标准 MILP 高效求解：

$$z_{AB} \le x_A, \quad z_{AB} \le x_B, \quad z_{AB} \ge x_A + x_B - 1$$

```typescript
const xA = m.binary("xA");
const xB = m.binary("xB");
// 当 xA, xB 为 0-1 变量时，连续区间 [0, 1] 上的 bothAB 会自动取 {0, 1} 整数值
const bothAB = m.continuous("both_AB", { lb: 0, ub: 1 });

m.constraint(expr`${bothAB} <= ${xA}`, "and_upper_A");
m.constraint(expr`${bothAB} <= ${xB}`, "and_upper_B");
m.constraint(expr`${bothAB} >= ${xA} + ${xB} - 1`, "and_lower_AB");
```

---

## 📊 求解后求值表达式 (`.value`)

`LinExpr` 与 `QuadExpr` 均提供 `.value` 访问器（`number | null`）。当模型完成求解且表达式引用的所有变量均具有有限原问题解时，您可以直接读取任意子表达式的值（如部门总成本、投资组合收益或资源使用量），无需手动重新计算：

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

若模型尚未求解（或表达式中任意变量的 `value === null`），`.value` 将返回 `null`。

---

## 🔗 链式算术与关系方法

除 `expr` 外，`Var`、`LinExpr` 与 `QuadExpr` 还提供不可变的链式方法，便于动态构建表达式：

| 方法 | 适用对象 | 返回类型 | 说明 |
| :--- | :--- | :--- | :--- |
| `.add(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` 或 `QuadExpr` | 加上一个数值、`Var`、`LinExpr` 或 `QuadExpr`。 |
| `.sub(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` 或 `QuadExpr` | 减去一个数值、`Var`、`LinExpr` 或 `QuadExpr`。 |
| `.mul(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` 或 `QuadExpr` | 乘以标量 `number`，或将两个一次项相乘得到 `QuadExpr`。 |
| `.div(divisor)` | `LinExpr`, `QuadExpr` | `LinExpr` 或 `QuadExpr` | 除以非零有限标量 `number`。 |
| `.neg()` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` 或 `QuadExpr` | 对所有项取反（$-e$）。 |
| `.le(rhs)` | `Var`, `LinExpr` | `Constraint` | 构建 $\le$ 约束（`lhs <= rhs`）。 |
| `.ge(rhs)` | `Var`, `LinExpr` | `Constraint` | 构建 $\ge$ 约束（`lhs >= rhs`）。 |
| `.eq(rhs)` | `Var`, `LinExpr` | `Constraint` | 构建 $==$ 等式约束（`lhs == rhs`）。 |
