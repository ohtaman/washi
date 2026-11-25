# 代数表达式 (`expr`, `sum`, `dot`)

数学表达式将决策变量与数值系数组合为线性、二次或分段线性公式。
由于 JavaScript 与 TypeScript 不支持运算符重载，WaSHI 提供了 `expr` 标签模板字面量以及 `sum()`、`dot()` 函数。
这让您能在保持完整静态类型安全的前提下编写清晰易读的代数公式。

| 方式 | 示例 | 中缀可读性 | 类型安全与 IDE 重命名 | 多维索引变量 (`flow[i][j]`) |
| :--- | :--- | :--- | :--- | :--- |
| 方法链 | `x.mul(30).add(y.mul(50)).le(40)` | 低 | 支持 | 支持 |
| 纯字符串解析 | `parseConstraint("30 * x + 50 * y <= 40", resolver)` | 高 | 不支持（运行时按名称查找） | 脆弱（需手动拼接字符串） |
| **标签模板 (`expr`)** | `` expr`30 * ${x} + 50 * ${y} <= 40` `` | **高** | **支持（真实 TS 引用）** | **支持（直接绑定对象引用）** |

---

## 标签模板字面量 (`expr`)

与参数化 SQL 模板类似，`expr` 将运算符与语法文本（`+`、`-`、`*`、`/`、`^2`、`<=`、`>=`、`==` 等）与 `${...}` 中的插值分开接收。
您可以直接插值 `Var`、`LinExpr`、`QuadExpr` 或有限 `number`，也可以在 `sum()` 或 `dot()` 中传入数组、字典容器及映射回调函数。
变量通过对象引用直接绑定，而非按字符串查找，因此既能避免命名冲突，也能完整保留 IDE 重命名等重构功能。

算术表达式（`LinExpr | QuadExpr`）和比较约束（`Constraint`）均可使用 `expr` 构建：

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// 1. 线性组合：3*x + 5*y - 10
const linearExpr = expr`3 * ${x} + 5 * ${y} - 10`;

// 2. 二次表达式：x * y + 2 * x^2
const quadExpr = expr`${x} * ${y} + 2 * ${x} * ${x}`;

// 3. 比较约束：
const balanceConstraint = expr`${x} + 2 * ${y} <= 40`;
```

### `expr` 支持的语法

- **加法与减法**：`${x} + ${y} - 5`
- **标量乘法与除法**：`4 * ${x}`、`${x} / 2`
- **二次项与幂运算**：`${x} * ${y}`、`2 * ${x} * ${x}`、`${x}^2`、`${x}**2`
- **一元正负号与圆括号**：`-${x} + 10`、`+${x}`、`2 * (${x} + ${y})`
- **聚合函数**：`sum(${xVec})`、`dot(${costs}, ${xVec})`、`sum(${rows}, ${(r) => grid[r][col]})`
- **分段线性与下标索引**：`max(${xVec}) <= 15`、`sum(abs(${w} - ${target}))`、`at(${costs}, ${idx})`（见 [分段线性与下标索引表达式](#分段线性与下标索引表达式-max-min-abs-at)）
- **容器逐元素运算**：`sum((${price} - ${cost}) * ${qty})`、`sum((${xVec} - ${target})^2)`、`dot(${price} - ${cost}, ${qty})`
- **嵌套表达式**：支持插值变量、数字、嵌套的 `LinExpr` 或 `QuadExpr`，以及 `sum` / `dot` 内的容器。

> [!NOTE]
> - **包含比较运算符（`<=`、`>=`、`==` 以及整数表达式专用的 `<`、`>`、`!=`）时**，`expr` 返回 `Constraint` 对象。
> - **算术表达式**一次式返回 `LinExpr`，二次式返回 `QuadExpr`。嵌入的数组或字典必须先用 `sum(...)`、`dot(..., ...)`、`max(...)` 或 `min(...)` 归约为标量表达式。
> - **不支持的非线性**：三次及以上多项式项（如 `${x}^3`）以及二次及以上约束（如 `${x} * ${y} <= 10`）会抛出错误（分段线性函数 `max`、`min`、`abs` 与 `at` 见下文）。

---

## 高性能求和 (`sum`)

`sum()` 可直接对一维或二维 `Array`、`Iterable`、`Record` 容器求和。
它既可在 `` expr`sum(...)` `` 内部使用，也可作为独立函数调用，以 $O(N)$ 线性时间运行且无重复拷贝开销。
在 `` expr`sum(...)` `` 内支持对二次表达式（`QuadExpr`）求和，而独立调用的 `sum()` 仅接受线性项：

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

> [!TIP]
> **避免在循环中用 `expr` 逐项累加（$O(N^2)$）**：`LinExpr` 对象是不可变的。
> 在循环中反复执行 ``total = expr`${total} + ${x[i]}` `` 会在每次迭代时复制全部已有项，带来 $O(N^2)$ 的时间与内存开销。
> 汇总大量变量时，请使用 `sum()` 或 `dot()` 以保持 $O(N)$ 复杂度。

---

## 向量与矩阵点积 (`dot`)

`dot(a, b)` 用于计算数值系数（`number`）与变量或线性表达式（`Var | LinExpr`）的加权线性组合。
它既可在 `` expr`dot(${a}, ${b})` `` 内使用，也可独立调用，且不限制两个操作数的顺序（`dot(coeffs, vars)` 或 `dot(vars, coeffs)`）。

支持的一维和二维容器结构：
- **一维数组**：`number[]` $\times$ `(Var | LinExpr)[]`
- **一维字典**：`Record<K, number>` $\times$ `Record<K, Var | LinExpr>`
- **二维数组**：`number[][]` $\times$ `(Var | LinExpr)[][]`
- **二维字典**：`Record<R, Record<C, number>>` $\times$ `Record<R, Record<C, Var | LinExpr>>`
- **二维混合容器**：`Array<Record<C, ...>>` 或 `Record<R, Array<...>>`

若数组长度不匹配、字典键缺失或元素无效，`dot()` 会抛出包含精确路径的错误（例如 `at '[0].StoreB'`）。

### 一维向量点积

```typescript
import { expr, dot } from "@ohtaman/washi";

const profits = { desk: 30, chair: 50 };
const vars = m.integer(["desk", "chair"] as const);

// 在 expr 内计算 30 * vars.desk + 50 * vars.chair
const totalProfit = expr`dot(${profits}, ${vars})`;
```

### 二维矩阵内积（Frobenius 内积）

```typescript
const factories = ["Tokyo", "Osaka"] as const;
const stores = ["StoreA", "StoreB"] as const;

const costs = {
  Tokyo: { StoreA: 4, StoreB: 7 },
  Osaka: { StoreA: 8, StoreB: 3 },
};

const ship = m.continuous(factories, stores, { lb: 0 });

// 一行代码表达所有路线的总运输成本：
const totalShippingCost = expr`dot(${costs}, ${ship})`;
```

> [!NOTE]
> **二维 `dot(A, B)` 是 Frobenius 内积**：对于二维矩阵或嵌套字典，`dot(A, B)` 计算的是所有对应元素乘积之和 $\langle A, B \rangle_F = \sum_{i,j} A_{i,j} B_{i,j}$。
> 它**不是**矩阵乘法 $(AB)_{i,k} = \sum_j A_{i,j} B_{j,k}$。

---

## `expr` 聚合与批量书写方式

建议将 `sum(...)`、`dot(..., ...)` 与比较符号直接写在 `expr` 模板内，避免多余的独立函数嵌套或 `Object.values()`：

```typescript
// 嵌套模板调用与 Object.values()（较繁琐）
const totalProfit1 = expr`${dot(profits, vars)}`;
const cap1 = expr`${sum(Object.values(vars))} <= 100`;

// 在 expr 内直接书写 sum() 与 dot()（推荐）
const totalProfit2 = expr`dot(${profits}, ${vars})`;
const cap2 = expr`sum(${vars}) <= 100`;
```

| 操作 | 数学公式 | WaSHI 写法 |
| :--- | :--- | :--- |
| **全体求和**（1D/2D 数组或字典） | $\sum_i x_i \le C$ | `` m.constraint(expr`sum(${x}) <= ${C}`) `` |
| **内积**（1D 向量或 2D Frobenius 内积） | $\sum_i c_i x_i \le B$ | `` m.constraint(expr`dot(${c}, ${x}) <= ${B}`) `` |
| **逐元素差与乘积求和** | $\sum_i (p_i - c_i) \cdot x_i$ | `` expr`sum((${price} - ${cost}) * ${x})` `` |
| **平方误差求和（QP）** | $\sum_i (x_i - t_i)^2$ | `` expr`sum((${x} - ${target})^2)` `` |
| **逐元素批量约束**（$\forall i \in I$） | $a_i x_i \le b_i \quad (\forall i)$ | `` m.constraint(items.map((i) => expr`${a[i]} * ${x[i]} <= ${b[i]}`)) `` |
| **二维变量按行求和**（每行 $f$） | $\sum_s X_{f,s} \le S_f \quad (\forall f)$ | `` m.constraint(factories.map((f) => expr`sum(${ship[f]}) <= ${supply[f]}`)) `` |
| **二维变量按列求和**（每列 $s$） | $\sum_f X_{f,s} \ge D_s \quad (\forall s)$ | `` m.constraint(stores.map((s) => expr`sum(${factories}, ${(f) => ship[f][s]}) >= ${demand[s]}`)) `` |

---

## 二次表达式 (`QuadExpr` 与 `expr`)

WaSHI 通过 HiGHS 支持凸二次规划（Convex QP）目标函数。
二次表达式既可以用 `expr` 模板编写，也可以通过 `QuadExpr` 和 `.mul()` 编程构建。

### 1. 使用 `expr`（推荐）

使用 `*`、`^2` 或 `**2` 书写二次项：

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

也可以通过编程方式构建二次表达式：

```typescript
import { Model, QuadExpr, minimize } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// 1. 使用 .mul() 构建二次项 (x * y + 2 * x^2)
const quad = x.mul(y).add(x.mul(x).mul(2));

// 2. 构建投资组合方差目标函数：w^T * Sigma * w（交叉项 0.005 已合并 2 * cov）
const assets = ["Tech", "Bonds"] as const;
const w = m.continuous(assets, { lb: 0, ub: 1 });

let risk = new QuadExpr();
risk = risk.add(w.Tech.mul(w.Tech).mul(0.04));
risk = risk.add(w.Tech.mul(w.Bonds).mul(0.005));
risk = risk.add(w.Bonds.mul(w.Bonds).mul(0.01));

m.objective(minimize(risk));
```

> [!NOTE]
> **凸性要求（半正定矩阵 $\mathbf{Q} \succeq 0$）**：最小化二次目标时，HiGHS 要求对称二次型矩阵 $\mathbf{Q}$ 为**半正定（PSD，$\mathbf{Q} \succeq 0$）**。
> 最大化时，$\mathbf{Q}$ 必须为**半负定（$\mathbf{Q} \preceq 0$）**。
> 平方和 $\sum_i (x_i - t_i)^2$ 以及由协方差矩阵 $\boldsymbol{\Sigma}$ 构成的方差二次型 $\mathbf{w}^\top \boldsymbol{\Sigma} \mathbf{w}$ 天然满足凸性（对应的 $\mathbf{Q}$ 为半正定）。
> 连续变量之间的不定乘积（如直接最小化 $x \cdot y$）属于非凸问题，会被求解器拒绝。
> 若要在 MILP 中线性化两个二元变量的乘积 $x_A \cdot x_B$，请参见 [建模模式与优化技巧](./formulation-tips.md#binary-product)。

---

## 分段线性与下标索引表达式 (`max`, `min`, `abs`, `at`)

WaSHI 提供后端无关的分段线性函数（`max`, `min`, `abs`）与基于 0 下标的变量索引查找（`at`）。
它们既可在 `` expr`...` `` 内直接使用，也可作为从 `@ohtaman/washi` 导出的独立函数调用：

```typescript
import { Model, expr, minimize, abs, max, min, at } from "@ohtaman/washi";

const m = new Model();
const w = m.continuous(3, { lb: 0, ub: 20, prefix: "w" });
const target = [4, 7, 10];
const route = m.integer("route", { lb: 0, ub: 2 });
const routeCost = [18, 12, 25];

// 凸方向的 max/abs 在 HiGHS/GLPK 上转为无二元变量的线性不等式（本例中的 at() 会使用二元选择变量）：
m.objective(
  minimize(expr`sum(abs(${w} - ${target})) + at(${routeCost}, ${route})`)
);
m.constraint(expr`max(${w}) <= 15`, "peak_cap");

// 支持嵌套组合与独立辅助函数调用：
const maxErr = max(expr`abs(${w[0]} - 4)`, abs(expr`${w[1]} - 7`));
m.constraint(expr`${maxErr} <= 3`);
```

### 容器逐元素展开

在 `expr` 中，`abs(${arr} - ${target})` 会自动在匹配的 1D 或 2D `Array`、`Iterable`、`Record` 容器上逐元素展开。
因此可以直接编写 `` expr`sum(abs(${w} - ${target}))` `` 与 `` expr`max(abs(${pred} - ${actual}))` ``。

### 各求解器如何处理 `max`、`min` 与 `abs`

在**凸方向**（最小化或 `<=` 约束 `max` / `abs`，以及最大化或 `>=` 约束 `min`）上，HiGHS 与 GLPK 仅引入单个连续辅助变量和简单线性不等式。
这种上镜图（epigraph）形式**不需要任何二元变量**，且支持无界连续变量。

在**非凸或等式上下文**（`minimize(min(...))`、`maximize(abs(...))`、`max(...) >= rhs`、`abs(...) == rhs`）中，各求解器的处理方式如下：

- **HiGHS 与 GLPK**：采用精确的离散 MIP 编码，因此所有参与变量都必须具备有限上下界。
- **Pumpkin**：在有界整数变量上以原生约束求解。
- **Z3**：使用原生条件表达式（`If`）表示。

### 基于 0 下标的元素查找 (`at(array, index)`)

`at(array, index)` 对应约束规划中的 `Element` 约束，允许数组下标本身作为决策变量（`array[index]`）。
`index` 必须为整数值表达式，所有求解器都会自动强制 `0 <= index < array.length`。
Pumpkin 与 Z3 原生支持 `at()`，而 HiGHS 与 GLPK 会使用二元选择变量进行线性化（当数组元素包含变量时，需具备有限上下界）。

---

## 求解后求值表达式 (`.value`)

`LinExpr` 与 `QuadExpr` 均提供返回 `number | null` 的 `.value` 访问器。
当模型完成求解且表达式引用的所有变量都有有限解时，可以直接计算任意子表达式的值：

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

若模型尚未求解，或表达式中任意变量的 `value === null`，`.value` 将返回 `null`。

---

## 链式算术与关系方法

除 `expr` 外，`Var`、`LinExpr` 与 `QuadExpr` 还提供不可变的链式方法，便于动态构建表达式：

| 方法 | 适用对象 | 返回类型 | 说明 |
| :--- | :--- | :--- | :--- |
| `.add(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` 或 `QuadExpr` | 加上一个数值、`Var`、`LinExpr` 或 `QuadExpr`。 |
| `.sub(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` 或 `QuadExpr` | 减去一个数值、`Var`、`LinExpr` 或 `QuadExpr`。 |
| `.mul(other)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` 或 `QuadExpr` | 乘以标量 `number`，或将两个一次式相乘得到 `QuadExpr`（含二次项的 `QuadExpr` 仅支持标量乘法，三次及以上会报错）。 |
| `.div(divisor)` | `LinExpr`, `QuadExpr` | `LinExpr` 或 `QuadExpr` | 除以非零有限标量 `number`。 |
| `.neg()` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` 或 `QuadExpr` | 对所有项取反（$-e$）。 |
| `.le(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | 构建 $\le$ 约束（`lhs <= rhs`；要求左右两端均不含二次项）。 |
| `.ge(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | 构建 $\ge$ 约束（`lhs >= rhs`；要求左右两端均不含二次项）。 |
| `.eq(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | 构建 $=$ 等式约束（`lhs == rhs`；要求左右两端均不含二次项）。 |
| `.lt(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | 构建离散 $<$ 约束（`lhs - rhs <= -1`；仅限不含二次项的整数值表达式）。 |
| `.gt(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | 构建离散 $>$ 约束（`lhs - rhs >= 1`；仅限不含二次项的整数值表达式）。 |
| `.ne(rhs)` | `Var`, `LinExpr`, `QuadExpr` | `Constraint` | 构建离散 $\ne$ 约束（`lhs != rhs`；仅限不含二次项的整数值表达式）。 |
