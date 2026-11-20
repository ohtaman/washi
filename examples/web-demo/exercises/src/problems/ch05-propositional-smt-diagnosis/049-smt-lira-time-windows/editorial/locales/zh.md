## 解题思路

联合声明布尔模式变量 `express[i]`（`m.bool`）、0-1 计数变量 `expFlag[i]`（`m.binary`）与连续实数时间变量 `start[i]`、`end[i]`、`tardy[i]`（`m.continuous`）。利用 `implies(...)` 分模式绑定时间窗与小数作业时长，利用 `or(...)` 表达禁停窗避让与单泊位析取非重叠约束，最后通过 `await m.solve({ solver: "z3" })` 求最小总成本。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \left( F_i^{\text{exp}}\, e_i + p_i\, \tau_i \right) \\
\text{s.t.} \quad & x_i \iff (e_i = 1) && \forall i \\
& \neg x_i \implies \bigl(w^{\text{std}}_{i,0} \le s_i,\; c_i = s_i + d_i^{\text{std}},\; c_i \le w^{\text{std}}_{i,1}\bigr) && \forall i \\
& x_i \implies \bigl(w^{\text{exp}}_{i,0} \le s_i,\; c_i = s_i + d_i^{\text{exp}},\; c_i \le w^{\text{exp}}_{i,1}\bigr) && \forall i \\
& (c_i \le b_0) \lor (s_i \ge b_1) && \forall i \\
& (c_i \le s_j) \lor (c_j \le s_i) && \forall i < j \\
& \sum_{i=0}^{n-1} e_i \le K_{\max}, \quad \tau_i \ge c_i - D_i \\
& x_i \in \{\text{false}, \text{true}\},\quad e_i \in \{0, 1\},\quad s_i, c_i, \tau_i \ge 0 && \forall i
\end{aligned}
$$

## 核心要点

- **无需 Big-M 的 SMT-LIRA 建模**：传统 MIP 在处理连续实数时间窗切换与析取非重叠时往往依赖经验大 $M$，而 Z3 可直接在 `implies` 与 `or` 内部精确推理实数线性不等式。
- **逻辑、整数与实数的统一求解**：将 `BoolVar` 与 `Binary` 联动后，可以在同一模型中同时表达整数加急配额与连续实数延误成本。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
m.constraint(
  implies(express[i], and(expr`${start[i]} >= ${spec.expWindow[0]}`, expr`${end[i]} == ${start[i]} + ${spec.expDuration}`, expr`${end[i]} <= ${spec.expWindow[1]}`)),
  `exp_mode_${i}`
);
m.constraint(or(expr`${end[i]} <= ${input.blackout[0]}`, expr`${start[i]} >= ${input.blackout[1]}`), `blackout_${i}`);
m.constraint(or(expr`${end[i]} <= ${start[j]}`, expr`${end[j]} <= ${start[i]}`), `dock_${i}_${j}`);
```
