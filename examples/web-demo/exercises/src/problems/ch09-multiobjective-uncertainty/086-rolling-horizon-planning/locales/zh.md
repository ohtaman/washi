# #086. 滚动时域规划（模型预测控制 MPC）

<!-- section:scenario -->
某工厂采用模型预测控制（MPC）进行有限时域内的生产与库存调度。在每个周期开始时，计划员观测当前实际库存水平，并针对未来有限窗口内的预测需求求解一个线性规划模型，模型包含单期产能上限、期末库存保管费及缺口惩罚成本。

然而，每一步只实际执行当前周期的产量决策；随后当期实际需求揭晓，据此结算实际期末库存与缺口量，并将预测窗口向前推进一格继续下一轮求解。请返回各周期实际执行的产量、实际库存与缺口轨迹以及累计实际总成本。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `actualDemands` | `number[]` | 执行当期决策后实际发生的各期需求 |
| `forecastDemands` | `number[]` | 前瞻窗口优化中使用的各期预测需求 |
| `prodCosts` | `number[]` | 第 $t$ 期的单位生产成本 |
| `prodCap` | `number` | 每期的最大产能上限 |
| `holdCost` | `number` | 每期期末库存的单位保管费 |
| `shortfallPenalty` | `number` | 每单位未满足需求的缺口惩罚 |
| `initialInventory` | `number` | 第 0 期开始前的初始库存 |
| `windowLen` | `number` | 每步决策的前瞻窗口长度 $H$ |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `produced` | `number[]` | 各期 $t$ 实际执行的生产量 |
| `inventories` | `number[]` | 各期 $t$ 按实际需求结算后的期末库存 |
| `shortfalls` | `number[]` | 各期 $t$ 实际发生的缺口量 |
| `totalCost` | `number` | 实际生产、库存与缺口惩罚累计总成本 |

<!-- section:example -->
**输入示例**

```json
{
  "actualDemands": [10, 10, 30, 10],
  "forecastDemands": [10, 10, 30, 10],
  "prodCosts": [9, 13, 25, 11],
  "prodCap": 20,
  "holdCost": 2,
  "shortfallPenalty": 100,
  "initialInventory": 0,
  "windowLen": 2
}
```

**输出示例**

```json
{
  "produced": [20, 20, 10, 10],
  "inventories": [10, 20, 0, 0],
  "shortfalls": [0, 0, 0, 0],
  "totalCost": 860
}
```

以窗口长度 `windowLen = 2` 滚动执行后得到产量 `[20, 20, 10, 10]`、库存 `[10, 20, 0, 0]` 与零缺口，累计实际总成本为 $(20 \times 9 + 20 \times 13 + 10 \times 25 + 10 \times 11) + 2 \times (10 + 20) =$ **860**。
