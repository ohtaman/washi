## Approach

Declare an $S \times D$ matrix of non-negative continuous shipment variables (`shipments[i][j]`), enforce warehouse supply caps (`sum(row) <= supplies[i]`) and store demand floors (`sum(col) >= demands[j]`), and minimize total freight cost.

## Mathematical Model

$$
\begin{aligned}
\min_{x \ge 0} \quad & \sum_{i=0}^{S-1} \sum_{j=0}^{D-1} c_{i,j} x_{i,j} \\
\text{s.t.} \quad & \sum_{j=0}^{D-1} x_{i,j} \le S_i && \forall i \in \{0, \dots, S-1\} \\
& \sum_{i=0}^{S-1} x_{i,j} \ge D_j && \forall j \in \{0, \dots, D-1\}
\end{aligned}
$$

## Key Points

- **Bipartite flow structure**: Each variable belongs to exactly one row (source warehouse) and one column (destination store). Because this node-arc incidence matrix is totally unimodular, integer `supplies` and `demands` automatically yield integer LP optimal flows without declaring integer variables.
- **Mapping row and column aggregations**: Build all supply and demand inequalities declaratively with `.map()`, then flatten the cost sum with `.flatMap()`.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(
  shipments.map((row, i) => expr`${sum(row)} <= ${input.supplies[i]}`)
);
m.constraint(
  input.demands.map(
    (demand, j) => expr`${sum(shipments.map((row) => row[j]))} >= ${demand}`
  )
);
```

**Python (highspy)**

```python
for i in range(n_s):
    h.addConstr(h.qsum(shipments[i][j] for j in range(n_d)) <= supplies[i])
for j in range(n_d):
    h.addConstr(h.qsum(shipments[i][j] for i in range(n_s)) >= demands[j])
```
