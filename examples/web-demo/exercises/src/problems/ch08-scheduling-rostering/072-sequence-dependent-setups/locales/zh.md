# #072. 顺序相关换产时间的单机调度

<!-- section:scenario -->
一台机器从零时刻开始连续加工若干项作业，首项作业前无需初始换产。当机器从作业 $i$ 切换至作业 $j$ 时，需要消耗与顺序相关的换产调整时间后才能开始加工 $j$。

请规划全部作业的加工排列顺序及各自完工时间，使所有作业的总交期延迟最小。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `processingTimes` | `number[]` | 各作业的加工时长 $p_j$ |
| `setupMatrix` | `number[][]` | 紧随作业 $i$ 之后加工作业 $j$ 所需的换产时间 $s_{ij}$ |
| `dueDates` | `number[]` | 各作业的交期 $d_j$ |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `order` | `number[]` | 作业编号 `0..n-1` 的排列顺序 |
| `completions` | `number[]` | 各作业 $j$ 的完工时间 $C_j$ |
| `totalTardiness` | `number` | 最小化的总延迟 $\sum_j \max(0, C_j - d_j)$ |

<!-- section:example -->
**输入示例**

```json
{
  "processingTimes": [3, 4, 2],
  "setupMatrix": [
    [0, 5, 1],
    [2, 0, 4],
    [3, 1, 0]
  ],
  "dueDates": [6, 8, 5]
}
```

**输出示例**

```json
{
  "order": [0, 2, 1],
  "completions": [3, 11, 6],
  "totalTardiness": 4
}
```

按 $0 \to 2 \to 1$ 顺序加工时，完工时间分别为 $C_0 = 3$（延迟 0）、$C_2 = 3 + 1 + 2 = 6$（延迟 1）、$C_1 = 6 + 1 + 4 = 11$（延迟 3），总延迟为 $0 + 1 + 3 =$ **4**。
