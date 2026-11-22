## 解题思路

将二进制邀请标志 `invite[i]` 与连续礼金变量 `giftBudget[i]` 配对，施加紧凑的条件上下界 `minSpend[i] * invite[i] <= giftBudget[i] <= maxSpend[i] * invite[i]`，将每条逻辑规则转化为 `invite` 上的线性不等式，并在总预算约束下最大化总愉悦度。

## 数学模型

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} \left( e_i y_i + r_i g_i \right) \\
\text{s.t.} \quad & L_i y_i \le g_i \le U_i y_i && \forall i \\
& \sum_{i=0}^{n-1} g_i \le B \\
& y_a \le y_b && \forall (a, b) \in \mathcal{I} \\
& y_u + y_v \le 1 && \forall (u, v) \in \mathcal{C} \\
& \sum_{i \in G_r} y_i \ge k_r && \forall r \\
& g_i \ge 0,\; y_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## 关键要点

- **0-1 变量上的逻辑命题线性化**: 蕴含 $y_a \implies y_b$ 转化为 $y_a \le y_b$；冲突 $\neg(y_u \land y_v)$ 转化为 $y_u + y_v \le 1$；至少 $k$ 人分组约束转化为 $\sum_{i \in G_r} y_i \ge k_r$。
- **紧凑边界 Big-M 与任意大常数**: 使用精确消费上下界 $L_i y_i \le g_i \le U_i y_i$ 替代过大的任意 Big-M 常数，可避免 LP 松弛过弱和数值病态问题。
- 相关概念：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) 和 [问题类别](?view=guide&lang=zh#paradigms)。

## 核心实现

**WaSHI (TypeScript)**

```ts
m.constraint(giftBudget.map((g, i) => expr`${input.minSpend[i]} * ${invite[i]} <= ${g}`));
m.constraint(giftBudget.map((g, i) => expr`${g} <= ${input.maxSpend[i]} * ${invite[i]}`));
m.constraint(input.implications.map(([a, b]) => expr`${invite[a]} <= ${invite[b]}`));
m.constraint(input.conflicts.map(([u, v]) => expr`${invite[u]} + ${invite[v]} <= 1`));
m.constraint(
  input.groupRules.map((rule) => expr`${sum(rule.guests.map((i) => invite[i]))} >= ${rule.minCount}`)
);
```

**PuLP (Python)**

```python
for i in range(n):
    prob += min_spend[i] * invite[i] <= gift_budget[i]
    prob += gift_budget[i] <= max_spend[i] * invite[i]
for a, b in implications:
    prob += invite[a] <= invite[b]
for u, v in conflicts:
    prob += invite[u] + invite[v] <= 1
for rule in group_rules:
    prob += pulp.lpSum(invite[i] for i in rule["guests"]) >= rule["minCount"]
```
