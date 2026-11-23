# #098. 基于逻辑的 Benders 分解（MIP + Pumpkin CP）

<!-- section:scenario -->
在汽车零部件加工厂中，需要将车削、铣削、磨削等各道加工工序（任务）分配到多台专用加工机中的某一台上，目标是最小化各加工机的指派成本总和。分配到同一台加工机上的工序集合必须按时间（单位：分钟）互不重叠地依次加工，且所有工序均须满足各自的可开始时间、完工期限以及全局计划周期上限。

请使用 WaSHI 多求解器协同的基于逻辑的 Benders 分解（LBBD），将 HiGHS 指派主问题与 Pumpkin CP 调度子问题结合，返回最优加工机指派、可行开始时间以及最小总成本。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `costs` | `number[][]` | 将工序 $j$ 指派到加工机 $m$ 的成本 `costs[j][m]` |
| `durations` | `number[]` | 工序 $j$ 的加工时间（分钟，整数） |
| `releaseTimes` | `number[]` | 工序 $j$ 允许开始的最早时间（分钟） |
| `deadlines` | `number[]` | 工序 $j$ 的完工截止时间（分钟） |
| `horizon` | `number` | 所有加工机共用的计划周期上限（分钟） |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `assignments` | `number[]` | 为各工序 $j$ 指派的加工机编号 $m \in \{0, \dots, M-1\}$ |
| `starts` | `number[]` | 满足时间窗与非重叠约束的各工序整数开始时间 $s_j$ |
| `totalCost` | `number` | 指派成本总和 $\sum_j \text{costs}[j][\text{assignments}[j]]$ |

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

工序 0 与 1 在加工机 0 上更便宜，但同时放在加工机 0 上无法兼顾时间窗 `[0, 6]` 与 `[1, 7]`。将工序 0 指派给加工机 1 后各加工机的作业区间互不重叠（加工机 0 为 `[2, 6]`，加工机 1 为 `[0, 4]`、`[4, 7]`、`[7, 10]`），总成本为 $25 + 12 + 15 + 14 =$ **66**。

<!-- section:hint1 -->
主问题 MIP 仅包含二元任务指派变量，确保每个任务被分配到一台机器并最小化总指派成本。所有时间窗与无重叠调度校验均通过 `master.solveBenders(...)` 交由每台机器独立的 CP 子问题完成。

<!-- section:hint2 -->
对每台机器 $m$ 的已指派任务集合 $S_m$，构建整数开始时间 $s_j \in [\text{releaseTimes}[j], \min(\text{deadlines}[j], \text{horizon}) - \text{durations}[j]]$ 与 `disjoint(...)` 约束的 Pumpkin CP 模型并调用 `await sub.check({ solver: "pumpkin" })`。若返回 `Unsat`，可通过贪心删减将 $S_m$ 缩减为极小不可行子集 $K$，再向主问题返回禁止割 $\sum_{j \in K} x_{jm} \le |K| - 1$。
