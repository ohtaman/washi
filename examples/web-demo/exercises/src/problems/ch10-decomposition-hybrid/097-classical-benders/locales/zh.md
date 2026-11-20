# #097. 经典 Benders 分解求解带容量选址问题

<!-- section:scenario -->
某物流企业需要决定启用哪些候选仓库（第一阶段 0-1 开设决策并产生固定激活成本），以及从各启用仓库向客户区域调拨多少货物（第二阶段连续线性运输问题）。固定一阶段开仓向量后，第二阶段即化简为连续线性规划，天然适合按阶段分解求解。

请使用 WaSHI 的 solveBenders 接口实现经典 Benders 分解：在主问题中同时优化 0-1 开仓决策与辅助费用估计变量，在子问题中求解运输 LP（若产能不足则求解 Phase-I 弹性松弛 LP）以提取精确对偶价格，不断向主问题添加 Benders 可行性割与最优性割直至上下界收敛。

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

启用两座仓库固定成本为 `100 + 120 = 220`，运费为 `60 + 60 + 50 = 170`，取得最优总成本 **390**。
