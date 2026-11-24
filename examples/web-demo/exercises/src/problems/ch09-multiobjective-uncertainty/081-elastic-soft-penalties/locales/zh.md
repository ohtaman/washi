# #081. 弹性软约束与分层惩罚规划

<!-- section:scenario -->
某糕点工厂需要确定巧克力、曲奇、玛德琳等多种甜点产品的生产量（0 以上的连续值，单位：kg）。全厂消耗的总机器工时（小时）不得超过设备产能上限，同时所有产品的总产量必须不低于规定的最低下限（kg）。

另一方面，每种产品都设有目标产量（kg）。低于目标的欠产部分会按优先级产生每 kg 欠产惩罚，高于目标的超产部分会产生每 kg 超产惩罚。请在严格遵守硬约束的前提下，最小化生产成本与目标偏离惩罚之和。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `unitCosts` | `number[]` | 各产品每 kg 的生产成本 |
| `hours` | `number[]` | 各产品每 kg 耗用的机器工时（小时） |
| `targets` | `number[]` | 各产品的目标产量（软目标，kg） |
| `shortfallPenalties` | `number[]` | 低于目标每 kg 的分级惩罚系数 |
| `excessPenalties` | `number[]` | 高于目标每 kg 的超产惩罚系数 |
| `machineCap` | `number` | 机器总工时的硬性上限（小时） |
| `minTotal` | `number` | 全部产品总产量的硬性下限（kg） |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `quantities` | `number[]` | 各产品的生产量（非负实数值，kg） |
| `shortfalls` | `number[]` | 各产品低于目标的欠产量（kg） |
| `excesses` | `number[]` | 各产品高于目标的超产量（kg） |
| `totalCost` | `number` | 最小化的生产总成本与偏离惩罚之和 |

<!-- section:example -->
**输入示例**

```json
{
  "unitCosts": [4, 5, 3],
  "hours": [2, 2, 2],
  "targets": [10, 10, 10],
  "shortfallPenalties": [100, 50, 15],
  "excessPenalties": [20, 20, 20],
  "machineCap": 46,
  "minTotal": 0
}
```

**输出示例**

```json
{
  "quantities": [10, 10, 3],
  "shortfalls": [0, 0, 7],
  "excesses": [0, 0, 0],
  "totalCost": 204
}
```

产量 `quantities = [10, 10, 3]` 满足工时约束 $2(10) + 2(10) + 2(3) = 46 \le 46$ 及目标平衡方程（`shortfalls = [0, 0, 7]`、`excesses = [0, 0, 0]`），总成本为 $(4 \times 10 + 5 \times 10 + 3 \times 3) + 15 \times 7 =$ **204**。


<!-- section:hint1 -->
为每个产品定义三组非负连续决策变量：实际产量、低于目标的短缺量以及高于目标的超产量。将总机器工时上限和总产量下限作为针对产量的硬约束，并将各产品的产量目标作为带惩罚项的软约束处理。

<!-- section:hint2 -->
弹性目标追踪的关键性质在于：只要短缺惩罚和超产惩罚均非负且之和严格为正（$w_j^- + w_j^+ > 0$），用非负短缺松弛和超产松弛将软目标写成等式既能避免模型不可行，又能保证在最优解处至少有一个松弛变量自然归零，无需任何二元变量。在 WaSHI 中使用 `m.continuous(...)`，或在 PuLP 中使用 `pulp.LpVariable(..., lowBound=0)`。