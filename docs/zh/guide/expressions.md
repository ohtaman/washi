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
- **标量乘法**：`4 * ${x}`、`${x} * 4`
- **变量相乘（二次项）**：`${x} * ${y}`、`2 * ${x} * ${x}`
- **幂运算与平方**：`${x}^2`、`${x}**2`
- **一元取反**：`-${x} + 10`
- **圆括号分组**：`2 * (${x} + ${y})`
- **嵌套表达式**：`expr` 可无缝插值变量、数字、`sum()` 结果以及嵌套表达式。

> [!NOTE]
> 对于包含关系比较运算符（`<=`、`>=`、`==`）的式子，`expr`（例如 ``expr`${x} + 2 * ${y} <= 40` ``）会返回一等的 `Constraint` 对象。
> 对于不含比较运算符的算术表达式，`expr` 会统一处理线性与二次表达式（最高 2 次）：若包含二次项则返回 `QuadExpr`，否则返回 `LinExpr`。次数 $> 2$ 的多项式项（如 ``${x} * ${y} * ${z}``、``${x}^3``）以及非线性约束（如 ``${x} * ${y} <= 10``）会被拒绝，因为标准的 MILP/LP/QP 模型仅支持线性约束与最高二次的目标函数。

---

## ⚡ 高性能求和 (`sum`)

在对大规模变量集合或索引数组进行迭代求和时，推荐使用 `sum()`：

```typescript
import { sum } from "@ohtaman/washi";

const items = ["A", "B", "C"];
const weights = { A: 10, B: 20, C: 30 };
const x = m.binary(items);

// 1. 使用映射回调函数转换并汇总元素：
const totalWeight = sum(items, (item) => x[item].mul(weights[item]));

// 2. 对变量数组直接求和：
const count = sum(Object.values(x));
```

`sum()` 在无 AST 解析开销的情况下以 $O(N)$ 线性时间运行。

---

## 🎯 向量与矩阵点积 (`dot`)

`dot(a, b)` 辅助函数用于计算数值系数（`number`）与变量或线性表达式（`Var | LinExpr`）的线性组合，支持任意操作数顺序（`dot(coeffs, vars)` 或 `dot(vars, coeffs)`）。

支持的一维和二维容器结构：
- **一维数组**：`number[]` $\times$ `(Var | LinExpr)[]`
- **一维字典**：`Record<K, number>` $\times$ `Record<K, Var | LinExpr>`
- **二维数组**：`number[][]` $\times$ `(Var | LinExpr)[][]`
- **二维字典**：`Record<R, Record<C, number>>` $\times$ `Record<R, Record<C, Var | LinExpr>>`
- **二维混合容器**：`Array<Record<C, ...>>` 或 `Record<R, Array<...>>`

当数组长度不匹配、字典键缺失或叶节点包含非有限数值/非线性项时，`dot()` 会抛出指明具体出错路径（例如 `at '[0].StoreB'`）的错误。

### 一维向量点积
```typescript
import { dot } from "@ohtaman/washi";

const profits = { desk: 30, chair: 50 };
const vars = m.integer(["desk", "chair"]);

// 计算 30 * vars.desk + 50 * vars.chair
const totalProfit = dot(profits, vars);
```

### 二维矩阵点积
直接支持二维数组（`m.continuous(rows, cols)`）、嵌套字典（`m.continuous(rowKeys, colKeys)`）或混合二维容器：

```typescript
const factories = ["Tokyo", "Osaka"];
const stores = ["StoreA", "StoreB"];

const costs = {
  Tokyo: { StoreA: 4, StoreB: 7 },
  Osaka: { StoreA: 8, StoreB: 3 },
};

const ship = m.continuous(factories, stores);

// 一行代码表达总运输成本：
m.objective(minimize(dot(costs, ship)));
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

---

## 📊 求解后求值表达式 (`.value`)

`LinExpr` 与 `QuadExpr` 均提供 `.value` 访问器（`number | null`）。当模型完成求解且表达式引用的所有变量均具有有限原问题解时，您可以直接读取任意子表达式的值（如部门总成本、投资组合收益或资源使用量），无需手动重新计算：

```typescript
const revenue = expr`30 * ${x} + 50 * ${y}`;
const laborUsed = expr`2 * ${x} + ${y}`;

m.objective(maximize(revenue));
m.constraint(expr`${laborUsed} <= 50`, "labor_cap");

await m.solve();

console.log("Total Revenue:", revenue.value);   // 1100
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
| `.div(divisor)` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` 或 `QuadExpr` | 除以非零有限标量 `number`。 |
| `.neg()` | `Var`, `LinExpr`, `QuadExpr` | `LinExpr` 或 `QuadExpr` | 对所有项取反（$-e$）。 |
| `.le(rhs)` | `Var`, `LinExpr` | `Constraint` | 构建 $\le$ 约束（`lhs <= rhs`）。 |
| `.ge(rhs)` | `Var`, `LinExpr` | `Constraint` | 构建 $\ge$ 约束（`lhs >= rhs`）。 |
| `.eq(rhs)` | `Var`, `LinExpr` | `Constraint` | 构建 $==$ 等式约束（`lhs == rhs`）。 |
