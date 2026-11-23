# #079. 电竞联赛赛程与场馆时段调度

<!-- section:scenario -->
某电竞联赛需要将若干待安排的比赛分配到 V 个场馆和 S 个直播时段中。每场比赛都有所需的直播时长、安排后可获得的收视得分以及场馆兼容掩码；未被安排的比赛得分为零。

每个场馆时段块都有一个常规时长，可通过支付线性单位加时惩罚来延长，但不能超过固定的加时上限。请选择要安排的比赛并将其指派到兼容的场馆与时段，以最大化总收视得分减去总加时成本。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `durations` | `number[]` | 每场比赛 $m$ 的直播时长 $d_m$ |
| `scores` | `number[]` | 比赛 $m$ 被安排时可获得的收视得分 $p_m$ |
| `compatible` | `number[][]` | $M \times V$ 二元矩阵，表示比赛 $m$ 是否可以在场馆 $v$ 举办 |
| `numSlots` | `number` | 每个场馆的时段数 $S$ |
| `regularLength` | `number` | 每个 `(venue, slot)` 块的常规直播时长 $B$ |
| `maxOvertime` | `number` | 每个 `(venue, slot)` 块允许的最大加时上限 $O_{\max}$ |
| `overtimeCost` | `number` | 超出常规时长后每单位加时的惩罚成本 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `assignedVenue` | `number[]` | 每场比赛指派的场馆索引 0 至 $V-1$，未安排则为 -1 |
| `assignedSlot` | `number[]` | 每场比赛指派的时段索引 0 至 $S-1$，未安排则为 -1 |
| `overtime` | `number[][]` | 每个 `(venue, slot)` 使用的非负加时时长 $o_{v,s}$（$V \times S$） |
| `netScore` | `number` | 最大化的总收视得分减去加时成本 |

<!-- section:example -->
**输入示例**

```json
{
  "durations": [2, 4, 3, 3, 2],
  "scores": [55, 95, 70, 65, 18],
  "compatible": [
    [1, 1],
    [1, 0],
    [0, 1],
    [1, 1],
    [1, 1]
  ],
  "numSlots": 2,
  "regularLength": 3,
  "maxOvertime": 1,
  "overtimeCost": 25
}
```

**输出示例**

```json
{
  "assignedVenue": [1, 0, 1, 0, -1],
  "assignedSlot": [1, 0, 0, 1, -1],
  "overtime": [
    [1, 0],
    [0, 0]
  ],
  "netScore": 260
}
```

比赛 0–3 均被安排到兼容场馆（`compatible[m][v] = 1`），场馆 0 的负荷 [4, 3] 与场馆 1 的负荷 [3, 2] 均满足常规时长 3 加上加时 [[1, 0], [0, 0]]（未超 `maxOvertime = 1`），比赛 4 未安排（-1），净得分为 $(55 + 95 + 70 + 65) - 25 \times 1 =$ **260**。

<!-- section:hint1 -->
使用三维二元决策变量表示每场比赛是否指派到某场馆与时段，并配合每个场馆时段块的非负有界连续加时变量。每场比赛最多在兼容场馆中安排一次，且每个时段块的总比赛时长不得超过常规时长与加时之和。

<!-- section:hint2 -->
由于 `overtimeCost` 为正且目标是最大化 `netScore`，连续加时变量（`m.continuous` / `pulp.LpVariable`）会自动取到超出 `regularLength` 的精确溢出量，无需额外引入二元指示变量。请记得将不兼容的 `(m, v)` 组合固定为零，并将未安排的比赛在 `assignedVenue` 和 `assignedSlot` 中均解码为 -1。
