## 解题思路

用有界整数变量 `starts[i]`（范围 `[0, horizon - durations[i]]`）表示各项任务的开始时刻，加入有向无环图前后序不等式和全局累积资源约束 `cumulative(tasks, input.capacity)`，并最小化 `max(starts[i] + durations[i])`。

## 数学模型

$$
\begin{aligned}
\min \quad & C_{\max} = \max_{i} (s_i + d_i) \\
\text{s.t.} \quad & s_u + d_u \le s_v && \forall (u, v) \in E_{\text{prec}} \\
& \sum_{i:\, s_i \le t < s_i + d_i} q_i \le C && \forall t \in \{0, \dots, H - 1\} \\
& 0 \le s_i \le H - d_i, \quad s_i \in \mathbb{Z} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## 核心要点

- **时间域无关的 CP `cumulative()` vs. 时隙展开 MIP**：传统时隙离散化 MIP 需构造 $O(n \cdot H)$ 个 0-1 变量，时间刻度一细便急剧膨胀；而 CP 的 `cumulative()` 只需 $n$ 个整数变量并交由 Pumpkin 的时间表（Time-Table）传播器直接过滤。
- **与 `disjoint` 的联系**：当容量 `capacity = 1` 且各项需求均为 `1` 时，累计约束退化为可使用边缘推导的 `disjoint` 约束。
- 参考资料：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [常见优化问题类型](?view=guide&lang=zh#paradigms)

## 实现要点

将各作业的 `{ start, duration, demand }` 汇总并注册为一条 `cumulative(..., input.capacity)` 约束，随后最小化所有作业的最大完工时间。

**WaSHI (TypeScript)**

```ts
m.constraint(
  cumulative(
    starts.map((s, i) => ({
      start: s,
      duration: input.durations[i],
      demand: input.demands[i],
    })),
    input.capacity
  ),
  "resource_cap"
);
m.objective(minimize(max(starts.map((s, i) => expr`${s} + ${input.durations[i]}`))));
```
