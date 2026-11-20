## 解题思路

为每项任务声明有界整数开始时间变量 `starts[i]`（范围为 `[releaseTimes[i], horizon - durations[i]]`），添加前后序不等式并按机器分组施加 `disjoint(tasks)` 全局约束，最后最小化 `max(starts[i] + durations[i])`。

## 数学模型

$$
\begin{aligned}
\min \quad & C_{\max} = \max_{i} (s_i + d_i) \\
\text{s.t.} \quad & s_u + d_u \le s_v && \forall (u, v) \in E_{\text{prec}} \\
& \text{Disjunctive}\big(\{(s_i, d_i) \mid m_i = k\}\big) && \forall k \in \{0, \dots, M-1\} \\
& r_i \le s_i \le H - d_i, \quad s_i \in \mathbb{Z} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## 核心要点

- **边缘推导（Edge-finding）vs. Big-M 两两拆解**：相比于在 MIP 中为每对同机任务引入二元顺序变量与 Big-M 不等式，`disjoint(tasks)` 直接调用 Pumpkin 原生的 `disjunctive_strict` 传播器进行整体区间推演，域收窄更紧致。
- **紧凑的有限时间域**：取 `horizon = max(releaseTimes) + sum(durations)` 作为上界，既保证不剪掉任何有效串行调度，又为 Pumpkin 提供了紧致的整数域范围。
- 参考资料：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [常见优化问题类型](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
const numMachines = Math.max(...input.machines) + 1;
m.constraint(
  Array.from({ length: numMachines }, (_, mach) =>
    disjoint(
      starts
        .map((s, i) => ({ start: s, duration: input.durations[i], mach: input.machines[i] }))
        .filter((t) => t.mach === mach)
        .map(({ start, duration }) => ({ start, duration }))
    )
  )
);
m.objective(minimize(max(starts.map((s, i) => expr`${s} + ${input.durations[i]}`))));
```
