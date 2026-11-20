# #011. 半连续批量生产计划

<!-- section:scenario -->
某工厂需要利用单一共享原料规划多种候选产品的连续产量。对于每种产品，要么完全停产（产量为零），要么启用生产并在最小批量与最大产能之间的连续区间内取值。

每种产品在生产时均会获得单位毛利并消耗相应单位的共享原料。请在不超过原料总供应上限的前提下，联合决策各产品是否启用及具体产量，以**最大化总利润**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `margins` | `number[]` | 各产品每单位产量的边际利润 |
| `minBatches` | `number[]` | 各产品启用生产时的最小批量下限 |
| `maxBatches` | `number[]` | 各产品启用生产时的最大产能上限 |
| `resourceUsages` | `number[]` | 各产品生产 1 单位耗用的共享资源量 |
| `resourceCap` | `number` | 共享资源总可用上限 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `active` | `number[]` | 各产品是否启用生产（`0` 或 `1`） |
| `quantities` | `number[]` | 各产品的连续产量（`0` 或位于 `[minBatches[i], maxBatches[i]]`） |
| `totalMargin` | `number` | 最大化后的总利润 |

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

启用产品 0 和 1 并令 `quantities = [15, 15, 0]` 满足 `[8, 20]` 与 `[15, 30]` 区间及产品 2 停产为零的要求，原料消耗 $15 + 15 = 30 \le 30$，总利润为 $30 \times 15 + 24 \times 15 =$ **810**。
