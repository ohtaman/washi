# #036. 资源受限项目调度（cumulative 全局约束）

<!-- section:scenario -->
建设项目的进度管理员正在带有上限容量的共享可再生资源（如作业人员、供电设备等）条件下，制定多项不中断作业的调度计划。每项作业都设有处理时间（小时）以及运行期间持续消耗的资源量（单位）。

请确定非负整数开始时间，使存在先后约束的作业组满足前道作业完成后再开始后继作业，且在任意时刻同时运行的作业总资源消耗量不超过上限容量，从而最小化整体完工时间（makespan，小时）。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `capacity` | `number` | 共享可再生资源的上限容量（整数） |
| `durations` | `number[]` | 各作业的处理时间（整数，小时） |
| `demands` | `number[]` | 各作业运行期间的资源消耗量（整数） |
| `precedences` | `number[][]` | 从 0 开始的先后顺序作业对 `[u, v]` 列表（作业 `u` 完成后才能开始作业 `v`） |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `starts` | `number[]` | 各作业的非负整数开始时间（小时） |
| `makespan` | `number` | 最小化后的最大完工时间（小时） |

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

在时段 [0, 3) 内，作业 0 与作业 2 并行消耗 $2 + 1 = 3 \le 3$ 单位资源；作业 0 结束后作业 1 在 [4, 7) 运行；前置作业 0 和 1 均完成后作业 3 在 [7, 9) 执行。最大完工时间为 $\max(0 + 4, 4 + 3, 0 + 3, 7 + 2) = \max(4, 7, 3, 9) =$ **9** 小时。

<!-- section:hint1 -->
为每个任务定义一个取值在 `[0, horizon - durations[i]]` 的整数开始时间变量。除任务间的先后顺序约束外，对所有任务施加一个累计资源全局约束，并最小化最大完工时间。

<!-- section:hint2 -->
将所有任务的 `{ start: starts[i], duration: input.durations[i], demand: input.demands[i] }` 传入 `cumulative(tasks, input.capacity)`。以 ``minimize(max(starts.map((s, i) => expr`${s} + ${input.durations[i]}`)))`` 为目标并用 `solver: "pumpkin"` 求解。
