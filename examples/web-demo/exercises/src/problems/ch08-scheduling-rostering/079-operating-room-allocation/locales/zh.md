# #079. 手术室病例分配与加班控制优化

<!-- section:scenario -->
医院需要将若干候选手术病例分配到 $R$ 间手术室的 $S$ 个每日时段中。每例手术都有所需时长、排程成功可获得的临床优先级得分以及手术室兼容限制；未入选的病例不得分。

每个（手术室，时段）区块均有常规可用时长上限，且可通过支付单位加班惩罚延长至多不超过规定的加班上限。请筛选并分配病例，使总优先级得分减去总加班成本最大化。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `durations` | `number[]` | 每例手术 $c$ 的占用时长 $d_c$ |
| `priorities` | `number[]` | 安排手术 $c$ 获得的优先级得分 $p_c$ |
| `compatible` | `number[][]` | $C \times R$ 的 `0`/`1` 矩阵，表示手术 $c$ 能否在手术室 $r$ 进行 |
| `numSessions` | `number` | 每间手术室的每日时段数 $S$ |
| `regularCapacity` | `number` | 每个 `(手术室, 时段)` 区块的常规容量 $B$ |
| `maxOvertime` | `number` | 每个 `(手术室, 时段)` 区块的最大允许加班时长 $O_{\max}$ |
| `overtimeCost` | `number` | 超出常规容量后每单位加班的惩罚成本 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `assignedRoom` | `number[]` | 每例手术分配到的手术室编号 `0..R-1`，未排程为 `-1` |
| `assignedSession` | `number[]` | 每例手术分配到的时段编号 `0..S-1`，未排程为 `-1` |
| `overtime` | `number[][]` | 各 `(手术室, 时段)` 的非负加班时长 $o_{r,s}$（$R \times S$） |
| `netScore` | `number` | 最大化的净得分（总优先级减去总加班成本） |

<!-- section:example -->
**输入示例**

```json
{
  "durations": [3, 4, 2, 3, 2],
  "priorities": [60, 85, 45, 70, 20],
  "compatible": [
    [1, 1],
    [1, 0],
    [0, 1],
    [1, 1],
    [1, 1]
  ],
  "numSessions": 2,
  "regularCapacity": 3,
  "maxOvertime": 1,
  "overtimeCost": 25
}
```

**输出示例**

```json
{
  "assignedRoom": [0, 0, 1, 1, -1],
  "assignedSession": [1, 0, 1, 0, -1],
  "overtime": [
    [1, 0],
    [0, 0]
  ],
  "netScore": 235
}
```

病例 0–3 均满足手术室兼容约束（`compatible[c][r] = 1`），手术室 0 各时段负荷 `[4, 3]` 与手术室 1 负荷 `[3, 2]` 均不超过常规容量 `3` 加对应加班 `[[1, 0], [0, 0]]`（上限 `1`），病例 4 未排程（`-1`），净得分为 $(60 + 85 + 45 + 70) - 25 \times 1 =$ **235**。
