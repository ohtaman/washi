# #023. 正部惩罚线性化（多周期加班排班）

<!-- section:scenario -->
某服务中心需要规划多个周期的常规产能以覆盖预测需求。每个周期都有最低保底常规工时和最大产能上限，同时所有周期的常规排班总量不得超过总常规工时预算。

当某周期常规产量低于需求时，缺口部分需按单位加班惩罚成本补齐；若常规产量高于需求，超出部分既不产生退款也无额外收益。请在满足全部约束的前提下，**最小化常规成本与加班惩罚之和**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `demands` | `number[]` | 第 $t$ 周期的需求量 $d_t$ |
| `minRegular` | `number[]` | 第 $t$ 周期的最低保底常规产量 $L_t$ |
| `maxRegular` | `number[]` | 第 $t$ 周期的最大常规产能 $U_t$ |
| `regularCosts` | `number[]` | 第 $t$ 周期的单位常规成本 $r_t$ |
| `overtimePenalties` | `number[]` | 第 $t$ 周期缺口 $\max(0, d_t - x_t)$ 的单位加班惩罚 $p_t$ |
| `totalRegularCap` | `number` | 全周期常规总量 $\sum_t x_t$ 的上限 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `regular` | `number[]` | 各周期常规排班量 $x_t$ |
| `shortage` | `number[]` | 各周期加班补足的缺口 $\max(0, d_t - x_t)$ |
| `totalCost` | `number` | 最小化后的总成本 |

<!-- section:example -->
**输入示例**

```json
{
  "demands": [40, 60, 50],
  "minRegular": [10, 10, 10],
  "maxRegular": [50, 50, 50],
  "regularCosts": [20, 25, 18],
  "overtimePenalties": [50, 45, 55],
  "totalRegularCap": 100
}
```

**输出示例**

```json
{
  "regular": [40, 10, 50],
  "shortage": [0, 50, 0],
  "totalCost": 4200
}
```

常规排班 `[40, 10, 50]` 之和为 $100 \le 100$ 且满足各期上下界，缺口为 `[0, 50, 0]`，总成本为 $(20 \times 40 + 25 \times 10 + 18 \times 50) + (45 \times 50) =$ **4,200**。
