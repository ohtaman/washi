# 约束条件 (`m.constraint` & `m.indicator`)

约束条件用于限定数理优化或逻辑验证模型的可行解空间。
在 WaSHI 中，线性算术约束和命题逻辑公式均通过 **`m.constraint()`** 注册：

```typescript
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_limit");
```

---

## 代数线性约束 (`expr`)

使用 `expr` 标签模板字面量语法，可以以标准数学记法编写等式与不等式约束：

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

`m.constraint()` 返回已注册的 `Constraint`（逻辑公式返回 `BoolExpr`，传入批量数组时返回对应数组）。

### 支持的比较运算符
- `<=`：小于等于（上界）约束
- `>=`：大于等于（下界）约束
- `==` 或 `=`：等式约束

### 数组批量注册
向 `m.constraint([...])` 传入约束数组，可在单次调用中以事务方式批量注册多条约束：

```typescript
m.constraint([expr`${x} <= 10`, expr`${y} <= 20`]);
```

---

## 为约束命名

在 `m.constraint(c, name)` 的第二个参数中，可为约束指定唯一且具描述性的名称：

```typescript
m.constraint(expr`${x} + ${y} <= 100`, "budget_cap");
```

### 为什么要为约束命名？
1. **模型检查 (`m.toLpString()`)**：导出的 CPLEX LP 格式字符串会保留这些名称（必要时自动转义），便于核对生成的数学模型。
2. **冲突诊断 (`conflicts` / `unsatCore`)**：当约束之间相互矛盾导致模型不可行时，`m.check()`（通过内置 HiGHS 弹性松弛或 Z3 `unsatCore`）会返回构成冲突子集的具体约束名称。
3. **按名称查询 (`m.getConstraintByName()`)**：求解后可按名称获取约束对象，读取其影子价格（`dual`）或松弛量（`slack`）。

---

## 聚合约束 (`sum` & `dot`)

在 `expr` 中直接使用 `sum(...)` 与 `dot(..., ...)`，即可简洁地表达数组或字典上的线性聚合约束：

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model();
const items = ["A", "B", "C"] as const;
const weights = { A: 5, B: 10, C: 15 };
const selected = m.binary(items);

// 最多选择 2 个物品
m.constraint(expr`sum(${selected}) <= 2`, "max_items");

// 总重量不得超过容量上限 25
m.constraint(expr`dot(${weights}, ${selected}) <= 25`, "capacity_limit");
```

---

## 条件约束 / 指示约束 (`m.indicator`)

当某条线性约束仅在某个 0-1 二元决策变量（`m.binary()`）取特定值（`1` 或 `0`）时才生效，请使用 `m.indicator()`：

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

如果引用的任何变量缺少所需的有限边界，`m.indicator()` 会抛出错误，提示补充有限边界或显式指定 `options.M`。

### 显式指定 `M`

可以通过传入 `{ M: number }` 显式覆盖自动推导的 Big-M：

```typescript
m.indicator(useDiscount, expr`${cartTotal} >= 100`, {
  activeValue: 1,
  M: 10_000, // 显式覆盖
});
```

> [!TIP]
> **优先为变量设置有限边界（`lb`、`ub`）而非手动指定过大的 `M`**：过小的 $M$ 值可能截断合法可行解，而过大的 $M$ 值（如 $10^9$）会导致 MIP 求解器矩阵病态与数值不稳定。为变量设置符合实际的有限边界后，WaSHI 会自动推导出最紧致的安全 Big-M。

---

## 命题逻辑与 SMT 约束 (`BoolVar`, `and`, `or`, `not`, `implies`, `xor`)

WaSHI 提供一等逻辑运算符来组合命题布尔变量（`m.bool()`）与线性算术约束（`Constraint`）。逻辑公式在 **Z3** SMT 求解器（`@ohtaman/washi/solvers/z3`）中原生求解，在 **HiGHS** 与 **GLPK** 中自动线性化为 0-1 MIP 约束：

```typescript
import { Model, expr, and, or, not, implies, xor } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/z3";

const m = new Model({ solver: "z3" });
const isAdmin = m.bool("isAdmin");
const hasMfa = m.bool("hasMfa");
const clearance = m.integer("clearance", { lb: 0, ub: 5 });

// BoolVar / BoolOp 上的方法语法：
m.constraint(isAdmin.implies(hasMfa), "admin_requires_mfa");

// 将布尔命题与线性算术比较约束组合使用：
m.constraint(
  implies(isAdmin, expr`${clearance} >= 4`),
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
| **主要用途** | 包含二元算术变量的数理优化模型（`m.solve()`） | 逻辑规则系统与 SMT 可满足性判定（`m.check()`） |

> [!NOTE]
> **在 `implies()` 的前提条件（Antecedent）中使用一般不等式**：使用 **Z3**（`solver: "z3"`）时，`implies(a, b)` 的前提 `a` 可以是任意线性不等式——例如使用上文 `clearance` 与 `hasMfa` 编写 ``implies(expr`${clearance} >= 4`, hasMfa)``。而在 MIP 求解器（**HiGHS** / **GLPK**）中建模条件约束时，前提条件应使用 `BoolVar`（`m.bool()`），或通过 `m.indicator(binVar, constraint)` 使用 0-1 二元触发变量。

---

## 对偶值（影子价格）、松弛变量与查询

对于连续线性规划（LP）问题，求解后可在每条约束（由 `m.constraint()` 返回，或通过 `m.getConstraintByName()` 查询）上读取其影子价格/对偶值（`dual`）与松弛量（`slack`）：

```typescript
const woodConstraint = m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood");

await m.solve();

console.log("Shadow price (dual):", woodConstraint.dual);
console.log("Slack surplus:", woodConstraint.slack);
console.log("Total linear constraints:", m.numConstrs);
```

对于已命名的逻辑约束，可使用 `m.getLogicalConstraintByName(name)` 查询已注册的 `LogicalConstraintItem`。

> [!TIP]
> 关于**使用松弛变量构建软约束**与**同构资源对称性破缺（Symmetry Breaking）**等建模技巧，请参见 [建模模式与优化技巧](./formulation-tips.md#constraint-design)。
