# #081. 弹性软约束与分层惩罚规划

<!-- section:scenario -->
某工厂需要确定多种产品的连续生产量，且必须严格遵守两条硬性规则：总消耗机器工时不得超过可用产能上限，同时全部产品的总产量不得低于最低总量要求。

此外，每种产品都设有软性生产目标。低于目标会产生按优先级分层的缺口惩罚，高于目标则会产生超产惩罚。请在满足硬约束的前提下，求非负产量及正负偏差量，以最小化总生产成本与软目标偏离惩罚之和。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `unitCosts` | `number[]` | 各产品每单位的直接生产成本 |
| `hours` | `number[]` | 各产品每单位耗用的机器工时 |
| `targets` | `number[]` | 各产品的软性生产目标 |
| `shortfallPenalties` | `number[]` | 低于目标每单位的分层惩罚系数 |
| `excessPenalties` | `number[]` | 高于目标每单位的超产惩罚系数 |
| `machineCap` | `number` | 机器总工时的硬性上限 |
| `minTotal` | `number` | 总产量的硬性最低要求 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `quantities` | `number[]` | 各产品的非负连续产量 |
| `shortfalls` | `number[]` | 低于目标的欠产偏差量 |
| `excesses` | `number[]` | 高于目标的超产偏差量 |
| `totalCost` | `number` | 最小化的生产成本与偏差惩罚之和 |

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
