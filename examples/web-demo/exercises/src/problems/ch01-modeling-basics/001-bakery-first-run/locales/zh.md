# #001. 面包房生产计划（<= 与最大化）

<!-- section:scenario -->
面包房生产牛角包和吐司（均为非负连续值），在有限的面粉和黄油库存下最大化总利润：

- 每个牛角包：利润 40，消耗面粉 2、黄油 1
- 每条吐司：利润 70，消耗面粉 3、黄油 2

在库存上限 flourCap 和 butterCap 内最大化总利润（初始代码中只缺少了黄油上限约束）。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `flourCap` | `number` | 面粉库存上限 |
| `butterCap` | `number` | 黄油库存上限 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `croissants` | `number` | 牛角包产量（$\ge 0$） |
| `loaves` | `number` | 吐司产量（$\ge 0$） |
| `totalProfit` | `number` | 最大化后的总利润 |

<!-- section:example -->
**输入示例**

```json
{
  "flourCap": 120,
  "butterCap": 70
}
```

**输出示例**

```json
{
  "croissants": 30,
  "loaves": 20,
  "totalProfit": 2600
}
```

生产 `30` 个牛角包和 `20` 条吐司时，面粉 $2\times 30 + 3\times 20 = 120$、黄油 $30 + 2\times 20 = 70$ 恰好用尽，总利润达到最大 `2600`。
