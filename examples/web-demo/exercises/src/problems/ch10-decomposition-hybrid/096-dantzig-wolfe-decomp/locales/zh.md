# #096. 基于 Dantzig-Wolfe 分解的块角结构规划

<!-- section:scenario -->
一家企业下设多个独立生产部门，每个部门拥有各自独立的本地设备产能与产品市场上限，但所有部门共同受限于一项公司级共享瓶颈资源。此类由全局耦合约束与分部门独立多面体构成的模型属于经典的块角结构线性规划问题。

请使用 WaSHI 的列生成接口实现 Dantzig-Wolfe 分解：在主问题中保留全局共享资源约束与各部门凸组合约束，根据主问题对偶影子价格独立求解每个部门的子问题以生成改进极点列，最后利用最优凸组合权重还原各产品的连续生产计划。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `profits` | `number[][]` | 部门 $k$ 中产品 $j$ 的单位利润 `profits[k][j]` |
| `localUsages` | `number[][]` | 部门 $k$ 生产单位产品 $j$ 消耗的本地资源量 |
| `localCaps` | `number[]` | 部门 $k$ 的本地资源总上限 |
| `sharedUsages` | `number[][]` | 部门 $k$ 生产单位产品 $j$ 消耗的全局共享资源量 |
| `sharedCap` | `number` | 全局共享瓶颈资源上限 |
| `productCaps` | `number[][]` | 部门 $k$ 中产品 $j$ 的产量上界 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `allocations` | `number[][]` | 各部门与产品的连续产量方案 `allocations[k][j]` |
| `totalProfit` | `number` | 企业总利润 $\sum_k \sum_j \text{profits}[k][j] \cdot \text{allocations}[k][j]$ |

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

部门 0 消耗本地资源 `19 <= 24`，部门 1 消耗 `18 <= 30`，全局共享资源消耗 `11 + 9 = 20 <= 20`，获得最大总利润 **225**。
