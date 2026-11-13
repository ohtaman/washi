# 数理优化建模模式与实战技巧

前面的建模指南各章节介绍了 WaSHI 的 API 与核心功能（`Model`、`expr`、`m.constraint`、`m.solve` 等）。本章汇总了线性规划（LP）与混合整数规划（MIP）中常用的通用运筹建模模式与求解器调优技巧。

---

## 1. 变量与定义域建模

### 半连续决策变量（$\{0\} \cup [L, U]$）

半连续变量的取值范围为 $\{0\} \cup [L, U]$（例如要么不排产取 `0`，要么排产且产量落在最小起订批次 $L = 10$ 与产能上限 $U = 100$ 之间）。

将一个连续变量与一个 0-1 二元激活变量结合，并添加关联约束 $L \cdot b \le x \le U \cdot b$ 即可表达：

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

在遇到突发变动需要重排计划时，仅将原方案传入 [`initialValue`](./variables.md#warm-start) 只会为求解器提供搜索起点提示，**不会**阻止求解器为了微小的目标改进而推翻原有的大部分决策。

若希望新二元方案 $x_i \in \{0, 1\}$ 尽可能接近原方案 $x_i^{\text{prev}} \in \{0, 1\}$，可在目标函数中添加**汉明距离（Hamming Distance）变动惩罚项**：

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

在整数规划中，当两个二元决策 $x_A, x_B \in \{0, 1\}$ **同时为 `1`** 时才会产生协同收益或交互成本（$z_{AB} = x_A \cdot x_B$），无需使用二次项。引入辅助变量 $z_{AB} \in [0, 1]$ 与以下三条 McCormick / Fortet 线性不等式，即可保持为标准 MILP 高效求解：

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

LP/MIP 目标函数不能直接调用 `Math.max(...)`。若要最小化峰值负荷 $\min \max_i (\text{load}_i)$，可引入辅助上限变量 $z$，对每个个体施加约束 $\text{load}_i \le z$，然后最小化 $z$：

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

*（同理，若要**最大化最低水平** $\max \min_i u_i$，只需对所有 $i$ 施加 $u_i \ge z$ 并设置 `m.objective(maximize(z))`。）*

---

## 3. 约束设计与数值稳定性 {#constraint-design}

### 硬约束与软约束（引入弹性松弛变量）

如果将所有业务目标都设为刚性的**硬约束**，一旦遇到需求高峰或资源不足，模型就会直接返回 `"Infeasible"`。建议保留物理与法规底线作为硬约束，将非刚性目标转化为带非负松弛变量（$s \ge 0$）与惩罚权重 $W$ 的**软约束**：

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
> **惩罚权重 $W$ 的量级选择**：将权重 $W$ 设为高于常规边际成本（通常为单位成本的 $10\sim 1{,}000$ 倍），避免使用 $10^{12}$ 这类过大的数值。将模型中最大系数与最小系数之比控制在 $10^5\sim 10^6$ 以内，有助于保持 LP/MIP 求解器的浮点数值稳定性。

### 同构资源的对称性破缺（Symmetry Breaking）

当模型包含 $K$ 个完全相同的可互换资源（如相同规格的货车、箱子或并行机器）时，重排资源编号会产生多达 $K!$ 个目标值完全相同的等价解，导致 MIP 求解器在分支定界树中重复搜索镜像子树。

对同构资源的启用状态施加顺序约束（$u_0 \ge u_1 \ge \dots \ge u_{K-1}$），即可在不改变最优值的前提下削减对称搜索空间：

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

当需要兼顾多个目标（例如最小化总成本 $f_1$ 与均衡最大工时 $f_2$）时，常用以下两种模式：

- **加权求和（单次求解）**：量纲归一化后合并为单一目标，如 ``minimize(expr`${totalCost} + 50 * ${maxHours}`)``。
- **词典序（分层）两阶段求解**：当首要目标具有明确优先级时，第一阶段先求最优值 $f_1^*$，第二阶段将 $f_1$ 锁定在最优值附近（如允许 1% 退化的 $f_1 \le 1.01 f_1^*$），再优化次要目标：

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

在组合 MIP 问题中，求解器通常能在前几秒内找到高质量的可行解（Incumbent），但往往会耗费大量剩余时间在分支定界树中证明最后不到 0.5% 的间隙（**Tail-Off 现象**）。

在交互式应用或生产流水线中，建议在 [`m.solve(options)`](./objectives.md#求解选项-solveoptions) 中结合 `timeLimit` 设置符合业务精度的容差：
- **`relGap: 0.01`**：一旦证明当前可行解与理论对偶界的相对差距在 **1% 以内**即停止。
- **`absGap: 100`**：一旦 `|objectiveValue - objectiveBound| <= 100`（按目标函数单位计）即停止。

---

## 5. 分解算法建模要点 {#decomposition-tips}

在使用 [`solveColumnGeneration` 或 `solveBenders`](./decomposition.md) 时：

1. **列生成法中的集合覆盖（`>= 1`）与集合划分（`== 1`）**：
   将覆盖约束写成不等式 `>= 1`（集合覆盖）而非严格等式 `== 1`（集合划分），可将对偶价格限制在 $\pi_i \ge 0$，抑制对偶价格的正负震荡并加快收敛（适用于满足三角不等式、跳过重复访问不会增加成本的路径问题）。
2. **Price-and-Branch（`finalizeAsMIP: true`）与精确 Branch-and-Price**：
   在根节点 LP 松弛完成列生成后对列池求解一次 MIP（`finalizeAsMIP: true`）即 **Price-and-Branch（限制主问题启发式）**，无需在定价子问题内部处理分支约束即可快速获得高质量整数解。
3. **Benders / 延迟约束中的多割平面分离**：
   当子问题从当前候选解中同时检测到多个孤立子回路或违规连通分量时，一次性返回**全部**违规分量的割平面数组能显著减少主问题 MIP 的重求解次数（完整示例参见 [旅行商问题 (`examples/traveling-salesperson`)](../examples/traveling-salesperson.md)）。
