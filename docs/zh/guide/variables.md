# 决策变量与定义域 (`Variables`)

决策变量表示数理优化或逻辑验证模型中待求解的未知量。
在 `Model` 实例上，WaSHI 提供了四个按定义域划分的工厂方法：`m.continuous()`、`m.integer()`、`m.binary()` 与 `m.bool()`。

---

## 决策变量类型

### 1. 连续变量 (`m.continuous`)

连续变量可在 `[lb, ub]` 内取任意实数值。
适用于流量、重量、预算分配和投资比例等可分割的连续量：

```typescript
import { Model } from "@ohtaman/washi";

const m = new Model();

// 范围在 [0, 1000] 内的单个连续变量
const fuel = m.continuous("fuel", { lb: 0, ub: 1000 });
```

### 2. 整数变量 (`m.integer`)

整数变量仅在 `[lb, ub]` 内取整数值。
适用于车辆台数、生产件数、人员数量等不可分割的计数变量：

```typescript
// 范围在 [0, 15] 内的单个整数变量
const trucks = m.integer("trucks", { lb: 0, ub: 15 });
```

### 3. 0-1 二元变量 (`m.binary`)

0-1 二元变量仅取数值 $\{0, 1\}$，并自动设置 `lb = 0`、`ub = 1`。
适用于混合整数规划（MIP）中参与线性求和或目标函数成本项的是/否决策：

```typescript
// 单个 0-1 二元变量（lb 自动设为 0，ub 自动设为 1）
const openWarehouse = m.binary("open_warehouse");
```

### 4. 命题布尔变量 (`m.bool`)

命题布尔变量取纯布尔值（`true` 或 `false`）。
适用于使用逻辑运算符（`and`、`or`、`not`、`implies`、`xor`）的逻辑规则与可满足性模理论（SMT）模型：

```typescript
// 单个命题布尔变量
const isAdmin = m.bool("isAdmin");
const hasMfa = m.bool("hasMfa");

// 一等布尔逻辑运算符：and, or, not, implies, xor
m.constraint(isAdmin.implies(hasMfa), "admin_requires_mfa");
```

### `m.binary()` 与 `m.bool()` 的选型对比

| 特性 | `m.binary()` (`Var`) | `m.bool()` (`BoolVar`) |
| :--- | :--- | :--- |
| **求解后的 `.value` 类型** | `number \| null`（精确的 `0` 或 `1`） | `boolean \| null`（`true` 或 `false`） |
| **线性算术运算（`expr`, `sum`, `dot`, 目标成本）** | ✅ 原生支持（`` expr`30 * ${b}` ``） | ❌ 不能直接与数值相乘或求和 |
| **指示约束（`m.indicator(b, ...)`）** | ✅ 可作为触发变量 | ❌ 请改用 `` implies(flag, expr`...`) `` |
| **命题逻辑（`and`, `or`, `not`, `implies`, `xor`）** | 需通过比较式（`` expr`${b} == 1` ``） | ✅ 原生一等方法（`.implies()`, `.and()`） |
| **适用场景** | 数量求和、目标函数成本项、`m.indicator()` | 不含数值系数的纯逻辑条件 |

---

## 多维数组、字典与矩阵的批量创建

四个工厂方法（`continuous`、`integer`、`binary`、`bool`）均支持传入数量或字符串键名数组。
您可在单次调用中创建一维数组、强类型字典或二维矩阵。

### 按数量创建一维数组

传入数字即可创建变量数组：

```typescript
const x = m.continuous(5, { lb: 0 }); // Var[] (x_0, ..., x_4)
const flags = m.bool(3);              // BoolVar[] (p_0, p_1, p_2)
```

### 创建一维变量字典

传入字符串键名数组即可获得强类型字典（`Record<K, Var>` 或 `Record<K, BoolVar>`）：

```typescript
const items = ["laptop", "phone", "tablet"] as const;

// Record<"laptop" | "phone" | "tablet", Var>
const selected = m.binary(items);

const perms = m.bool(["read", "write", "execute"] as const);
// perms.read, perms.write, perms.execute
```

### 创建二维变量矩阵与网格

每个维度遵循统一规则：传入数字生成 `Array`，传入键名数组生成 `Record`。

- `(rowsCount, colsCount)` $\rightarrow$ `Var[][]`（或 `BoolVar[][]`）
- `(rowKeys, colKeys)` $\rightarrow$ `Record<R, Record<C, Var>>`（或 `Record<R, Record<C, BoolVar>>`）
- `(rowsCount, colKeys)` $\rightarrow$ `Array<Record<C, Var>>`
- `(rowKeys, colsCount)` $\rightarrow$ `Record<R, Var[]>`

```typescript
const factories = ["Tokyo", "Osaka"];
const stores = ["StoreA", "StoreB", "StoreC"];

// 1. 键名数组 x 键名数组 -> Record<string, Record<string, Var>>
const ship = m.continuous(factories, stores, { lb: 0 });
// ship.Tokyo.StoreA

// 2. 数量 x 数量 -> Var[][] (二维数组)
const board = m.binary(8, 8, { prefix: "queen" });
// board[0][0], board.map(...)

// 3. 混合维度：键名数组 x 数量 -> Record<string, Var[]>
const schedule = m.binary(factories, 7, { prefix: "open_day" });
// schedule.Tokyo[0]
```

---

## 变量配置选项 (`VarOptions`)

| 选项 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `lb` | `number` | `0` | 下界（Lower bound）。允许负值时请传入 `-Infinity`。 |
| `ub` | `number` | `Infinity`（`binary` 为 `1`） | 上界（Upper bound）。 |
| `prefix` | `string` | `"x"`（`m.bool()` 为 `"p"`） | 未命名标量变量以及索引数组/矩阵的命名前缀（如 `queen_0_0`）。 |
| `type` | `"Continuous"` \| `"Integer"` \| `"Binary"` | 由方法自动推断 | 底层数值变量定义域类别。 |
| `initialValue` | `number` | `undefined` | 可选的热启动提示值，与求解后的 `variable.value` 相互独立。 |

### 上下界（`lb`, `ub`）设置要点

- **允许负值**：数值变量默认非负。对于净库存变化或偏差项等可能为负的量，请显式传入 `{ lb: -Infinity }`。
- **增强 MIP 求解**：有限的 `lb` 与 `ub` 能提升 MIP 预处理效果，也让 `m.indicator()` 自动推导紧凑的 Big-M 常数。
- **CP 求解器前置要求**：Pumpkin 等有界整数约束规划（CP）求解器要求每个数值变量都具备有限整数边界。

---

## 原问题初始值（热启动提示 `initialValue`） {#warm-start}

在迭代重算中重建模型时，您可以为部分或全部数值变量提供热启动提示（`initialValue`）。
可通过工厂方法选项传入，或直接赋值 `v.initialValue = ...`：

```typescript
const prevValues: Record<string, number | null> = { trucks: 8, open_warehouse: 1 };

const m2 = new Model("RebuiltMIP");
const trucks2 = m2.integer("trucks", {
  lb: 0,
  ub: 15,
  initialValue: prevValues.trucks ?? undefined,
});
const openWarehouse2 = m2.binary("open_warehouse", {
  initialValue: prevValues.open_warehouse ?? undefined,
});
const extraCapacity = m2.continuous("extra_capacity", { lb: 0 }); // 支持部分指定：无需提供 initialValue
```

### 提示而非硬约束

`initialValue` 仅是传递给求解器的可选探索提示，不会固定变量或添加约束。
求解前，`variable.value` 始终保持为 `null`。
若需在目标函数中惩罚相对原方案的变动，请参见 [建模模式与优化技巧](./formulation-tips.md#minimal-perturbation)。

### 校验与容差 (`1e-6`)

每个提供的 `initialValue` 必须是位于 `[lb - 1e-6, ub + 1e-6]` 内的有限数值。
对于 `"Integer"` 和 `"Binary"` 变量，还必须与某个整数的距离不超过 `1e-6`。
支持仅提供部分变量的初始值；若提供满足全部约束的完整可行解，MIP 求解器可在搜索初期立即获得暂定解（Incumbent，用于剪枝的可行基准解）。

### 求解器支持

- **支持**：HiGHS 支持全部数值变量。Pumpkin 在 `solve()` 和 `check()` 中支持有界 `Integer` 和 `Binary` 变量。
- **不支持**：GLPK、Z3 以及未声明支持热启动的自定义适配器在调用 `solve()` 和 `check()` 时会抛出明确错误，而不会静默忽略 `initialValue`。

---

## 获取求解结果与缩减成本 (Reduced Cost)

调用 `await m.solve()` 或 `await m.check()` 后，可通过 `variable.value` 直接读取解，也可按名称从 `m.values` 查询。
`variable.value` 对 `Var` 返回 `number | null`，对 `BoolVar` 返回 `boolean | null`。

使用 HiGHS 求解连续线性规划（LP）模型后，`variable.reducedCost` 会以 `number | null` 返回灵敏度分析结果。
**缩减成本（Reduced Cost）**表示处于上下界处的非基变量的目标系数需要改善多少，才值得在最优解中取非零值。
在求解前、使用 GLPK（仅返回约束的 `dual`）或对于 MIP、CP 与 SMT 模型，`reducedCost` 为 `null`。

```typescript
await m.solve();

// 标量变量的原问题解与布尔值
console.log(`trucks: ${trucks.value}`);
console.log(`isAdmin: ${isAdmin.value}`);

// 一维与二维容器的变量值读取
const packedItems = items.filter((it) => selected[it].value === 1);
console.log(`Tokyo -> StoreA: ${ship.Tokyo.StoreA.value}`);

// 按变量名从 ReadonlyMap 查询 (ReadonlyMap<string, number | boolean>)
console.log(`trucks by name: ${m.values.get("trucks")}`);

// 缩减成本（LP 灵敏度分析；number | null）
console.log(`fuel reduced cost: ${fuel.reducedCost}`);
```

---

## 按名称查找变量

所有已注册的数值决策变量（`Var`）和命题布尔变量（`BoolVar`）均统一存储在 `m.variables`（`ReadonlyMap<string, Var | BoolVar>`）中：

```typescript
const v = m.variables.get("trucks");   // Var | BoolVar | undefined
const b = m.variables.get("isAdmin");  // Var | BoolVar | undefined
console.log("是否包含 trucks:", m.variables.has("trucks"));
console.log("总变量数:", m.variables.size);

// 可通过 v.type ("Continuous" | "Integer" | "Binary" | "Boolean") 进行类型窄化：
if (v && v.type !== "Boolean") {
  console.log("变量上下界:", v.lb, v.ub);
}
```
