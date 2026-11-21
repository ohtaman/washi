# #035. 互斥机器调度（disjoint 全局约束）

<!-- section:scenario -->
某车间需要不中断地执行 n 项任务。每项任务 i 拥有固定加工时长 durations[i]、最早释放时间 releaseTimes[i] 以及指定的加工机器 machines[i]。

分配在同一台机器上的任务执行时间段不得重叠，并且对于每个前后序约束 [u, v]，任务 u 必须完工后任务 v 才能开始。请为每项任务安排整数开始时间 starts[i]，以最小化最大完工时间（makespan）。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `durations` | `number[]` | 每项任务的整数加工时长 |
| `releaseTimes` | `number[]` | 每项任务允许的最早开始时间 |
| `machines` | `number[]` | 每项任务所属的机器编号（`0..M-1`） |
| `precedences` | `number[][]` | 需满足 `starts[u] + durations[u] <= starts[v]` 的前后序对 `[u, v]` |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `starts` | `number[]` | 每项任务的整数开始时间 |
| `makespan` | `number` | 最小化后的最大完工时间 `max(starts[i] + durations[i])` |

<!-- section:example -->
**输入示例**

```json
{
  "durations": [4, 3, 5, 2],
  "releaseTimes": [0, 2, 0, 4],
  "machines": [0, 0, 0, 0],
  "precedences": [
    [0, 3]
  ]
}
```

**输出示例**

```json
{
  "starts": [0, 6, 9, 4],
  "makespan": 14
}
```

机器 0 依次无重叠地执行任务 0 `[0, 4)`、任务 3 `[4, 6)`、任务 1 `[6, 9)` 和任务 2 `[9, 14)`，同时满足释放时间与先后约束 `0 -> 3`，总完工时间为 **14**。

<!-- section:hint1 -->
为每个任务定义一个下界为释放时间、上界为 `horizon - durations[i]` 的整数开始时间变量。除先后约束外，按所属机器对任务分组，并对每台机器施加不重叠析取约束。

<!-- section:hint2 -->
对每台机器收集其任务列表 `{ start: starts[i], duration: input.durations[i] }`，若非空则施加 `disjoint(tasks)` 约束。以 `minimize(max(starts.map((s, i) => expr\`${s} + ${input.durations[i]}\`)))` 为目标，并通过 `solver: "pumpkin"` 求解。
