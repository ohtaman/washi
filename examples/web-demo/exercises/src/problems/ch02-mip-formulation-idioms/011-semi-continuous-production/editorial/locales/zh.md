## 解题思路

为各品种的连续酿造量 `quantities[i]` 配对一个 0-1 酿造变量 `active[i]`，施加双向关联不等式 `minBatches[i] * active[i] <= quantities[i] <= maxBatches[i] * active[i]`，并在共用麦芽库存上限下最大化总毛利润。

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

- **为何不能只用简单的下界 `lb`**：若直接在变量声明中将下界 `lb` 设为 $L_i$，将强制要求“始终 $q_i \ge L_i$”，从而无法为了节省麦芽而把某个品种设为 0 并把资源让给其他品种。
- **双向关联约束（半连续变量）**：写成 $L_i y_i \le q_i \le U_i y_i$ 后，当 $y_i = 0$ 时得到 $0 \le q_i \le 0$（放弃酿造），当 $y_i = 1$ 时得到 $L_i \le q_i \le U_i$（不低于最小批量）。如果漏掉下界约束，就会出现处于区间 $(0, L_i)$ 内的违规小批量酿造。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

用乘以二元变量 `active[i]` 的最小批量和最大发酵罐容量从上下两侧夹住各品种的连续变量 `quantities[i]`，以两条线性不等式表达半连续变量性质。

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
```
