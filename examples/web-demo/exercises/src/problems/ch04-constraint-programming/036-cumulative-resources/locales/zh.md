# #036. 资源受限项目调度（cumulative 全局约束）

<!-- section:scenario -->
某项目包含 n 项不可中断的任务，它们共享上限为 capacity 的可再生资源池（如电力或人力）。每项任务 i 持续时长 durations[i]，并在运行期间持续占用 demands[i] 单位资源。

每个前后序约束 [u, v] 要求任务 u 完工后任务 v 才能启动，且任意时刻正在运行的任务资源需求之和不得超过 capacity。请为各项任务安排非负整数开始时间 starts[i] 以最小化最大完工时间。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `capacity` | `number` | 共享可再生资源的总容量上限 |
| `durations` | `number[]` | 每项任务的整数持续时长 |
| `demands` | `number[]` | 每项任务在执行期间占用的资源需求量 |
| `precedences` | `number[][]` | 需满足 `starts[u] + durations[u] <= starts[v]` 的前后序对 `[u, v]` |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `starts` | `number[]` | 每项任务的非负整数开始时间 |
| `makespan` | `number` | 最小化后的最大完工时间 `max(starts[i] + durations[i])` |

<!-- section:example -->
**输入示例**

```json
{
  "capacity": 3,
  "durations": [4, 3, 3, 2],
  "demands": [2, 2, 1, 2],
  "precedences": [
    [0, 3],
    [1, 3]
  ]
}
```

**输出示例**

```json
{
  "starts": [0, 4, 0, 7],
  "makespan": 9
}
```

任务 0 与任务 2 在 `[0, 3)` 并行占用 $2 + 1 = 3 \le 3$ 单位资源；任务 0 释放资源后任务 1 在 `[4, 7)` 执行；任务 3 在前置任务 0 和 1 均结束后于 `[7, 9)` 执行，总完工时间为 **9**。

<!-- section:hint1 -->
为每个任务定义一个取值在 `[0, horizon - durations[i]]` 的整数开始时间变量。除任务间的先后顺序约束外，对所有任务施加一个累计资源全局约束，并最小化总完工时间。

<!-- section:hint2 -->
将所有任务的 `{ start: starts[i], duration: input.durations[i], demand: input.demands[i] }` 传入 `cumulative(tasks, input.capacity)`。以 `minimize(max(starts.map((s, i) => expr\`${s} + ${input.durations[i]}\`)))` 为目标并用 `solver: "pumpkin"` 求解。
