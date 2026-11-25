# #086. 滚动时域规划（模型预测控制 MPC）

<!-- section:scenario -->
某饮料灌装工厂采用模型预测控制（MPC）进行多周期的瓶装饮料（单位：箱）生产与库存调度。在每期开始时，计划员确认当前实际库存（箱），并针对近期预测窗口（在计划期末截断）求解一个前瞻线性规划问题：在满足每期产能上限（箱）与库存/缺货平衡的前提下，最小化窗口内的生产成本、期末库存保管费（日元/箱）与缺货惩罚（日元/箱）之和。

然而，每一步实际确定并执行的仅是当期的产量。随后当期实际需求揭晓；未满足的需求直接作为缺货损失而不向后积压，因此实际期末库存保持非负，缺货量不会结转到下一期。随后窗口向后滚动一期继续计划，请返回各期实际执行的产量、实际库存、实际缺货量以及累计实际总成本。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `actualDemands` | `number[]` | 生产决策后观测到的各期实际需求（箱） |
| `forecastDemands` | `number[]` | 前瞻计划中参考的各期预测需求（箱） |
| `prodCosts` | `number[]` | 各期的生产单价（日元/箱） |
| `prodCap` | `number` | 每期的最大生产能力（箱） |
| `holdCost` | `number` | 每箱期末库存的保管成本（日元） |
| `shortfallPenalty` | `number` | 每箱未满足需求的缺货惩罚（日元） |
| `initialInventory` | `number` | 第 0 期开始前的初始库存（箱） |
| `windowLen` | `number` | 每步参考的前瞻窗口长度（期数，在计划期末截断） |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `produced` | `number[]` | 各期实际执行的生产量（箱） |
| `inventories` | `number[]` | 各期按实际需求结算后的期末库存（箱） |
| `shortfalls` | `number[]` | 各期实际发生的缺货量（箱） |
| `totalCost` | `number` | 实际生产、库存与缺货惩罚累计总成本（日元） |

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

以窗口长度 `windowLen = 2` 滚动执行后得到产量 `[20, 20, 10, 10]`、库存 `[10, 20, 0, 0]` 与零缺货，累计实际总成本为 $(20 \times 9 + 20 \times 13 + 10 \times 25 + 10 \times 11) + 2 \times (10 + 20) =$ **860**。


<!-- section:hint1 -->
在结转真实期末库存的同时逐期仿真整个计划期。在每一期中，针对有限的前瞻窗口构建并求解一个新的线性规划，为窗口内的每一期设置生产量、期末库存与缺货量决策变量。

<!-- section:hint2 -->
每一步的前瞻 LP 只能使用（在计划期末截断后的）`forecastDemands`，绝不能偷看 `actualDemands`。求解后仅采纳第一期的生产决策，再用 `actualDemands[t]` 更新真实的期末库存、实际缺货量并累加当期已实现成本。