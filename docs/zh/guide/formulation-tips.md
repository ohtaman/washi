# 数理优化建模模式与实战技巧

前面的建模指南介绍了 WaSHI 的核心 API（`Model`、`expr`、`m.constraint`、`m.solve`）。
本章汇总了线性规划（LP）与混合整数线性规划（MILP）中常用的建模模式与求解器调优技巧。
有关配合 Pumpkin 使用约束规划（`disjoint`、`cumulative`、`distinct`、`allowed`、`at`）的方法，请参阅 [约束规划 (CP) 建模指南](./constraint-programming.md)。

---

## 1. 变量与定义域建模

### 半连续决策变量（$\{0\} \cup [L, U]$）

半连续变量在未启用时取 `0`，启用时则必须落在正区间 `[L, U]` 内。
例如，某生产批次要么不排产（`0`），要么产量位于最小起订量 $L = 10$ 与产能上限 $U = 100$ 之间。

将连续变量 `batch` 与二元激活变量 `isActive` 通过关联不等式 $L \cdot b \le x \le U \cdot b$ 结合即可表达：

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model("SemiContinuousBatch");
const batch = m.continuous("batch", { lb: 0, ub: 100 });
const isActive = m.binary("is_active");

// 若 isActive === 0，则 batch 被强制为 0；若 isActive === 1，则 batch 落在 [10, 100] 内
m.constraint(expr`${batch} >= 10 * ${isActive}`, "min_batch_run");
m.constraint(expr`${batch} <= 100 * ${isActive}`, "max_batch_run");
```

### 最小扰动重优化（汉明距离惩罚）与热启动的区别 {#minimal-perturbation}

遇到突发变动需要重排计划时，仅将原方案传入 [`initialValue`](./variables.md#warm-start) 只会为求解器提供搜索起点提示。
它**不会**阻止求解器为了微小的目标改善而推翻原有的大部分决策。

若希望新二元方案 $x_i \in \{0, 1\}$ 尽量贴近原方案 $x_i^{\text{prev}} \in \{0, 1\}$，请在目标函数中惩罚**汉明距离**（发生翻转的决策数量）：

$$\text{Changes} = \sum_{i:\, x_i^{\text{prev}} = 0} x_i + \sum_{i:\, x_i^{\text{prev}} = 1} (1 - x_i)$$

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("StableReschedule");
const prevPlan = [1, 0, 1, 0];
const x = prevPlan.map((prev, i) =>
  m.binary(`slot_${i}`, { initialValue: prev })
);

// 统计相比 prevPlan 发生翻转（0->1 或 1->0）的各项
const flipTerms = x.map((v, i) => (prevPlan[i] === 1 ? expr`1 - ${v}` : v));

// 在满足至少启用 3 个时段的前提下，最小化方案变动数
m.constraint(expr`sum(${x}) >= 3`, "min_active_slots");
m.objective(minimize(expr`5 * sum(${flipTerms})`));
```

---

## 2. 非线性项的线性化

### 两个 0-1 二元变量乘积（$x_A \cdot x_B$）的线性化 {#binary-product}

假设只有当两个二元决策 $x_A, x_B \in \{0, 1\}$ **同时为 `1`** 时，才会触发协同收益或交互成本。
无需写成二次乘积，只需引入辅助变量 $z_{AB} \in [0, 1]$ 和三条标准线性不等式（Fortet / McCormick 线性化），即可保持纯 MILP 结构高效求解：

$$z_{AB} \le x_A, \quad z_{AB} \le x_B, \quad z_{AB} \ge x_A + x_B - 1$$

```typescript
import { Model, expr, maximize } from "@ohtaman/washi";

const m = new Model("BinaryProductLinearization");
const xA = m.binary("xA");
const xB = m.binary("xB");
// 当 xA、xB 为二元变量时，连续区间 [0, 1] 上的 bothAB 会自动取 {0, 1} 整数值
const bothAB = m.continuous("both_AB", { lb: 0, ub: 1 });

m.constraint(expr`${bothAB} <= ${xA}`, "and_upper_A");
m.constraint(expr`${bothAB} <= ${xB}`, "and_upper_B");
m.constraint(expr`${bothAB} >= ${xA} + ${xB} - 1`, "and_lower_AB");

m.objective(maximize(expr`10 * ${xA} + 10 * ${xB} + 5 * ${bothAB}`));
```

### Min-Max 与 Max-Min 目标函数（负载均衡）

WaSHI 内置的 `max(...)` 与 `min(...)` 会自动将凸负载均衡目标转为 HiGHS/GLPK 上的纯线性不等式，以及 Pumpkin 上的原生约束。
详见 [分段线性与下标索引表达式](./expressions.md#分段线性与下标索引表达式-max-min-abs-at)。

如果需要在第 4 节的词典序两阶段优化等场景中显式引用共享上限变量 $z$，请直接写出**上镜图（epigraph）**形式。
对每个负载施加 $\text{load}_i \le z$ 并最小化 $z$（若为 Max-Min，则施加 $u_i \ge z$ 并最大化 $z$）：

$$\min z \quad \text{subject to} \quad \text{load}_i \le z \quad \forall i$$

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("MinMaxLoadBalancing");
const workers = ["Alice", "Bob", "Carol"] as const;
const hours = m.continuous(workers, { lb: 0, ub: 40 });
const maxHours = m.continuous("max_hours", { lb: 0, ub: 40 });

// 将每位员工的工时限制在共享上限 maxHours 以内
m.constraint(workers.map((w) => expr`${hours[w]} <= ${maxHours}`));
m.constraint(expr`sum(${hours}) >= 60`, "total_required_work");

// 最小化 maxHours 即可将 60 小时均匀分配（每人 20 小时）
m.objective(minimize(maxHours));
```

---

## 3. 约束设计与数值稳定性 {#constraint-design}

### 硬约束与软约束（引入弹性松弛变量）

若把所有业务目标都设为刚性的**硬约束**，一旦需求超出产能，模型就会直接返回 `"Infeasible"`。
建议把物理与法规底线保留为硬约束，把可弹性调整的目标写成带非负松弛变量（$s \ge 0$）和目标惩罚权重 $W$ 的**软约束**：

| 约束类型 | 硬约束形式 | 软约束（弹性）形式 ($s \ge 0$) | 目标函数惩罚项（最小化） |
| :--- | :--- | :--- | :--- |
| **下界约束** | $\text{lhs} \ge b$ | $\text{lhs} + s_{\text{short}} \ge b$ | $+ W \cdot s_{\text{short}}$ |
| **上界约束** | $\text{lhs} \le b$ | $\text{lhs} - s_{\text{excess}} \le b$ | $+ W \cdot s_{\text{excess}}$ |
| **目标等式** | $\text{lhs} = b$ | $\text{lhs} + s_{\text{short}} - s_{\text{excess}} = b$ | $+ W_1 \cdot s_{\text{short}} + W_2 \cdot s_{\text{excess}}$ |

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("SoftConstraintCoverage");
const assignedStaff = m.integer("assigned_staff", { lb: 0, ub: 4 }); // 当日最多有 4 名员工可用
const shortage = m.continuous("shortage", { lb: 0 });                // 非负缺口松弛变量 (s >= 0)

// 软约束：目标配置 5 名员工，若人手不足则允许 shortage > 0
m.constraint(expr`${assignedStaff} + ${shortage} >= 5`, "target_5_staff");

// 对缺口人数施加高于常规人力成本 (100) 的惩罚权重 (1000)
m.objective(minimize(expr`100 * ${assignedStaff} + 1000 * ${shortage}`));

await m.solve();
// assignedStaff.value === 4, shortage.value === 1（返回最优折中方案而非 Infeasible）
```

> [!TIP]
> **惩罚权重 $W$ 的量级选择**：将 $W$ 设为高于常规边际成本（通常为单位成本的 $10\sim 1{,}000$ 倍），避免使用 $10^{12}$ 这类极端数值。
> 将模型中最大与最小系数的比值控制在 $10^5\sim 10^6$ 以内，可保持 LP 与 MIP 求解器的浮点数值稳定性。

### 同构资源的对称性破缺（Symmetry Breaking）

当模型包含 $K$ 个完全可互换的资源（如相同规格的货车、箱子或并行机器）时，重排编号会产生多达 $K!$ 个目标值相同的等价解。
若不打破对称性，MIP 求解器会在分支定界树中重复搜索镜像子树。

施加按编号顺序启用的约束（$u_0 \ge u_1 \ge \dots \ge u_{K-1}$），即可在不改变最优值的前提下削减搜索空间：

```typescript
import { Model, expr } from "@ohtaman/washi";

const m = new Model("SymmetryBreaking");
const numTrucks = 4;
const truckUsed = m.binary(numTrucks, { prefix: "truck_used" });

// 仅当第 k 辆货车启用时，才允许启用第 k+1 辆货车
for (let k = 0; k < numTrucks - 1; k++) {
  m.constraint(
    expr`${truckUsed[k]} >= ${truckUsed[k + 1]}`,
    `order_truck_${k}`
  );
}
```

---

## 4. 多目标优化与 MIP 停止条件设计 {#multi-objective}

### 多目标优化（加权求和 vs. 词典序两阶段求解）

在平衡总成本 $f_1$ 与峰值负荷 $f_2$ 等多个目标时，常用两种方法：

- **加权求和（单次求解）**：将各目标归一化后合并为单一目标，例如 ``minimize(expr`${totalCost} + 50 * ${maxHours}`)``。
- **词典序两阶段求解**：先求首要目标 $f_1$ 的最优值 $f_1^*$，再用容差约束锁定 $f_1$，最后再优化次要目标 $f_2$。

```typescript
import { Model, expr, minimize } from "@ohtaman/washi";

const m = new Model("LexicographicTwoStage");
const workers = ["Alice", "Bob"] as const;
const wage = { Alice: 20, Bob: 20 };
const hours = m.continuous(workers, { lb: 0, ub: 40 });
const maxHours = m.continuous("max_hours", { lb: 0, ub: 40 });

const totalCost = expr`dot(${wage}, ${hours})`;
m.constraint(expr`sum(${hours}) >= 40`, "required_hours");
m.constraint(workers.map((w) => expr`${hours[w]} <= ${maxHours}`));

// 第一阶段：最小化首要目标（总人力成本）
m.objective(minimize(totalCost));
await m.solve();
const minCost = m.objectiveValue!;

// 第二阶段：限制成本增幅不超过 1%，在此前提下均衡负荷（最小化 maxHours）
m.constraint(expr`${totalCost} <= ${minCost * 1.01}`, "near_optimal_cost");
m.objective(minimize(maxHours));
await m.solve();
```

### MIP 长尾效应（Tail-Off）与最优性间隙容差

在组合 MIP 问题中，求解器通常能在几秒内找到优质的**暂定解（Incumbent）**，却往往耗费剩余大部分时间去证明最后不到 0.5% 的间隙（**Tail-Off 现象**）。

在交互式应用或批处理任务中，建议在 [`m.solve(options)`](./objectives.md#求解选项-solveoptions) 中配合 `timeLimit` 设置合理的容差：

- **`relativeGap: 0.01`**：一旦证明当前解与对偶界的相对差距在 **1% 以内**即停止。
- **`absoluteGap: 100`**：一旦按目标单位计算的 `|objectiveValue - objectiveBound| <= 100` 即停止。

---

## 5. 分解算法建模要点 {#decomposition-tips}

在使用 [`solveColumnGeneration` 或 `solveBenders`](./decomposition.md) 时，以下三项技巧有助于提升收敛速度与解质量。

### 列生成法中的集合覆盖（`>= 1`）与集合划分（`== 1`）

将需求覆盖约束写成不等式 `>= 1`（集合覆盖）而非等式 `== 1`，可将对偶价格限制在 $\pi_i \ge 0$。
这能抑制对偶价格的正负震荡并加快收敛，尤其适用于满足三角不等式、跳过重复访问不会增加成本的路径问题。

### Price-and-Branch（`finalizeAsMIP: true`）与精确 Branch-and-Price

在根节点 LP 松弛完成列生成后，对已有列池求解一次 MIP（`finalizeAsMIP: true`）被称为 **Price-and-Branch** 启发式。
与在分支定界树的每个节点内都执行列生成的精确 **Branch-and-Price** 不同，它无需把分支约束嵌入定价子问题，即可快速产出高质量整数解。

### Benders 与延迟约束中的多割平面分离

当分离回调从当前候选解中检测到多个孤立子环或违规分量时，请一次性返回**全部**违规分量的割平面数组。
单轮追加多个割平面能够大幅减少主问题 MIP 的重求解次数（完整示例见 [旅行商问题](../examples/traveling-salesperson.md)）。
