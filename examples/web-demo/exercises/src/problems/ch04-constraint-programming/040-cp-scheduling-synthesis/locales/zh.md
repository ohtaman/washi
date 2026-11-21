# #040. 综合制造单元调度（CP 综合应用）

<!-- section:scenario -->
某制造单元需要加工 n 项作业，每项作业已指定加工机器、固定时长和运行功率。我们需要同时决策每项作业的整数开始时间 starts[i] 与工作模式 modes[i]，不同模式在机外预准备时间 setupTimes 与机后冷却时间 postTimes 之间存在权衡。

作业必须等待预准备完成后才能启动；同一机器上的作业不得重叠；并行作业总功率不得超过 powerCap；前后序对 [u, v] 要求前驱作业的冷却阶段结束后后继作业才能启动；modeRules 规定了成对作业的兼容模式元组表。请最小化最大完工时间（makespan）。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `powerCap` | `number` | 全单元同时运行的最大允许功率上限 |
| `jobs` | `JobSpec[]` | 作业属性数组（`duration`, `power`, `machine`, `setupTimes`, `postTimes`） |
| `precedences` | `number[][]` | 需满足 `starts[u] + duration[u] + postTimes[u][modes[u]] <= starts[v]` 的前后序对 `[u, v]` |
| `modeRules` | `ModeRule[]` | 作业对 `{ jobs: [u, v], allowedPairs }` 的兼容模式二元组约束 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `starts` | `number[]` | 每项作业的整数启动时间 |
| `modes` | `number[]` | 每项作业选择的工作模式索引 |
| `makespan` | `number` | 最小化后的最大完工时间 `max(starts[i] + duration[i] + postTimes[i][modes[i]])` |

<!-- section:example -->
**输入示例**

```json
{
  "powerCap": 4,
  "jobs": [
    { "duration": 4, "power": 1, "machine": 0, "setupTimes": [0, 2], "postTimes": [2, 0] },
    { "duration": 4, "power": 2, "machine": 0, "setupTimes": [0, 2], "postTimes": [2, 0] },
    { "duration": 4, "power": 3, "machine": 1, "setupTimes": [0, 3], "postTimes": [3, 0] },
    { "duration": 2, "power": 2, "machine": 1, "setupTimes": [0, 2], "postTimes": [1, 0] }
  ],
  "precedences": [[0, 3], [1, 3]],
  "modeRules": [{ "jobs": [1, 2], "allowedPairs": [[0, 0], [1, 1]] }]
}
```

**输出示例**

```json
{
  "starts": [4, 0, 4, 9],
  "modes": [1, 0, 0, 1],
  "makespan": 11
}
```

作业 1（模式 `0`）在 `[0, 4)` 加工并于 `6` 完成冷却；之后机器 0 上的作业 0（模式 `1`，准备时间 `2 <= 4`）在 `[4, 8)` 与作业 2（模式 `0`，总功率 $1 + 3 = 4 \le 4$）并行，作业 2 冷却至 `11`，作业 3（模式 `1`）在 `[9, 11)` 完成，最大完工时间为 **11**。

<!-- section:hint1 -->
为每个作业定义两个整数决策变量：开始时间 `starts[i]` 与运行模式 `modes[i]`。将按模式索引的准备/后处理延迟、先后顺序、按机器的互斥执行、全局功率上限以及模式兼容表结合起来，最小化最大完工时间。

<!-- section:hint2 -->
使用 `at(j.setupTimes, modes[i])` 约束启动下界，并在先后约束和完工时间表达式中使用 `at(j.postTimes, modes[i])`。对每台机器的 `{ start: starts[i], duration: j.duration }` 施加 `disjoint(...)`，对全局功率施加带 `demand: j.power` 的 `cumulative(..., input.powerCap)`，并对每条模式规则施加 `allowed([modes[u], modes[v]], rule.allowedPairs)`，最后用 `solver: "pumpkin"` 求解。
