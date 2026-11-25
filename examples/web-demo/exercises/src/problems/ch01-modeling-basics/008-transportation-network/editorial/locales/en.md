## Approach

For $S$ roasting plants with supplies $s_i$, $D$ café stores with demands $d_j$, and unit shipping costs $c_{i,j}$, define the shipment quantity (kg) from plant $i$ to store $j$ as a non-negative continuous variable $x_{i,j} \ge 0$. Enforce each plant's **supply cap (row sum $\le s_i$)** and each store's **demand floor (column sum $\ge d_j$)**, and minimize total shipping cost.

## Mathematical Model

$$
\begin{aligned}
\min_{x \ge 0} \quad & \sum_{i=0}^{S-1} \sum_{j=0}^{D-1} c_{i,j} x_{i,j} \\
\text{s.t.} \quad & \sum_{j=0}^{D-1} x_{i,j} \le s_i && \forall i \in \{0, \dots, S-1\} \\
& \sum_{i=0}^{S-1} x_{i,j} \ge d_j && \forall j \in \{0, \dots, D-1\}
\end{aligned}
$$

## Key Points

- **Automatic integrality via total unimodularity (TU)**: Because the transportation constraint matrix has a special network structure (node-arc incidence matrix of a bipartite graph), solving it as a continuous LP automatically yields integer optimal vertices whenever supplies and demands are integers.
- **2D aggregations with `.map()` and `.flatMap()`**: Build row and column constraints as arrays using `.map()`, and flatten the double sum in the objective using `.flatMap()`.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

For the 2D variable array `shipments`, build row-sum constraints (plant supply caps) and column-sum constraints (store demand floors) using `.map()`.

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

**PuLP (Python)**

```python
for i in range(n_s):
    prob += pulp.lpSum(shipments[i][j] for j in range(n_d)) <= supplies[i]
for j in range(n_d):
    prob += pulp.lpSum(shipments[i][j] for i in range(n_s)) >= demands[j]
```
