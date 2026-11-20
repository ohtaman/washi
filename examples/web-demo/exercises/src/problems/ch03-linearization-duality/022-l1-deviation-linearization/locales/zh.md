# #022. 加权 L1 偏差线性化（目标追踪）

<!-- section:scenario -->
运营规划师需要在各渠道上限、总分配量严格达标以及总预算约束下，决定多个渠道的非负分配量。由于各渠道的理想目标分配往往无法同时满足总预算或总量要求，因此必须对部分渠道进行上调或下调。

任意渠道偏离其目标值都会按给定权重产生每单位惩罚。请在满足所有约束的前提下，**最小化与目标值之间的加权 L1 偏差总和**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `targets` | `number[]` | 渠道 $i$ 的目标分配量 $\tau_i$ |
| `weights` | `number[]` | 渠道 $i$ 每单位偏离的惩罚权重 $w_i$ |
| `upperBounds` | `number[]` | 渠道 $i$ 的允许上限 $u_i$ |
| `costs` | `number[]` | 渠道 $i$ 的单位成本 $c_i$ |
| `budget` | `number` | 允许的总支出上限 |
| `totalOutput` | `number` | 必须达到的分配总和 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `allocations` | `number[]` | 各渠道的分配量 $x_i$ |
| `totalDeviation` | `number` | 最小化后的加权 L1 偏差 $\sum_i w_i \lvert x_i - \tau_i \rvert$ |

<!-- section:example -->
**输入示例**

```json
{
  "targets": [40, 30, 30],
  "weights": [3, 2, 1],
  "upperBounds": [60, 60, 60],
  "costs": [5, 2, 1],
  "budget": 230,
  "totalOutput": 100
}
```

**输出示例**

```json
{
  "allocations": [25, 30, 45],
  "totalDeviation": 60
}
```

分配 `[25, 30, 45]` 的总和为 $100$，总支出 $5 \times 25 + 2 \times 30 + 1 \times 45 = 230 \le 230$，加权偏差为 $3 \lvert 25 - 40 \rvert + 2 \lvert 30 - 30 \rvert + 1 \lvert 45 - 30 \rvert =$ **60**。
