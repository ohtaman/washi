# #071. 带释放时间的单机加权总延迟最小化

<!-- section:scenario -->
一台不可抢占的机器需要加工若干项作业。每项作业都有各自的最早释放时间、加工时长、目标交期以及单位延迟惩罚权重。

任意时刻机器上最多只能加工一项作业。请为每项作业安排满足释放时间且互不重叠的开工时间，使所有作业的加权延迟之和最小。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `releaseDates` | `number[]` | 各作业的最早可开工时间 $r_j$ |
| `processingTimes` | `number[]` | 各作业不可中断的加工时长 $p_j$ |
| `dueDates` | `number[]` | 各作业的目标交期 $d_j$ |
| `weights` | `number[]` | 各作业单位交期延迟的惩罚权重 $w_j$ |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `starts` | `number[]` | 各作业的开工时间 $S_j$（$S_j \ge r_j$） |
| `totalWeightedTardiness` | `number` | 最小化的加权总延迟 $\sum_j w_j \max(0, S_j + p_j - d_j)$ |

<!-- section:example -->
**输入示例**

```json
{
  "releaseDates": [0, 2, 1],
  "processingTimes": [4, 3, 2],
  "dueDates": [5, 5, 6],
  "weights": [1, 5, 2]
}
```

**输出示例**

```json
{
  "starts": [7, 2, 5],
  "totalWeightedTardiness": 8
}
```

按 $[2, 5)$ 加工作业 1、$[5, 7)$ 加工作业 2、$[7, 11)$ 加工作业 0 时满足所有释放时间且无重叠，延迟为 $[6, 0, 1]$，加权总延迟为 $1 \times 6 + 5 \times 0 + 2 \times 1 =$ **8**。
