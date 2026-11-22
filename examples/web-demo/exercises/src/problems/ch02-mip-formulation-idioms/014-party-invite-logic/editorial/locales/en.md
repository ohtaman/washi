## Approach

Pair binary invitation flags `invite[i]` with continuous gift allocations `giftBudget[i]`, apply tight conditional bounds `minSpend[i] * invite[i] <= giftBudget[i] <= maxSpend[i] * invite[i]`, translate each logical rule into a linear inequality on `invite`, and maximize total enjoyment within the party budget.

## Mathematical Model

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

## Key Points

- **Linearizing propositional clauses over 0-1 variables**: Implication $y_a \implies y_b$ becomes $y_a \le y_b$; conflict $\neg(y_u \land y_v)$ becomes $y_u + y_v \le 1$; and an at-least-$k$ group quota becomes $\sum_{i \in G_r} y_i \ge k_r$.
- **Tight domain-bound Big-M vs. arbitrary large constants**: Gating $g_i$ with its exact spending bounds $L_i y_i \le g_i \le U_i y_i$ avoids weak LP relaxations and numerical ill-conditioning caused by oversized Big-M values.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

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
