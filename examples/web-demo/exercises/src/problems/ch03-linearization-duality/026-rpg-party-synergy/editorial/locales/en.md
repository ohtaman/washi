## Approach

Introduce an auxiliary variable $w_k \in [0, 1]$ for each hero pair $(i_k, j_k)$ representing the binary product $x_{i_k} x_{j_k}$. Enforce the budget cap, the party-size cap, and all three McCormick inequalities ($w_k \le x_{i_k}$, $w_k \le x_{j_k}$, and $w_k \ge x_{i_k} + x_{j_k} - 1$) so both positive synergy bonuses and negative rivalry penalties remain exact.

## Mathematical Model

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} p_i x_i + \sum_{k=0}^{P-1} s_k w_k \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} c_i x_i \le B \\
& \sum_{i=0}^{n-1} x_i \le K \\
& w_k \le x_{i_k}, \quad w_k \le x_{j_k}, \quad w_k \ge x_{i_k} + x_{j_k} - 1 && \forall k \in \{0, \dots, P-1\} \\
& x_i \in \{0, 1\}, \quad 0 \le w_k \le 1 && \forall i, k
\end{aligned}
$$

## Key Points

- **Why all three inequalities are essential when $s_k$ has mixed signs**: For synergy pairs ($s_k > 0$), maximization pushes $w_k$ up, so $w_k \le x_{i_k}$ and $w_k \le x_{j_k}$ prevent claiming a combo bonus unless both heroes are recruited. For rival pairs ($s_k < 0$), maximization pushes $w_k$ down, so omitting $w_k \ge x_{i_k} + x_{j_k} - 1$ lets the solver set $w_k = 0$ even when $x_{i_k} = x_{j_k} = 1$, dodging the penalty!
- **Automatic integrality of $w_k$**: Because $x_{i_k}, x_{j_k} \in \{0, 1\}$, the three inequalities and $0 \le w_k \le 1$ force $w_k \in \{0, 1\}$ even when $w_k$ is declared continuous.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(expr`dot(${input.costs}, ${selected}) <= ${input.budget}`, "budget");
m.constraint(expr`sum(${selected}) <= ${input.maxPartySize}`, "party_size");
m.constraint(
  input.pairs.flatMap(([i, j], k) => [
    expr`${pairProducts[k]} <= ${selected[i]}`,
    expr`${pairProducts[k]} <= ${selected[j]}`,
    expr`${pairProducts[k]} >= ${selected[i]} + ${selected[j]} - 1`,
  ])
);
```

**PuLP (Python)**

```python
prob += pulp.lpDot(costs, selected) <= budget
prob += pulp.lpSum(selected) <= max_party_size
for k, (i, j, _) in enumerate(pairs):
    prob += pair_products[k] <= selected[i]
    prob += pair_products[k] <= selected[j]
    prob += pair_products[k] >= selected[i] + selected[j] - 1
```
