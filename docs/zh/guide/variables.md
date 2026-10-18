# 决策变量与定义域 (`Variables`)

决策变量表示数理优化模型中待求解的未知量。
WaSHI 在 `Model` 实例上提供了按定义域划分的工厂方法：`m.continuous()`、`m.integer()`、`m.binary()` 与 `m.bool()`。

---

## 决策变量类型

### 1. 连续变量 (`m.continuous`)
可取区间 `[lb, ub]` 内的任意实数值。适用于物理测量值、流量、预算分配和权重：

```typescript
import { Model } from "@ohtaman/washi";

const m = new Model();

// 范围在 [0, 1000] 内的单个连续变量
const fuel = m.continuous("fuel", { lb: 0, ub: 1000 });
```

### 2. 整数变量 (`m.integer`)
仅允许取整数值。适用于不可分割的计数资源（如设备台数、卡车数量、人员编制）：

```typescript
// 范围在 [0, 15] 内的单个整数变量
const trucks = m.integer("trucks", { lb: 0, ub: 15 });
```

### 3. 0-1 二元变量 (`m.binary`)
限制取值为数学上的 $\{0, 1\}$。适用于混合整数规划（MIP）中的方案选择、是/否决策以及设施选址：

```typescript
// 单个 0-1 二元变量（lb 自动设为 0，ub 自动设为 1）
const openWarehouse = m.binary("open_warehouse");
```

### 4. 命题布尔变量 (`m.bool`)
用于 Z3 进行可满足性模理论（SMT / SAT）建模的纯布尔逻辑命题变量（`true` / `false`）：

```typescript
// 单个命题布尔变量
const isNight = m.bool("isNight");
const alarmTriggered = m.bool("alarmTriggered");

// 一等布尔逻辑运算符：and, or, not, implies, xor
m.constraint(alarmTriggered.implies(isNight), "alarm_policy");
```

### 💡 半连续决策变量（Semi-Continuous）的建模
半连续变量的取值范围为 $\{0\} \cup [L, U]$（即要么为 0，要么落在正下界 $L$ 与上界 $U$ 之间，常用于具有最小起订量或最小生产批次的场景）。

通过将一个连续变量与一个 0-1 二元指示变量结合，并添加关联约束（$L \cdot b \le x \le U \cdot b$），即可清晰地表达半连续特性：

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model();
const batch = m.continuous("batch", { lb: 0, ub: 100 });
const isActive = m.binary("is_active");

// 若 isActive === 0，则 batch 被强制为 0；若为 1，则 batch 落在 [10, 100] 内
m.constraint(expr`${batch} >= 10 * ${isActive}`, "min_batch_run");
m.constraint(expr`${batch} <= 100 * ${isActive}`, "max_batch_run");
```

---

## 多维数组、字典与矩阵的批量创建

各定义域工厂方法（`continuous`、`integer`、`binary`、`bool`）支持传入数量（`number`）、键名数组或行/列键集合，从而在单次调用中创建一维数组、强类型字典或二维矩阵。

### 按数量创建一维数组
传入数字即可创建变量数组：

```typescript
const x = m.continuous(5, { lb: 0 }); // Var[] (x_0, ..., x_4)
const flags = m.bool(3);              // BoolVar[] (p_0, p_1, p_2)
```

### 创建一维变量字典
传入键名数组即可获得强类型字典 `Record<string, Var>` 或 `Record<string, BoolVar>`：

```typescript
const items = ["laptop", "phone", "tablet"];

// Record<"laptop" | "phone" | "tablet", Var>
const selected = m.binary(items);

const perms = m.bool(["read", "write", "execute"]);
// perms.read, perms.write, perms.execute
```

### 创建二维变量矩阵与网格
每个维度都遵循一致的规则：传入数字数量（`number`）生成 `Array`，传入键名集合生成 `Record`：
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
| `lb` | `number` | `0` | 下界（Lower bound）。默认为非负约束 `0`。 |
| `ub` | `number` | `Infinity`（`binary` 为 `1`） | 上界（Upper bound）。 |
| `type` | `"Continuous"` \| `"Integer"` \| `"Binary"` | 由方法自动推断 | 底层变量定义域类别。 |
| `initialValue` | `number` | `undefined` | 可选的原问题初始解提示（MIP 热启动），与求解后的 `variable.value` 保持独立。 |

---

## 原问题初始值（热启动提示 `initialValue`）

在迭代计算中以固定变量名重建模型时，您可以为部分或全部数值变量（通过 `m.continuous`、`m.integer`、`m.binary` 或 `v.initialValue = ...`）提供可选的原问题初始值（`initialValue`）：

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

- **提示而非硬约束**：`initialValue` 仅作为传递给求解器的可选初始解提示（通过 `setSolution` 传递给 HiGHS）。它**不会**固定变量或添加额外约束，也不保证一定被求解器采纳或带来加速。它与 `variable.value` 相互独立（`variable.value` 在求解前始终为 `null`，求解后填充为求解器所得的原问题解）。
- **校验与容差 (`1e-6`)**：提供的值必须是位于 `[lb - 1e-6, ub + 1e-6]` 内的有限数值（对于 `"Integer"` 与 `"Binary"` 变量，还必须与边界内的某个整数距离不超过 `1e-6`）。部分初始解无需满足模型的所有约束条件。
- **求解器支持**：由 **HiGHS**（`capabilities.supportsWarmStart === true`）支持。不支持热启动的求解器（**GLPK**、**Z3** 或未声明 `supportsWarmStart: true` 的自定义适配器）在调用 `solve()` 和 `check()` 时会抛出明确的错误，而不会静默忽略 `initialValue`。

---

## 获取求解结果与缩减成本 (Reduced Cost)

调用 `await m.solve()` 或 `await m.check()` 后，可通过 `variable.value`（`Var` 返回 `number | null`，`BoolVar` 返回 `boolean | null`）或批量访问器 `m.getValues()` 获取最优解：

```typescript
await m.solve();

// 单个变量的原问题解
console.log(`trucks: ${trucks.value}`);

// 缩减成本（LP 灵敏度分析：处于边界上的变量进入基之前，其目标函数系数需要改善的最小量）
console.log(`fuel reduced cost: ${fuel.reducedCost}`);

// 批量提取一维或二维集合的值（同时支持 Var 与 BoolVar 集合）
const selectedValues = m.getValues(selected);
// { laptop: 1, phone: 0, tablet: 1 }

const flowValues = m.getValues(ship);
// { Tokyo: { StoreA: 50, ... }, Osaka: { ... } }
```

---

## 按名称查找变量

您可以按名称检索已注册的决策变量，或查看模型中的数值变量总数：

```typescript
const v = m.getVarByName("trucks");           // Var | undefined
const b = m.getBoolVarByName("isNight");      // BoolVar | undefined
console.log("Total numeric variables:", m.numVars);
```
