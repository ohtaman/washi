# #031. 互斥信道分配（distinct 全局约束）

<!-- section:scenario -->
无线运营商需要为若干个发射台各分配一个 0 到 numChannels - 1 之间的整数频段信道，且任意两个发射台都不能共用同一信道。

此外，存在相邻干扰的发射台对所分配信道编号之差的绝对值必须至少为 2。若发射台 i 使用信道 c 的加权频谱成本为 weights[i] * c，请规划信道分配以最小化加权总成本。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `numChannels` | `number` | 可用信道总数（整数编号 `0` 到 `numChannels - 1`） |
| `weights` | `number[]` | 各发射台的信道权重（总成本为 `sum(weights[i] * channels[i])`） |
| `adjacentConflicts` | `number[][]` | 需满足 `abs(channels[u] - channels[v]) >= 2` 的干扰发射台对 `[u, v]` |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `channels` | `number[]` | 为各发射台分配的整数信道编号（`[0, numChannels - 1]`） |
| `totalCost` | `number` | 最小化后的加权总成本 |

<!-- section:example -->
**输入示例**

```json
{
  "numChannels": 4,
  "weights": [10, 6, 4],
  "adjacentConflicts": [
    [0, 1]
  ]
}
```

**输出示例**

```json
{
  "channels": [0, 2, 1],
  "totalCost": 16
}
```

分配 `[0, 2, 1]` 互不重复，对干扰对 `(0, 1)` 满足 $|0 - 2| = 2 \ge 2$，总加权成本为 $10 \times 0 + 6 \times 2 + 4 \times 1 =$ **16**。

<!-- section:hint1 -->
为每个发射台定义一个取值范围为 `[0, numChannels - 1]` 的整数决策变量。使用全异（AllDifferent）全局约束表示所有发射台不能共用信道，并为每对干扰发射台添加信道间隔约束。

<!-- section:hint2 -->
对信道变量数组施加 `distinct(channels)` 约束，并对 `input.adjacentConflicts` 中的每对 `[u, v]` 添加 `expr\`abs(${channels[u]} - ${channels[v]}) >= 2\``。使用 `minimize(expr\`dot(${input.weights}, ${channels})\`)` 最小化加权总成本，并通过 `solver: "pumpkin"` 求解。
