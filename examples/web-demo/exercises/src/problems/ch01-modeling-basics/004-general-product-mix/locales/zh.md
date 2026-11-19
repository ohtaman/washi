# #004. 通用产品组合规划（m × n 矩阵）

<!-- section:scenario -->
在 **#002** 中我们手写了固定两种产品的模型；但在实际业务中，产品数量与共享资源种类都会随输入规模变化。

工坊计划生产若干种口味（非负连续产量），每种产品带来各自单位利润，并按给定配比消耗多种共享原材料或设备产能。请在不超出任何资源可用上限的前提下，决策每种产品的产量以 **最大化总利润**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `margins` | `number[]` | 产品 $j$ 的单位利润 |
| `usages` | `number[][]` | 资源消耗矩阵，`usages[k][j]` 为生产 1 单位产品 $j$ 消耗的资源 $k$ |
| `capacities` | `number[]` | 资源 $k$ 的总可用上限 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `quantities` | `number[]` | 各产品的非负连续产量数组 |
| `totalProfit` | `number` | 最大化后的总利润 |

<!-- section:example -->
**输入示例**

```json
{
  "margins": [500, 300],
  "usages": [
    [3, 1],
    [1, 2]
  ],
  "capacities": [90, 80]
}
```

**输出示例**

```json
{
  "quantities": [20, 30],
  "totalProfit": 19000
}
```

若只做高毛利的产品 0，最多只能做 30 单位（利润 15,000）且资源 1 大量闲置；组合生产 `[20, 30]` 同时用满资源 0（90）与资源 1（80），取得最大总利润 **19,000**。

<!-- section:hint1 -->
初始代码中已声明连续非负变量 `quantities` 并解包参数。只需遍历 `k = 0 .. capacities.length - 1` 添加资源约束 `dot(usages[k], quantities) <= capacities[k]`。

<!-- section:hint2 -->
添加最大化目标 `dot(margins, quantities)` 并求解；注意保持 `quantities` 为连续变量不要取整（用例 2 最优顶点为小数 `[6.6667, 46.6667, 0]`）。

<!-- section:formulation -->
$$
\begin{aligned}
\max \quad & \sum_{j=0}^{n-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} a_{k,j} x_j \le b_k && \forall k \in \{0, \dots, m-1\} \\
& x_j \ge 0 && \forall j \in \{0, \dots, n-1\}
\end{aligned}
$$
