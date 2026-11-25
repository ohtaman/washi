## 解题思路

每项作业仅声明两个有界整数变量（启动时间 `starts[i]` 与运行模式 `modes[i]`），借助 `at(...)` 查找模式对应的机外准备与后处理冷却时间，用 `disjoint(...)` 保障单机互斥、`cumulative(..., powerCap)` 限制全厂瞬时总功率、`allowed(...)` 约束成对模式兼容表，并最小化 `max(...)` 最大完工时间。

## 数学模型

$$
\begin{aligned}
\min \quad & C_{\max} = \max_{i} \big(s_i + d_i + \text{post}_{i, m_i}\big) \\
\text{s.t.} \quad & s_i \ge \text{setup}_{i, m_i} && \forall i \\
& s_u + d_u + \text{post}_{u, m_u} \le s_v && \forall (u, v) \in E_{\text{prec}} \\
& \text{Disjunctive}\big(\{(s_i, d_i) \mid \text{mach}_i = k\}\big) && \forall k \\
& \sum_{i:\, s_i \le t < s_i + d_i} p_i \le P_{\text{cap}} && \forall t \\
& (m_u, m_v) \in T_r && \forall r = (u, v, T_r) \in \mathcal{R}_{\text{mode}}
\end{aligned}
$$

## 核心要点

- **CP 与 MIP 建模对比**：若在 MIP 中表达同类综合调度，必须构建 $O(n \cdot H)$ 时隙 0-1 变量、模式选择 0-1 变量、模式表元组指示变量以及 $O(H)$ 行功率平衡约束；而在 WaSHI + Pumpkin 中，整套模型仅保持 $O(n)$ 整数变量，并让 `disjoint`、`cumulative`、`allowed`、`at` 四类原生传播器协同过滤搜索空间。
- **利用作业等待窗口吸收机外准备**：当作业因机器冲突或功率上限被迫延后启动时，可利用这段等待窗口切换为机外准备较长但后处理冷却为零的运行模式，从而压低最大完工时间——例如在输入示例中，作业 0 需等待机器 0 至 `starts[0] = 4` 才可启动，选用模式 1（`setup = 2`，`post = 0`）即可零额外代价消除后处理冷却延迟。
- 参考资料：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [常见优化问题类型](?view=guide&lang=zh#paradigms)

## 实现要点

组合使用 `at(..., modes[i])` 处理前段准备与先后约束、`disjoint(...)` 处理按机器的非重叠约束、`cumulative(..., input.powerCap)` 处理功率上限以及 `allowed(...)` 处理模式兼容表，最后用 `max(...)` 最小化包含后处理冷却的最大完工时间。

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
    input.jobs
      .map((j, i) => ({ start: starts[i], duration: j.duration, machine: j.machine }))
      .filter((t) => t.machine === mach)
      .map(({ start, duration }) => ({ start, duration }))
  )
    .filter((tasks) => tasks.length > 0)
    .map((tasks) => disjoint(tasks))
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
m.objective(
  minimize(
    max(
      input.jobs.map(
        (j, i) => expr`${starts[i]} + ${j.duration} + at(${j.postTimes}, ${modes[i]})`
      )
    )
  )
);
```
