# 约束条件 (`m.constraint` & `m.indicator`)

约束条件定义了合法解必须满足的规则。
在 WaSHI 中，线性算术约束、逻辑约束与 CP 全局约束均通过 `m.constraint()` 注册：

```typescript
m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood_limit");
```

---

## 代数线性约束 (`expr`)

使用 `expr` 标签模板字面量，可以以标准数学记法编写线性等式与不等式约束：

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

`m.constraint()` 返回已注册的 `Constraint`（逻辑公式返回 `BoolExpr`），传入数组时则返回对应的数组。

### 支持的比较运算符

- `<=`：小于等于（上界）约束。
- `>=`：大于等于（下界）约束。
- `==` 或 `=`：等式约束。
- `<`、`>`、`!=`：仅限整数值表达式的严格不等与不等约束（见 [离散比较运算符](#discrete-comparisons)）。

### 数组批量注册

向 `m.constraint([...])` 传入约束数组即可原子化批量注册。
如果数组中任意一项无效，则整体回滚，不会残留部分约束：

```typescript
m.constraint([expr`${x} <= 10`, expr`${y} <= 20`]);
```

---

## 为约束命名

在 `m.constraint(c, name)` 的第二个参数中，可为约束指定唯一且易读的名称：

```typescript
m.constraint(expr`${x} + ${y} <= 100`, "budget_cap");
```

### 为什么要为约束命名？

1. **模型检查 (`m.toLpString()`)**：导出的 CPLEX LP 字符串会保留这些名称，方便核对生成的数学模型。
2. **冲突诊断 (`conflicts` / `unsatCore`)**：当约束相互矛盾导致无解时，`m.check()` 会返回冲突约束的名称。
3. **按名称查询 (`m.constraints.get()`)**：求解后可按名称获取约束对象，读取其 `dual` 或 `slack` 值。

---

## 使用求和与点积的约束 (`sum` & `dot`)

在 `expr` 中直接使用 `sum(...)` 与 `dot(..., ...)`，可简洁地表达数组或字典上的线性聚合约束：

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

## 对偶值（影子价格）与松弛量

使用 HiGHS 求解连续线性规划（LP）模型或通过 `m.relax()` 求解 LP 松弛后，每条线性约束会提供两个灵敏度分析属性（GLPK 仅填充 `dual`，`slack` 保持为 `null`）：

- **`dual`（影子价格 / 对偶值）**：在最优基不变的范围内，约束右端项每增加一个单位时，最优目标函数值的边际有符号变化量。
- **`slack`（松弛量）**：最优解下的 `rhs - lhs` 值（`<=` 约束为 `>= 0`，`>=` 约束为 `<= 0`，约束取紧时为 `0`）。

两个属性的类型均为 `number | null`。
在求解前、未求得最优解时、使用 `m.solve()` 求解 MIP 模型时，以及对于 CP、SMT 模型与逻辑约束，其值均为 `null`。

```typescript
const woodConstraint = m.constraint(expr`${x} + 2 * ${y} <= 40`, "wood");

await m.solve();

console.log("影子价格 (dual):", woodConstraint.dual);
console.log("松弛量 (slack):", woodConstraint.slack);
console.log("按名称查询 dual:", m.constraints.get("wood")?.dual); // number | null
console.log("已注册约束总数:", m.constraints.size);
```

---

## 条件约束 / 指示约束 (`m.indicator`)

当某条线性约束仅在 0-1 二元变量（`m.binary()`）等于 `activeValue`（默认为 `1`，或 `0`）时生效，请使用 `m.indicator()`。
在 MIP 中，这类条件约束通过 **Big-M 法**编码。
例如，$a^\top x \le b + M(1 - y)$ 在 $y = 1$ 时强制 $a^\top x \le b$，在 $y = 0$ 时借助足够大的常数 $M$ 放宽该约束。

目标约束必须为使用 `<=`、`>=` 或 `==` 的线性约束；离散 `!=`、非线性项（`max`、`min`、`abs`、`at`）以及在被约束表达式中引用 `binVar` 本身均会被拒绝：

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

当省略 `options.M` 时，WaSHI 会根据有限的变量上下界（`lb`、`ub`）自动推导最小的合法 Big-M 值：

- 对于 `<=` 约束，正系数变量需要有限 `ub`，负系数变量需要有限 `lb`。
- 对于 `>=` 约束，正系数变量需要有限 `lb`，负系数变量需要有限 `ub`。
- 对于 `==` 约束，会分别对 `<=` 与 `>=` 两个方向独立推导，并生成 `name_le` 与 `name_ge`。

若任意引用变量缺少所需有限边界，`m.indicator()` 会抛出错误，提示补充有限边界或显式传入 `options.M`。

> [!NOTE]
> **`m.indicator()` 在 MIP、CP 与 SMT 求解器上的工作方式**：省略 `options.M` 时，`m.indicator()` 返回带原生指示标记的 Big-M 线性约束数组（`Constraint[]`）。
> HiGHS、GLPK 和 `m.toLpString()` 直接使用其中的 Big-M 不等式，而 Pumpkin 和 Z3 会读取该标记并原生求解，避免 Big-M 带来的数值误差与松弛过弱问题。
> 若后续直接修改返回的任意 `Constraint` 对象，WaSHI 会清除该原生标记，使修改后的线性约束在所有求解器中生效。

### 显式指定 `M`

传入 `{ M: number }` 可显式覆盖自动推导的 Big-M：

```typescript
m.indicator(useDiscount, expr`${cartTotal} >= 100`, {
  activeValue: 1,
  M: 10_000, // 显式覆盖
});
```

> [!TIP]
> **优先设置有限变量边界而非手动指定过大的 `M`**：过小的 $M$ 会误删可行解，而过大的 $M$（如 `1e9`）不仅会削弱 LP 松弛，还会破坏 MIP 求解器的数值稳定性。
> 为变量设置符合实际的 `lb` 与 `ub`，即可让 WaSHI 自动推导最紧致的安全 Big-M。

---

## 命题逻辑与 SMT 约束 (`BoolVar`, `and`, `or`, `not`, `implies`, `xor`)

WaSHI 的逻辑运算符可将 `m.bool()` 创建的 `BoolVar` 与线性 `Constraint` 自由组合。
Pumpkin 与 Z3 原生求解逻辑公式，而 HiGHS 与 GLPK 会自动将其线性化为 0-1 MIP 约束。
可通过导入 `@ohtaman/washi/solvers/pumpkin` 或 `@ohtaman/washi/solvers/z3` 注册对应后端。

> [!IMPORTANT]
> **求解器前置条件**：
> - **Pumpkin**：所有数值变量都必须是具备有限 `lb` 与 `ub` 的 `Integer` 或 `Binary` 变量。
> - **Z3**：需要安装可选对等依赖（`npm install z3-solver`）。在浏览器中运行 Z3 还需要配置支持 `SharedArrayBuffer` 的 `COOP`/`COEP` 响应头。

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

所有已注册约束（包括自动命名的约束）均存储在 `m.constraints`（`ReadonlyMap<string, Constraint | LogicalConstraint>`）中，可通过 `m.constraints.get(name)` 检索。
逻辑与 CP 约束条目的结构为 `{ kind: "logical", name, expr, dual: null, slack: null }`。

### 如何选择 `m.indicator()` 与 `implies()`

| 特性 | `m.indicator(binVar, constraint, opts)` | `implies(a, b)` / `a.implies(b)` |
| :--- | :--- | :--- |
| **触发条件变量** | 数值 `Binary` 变量 (`m.binary()`) | `BoolVar` (`m.bool()`)、`BoolOp` 或 `Constraint` |
| **推论侧** | 线性 `Constraint` (`<=`, `>=`, `==`) | `BoolVar`、`BoolOp` 或线性 `Constraint` |
| **适用求解器** | 全部求解器（HiGHS/GLPK 用 Big-M；省略 `M` 时 Pumpkin/Z3 原生求解） | 全部求解器（HiGHS/GLPK 自动 0-1 MIP 线性化；Pumpkin/Z3 原生求解） |
| **主要用途** | 含数值二元变量的 MIP 优化模型 | 逻辑规则系统与 SMT 可满足性判定 |

> [!NOTE]
> **当比较约束出现在取反位置（`not`、`xor` 的参数，或 `implies` 的条件侧）时**：
> - **纯整数表达式**：例如 $\neg(x \le 5)$ 在 HiGHS 和 GLPK 上会自动转为 $x \ge 6$，在 Pumpkin 和 Z3 上则原生求解。
> - **包含 `Continuous` 变量或小数时**：HiGHS 和 GLPK 无法用闭线性不等式表示连续域的严格 `<` / `>`，会直接报错。请改用 `{ solver: "z3" }` 或用 `m.bool()` 表达条件。

---

## 离散比较运算符 (`!=`, `<`, `>`) {#discrete-comparisons}

WaSHI 在 `expr` 模板以及 `Var`、`LinExpr`、`QuadExpr` 的 `.ne()`、`.lt()`、`.gt()` 方法中支持离散比较运算符 `!=`、`<` 和 `>`。
这些运算符**仅限整数值表达式**——即仅包含 `Integer` 或 `Binary` 变量以及安全整数系数与常数的表达式：

```typescript
const rankA = m.integer("rankA", { lb: 1, ub: 4 });
const rankB = m.integer("rankB", { lb: 1, ub: 4 });
const roomA = m.integer("roomA", { lb: 1, ub: 3 });
const roomB = m.integer("roomB", { lb: 1, ub: 3 });

m.constraint(expr`${rankA} < ${rankB}`, "strict_order"); // 等价为 rankA - rankB <= -1
m.constraint(expr`${roomA} != ${roomB}`, "diff_room");   // Pumpkin/Z3 原生支持，HiGHS/GLPK 单二元变量 MIP
```

包含 `Continuous` 变量或小数常数的表达式无法使用 `!=`、`<` 或 `>`，系统会立即报错。
原因在于实数域上的严格不等式构成开集，例如在 $x < 5$ 条件下最大化 $x$ 不存在最优实数解。
因此 LP 与 MIP 求解器要求使用闭不等式（$\le$、$\ge$、$=$），以保证最优解可达。

---

## CP 全局约束 (`distinct`, `disjoint`, `cumulative`, `allowed`)

WaSHI 提供后端无关的约束规划**全局约束**——即把多个变量之间的高层组合关系封装为单个可组合的 `BoolExpr` 谓词。
它们可与 `and`、`or`、`not`、`implies`、`xor` 自由组合。
有关区间调度、对称性破缺与 Pumpkin 建模技巧，请参阅 [约束规划 (CP) 建模指南](./constraint-programming.md)。

| 约束 | 含义 | HiGHS / GLPK | Pumpkin | Z3 |
| :--- | :--- | :--- | :--- | :--- |
| `distinct(...args)` | 所有值两两不同（`!=`） | 两两 `!=` MIP | 原生 `all_different` | 原生 `Distinct` |
| `disjoint(tasks)` | 任务 `[start, start + duration)` 互不重叠 | 两两顺序 + Big-M | 原生非重叠 | 两两 `Or` |
| `cumulative(tasks, capacity)` | 任意时刻总需求 $\le$ `capacity` | 时间索引 MIP（超过 5,000 步 / 25,000 变量报错） | 原生 `cumulative` | 起始事件负载 |
| `allowed(vars, tuples)` | 取值匹配 `tuples` 中的某一行（`not(allowed(...))` 为禁止） | 元组选择二元变量 | 原生表约束 | 元组 `Or` / `And` |

```typescript
import { Model, expr, distinct, disjoint, cumulative, allowed, not, minimize } from "@ohtaman/washi";

const m = new Model("ScheduleAndAssign");
const s = m.integer(2, { lb: 0, ub: 10, prefix: "s" });
const room = m.integer(2, { lb: 1, ub: 2, prefix: "room" });

m.constraint(distinct(room), "unique_rooms");
m.constraint(disjoint([{ start: s[0], duration: 4 }, { start: s[1], duration: 3 }]), "machine_1");
m.constraint(not(allowed([room[0], room[1]], [[1, 2]])), "forbid_1_2");
m.constraint(cumulative([{ start: s[0], duration: 4, demand: 1 }, { start: s[1], duration: 3, demand: 1 }], 2), "workers");
m.objective(minimize(expr`${s[0]} + ${s[1]}`));
```

> [!TIP]
> 关于 **使用松弛变量构建软约束** 与 **对称性破缺（Symmetry Breaking）** 等建模技巧，请参见 [建模模式与优化技巧](./formulation-tips.md#constraint-design)。
