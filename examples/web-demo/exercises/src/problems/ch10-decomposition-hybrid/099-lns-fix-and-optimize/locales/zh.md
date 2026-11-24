# #099. Fix-and-Optimize 固定并优化法（滚动窗口 MIP）

<!-- section:scenario -->
某注塑零部件制造厂需要制定多周期塑料零件（单位：箱）的生产计划。每一期均存在需求（箱）、在换模等准备作业时产生固定准备成本并解锁产能的 0-1 准备决策、单位生产成本（日元/箱）以及期末库存保管费（日元/箱）。当计划周期变长时，单一庞大 MIP 模型容易在搜索中停滞。

请从给定的初始准备计划与窗口宽度出发执行滚动窗口 Fix-and-Optimize 求解，反复改进批量计划直至完整扫描一轮不再降低成本，返回最终的准备决策、产量、库存量及总成本。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `demands` | `number[]` | 第 $t$ 期的必要需求量（箱） |
| `setupCosts` | `number[]` | 第 $t$ 期进行准备作业时的固定准备成本（日元） |
| `prodCosts` | `number[]` | 第 $t$ 期每箱的生产成本（日元） |
| `holdCost` | `number` | 每箱期末库存的保管成本（日元） |
| `capacities` | `number[]` | 第 $t$ 期进行准备作业时的产能上限（箱） |
| `initialPlan` | `number[]` | 可行的初始 0/1 准备向量 |
| `windowSize` | `number` | 每次 Fix-and-Optimize 子问题同时释放的连续周期数 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `setups` | `number[]` | 全部周期的 0/1 准备向量 |
| `production` | `number[]` | 各期的产量（非负实数值，箱） |
| `inventory` | `number[]` | 期末库存量（初始库存设为 0，箱） |
| `totalCost` | `number` | 固定准备费、生产费与库存保管费之和（日元） |

<!-- section:example -->
**输入示例**

```json
{
  "demands": [20, 25, 15, 30, 20, 25],
  "setupCosts": [120, 120, 120, 120, 120, 120],
  "prodCosts": [4, 4, 4, 4, 4, 4],
  "holdCost": 1,
  "capacities": [60, 60, 60, 60, 60, 60],
  "initialPlan": [1, 1, 1, 1, 1, 1],
  "windowSize": 3
}
```

**输出示例**

```json
{
  "setups": [1, 0, 0, 1, 0, 1],
  "production": [60, 0, 0, 50, 0, 25],
  "inventory": [40, 15, 0, 20, 0, 0],
  "totalCost": 975
}
```

将 6 次准备合并为 3 次后，准备费 $120 \times 3 = 360$ + 生产费 $4 \times 135 = 540$ + 库存费 $1 \times (40 + 15 + 0 + 20 + 0 + 0) = 75 =$ **975**。

<!-- section:hint1 -->
维护一个由 `initialPlan` 初始化的当前最优二元启停向量，并以长度为 `windowSize` 的重叠窗口扫描整个计划期。在每个子问题中，仅将当前窗口内的启停决策设为自由二元变量，窗口外的启停保持固定，而所有周期的连续产量和库存变量均保持自由。

<!-- section:hint2 -->
在每个子 MIP 中建立全周期批量约束 $0 \le p_t \le C_t y_t$ 与库存平衡 $I_{t-1} + p_t - d_t = I_t$（$I_{-1} = 0$），并对 $t \notin [\text{start}, \text{start} + \text{windowSize})$ 固定 $y_t = \bar{y}_t$。每当子问题目标严格优于当前解（差值超过 $10^{-6}$）时采纳新方案，直至完整扫描一轮无任何改进为止。
