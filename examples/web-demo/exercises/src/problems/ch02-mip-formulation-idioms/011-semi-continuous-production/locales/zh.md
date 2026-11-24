# #011. 半连续最小批量酿造计划

<!-- section:scenario -->
某精酿啤酒厂在共用麦芽库存（kg）的条件下，以连续量（升）酿造多种候选啤酒品种（如 IPA、淡色艾尔、世涛等）。对于每种品种，必须二选一：要么放弃酿造使产量为零，要么投入酿造并使其产量处于最小批量以上、最大发酵罐容量以下的区间内。

各品种每升的毛利润与麦芽消耗量已知。请在不超出共用麦芽库存上限的前提下，决定要酿造的品种及其酿造量，以**最大化总毛利润**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `margins` | `number[]` | 各品种每升的毛利润 |
| `minBatches` | `number[]` | 酿造各品种时的最小批量（升） |
| `maxBatches` | `number[]` | 各品种的最大发酵罐容量（升） |
| `resourceUsages` | `number[]` | 各品种每升的麦芽消耗量（kg） |
| `resourceCap` | `number` | 共用麦芽的总库存上限（kg） |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `active` | `number[]` | 是否酿造各品种的选择（0 或 1） |
| `quantities` | `number[]` | 各品种的酿造量（0 或区间 `[minBatches[i], maxBatches[i]]`） |
| `totalMargin` | `number` | 最大化后的总毛利润 |

<!-- section:example -->
**输入示例**

```json
{
  "margins": [30, 24, 18],
  "minBatches": [8, 15, 5],
  "maxBatches": [20, 30, 15],
  "resourceUsages": [1, 1, 1],
  "resourceCap": 30
}
```

**输出示例**

```json
{
  "active": [1, 1, 0],
  "quantities": [15, 15, 0],
  "totalMargin": 810
}
```

酿造品种 0 和 1 并令 `quantities = [15, 15, 0]`，分别满足 `[8, 20]` 与 `[15, 30]` 的酿造区间（品种 2 为 0）以及麦芽上限 $15 + 15 = 30 \le 30$，总毛利润为 $30 \times 15 + 24 \times 15 =$ **810**。

<!-- section:hint1 -->
每种品种都有一个表示是否酿造的二元变量和一个连续酿造量变量。将每对变量耦合起来，使未酿造的品种产量为零、酿造的品种处于规定的批量范围内，同时加上共用麦芽上限约束。

<!-- section:hint2 -->
用二元变量从上下两侧夹住酿造量变量：将 `minBatches[i]` 和 `maxBatches[i]` 分别乘以 `active[i]`，使未酿造时（0）酿造量被固定为 0，仅在酿造时（1）启用 `[minBatches[i], maxBatches[i]]` 区间。同时设置共用麦芽上限与总毛利润最大化。
