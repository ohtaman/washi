# #096. 基于 Dantzig-Wolfe 分解的块角结构规划

<!-- section:scenario -->
精密零件制造商的多座加工工厂各自在本地电力容量（单位：kWh）与产品（轴承、齿轮、轴等）产量上限（单位：个）下运营，同时全公司共同分享一种稀缺原材料（特种钢材，单位：kg）。这种由全局耦合约束与各工厂独立模块组成的结构，正是典型的块角线性规划问题。

请使用基于 WaSHI 列生成的 Dantzig-Wolfe 分解求解这一块角线性规划问题，在协调共享原材料的同时返回最优产量分配（非负实数值，个）与全公司总利润。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `profits` | `number[][]` | 工厂 $k$ 的产品 $j$ 的单位利润 `profits[k][j]` |
| `localUsages` | `number[][]` | 工厂 $k$ 生产 1 个产品 $j$ 耗用的本地电力（kWh） |
| `localCaps` | `number[]` | 工厂 $k$ 的本地电力容量上限（kWh） |
| `sharedUsages` | `number[][]` | 工厂 $k$ 生产 1 个产品 $j$ 耗用的全公司共享钢材量（kg） |
| `sharedCap` | `number` | 全公司共享特种钢材上限（kg） |
| `productCaps` | `number[][]` | 工厂 $k$ 的产品 $j$ 产量上限（个） |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `allocations` | `number[][]` | 各工厂各产品的产量（非负实数值，`allocations[k][j]`，个） |
| `totalProfit` | `number` | 全公司总利润 $\sum_k \sum_j \text{profits}[k][j] \cdot \text{allocations}[k][j]$ |

<!-- section:example -->
**输入示例**

```json
{
  "profits": [
    [12, 18, 10],
    [15, 11, 20]
  ],
  "localUsages": [
    [2, 3, 1],
    [3, 2, 4]
  ],
  "localCaps": [24, 30],
  "sharedUsages": [
    [1, 2, 1],
    [2, 1, 2]
  ],
  "sharedCap": 20,
  "productCaps": [
    [8, 6, 10],
    [6, 9, 5]
  ]
}
```

**输出示例**

```json
{
  "allocations": [
    [8, 0, 3],
    [0, 9, 0]
  ],
  "totalProfit": 225
}
```

工厂 0 的本地电力消耗为 $2(8) + 3(0) + 1(3) = 19 \le 24$，工厂 1 为 $3(0) + 2(9) + 4(0) = 18 \le 30$，共享钢材消耗为 $(8 + 3) + 9 = 20 \le 20$，总利润为 $(12 \times 8 + 10 \times 3) + 11 \times 9 = 126 + 99 =$ **225**。

<!-- section:hint1 -->
在主问题 LP 中仅保留全局共享资源约束以及每个部门的凸组合约束，并为每个部门提供一个零产量的初始极点列。每个部门的本地产能和产品上界各自构成独立的 LP 定价子问题，用于生成改进极点。

<!-- section:hint2 -->
在带有命名约束（`shared_cap` 与 `conv_${k}`）的主问题上运行 `solveColumnGeneration({ master, finalizeAsMIP: false, pricing })`，使各部门凸组合权重之和为 $1$。在 `pricing({ getDual })` 中从单位利润里扣除共享资源对偶成本并求解部门 $k$ 的本地 LP，当子问题最优值超过该部门凸组合对偶变量（超过 $10^{-6}$）时返回新列，最后按凸组合还原 `allocations[k][j]`。
