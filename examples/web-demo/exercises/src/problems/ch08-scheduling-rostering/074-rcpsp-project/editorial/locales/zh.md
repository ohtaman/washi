## 解题思路

记调度时间上界 $H = \sum_i d_i$，紧前关系有向边集合为 $E$。为每个任务定义有限整数开工变量 $S_i \in [0, H - d_i]$，对每条 $(u, v) \in E$ 添加 DAG 紧前不等式 $S_u + d_u \le S_v$，再用 Pumpkin 的全局累积约束 `cumulative(tasks, capacity)` 刻画每类可再生资源容量上限，最小化以 `max(...)` 表示的项目总工期。

## 数学模型

$$
\begin{aligned}
\min \quad & C_{\max} = \max_{i} (S_i + d_i) \\
\text{s.t.} \quad & S_u + d_u \le S_v && \forall (u, v) \in E \\
& \text{cumulative}\!\left(\left\{(S_i, d_i, q_{r,i}) \mid q_{r,i} > 0\right\},\, C_r\right) && \forall r \\
& S_i \in \{0, \dots, H - d_i\} && \forall i
\end{aligned}
$$

## 核心要点

- **与时间跨度无关的 CP `cumulative` 对比时间索引 MIP**：时间索引 MIP 需要引入 $O(n \cdot H)$ 个二进制变量 $x_{i,t}$ 及逐时刻容量约束，当时间粒度变细或跨度变大时规模急剧膨胀；而 CP 的 `cumulative` 仅需 $n$ 个整数开工变量即可完成时间表传播。
- **资源竞争拉长关键路径**：在示例中，忽略资源限制时的 DAG 最长链仅需 8，但任务 0、1、2、4 各自占用 2 单位资源 0，相对于容量 $C_0 = 3$ 有 $2 + 2 > 3$，因此这四项任务无法重叠，使总工期增至 $3 + 3 + 4 + 2 = 12$（需求为 1 的任务 3 则可与任务 2 并行）。
- **过滤零需求任务**：面对多类资源时仅将 `demand > 0` 的任务传入 `cumulative(...)`，可保持传播器精简高效。
- 概念参考：[指南与术语表 — 常见模型分类](?view=guide&lang=zh#paradigms) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

在 Pumpkin 求解器中声明整数开工时间变量，并注册 DAG 紧前约束与各资源的 `cumulative()` 约束。仅筛选需求量为正的任务传入，可使每项资源的约束保持简洁。

**WaSHI (TypeScript)**

```ts
const m = new Model("RcpspProjectCP", { solver: "pumpkin" });
const horizon = input.durations.reduce((a, b) => a + b, 0);
const starts = input.durations.map((d, i) =>
  m.integer(`s_${i}`, { lb: 0, ub: horizon - d })
);
m.constraint(
  input.precedences.map(([u, v]) => expr`${starts[u]} + ${input.durations[u]} <= ${starts[v]}`)
);
input.capacities.forEach((cap, r) => {
  const tasks = input.durations
    .map((duration, i) => ({ start: starts[i], duration, demand: input.demands[r][i] }))
    .filter((task) => task.demand > 0);
  if (tasks.length > 0) m.constraint(cumulative(tasks, cap), `resource_${r}`);
});
m.objective(minimize(max(starts.map((s, i) => expr`${s} + ${input.durations[i]}`))));
```
