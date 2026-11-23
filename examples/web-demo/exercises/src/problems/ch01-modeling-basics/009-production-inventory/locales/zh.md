# #009. 多周期生产与库存平滑（流守恒）

<!-- section:scenario -->
某电动自行车装配工厂需要对连续多个周期（按月）的正常班生产、加班生产以及期末库存进行统筹排程。已知期初库存（辆），且每个周期的正常产能、加班产能和仓库库容均有各自上限。

每个周期必须满足物料平衡：“上期期末库存 + 本期正常产量 + 本期加班产量 - 本期需求 = 本期期末库存”（各项均非负），并在最后一个周期结束时至少保留规定的安全库存。请制定各期的正常产量、加班产量与期末库存计划，以 **最小化总生产与库存保管成本**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `demands` | `number[]` | 各周期 $t$ 的自行车需求量（辆） |
| `regCap` | `number[]` | 各周期 $t$ 的正常产能上限（辆） |
| `otCap` | `number[]` | 各周期 $t$ 的加班产能上限（辆） |
| `invCap` | `number` | 每期仓库最大存储容量（辆） |
| `initialInventory` | `number` | 期初（0期开始前）的初始库存（辆） |
| `minFinalInventory` | `number` | 最后一期末最低安全库存下限（辆） |
| `regCost` | `number` | 正常生产单位成本 |
| `otCost` | `number` | 加班生产单位成本 |
| `holdCost` | `number` | 每件每期库存保管费 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `regular` | `number[]` | 各周期正常班产量计划 |
| `overtime` | `number[]` | 各周期加班产量计划 |
| `inventory` | `number[]` | 各周期期末库存计划 |
| `totalCost` | `number` | 最小化后的总生产与保管成本 |

<!-- section:example -->
**输入示例**

```json
{
  "demands": [80, 140, 120, 70],
  "regCap": [100, 100, 100, 100],
  "otCap": [40, 40, 40, 40],
  "invCap": 60,
  "initialInventory": 10,
  "minFinalInventory": 10,
  "regCost": 20,
  "otCost": 32,
  "holdCost": 3
}
```

**输出示例**

```json
{
  "regular": [100, 100, 100, 80],
  "overtime": [0, 10, 20, 0],
  "inventory": [30, 0, 0, 10],
  "totalCost": 8680
}
```

从初始库存 10 出发，各期满足产销平衡与库存上下限（期末库存 `[30, 0, 0, 10]` ≤ 60，期末 10 ≥ 10），总成本为 $380 \times 20 + 30 \times 32 + 40 \times 3 =$ **8,680**。
