# #099. 大邻域搜索（Fix-and-Optimize 固定并优化）

<!-- section:scenario -->
制造工厂需要制定多周期离散生产计划。每个周期均包含已知需求、决定是否启线并承担固定准备成本的 0-1 变量、单位生产成本以及期末库存持有成本。当计划周期较长时，单一大规模混合整数规划往往在分支定界搜索中耗时过长。

从给定的初始启停计划和窗口长度出发，运用 Fix-and-Optimize 大邻域搜索迭代改进批量计划直至整轮扫描不再降低成本，返回最终启停、产量、库存及总成本。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `demands` | `number[]` | 第 $t$ 期的产品需求量 |
| `setupCosts` | `number[]` | 第 $t$ 期开机生产产生的一次性准备成本 |
| `prodCosts` | `number[]` | 第 $t$ 期的单位生产成本 |
| `holdCost` | `number` | 每单位期末库存的持有成本 |
| `capacities` | `number[]` | 第 $t$ 期开机时的最大产能 |
| `initialPlan` | `number[]` | 初始可行的 0/1 启停向量 |
| `windowSize` | `number` | 每次 LNS 子问题释放的连续窗口长度 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `setups` | `number[]` | 全部周期的 0/1 启停决策 |
| `production` | `number[]` | 各期连续生产数量 |
| `inventory` | `number[]` | 各期期末库存数量（初始库存为 0） |
| `totalCost` | `number` | 准备成本、生产成本与库存持有成本之和 |

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

将 6 次开机合并为 3 次后，准备成本 `360` 加上生产成本 `540` 与库存成本 `75` 得到总成本 **975**。

<!-- section:hint1 -->
维护一个由 `initialPlan` 初始化的当前最优二元启停向量，并以长度为 `windowSize` 的重叠窗口扫描整个计划期。在每个子问题中，仅将当前窗口内的启停决策设为自由二元变量，窗口外的启停保持固定，而所有周期的连续产量和库存变量均保持自由。

<!-- section:hint2 -->
在每个子 MIP 中建立全周期批量约束 $0 \le p_t \le C_t y_t$ 与库存平衡 $I_{t-1} + p_t - d_t = I_t$（$I_{-1} = 0$），并对 $t \notin [\text{start}, \text{start} + \text{windowSize})$ 固定 $y_t = \bar{y}_t$。每当子问题目标严格优于当前解（差值超过 $10^{-6}$）时采纳新方案，直至完整扫描一轮无任何改进为止。
