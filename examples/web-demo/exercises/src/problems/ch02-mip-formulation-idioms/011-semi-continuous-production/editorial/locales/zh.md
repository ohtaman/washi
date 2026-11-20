## 解题思路

为每个连续产量变量 `quantities[i]` 配对一个 0-1 启停变量 `active[i]`，建立双向关联不等式 `minBatches[i] * active[i] <= quantities[i] <= maxBatches[i] * active[i]`，并在共享资源上限下最大化总利润。

## 数学模型

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} m_i q_i \\
\text{s.t.} \quad & L_i y_i \le q_i \le U_i y_i && \forall i \in \{0, \dots, n-1\} \\
& \sum_{i=0}^{n-1} a_i q_i \le R \\
& q_i \ge 0,\; y_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## 核心要点

- **为何不能直接把变量下界设为 `lb: L_i`**：若直接在变量上指定 `lb: L_i`，将强制所有产品必须至少生产 $L_i$，无法取 $0$ 以腾出宝贵资源给更优组合。
- **双向开关约束（半连续变量）**：写成 $L_i y_i \le q_i \le U_i y_i$ 时，当 $y_i = 0$ 强制 $q_i = 0$，当 $y_i = 1$ 则要求 $L_i \le q_i \le U_i$；若遗漏左侧下界关联约束，就会出现落在 $(0, L_i)$ 内的违规小批量。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
m.constraint(
  quantities.map((qty, i) => expr`${input.minBatches[i]} * ${active[i]} <= ${qty}`)
);
m.constraint(
  quantities.map((qty, i) => expr`${qty} <= ${input.maxBatches[i]} * ${active[i]}`)
);
```

**PuLP (Python)**

```python
for i in range(n):
    prob += min_batches[i] * active[i] <= quantities[i]
    prob += quantities[i] <= max_batches[i] * active[i]
prob += pulp.lpDot(usages, quantities) <= cap
```
