## 解题思路

为每位宾客 $i$ 配对二进制邀请变量 $y_i$（`invite[i]`）与连续礼物预算变量 $g_i$（`giftBudget[i]`），并利用 `minSpend`（$L_i$）和 `maxSpend`（$U_i$）施加紧凑的条件上下界 $L_i y_i \le g_i \le U_i y_i$。在总预算 $B$（`budget`）限制下，将 `implications`（$\mathcal{I}$）、`conflicts`（$\mathcal{C}$）与 `groupRules`（$(G_r, k_r)$）转化为 $y_i$ 上的线性不等式，最大化由 `baseEnjoyment`（$e_i$）和 `bonusRates`（$r_i$）决定的总愉悦度。

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

将每位宾客的礼物预算与邀请标志通过上下界关联，并将蕴含、冲突和分组下限规则依次作为 `invite` 变量上的线性不等式加入模型。

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
