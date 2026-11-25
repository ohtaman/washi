## Approach

Use vehicle-indexed binary arcs $x_{ijk}$ ($k \in \{0, \dots, K-1\}$) to enforce flow conservation, per-vehicle stop caps $S_{\max}$ (`maxStopsPerVehicle`), and same-vehicle pairing $\sum_j x_{p_r j k} = \sum_j x_{d_r j k}$ per request, combined with continuous visit-order variables $t_i$ (enforcing $t_{p_r} + 1 \le t_{d_r}$ and eliminating subtours) and continuous load variables $L_i \in [0, Q]$ updated by $\delta_{p_r} = +q_r$ and $\delta_{d_r} = -q_r$.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{k=0}^{K-1} \sum_{i=0}^{N-1} \sum_{j \ne i} d_{ij} x_{ijk} \\
\text{s.t.} \quad & \sum_{k=0}^{K-1} \sum_{j \ne i} x_{ijk} = 1 && \forall i \ge 1 \\
& \sum_{j=1}^{N-1} x_{0jk} = \sum_{i=1}^{N-1} x_{i0k} \le 1, \quad \sum_{j \ne i} x_{jik} = \sum_{j \ne i} x_{ijk} && \forall i \ge 1,\; k \\
& \sum_{j \ne p_r} x_{p_r j k} = \sum_{j \ne d_r} x_{d_r j k}, \quad t_{p_r} + 1 \le t_{d_r} && \forall r,\; k \\
& t_i + 1 - t_j \le N\left(1 - \sum_{k=0}^{K-1} x_{ijk}\right) && \forall i \ge 1,\; j \ge 1,\; i \ne j \\
& L_i + \delta_j - L_j \le (Q + \max(0, \delta_j))\left(1 - \sum_{k=0}^{K-1} x_{ijk}\right) && \forall i \ge 0,\; j \ge 1,\; i \ne j \\
& \sum_{i \ge 1} \sum_{j \ne i} x_{ijk} \le S_{\max} && \forall k \\
& t_0 = 0,\; L_0 = 0,\quad 1 \le t_i \le N - 1,\; \max(0, \delta_i) \le L_i \le \min(Q, Q + \delta_i) && \forall i \ge 1 \\
& x_{ijk} \in \{0, 1\} && \forall i \ne j,\; k
\end{aligned}
$$

## Key Points

- **Why 3-index arcs $x_{ijk}$ are needed for multi-vehicle pairing**: With 2-index arcs $x_{ij}$ alone, you cannot require pickup $p_r$ and delivery $d_r$ to belong to the *same* vehicle route; indexing arcs by vehicle $k$ turns same-route pairing into a single equality per $(r, k)$.
- **Shared order and load potentials across vehicles**: Because each non-depot stop $i \ge 1$ is visited by exactly one vehicle, a single $t_i$ and $L_i$ per stop suffice across all vehicles ($y_{ij} = \sum_k x_{ijk}$).
- **Signed load updates allow interleaving**: Positive $\delta_{p_r}$ and negative $\delta_{d_r}$ allow overlapping requests (`p_0 -> p_1 -> d_0 -> d_1`) whenever their combined load stays within $Q$, and force sequential delivery whenever $q_0 + q_1 > Q$.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

For each transport request `r`, iterate over `vehicles` to enforce the same-vehicle constraint equating the out-degrees of pickup and delivery, along with the pickup-before-delivery precedence constraint using order variables `t`.

**WaSHI (TypeScript)**

```ts
const vehicles = Array.from({ length: K }, (_, k) => k);
const nodes = Array.from({ length: n }, (_, j) => j);

input.requests.forEach((r) => {
  vehicles.forEach((k) => {
    const pOut = nodes.filter((j) => j !== r.pickup).map((j) => x[r.pickup][j]![k]);
    const dOut = nodes.filter((j) => j !== r.delivery).map((j) => x[r.delivery][j]![k]);
    m.constraint(expr`${sum(pOut)} == ${sum(dOut)}`);
  });
  m.constraint(expr`${t[r.pickup]} + 1 <= ${t[r.delivery]}`);
});
```

**PuLP (Python)**

```python
for r in requests:
    p, d = r["pickup"], r["delivery"]
    for k in range(max_vehicles):
        prob += pulp.lpSum(x[p][j][k] for j in range(n) if j != p) == pulp.lpSum(
            x[d][j][k] for j in range(n) if j != d
        )
    prob += t[p] + 1 <= t[d]
```
