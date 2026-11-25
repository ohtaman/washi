## 解题思路

每项作业仅声明两个有界整数变量（启动时间 `starts[i]` 与工作模式 `modes[i]`），借助 `at(...)` 查找模式对应的机外准备与冷却时间，用 `disjoint(...)` 保障单机互斥、`cumulative(..., powerCap)` 限制全厂瞬时总功率、`allowed(...)` 约束成对模式兼容表，并最小化 `max(...)` 完工时间。

## 数学模型

记作业数为 $n = |\text{jobs}|$，作业 $i$ 的运行模式数为 $M_i = |\text{jobs}[i].\text{setupTimes}|$：

$$
\begin{aligned}
\min \quad & C_{\max} = \max_{i} \big(s_i + d_i + \text{post}_{i, m_i}\big) \\
\text{s.t.} \quad & s_i \ge \text{setup}_{i, m_i} && \forall i \in \{0, \dots, n - 1\} \\
& s_u + d_u + \text{post}_{u, m_u} \le s_v && \forall (u, v) \in E_{\text{prec}} \\
& \text{Disjunctive}\big(\{(s_i, d_i) \mid \text{mach}_i = k\}\big) && \forall k \\
& \sum_{i:\, s_i \le t < s_i + d_i} p_i \le P_{\text{cap}} && \forall t \in \mathbb{Z}_{\ge 0} \\
& (m_u, m_v) \in T_r && \forall r = (u, v, T_r) \in \mathcal{R}_{\text{mode}} \\
& s_i \in \mathbb{Z}_{\ge 0}, \quad m_i \in \{0, \dots, M_i - 1\} && \forall i \in \{0, \dots, n - 1\}
\end{aligned}
$$

## 核心要点

- **CP 与 MIP 建模对比**：对于包含 $n$ 项作业、调度时间范围为 $H$ 的问题，标准的时间索引 MIP 建模需要 $O(n \cdot H)$ 个时隙 0-1 变量 $x_{i,t}$、模式选择 0-1 变量 $z_{i,m}$、模式表元组指示变量以及 $O(H)$ 行功率上限约束；而在 WaSHI + Pumpkin 中，整套模型仅保持 $O(n)$ 整数变量，并让 `disjoint`、`cumulative`、`allowed`、`at` 四类原生全局传播器协同工作。
- **利用机器空闲窗口吸收预准备**：当作业因机器冲突或功率上限被迫延后启动时，可利用这段空闲等待时间切换为预准备较长（`setup = 2, 3`）但机后冷却为零（`post = 0`）的高效模式，从而压低最大完工时间。
- 参考资料：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [常见优化问题类型](?view=guide&lang=zh#paradigms)

## 实现要点

组合使用 `at(..., modes[i])` 处理前段准备与先后约束、`disjoint(...)` 处理按机器的非重叠约束、`cumulative(..., input.powerCap)` 处理功率上限以及 `allowed(...)` 处理模式兼容表并注册约束。

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.jobs.map((j, i) => expr`${starts[i]} >= at(${j.setupTimes}, ${modes[i]})`)
);
m.constraint(
  input.precedences.map(
    ([u, v]) =>
      expr`${starts[u]} + ${input.jobs[u].duration} + at(${input.jobs[u].postTimes}, ${modes[u]}) <= ${starts[v]}`
  )
);
m.constraint(
  Array.from({ length: numMachines }, (_, mach) =>
    disjoint(
      input.jobs
        .map((j, i) => ({ start: starts[i], duration: j.duration, machine: j.machine }))
        .filter((t) => t.machine === mach)
        .map(({ start, duration }) => ({ start, duration }))
    )
  )
);
m.constraint(
  cumulative(
    input.jobs.map((j, i) => ({ start: starts[i], duration: j.duration, demand: j.power })),
    input.powerCap
  )
);
m.constraint(
  input.modeRules.map((r) => allowed([modes[r.jobs[0]], modes[r.jobs[1]]], r.allowedPairs))
);
```
