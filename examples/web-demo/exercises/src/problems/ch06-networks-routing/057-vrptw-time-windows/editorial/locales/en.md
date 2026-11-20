## Approach

Model routing arcs with binary variables $x_{ij}$ ($i \ne j$) and service start times with continuous variables $t_i \in [a_i, b_i]$. Link consecutive stops along any active arc $(i, j)$ via tight Big-M inequalities $t_i + s_i + d_{ij} - t_j \le M_{ij}(1 - x_{ij})$ and enforce depot return $t_i + s_i + d_{i0} \le b_0$ when $x_{i0} = 1$.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n} \sum_{j \ne i} d_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{j \ne i} x_{ij} = \sum_{j \ne i} x_{ji} = 1 && \forall i \in \{1, \dots, n\}, \qquad \sum_{j=1}^n x_{0j} = \sum_{i=1}^n x_{i0} \le K \\
& t_0 = a_0, \quad a_i \le t_i \le b_i, \quad 1 \le u_i \le n && \forall i \in \{1, \dots, n\} \\
& t_i + s_i + d_{ij} - t_j \le M_{ij}(1 - x_{ij}) && \forall i \in \{0, \dots, n\}, j \in \{1, \dots, n\}, i \ne j \\
& u_i + 1 - u_j \le n(1 - x_{ij}) && \forall i, j \in \{1, \dots, n\}, i \ne j \\
& t_i + s_i + d_{i0} \le b_0 + M_{i0}(1 - x_{i0}) && \forall i \in \{1, \dots, n\} \\
& x_{ij} \in \{0, 1\} && \forall i \ne j
\end{aligned}
$$

where $M_{ij} = \max(0, b_i + s_i + d_{ij} - a_j)$ and $M_{i0} = \max(0, b_i + s_i + d_{i0} - b_0)$.

## Key Points

- **Waiting is automatic with `<=` linking**: Writing $t_j \ge t_i + s_i + d_{ij}$ (rather than equality) combined with $t_j \ge a_j$ allows a vehicle arriving early at $j$ to wait until window opening $a_j$.
- **MTZ order potentials prevent zero-time subtours**: When colocated customers have $s_i + d_{ij} = 0$, time monotonicity alone allows disconnected zero-cost customer cycles (`1 -> 2 -> 1`). Adding visit-order potentials $u_i \in [1, n]$ with $u_i + 1 - u_j \le n(1 - x_{ij})$ eliminates all customer subtours even when travel/service times are zero.
- **Tight Big-M calculation**: Bounding $t_i \le b_i$ and $t_j \ge a_j$ gives the exact smallest valid Big-M, strengthening the LP relaxation.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
for (let i = 1; i < n; i++) {
  const bigMi0 = Math.max(0, latest[i] + service[i] + dist[i][0] - latest[0]);
  m.constraint(
    expr`${t[i]} + ${service[i] + dist[i][0]} <= ${latest[0]} + ${bigMi0} * (1 - ${x[i][0]!})`
  );
  for (let j = 1; j < n; j++) {
    if (i !== j) {
      const bigMij = Math.max(0, latest[i] + service[i] + dist[i][j] - earliest[j]);
      m.constraint(
        expr`${t[i]} + ${service[i] + dist[i][j]} - ${t[j]} <= ${bigMij} * (1 - ${x[i][j]!})`
      );
      m.constraint(expr`${u[i]!} + 1 - ${u[j]!} <= ${n - 1} * (1 - ${x[i][j]!})`);
    }
  }
}
```

**PuLP (Python)**

```python
for i in range(1, n):
    mi0 = max(0, latest[i] + service[i] + dist[i][0] - latest[0])
    prob += t[i] + service[i] + dist[i][0] <= latest[0] + mi0 * (1 - x[i][0])
    for j in range(1, n):
        if i != j:
            mij = max(0, latest[i] + service[i] + dist[i][j] - earliest[j])
            prob += t[i] + service[i] + dist[i][j] - t[j] <= mij * (1 - x[i][j])
            prob += u[i] + 1 - u[j] <= (n - 1) * (1 - x[i][j])
```
