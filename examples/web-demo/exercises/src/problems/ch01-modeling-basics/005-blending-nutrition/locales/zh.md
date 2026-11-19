# #005. 精密合金配比（比例上下界约束）

<!-- section:scenario -->
某金属精炼厂需要将多种原料金属熔炼成总重量恰好等于规定批次重量的特种合金。每种原料都有单位重量成本、可用库存上限以及各种化学元素的质量分数。

质检规范要求成品合金中每种化学元素的重量占比必须落在各自的最低与最高允许区间内。请在满足库存上限与全部元素含量上下界的前提下，决定各原料的投入重量以 **最小化总材料成本**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `targetBatch` | `number` | 必须恰好生产的总批次重量 (kg) |
| `costs` | `number[]` | 原料 $i$ 的每公斤单价 |
| `availabilities` | `number[]` | 原料 $i$ 的库存上限 (kg) |
| `compositions` | `number[][]` | `compositions[i][k]` 为原料 $i$ 中元素 $k$ 的质量分数 |
| `minRatios` | `number[]` | 元素 $k$ 的最低允许含量比例 |
| `maxRatios` | `number[]` | 元素 $k$ 的最高允许含量比例 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `amounts` | `number[]` | 各原料投入重量 (kg) |
| `totalCost` | `number` | 最小化后的总材料成本 |

<!-- section:example -->
**输入示例**

```json
{
  "targetBatch": 100,
  "costs": [300, 500, 400],
  "availabilities": [80, 60, 70],
  "compositions": [
    [0.2, 0.5, 0.1],
    [0.6, 0.2, 0.4],
    [0.4, 0.4, 0.2]
  ],
  "minRatios": [0.35, 0.3, 0],
  "maxRatios": [1, 1, 0.25]
}
```

**输出示例**

```json
{
  "amounts": [62.5, 37.5, 0],
  "totalCost": 37500
}
```

单用最便宜的原料 0 时元素 0 含量只有 20%（低于 35%）；按 62.5 kg 原料 0 与 37.5 kg 原料 1 混合可使元素 0 达到 35%、元素 1 达到 38.75%、元素 2 为 21.25%，以最低总成本 **37,500** 达标。

<!-- section:hint1 -->
占比约束 $\frac{\sum_i p_{i,k} x_i}{\sum_i x_i} \ge L_k$ 看上去是非线性的分式；但由于本题要求总重量 $\sum_i x_i$ 严格等于常数 `targetBatch`，两边同乘 `targetBatch` 即可直接线性化！

<!-- section:hint2 -->
初始代码中已按库存上界创建了变量 `amounts`。只需补充总量等式 `sum(amounts) == targetBatch`，并对每种元素 $k$ 添加：
- `elemWeight_k >= minRatios[k] * targetBatch`
- `elemWeight_k <= maxRatios[k] * targetBatch`

<!-- section:formulation -->
$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} c_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} x_i = B \\
& L_k B \le \sum_{i=0}^{n-1} p_{i,k} x_i \le U_k B && \forall k \\
& 0 \le x_i \le A_i && \forall i
\end{aligned}
$$

只要百分比分母是固定的批次重量 $B$，消除分母就能保持纯线性规划（LP）。当分母也是变量时的处理技巧将在第 2 章探讨。
