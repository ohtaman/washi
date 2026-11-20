## 解题思路

将 0-1 启用开关 `active[i]` 与连续规模 `levels[i]` 绑定，利用紧上下界约束 `minLevels[i] * active[i] <= levels[i] <= maxLevels[i] * active[i]` 控制启用区间，把前提、合取与互斥规则全部线性化为 0-1 不等式后最大化净利润。

## 数学模型

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} \left( r_i x_i - F_i y_i \right) \\
\text{s.t.} \quad & L_i y_i \le x_i \le U_i y_i && \forall i \\
& \sum_{i=0}^{n-1} x_i \le B \\
& y_a \le y_b && \forall (a, b) \in \mathcal{P} \\
& y_a + y_b - 1 \le y_c && \forall (a, b, c) \in \mathcal{J} \\
& y_u + y_v \le 1 && \forall (u, v) \in \mathcal{C} \\
& x_i \ge 0,\; y_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## 核心要点

- **布尔逻辑条款的线性化公式**：蕴含 $y_a \implies y_b$ 写作 $y_a \le y_b$；合取触发 $(y_a \land y_b) \implies y_c$ 写作 $y_a + y_b - 1 \le y_c$（仅当 $y_a = y_b = 1$ 时强制 $y_c \ge 1$）；冲突互斥 $\neg(y_u \land y_v)$ 写作 $y_u + y_v \le 1$。
- **使用紧致区间替代过大的 Big-M**：直接采用设施自身的真实上下限 $L_i, U_i$ 而不是随意取极大常数，可显著收紧 LP 松弛并避免数值病态。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
m.constraint(
  levels.map((lvl, i) => expr`${input.minLevels[i]} * ${active[i]} <= ${lvl}`)
);
m.constraint(
  levels.map((lvl, i) => expr`${lvl} <= ${input.maxLevels[i]} * ${active[i]}`)
);
m.constraint(input.prerequisites.map(([a, b]) => expr`${active[a]} <= ${active[b]}`));
m.constraint(
  input.conjunctions.map(([a, b, c]) => expr`${active[a]} + ${active[b]} - 1 <= ${active[c]}`)
);
m.constraint(input.conflicts.map(([u, v]) => expr`${active[u]} + ${active[v]} <= 1`));
```

**PuLP (Python)**

```python
for i in range(n):
    prob += min_levels[i] * active[i] <= levels[i]
    prob += levels[i] <= max_levels[i] * active[i]
for a, b in prerequisites:
    prob += active[a] <= active[b]
for a, b, c in conjunctions:
    prob += active[a] + active[b] - 1 <= active[c]
for u, v in conflicts:
    prob += active[u] + active[v] <= 1
```
