## Approach

Pair each continuous quantity `quantities[i]` with a binary indicator `active[i]`, enforce the two-sided linking inequalities `minBatches[i] * active[i] <= quantities[i] <= maxBatches[i] * active[i]`, and maximize total profit margin subject to the shared resource cap.

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

- **Why a simple `lb` fails for semi-continuous domains**: Setting `lb: L_i` directly on `q_i` forces every product to be active at all times (`q_i >= L_i`), even when shutting a product off (`q_i = 0`) is needed to save scarce resource capacity.
- **Two-sided Big-M gating**: Writing $L_i y_i \le q_i \le U_i y_i$ makes $y_i = 0 \implies 0 \le q_i \le 0 \implies q_i = 0$, while $y_i = 1 \implies L_i \le q_i \le U_i$. Leaving out the lower inequality allows illegal fractional production strictly inside $(0, L_i)$.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

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
