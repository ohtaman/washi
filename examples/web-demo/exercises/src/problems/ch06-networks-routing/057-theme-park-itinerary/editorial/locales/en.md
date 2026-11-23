## Approach

Model group transitions with binary variables $x_{ij}$ ($i \ne j$) and attraction start times with continuous variables $t_i \in [a_i, b_i]$. Link consecutive stops along any active arc $(i, j)$ via tight Big-M inequalities $t_i + s_i + d_{ij} - t_j \le M_{ij}(1 - x_{ij})$ and enforce park closing $t_i + s_i + d_{i0} \le b_0$ when $x_{i0} = 1$.

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

- **Waiting is automatic with `<=` linking**: Writing $t_j \ge t_i + s_i + d_{ij}$ (rather than equality) combined with $t_j \ge a_j$ allows a group arriving early at attraction $j$ to wait until opening time $a_j$.
- **MTZ order potentials prevent zero-time subtours**: When colocated attractions have $s_i + d_{ij} = 0$, time monotonicity alone allows disconnected zero-duration attraction cycles (`1 -> 2 -> 1`). Adding visit-order potentials $u_i \in [1, n]$ with $u_i + 1 - u_j \le n(1 - x_{ij})$ eliminates all attraction subtours even when travel/visit times are zero.
- **Tight Big-M calculation**: Bounding $t_i \le b_i$ and $t_j \ge a_j$ gives the exact smallest valid Big-M, strengthening the LP relaxation.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Iterate over the attraction index array `attractions`, registering the park closing deadline on return arcs to the entrance together with tight Big-M time-linking and MTZ visit-order constraints for transitions between attractions.

**WaSHI (TypeScript)**

```ts
const attractions = Array.from({ length: n - 1 }, (_, k) => k + 1);
attractions.forEach((i) => {
  const bigMi0 = Math.max(0, latest[i] + visitDurations[i] + travelTimes[i][0] - latest[0]);
  m.constraint(
    expr`${t[i]} + ${visitDurations[i] + travelTimes[i][0]} <= ${latest[0]} + ${bigMi0} * (1 - ${x[i][0]!})`
  );
  m.constraint(
    attractions
      .filter((j) => i !== j)
      .flatMap((j) => {
        const bigMij = Math.max(
          0,
          latest[i] + visitDurations[i] + travelTimes[i][j] - earliest[j]
        );
        return [
          expr`${t[i]} + ${visitDurations[i] + travelTimes[i][j]} - ${t[j]} <= ${bigMij} * (1 - ${x[i][j]!})`,
          expr`${u[i]!} + 1 - ${u[j]!} <= ${n - 1} * (1 - ${x[i][j]!})`,
        ];
      })
  );
});
```

**PuLP (Python)**

```python
for i in range(1, n):
    mi0 = max(0, latest[i] + visit_durations[i] + travel_times[i][0] - latest[0])
    prob += t[i] + visit_durations[i] + travel_times[i][0] <= latest[0] + mi0 * (1 - x[i][0])
    for j in range(1, n):
        if i != j:
            mij = max(0, latest[i] + visit_durations[i] + travel_times[i][j] - earliest[j])
            prob += t[i] + visit_durations[i] + travel_times[i][j] - t[j] <= mij * (1 - x[i][j])
            prob += u[i] + 1 - u[j] <= (n - 1) * (1 - x[i][j])
```
