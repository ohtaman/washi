## Approach

Pair binary activation flags `active[i]` with continuous levels `levels[i]`, apply tight semi-continuous bounds `minLevels[i] * active[i] <= levels[i] <= maxLevels[i] * active[i]`, translate each logical clause into a linear inequality on `active`, and maximize net profit within the total budget.

## Mathematical Model

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

## Key Points

- **Linearizing propositional clauses over 0-1 variables**: Implication $y_a \implies y_b$ becomes $y_a \le y_b$; conjunction $(y_a \land y_b) \implies y_c$ becomes $y_a + y_b - 1 \le y_c$ (active only when $y_a = y_b = 1$, forcing $y_c \ge 1$); conflict $\neg(y_u \land y_v)$ becomes $y_u + y_v \le 1$.
- **Tight domain-bound Big-M vs. arbitrary large constants**: Gating $x_i$ with its exact operating bounds $L_i y_i \le x_i \le U_i y_i$ avoids weak LP relaxations and numerical ill-conditioning caused by oversized Big-M values.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

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
