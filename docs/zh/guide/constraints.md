# 约束条件 (`m.constraint` & `m.indicator`)

约束条件用于限定数理优化或逻辑验证模型的可行解空间。
在 WaSHI 中，线性算术约束和命题逻辑 SMT 公式均通过 **`m.constraint()`** 注册：

```typescript
m.constraint(expr`${desks} + 2 * ${chairs} <= 40`, "wood_limit");
```

---

## ✍️ 代数线性约束 (`expr`)

使用 `expr` 标签模板字面量语法，可以以自然的数学记法编写等式与不等式约束：

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model();
const x = m.continuous("x", { lb: 0 });
const y = m.continuous("y", { lb: 0 });

// 上界不等式约束 (<=)
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_limit");

// 下界不等式约束 (>=)
m.constraint(expr`3 * ${x} + ${y} >= 20`, "min_demand");

// 严格等式约束 (==)
m.constraint(expr`${x} + ${y} == 30`, "exact_quota");
```

### 支持的比较运算符
- `<=`：小于等于（上界）约束
- `>=`：大于等于（下界）约束
- `==` 或 `=`：等式约束

### 数组批量注册
您可以在一次调用中向 `m.constraint([...])` 传入约束数组，以事务方式批量注册多条约束：

```typescript
m.constraint([expr`${x} <= 10`, expr`${y} <= 20`]);
```

---

## 🏷️ 为约束命名

在 `m.constraint(c, name)` 的第二个参数中，可以为每条约束指定唯一且具描述性的名称：

```typescript
m.constraint(expr`${x} + ${y} <= 100`, "budget_cap");
```

### 为什么要为约束命名？
1. **模型检查 (`m.toLpString()`)**：导出的 CPLEX LP 格式字符串会保留这些可读名称（必要时自动转义），方便直接检查生成的数学模型。
2. **冲突诊断 (`conflicts` / `unsatCore`)**：当约束之间相互矛盾导致模型不可行时，Z3 的 `m.check()` 会返回构成冲突子集的具体约束名称。
3. **按名称查询 (`m.getConstraintByName()`)**：求解后可按名称获取对应的约束对象，以查看其影子价格（`dual`）或松弛变量值（`slack`）。

---

## 🔁 基于集合与求和构建聚合约束

在 `expr` 内部嵌入 `sum()` 或 `dot()`，可以简洁地表达集合上的线性聚合约束：

```typescript
import { Model, sum, expr } from "@ohtaman/washi";

const items = ["A", "B", "C"];
const weights = { A: 5, B: 10, C: 15 };
const selected = m.binary(items);

// 总重量不得超过容量上限 25
m.constraint(
  expr`${sum(items, (i) => selected[i].mul(weights[i]))} <= 25`,
  "capacity_limit"
);
```

---

## 🎯 条件约束 / 指示约束 (`m.indicator`)

当某条线性约束仅在某个 0-1 二元决策变量处于激活状态（`1` 或 `0`）时才生效，请使用 `m.indicator()`：

```typescript
const useDiscount = m.binary("use_discount");
const cartTotal = m.continuous("cart_total", { lb: 0, ub: 10_000 });

// 若 useDiscount == 1，则强制要求 cartTotal >= 100
// WaSHI 会根据变量的上下界自动推导出安全且紧致的 Big-M 常数
m.indicator(useDiscount, expr`${cartTotal} >= 100`, {
  activeValue: 1,
  name: "min_spend_for_discount",
});
```

### 安全的自动 Big-M 推导与变量边界

当省略 `options.M` 时，WaSHI 会根据有限的变量边界（`lb`、`ub`）自动推导安全且最小的 Big-M 值：
- 对于 `<=` 约束，正系数变量需要有限上界（`ub`），负系数变量需要有限下界（`lb`）。
- 对于 `>=` 约束，正系数变量需要有限下界（`lb`），负系数变量需要有限上界（`ub`）。
- 对于 `==` 约束，会分别针对 `<=` 与 `>=` 两个方向独立推导安全边界（生成 `name_le` 与 `name_ge`）。

如果引用的任何变量缺少所需的有限边界，`m.indicator()` 会抛出明确的错误，提示补充有限边界或显式指定 `options.M`。

### 显式指定 Big-M 与数值稳定性

您可以通过传入 `{ M: number }` 显式覆盖自动推导的 Big-M：

```typescript
m.indicator(useDiscount, expr`${cartTotal} >= 100`, {
  activeValue: 1,
  M: 10_000, // 显式覆盖
});
```

> [!TIP]
> **数值稳定性与正确性**：
> 过小的 $M$ 值可能会意外截断合法的可行解；反之，过大的 $M$ 值（例如 $10^9$）会导致 MIP 求解器出现矩阵病态与数值不稳定。
> 建议为变量设置符合实际的有限边界（`lb` 与 `ub`），由 WaSHI 自动推导最紧致的安全 Big-M。

---

## 🧠 命题逻辑与 SMT 约束 (`BoolVar`, `and`, `or`, `not`, `implies`, `xor`)

使用 **Z3** SMT 求解器插件（`@ohtaman/washi/solvers/z3`）时，您可以使用一等逻辑运算符将命题布尔变量（`m.bool()`）与线性算术约束（`Constraint`）自由组合：

```typescript
import { Model, expr, and, or, not, implies, xor } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model({ solver: "z3" });
const isAdmin = m.bool("isAdmin");
const hasMfa = m.bool("hasMfa");
const Clearance = m.integer("clearance", { lb: 0, ub: 5 });

// BoolVar / BoolOp 上的方法语法：
m.constraint(isAdmin.implies(hasMfa), "admin_requires_mfa");

// 将布尔命题与线性算术比较约束混合使用：
m.constraint(
  implies(isAdmin, expr`${Clearance} >= 4`),
  "admin_clearance_level"
);

// 顶层逻辑组合函数 (and, or, not, implies, xor)：
m.constraint(and(or(isAdmin, hasMfa), not(xor(isAdmin, hasMfa))), "policy");
```

### 如何选择 `m.indicator()` 与 `implies()`

| 特性 | `m.indicator(binVar, constraint, opts)` | `implies(a, b)` / `a.implies(b)` |
| :--- | :--- | :--- |
| **触发条件变量** | 数值 `Binary` 变量 (`m.binary()`) | `BoolVar` (`m.bool()`)、`BoolOp` 或 `Constraint` |
| **推论约束** | 线性 `Constraint` (`<=`, `>=`, `==`) | `BoolVar`、`BoolOp` 或线性 `Constraint` |
| **适用求解器** | **所有 MIP/LP 求解器**（HiGHS、GLPK、Z3），通过 Big-M 线性化实现 | **所有求解器**（HiGHS、GLPK 通过 0-1 MIP 自动线性化，Z3 原生支持） |
| **最佳适用场景** | 带有目标函数的运筹优化与 MIP 模型（`m.solve()`） | 规则引擎、策略验证与 SMT 可满足性判定（`m.check()`） |

> [!NOTE]
> **在 `implies()` 的前提条件（Antecedent）中使用一般不等式**：使用 **Z3**（`solver: "z3"`）时，`implies(a, b)` 的前提 `a` 可以是任意一般线性不等式（如 ``expr`${luxLevel} <= 50`.implies(isNight)``）。而在 MIP 求解器（**HiGHS** / **GLPK**）中建模条件约束时，前提条件应使用布尔命题变量 `BoolVar`（`m.bool()`），或通过 `m.indicator(binVar, constraint)` 使用 0-1 二元触发变量。

---

## 🪞 同构资源的对称性破缺（Symmetry Breaking）

当模型包含 $K$ 个完全相同的可互换资源（如相同规格的货车、箱子或并行机器）时，任意可行解都可以通过重排资源编号产生 $K!$ 个目标值完全相同的等价解。若不消除对称性，MIP 求解器会在分支定界树中反复搜索互为镜像的冗余子树，导致证明全局最优极度缓慢。

通过对同构资源的启用状态施加顺序约束（$u_0 \ge u_1 \ge \dots \ge u_{K-1}$），即可在不损失任何最优解的前提下大幅削减搜索空间：

```typescript
const numTrucks = 4;
const truckUsed = m.binary(numTrucks, { prefix: "truck_used" });

// 仅当第 k 辆货车已启用时，才允许启用第 k+1 辆货车 (u_0 >= u_1 >= u_2 >= u_3)
for (let k = 0; k < numTrucks - 1; k++) {
  m.constraint(
    expr`${truckUsed[k]} >= ${truckUsed[k + 1]}`,
    `symmetry_truck_${k}`
  );
}
```

---

## ⚖️ 硬约束 vs 软约束（引入弹性松弛变量）

在实际的排班调度与资源分配业务中，如果将所有业务规则都设为不可违背的**硬约束（Hard Constraints）**，一旦遇到需求高峰或人手不足，模型往往会直接返回无解（`"Infeasible"`）。

为了保证模型在极端情况下仍能给出最优折中方案并定位缺口，建议将非刚性目标转化为**软约束（Soft / Elastic Constraints）**：引入非负的缺口或超额松弛变量（$s \ge 0$），并在目标函数中对其施加惩罚权重：

| 约束类型 | 硬约束形式 | 软约束（弹性）形式 ($s \ge 0$) | 目标函数惩罚项（最小化） |
| :--- | :--- | :--- | :--- |
| **下界约束** | $\text{lhs} \ge b$ | $\text{lhs} + s_{\text{short}} \ge b$ | $+ W \cdot s_{\text{short}}$ |
| **上界约束** | $\text{lhs} \le b$ | $\text{lhs} - s_{\text{excess}} \le b$ | $+ W \cdot s_{\text{excess}}$ |
| **目标等式** | $\text{lhs} = b$ | $\text{lhs} + s_{\text{short}} - s_{\text{excess}} = b$ | $+ W_1 \cdot s_{\text{short}} + W_2 \cdot s_{\text{excess}}$ |

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("ElasticShiftCoverage");

const assignedStaff = m.integer("assignedStaff", { lb: 0, ub: 4 }); // 当日最多仅有 4 名员工可排班
const shortage = m.continuous("shortage", { lb: 0 });               // 非负缺口松弛变量 (s >= 0)

// 软约束：目标配置 5 名员工，若人手不足则允许 shortage > 0
m.constraint(expr`${assignedStaff} + ${shortage} >= 5`, "target_5_staff");

// 对每缺少 1 名员工施加远高于常规人力成本 ($100) 的惩罚权重 ($1,000)
m.objective(minimize(expr`100 * ${assignedStaff} + 1000 * ${shortage}`));

await m.solve();
console.log("排班人数:", assignedStaff.value); // 4
console.log("缺口人数:", shortage.value);      // 1 (平滑降级并给出最优折中方案，而非报错 Infeasible)
```

> **工程实践提示 — 惩罚权重 $W$ 的取值**：将权重 $W$ 设为略高于常规业务边际成本（例如单位成本的 $10\sim 1{,}000$ 倍），但应避免使用 $10^{12}$ 这类过大的天文数字。将模型中最大系数与最小系数的比例控制在 $10^5\sim 10^6$ 以内，有助于保持 LP/MIP 求解器的浮点数值稳定性。

---

## 📐 对偶值（影子价格）、松弛变量与查询

对于连续线性规划（LP）问题，求解后可在每条约束上查询其经济学影子价格/对偶值（`dual`）与松弛变量/余量（`slack`）：

```typescript
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood");

await m.solve();

const woodConstraint = m.getConstraintByName("wood");
console.log("Shadow price (dual):", woodConstraint?.dual);
console.log("Slack surplus:", woodConstraint?.slack);
console.log("Total linear constraints:", m.numConstrs);
```

对于已命名的逻辑约束，可使用 `m.getLogicalConstraintByName(name)` 查询已注册的 `LogicalConstraintItem`。
