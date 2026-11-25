# #040. 综合制造单元调度（CP 综合应用）

<!-- section:scenario -->
制造单元的进度管理员正在为多项加工作业制定调度计划。每项作业都已确定负责机器、加工时长（分钟）和运行功率（kW），需要同时决定其整数加工开始时间（分钟）和运行模式。不同运行模式在机外前段准备时间（分钟）与加工后的机外冷却及后处理时间（分钟）之间存在权衡。

调度方案必须满足以下所有条件：
- **前段准备完成**：所有作业的机外前段准备均可从时刻 0 并行开始（无需等待前置作业完成），每项作业必须在自身前段准备完成后才能开始加工。
- **同机非重叠**：同一台机器上的作业在加工区间内不能重叠（前后相邻作业可在端点相接）；机外前段准备与后处理不占用机器。
- **总功率上限**：同时处于加工状态的作业总功耗不得超过全厂上限（kW）；机外前段准备与后处理不消耗功率。
- **先后关系**：前置作业必须完成加工及机外后处理后，后续作业才能开始加工。
- **允许模式组合**：指定的作业对只能选用允许列表中的运行模式组合。

请最小化包含后处理在内的整体完工时间（makespan，分钟）。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `powerCap` | `number` | 全厂同时消耗功率的上限（kW） |
| `jobs` | `JobSpec[]` | 各作业的规格（`duration`, `power`, `machine`, `setupTimes`, `postTimes`） |
| `precedences` | `number[][]` | 要求 `starts[u] + jobs[u].duration + jobs[u].postTimes[modes[u]] <= starts[v]` 的从 `0` 开始的先后作业对 `[u, v]` |
| `modeRules` | `ModeRule[]` | 作业对 `{ jobs: [u, v], allowedPairs }` 的允许模式二元组表 |

类型定义：
- `JobSpec`: `{ duration: number, power: number, machine: number, setupTimes: number[], postTimes: number[] }`（时间单位为分钟，`power` 为 kW，`machine` 从 `0` 开始；`setupTimes[m]` 与 `postTimes[m]` 分别为模式 `m` 下的机外前段准备与后处理冷却时间，需满足 `starts[i] >= jobs[i].setupTimes[modes[i]]`）
- `ModeRule`: `{ jobs: [number, number], allowedPairs: number[][] }`（`jobs` 为从 `0` 开始的作业索引对 `[u, v]`，`allowedPairs` 的每个元素为 `[modes[u], modes[v]]` 所允许的 `[modeA, modeB]` 二元组）

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `starts` | `number[]` | 各作业的整数开始时间（分钟） |
| `modes` | `number[]` | 各作业从 `0` 开始的整数运行模式编号（`0 .. jobs[i].setupTimes.length - 1`） |
| `makespan` | `number` | 最小化后的最大完工时间 `max(starts[i] + jobs[i].duration + jobs[i].postTimes[modes[i]])`（分钟） |

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

作业 1（模式 0）在机器 0 上于 [0, 4) 加工并在时刻 4 释放机器 0，随后在机外于 [4, 6) 完成冷却后处理（时刻 6 完工）；机器 0 上的作业 0（模式 1，前段准备 $2 \le 4$）紧接着于 [4, 8) 加工，同时机器 1 上的作业 2（模式 0，允许组合 (0, 0)，并发功率 $1 + 3 = 4 \le 4$ kW）于 [4, 8) 加工并在机外于 [8, 11) 完成后处理；在前置作业 0 与 1 分别于时刻 8 和 6 完工后，作业 3（模式 1）在机器 1 上于 [9, 11) 加工，最大完工时间为 **11** 分钟。

<!-- section:hint1 -->
为每个作业定义两个整数决策变量：开始时间 `starts[i]` 与运行模式 `modes[i]`。将按模式索引的准备/后处理延迟、先后顺序、按机器的互斥执行、全局功率上限以及模式兼容表结合起来，最小化最大完工时间。

<!-- section:hint2 -->
使用 `at(j.setupTimes, modes[i])` 约束启动下界，并在先后约束和完工时间表达式中使用 `at(j.postTimes, modes[i])`。对每台机器的 `{ start: starts[i], duration: j.duration }` 施加 `disjoint(...)`，对全局功率施加带 `demand: j.power` 的 `cumulative(..., input.powerCap)`，并对每条模式规则施加 `allowed([modes[u], modes[v]], rule.allowedPairs)`，最后用 `solver: "pumpkin"` 求解。
