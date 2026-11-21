# #098. 基于逻辑的 Benders 分解（MIP + Pumpkin CP）

<!-- section:scenario -->
制造车间需要将每个加工任务指派到恰好一台不相关并行机器上以最小化总指派成本。同时，分配到同一台机器上的所有任务必须互不重叠地完成排程，且每个任务都必须满足各自的最早释放时间、完工截止时间以及全局计划周期上限。

使用 WaSHI 多求解器协同实现基于逻辑的 Benders 分解（LBBD），将 HiGHS 指派主问题与 Pumpkin 约束规划调度子问题结合，返回最优机器指派、可行开始时间及最小总成本。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `costs` | `number[][]` | 将任务 $j$ 指派到机器 $m$ 的成本 `costs[j][m]` |
| `durations` | `number[]` | 任务 $j$ 的整数加工时长 |
| `releaseTimes` | `number[]` | 任务 $j$ 允许的最早整数开始时间 |
| `deadlines` | `number[]` | 任务 $j$ 允许的最晚整数完工时间 |
| `horizon` | `number` | 全局最大完工时间上限 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `assignments` | `number[]` | 各任务 $j$ 指派到的机器编号 $m \in \{0, \dots, M-1\}$ |
| `starts` | `number[]` | 满足时间窗与无重叠要求的一组整数开始时间 $s_j$ |
| `totalCost` | `number` | 最小总指派成本 $\sum_j \text{costs}[j][\text{assignments}[j]]$ |

<!-- section:example -->
**输入示例**

```json
{
  "costs": [
    [10, 25],
    [12, 26],
    [30, 15],
    [28, 14]
  ],
  "durations": [4, 4, 3, 3],
  "releaseTimes": [0, 1, 2, 5],
  "deadlines": [6, 7, 10, 10],
  "horizon": 10
}
```

**输出示例**

```json
{
  "assignments": [1, 0, 1, 1],
  "starts": [0, 2, 4, 7],
  "totalCost": 66
}
```

任务 `0` 与 `1` 在机器 `0` 上的指派成本最低（`10 + 12`），但时间窗 `[0, 6]` 与 `[1, 7]` 使两者无法共享机器 `0`。将任务 `0` 移至机器 `1` 后可排入 `[2, 6]` 与 `[0, 4], [4, 7], [7, 10]`，总成本为最优值 **66**。

<!-- section:hint1 -->
主问题 MIP 仅包含二元任务指派变量，确保每个任务被分配到一台机器并最小化总指派成本。所有时间窗与无重叠调度校验均通过 `master.solveBenders(...)` 交由每台机器独立的 CP 子问题完成。

<!-- section:hint2 -->
对每台机器 $m$ 的已指派任务集合 $S_m$，构建整数开始时间 $s_j \in [\text{releaseTimes}[j], \min(\text{deadlines}[j], \text{horizon}) - \text{durations}[j]]$ 与 `disjoint(...)` 约束的 Pumpkin CP 模型并调用 `await sub.check({ solver: "pumpkin" })`。若返回 `Unsat`，可通过贪心删减将 $S_m$ 缩减为极小不可行子集 $K$，再向主问题返回禁止割 $\sum_{j \in K} x_{jm} \le |K| - 1$。
