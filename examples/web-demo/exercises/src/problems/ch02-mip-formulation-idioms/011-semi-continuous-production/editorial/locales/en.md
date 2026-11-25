## Approach

Pair each style's continuous brewing quantity `quantities[i]` with a 0-1 brewing indicator `active[i]`, enforce the two-sided linking inequalities `minBatches[i] * active[i] <= quantities[i] <= maxBatches[i] * active[i]`, and maximize total gross margin subject to the shared malt stock limit.

## Mathematical Model

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} m_i q_i \\
\text{s.t.} \quad & L_i y_i \le q_i \le U_i y_i && \forall i \in \{0, \dots, n-1\} \\
& \sum_{i=0}^{n-1} a_i q_i \le R \\
& q_i \ge 0,\; y_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## Key Points

- **Why a simple `lb` fails**: Setting `lb` to $L_i$ directly on $q_i$ forces $q_i \ge L_i$ at all times, preventing the brewery from skipping a style ($q_i = 0$) to save malt for another style.
- **Two-sided linking constraints (semi-continuous variables)**: Writing $L_i y_i \le q_i \le U_i y_i$ gives $0 \le q_i \le 0$ (skip) when $y_i = 0$, and $L_i \le q_i \le U_i$ (at least the minimum batch) when $y_i = 1$. Omitting the lower inequality allows invalid small batches in $(0, L_i)$.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Sandwich each style's continuous variable `quantities[i]` between the minimum batch size and maximum tank capacity multiplied by the binary variable `active[i]`, expressing the semi-continuous property with two linear inequalities.

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
