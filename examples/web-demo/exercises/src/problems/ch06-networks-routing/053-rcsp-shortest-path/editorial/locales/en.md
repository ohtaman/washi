## Approach

Introduce a binary decision variable `x[e]` for each directed arc, enforce unit s-to-t flow conservation at every node, add the knapsack-style resource inequality $\sum_e r_e x_e \le R$, and minimize total path cost $\sum_e c_e x_e$.

## Mathematical Model

$$
\begin{aligned}
\min_{x \in \{0,1\}^{|E|}} \quad & \sum_{e \in E} c_e x_e \\
\text{s.t.} \quad & \sum_{e=(v, w)} x_e - \sum_{e=(u, v)} x_e = \begin{cases} 1 & v = s \\ -1 & v = t \\ 0 & \text{otherwise} \end{cases} && \forall v \in V \\
& \sum_{e \in E} r_e x_e \le R
\end{aligned}
$$

## Key Points

- **Why binary variables are required**: While unconstrained shortest path is totally unimodular (integral under LP), adding a single side constraint ($\sum_e r_e x_e \le R$) breaks total unimodularity—an LP relaxation can split flow fractionally between a cheap resource-heavy path and a costlier resource-light path.
- **Cycle-freeness**: With strictly positive arc costs ($c_e > 0$), minimizing cost automatically excludes isolated cycles alongside the s-to-t path.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
for (let v = 0; v < input.nodeCount; v++) {
  const rhs = v === input.source ? 1 : v === input.sink ? -1 : 0;
  const outVars = x.filter((_, i) => input.edges[i].from === v);
  const inVars = x.filter((_, i) => input.edges[i].to === v);
  m.constraint(expr`${sum(outVars)} - ${sum(inVars)} == ${rhs}`);
}
m.constraint(
  expr`${sum(x.map((v, i) => expr`${input.edges[i].resource} * ${v}`))} <= ${input.maxResource}`
);
```

**PuLP (Python)**

```python
for v in range(n):
    rhs = 1 if v == s else (-1 if v == t else 0)
    out_x = pulp.lpSum(x[i] for i, e in enumerate(edges) if e["from"] == v)
    in_x = pulp.lpSum(x[i] for i, e in enumerate(edges) if e["to"] == v)
    prob += out_x - in_x == rhs
prob += pulp.lpSum(e["resource"] * x[i] for i, e in enumerate(edges)) <= max_r
```
