# #097. 经典 Benders 分解求解带容量选址问题

<!-- section:scenario -->
某物流企业需要决定启用哪些候选仓库（第一阶段 0-1 开设决策并产生固定激活成本），以及从各启用仓库向客户区域调拨多少货物（第二阶段连续线性运输问题）。固定一阶段开仓向量后，第二阶段即化简为连续线性规划，天然适合按阶段分解求解。

使用 WaSHI 的经典 Benders 分解将 0-1 开仓决策与连续运输补救问题分离，直至上下界收敛，返回最优设施选择、运输量矩阵及总成本。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `fixedCosts` | `number[]` | 各候选设施 $i$ 的固定启用成本 |
| `capacities` | `number[]` | 设施 $i$ 启用后的最大供应产能 |
| `demands` | `number[]` | 各客户区域 $j$ 的需求量 |
| `shippingCosts` | `number[][]` | 设施 $i$ 运往客户 $j$ 的单位运费 `shippingCosts[i][j]` |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `open` | `number[]` | 设施启用状态 0/1 向量 |
| `shipments` | `number[][]` | 非负运输量矩阵 `shipments[i][j]` |
| `totalCost` | `number` | 最小总固定成本与运费之和 |

<!-- section:example -->
**输入示例**

```json
{
  "fixedCosts": [100, 120],
  "capacities": [50, 60],
  "demands": [30, 25, 20],
  "shippingCosts": [
    [2, 5, 3],
    [4, 2, 4]
  ]
}
```

**输出示例**

```json
{
  "open": [1, 1],
  "shipments": [
    [30, 0, 20],
    [0, 25, 0]
  ],
  "totalCost": 390
}
```

同时启用两座仓库时，仓库 0 的供应量为 $30 + 20 = 50 \le 50$，仓库 1 为 $25 \le 60$，满足各客户需求 `[30, 25, 20]`，固定成本为 $100 + 120 = 220$，运费为 $(2 \times 30 + 3 \times 20) + 2 \times 25 = 170$，总计 $220 + 170 =$ **390**。

<!-- section:hint1 -->
在主问题 MIP 中仅保留二元开仓变量和非负第二阶段费用估计变量 `theta`，最小化固定成本与 `theta` 之和。针对每个候选开仓方案评估连续运输 LP 子问题：若总开放产能不足以满足总需求则生成可行性割，否则生成从下方约束 `theta` 的最优性割。

<!-- section:hint2 -->
调用 `await master.solveBenders({ theta, gapTolerance: 1e-5, subproblem })`。当运输 LP 不可行时，通过 Phase-I 弹性松弛 LP 提取对偶 $\alpha_j$（需求 $\ge$）和 $\beta_i \le 0$（产能 $\le$），返回满足 $\sum_j \alpha_j d_j + \sum_i \beta_i c_i y_i \le 0$ 的 `{ kind: "feasibility", constraint }`；可行时返回 $\theta \ge \sum_j \alpha_j d_j + \sum_i \beta_i c_i y_i$ 的 `{ kind: "optimality", constraint, subproblemObjective }`；最后在最优 `open` 下重解运输 LP 以恢复 `shipments`。
