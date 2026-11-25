## Approach

Introduce continuous start-time variables $S_j \ge r_j$ and non-negative tardiness variables $T_j \ge 0$ for every job, link them via $T_j \ge S_j + p_j - d_j$, and enforce non-overlap between every pair of jobs $(i, j)$ using binary precedence variables $y_{ij} \in \{0, 1\}$ and Big-M disjunctions.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{n-1} w_j T_j \\
\text{s.t.} \quad & r_j \le S_j \le H - p_j, \quad T_j \ge S_j + p_j - d_j, \quad T_j \ge 0 && \forall j \\
& S_i + p_i \le S_j + M(1 - y_{ij}) && \forall i < j \\
& S_j + p_j \le S_i + M y_{ij} && \forall i < j \\
& y_{ij} \in \{0, 1\} && \forall i < j
\end{aligned}
$$

where $H = \max_k r_k + \sum_k p_k$ and $M = H$.

## Key Points

- **Disjunctive precedence avoids time discretization**: Choosing $y_{ij} = 1$ forces $i$ before $j$, while $y_{ij} = 0$ forces $j$ before $i$. Unlike time-indexed binary variables, this handles fractional release dates and processing times directly.
- **Tight valid Big-M**: Any compacted optimal schedule completes within $H = \max_k r_k + \sum_k p_k$. With $r_j \ge 0$ and $S_j \le H - p_j$, setting $M = H$ is a valid uniform bound that keeps the LP relaxation much tighter than an arbitrary large constant.
- **Inserted idle time beats greedy non-delay rules**: With release dates, waiting for an imminent high-weight job can beat greedy non-delay schedules that start an available job immediately. For instance, in the example, idling from $t = 0$ to $t = 2$ to run job 1 ($w_1 = 5$) first significantly reduces total weighted tardiness.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Construct the per-job tardiness lower-bound constraints and the disjunctive Big-M non-overlap constraints for every pair of jobs. In WaSHI, register each pair's two constraints as an array using `slice` and `forEach`; in PuLP, write them with nested loops and `pulp.lpDot`.

**WaSHI (TypeScript)**

```ts
m.constraint(
  tardiness.map(
    (T, j) => expr`${T} >= ${starts[j]} + ${input.processingTimes[j]} - ${input.dueDates[j]}`
  )
);
starts.forEach((sI, i) => {
  starts.slice(i + 1).forEach((sJ, offset) => {
    const j = i + 1 + offset;
    const y = m.binary(`y_${i}_${j}`);
    m.constraint([
      expr`${sI} + ${input.processingTimes[i]} <= ${sJ} + ${M} * (1 - ${y})`,
      expr`${sJ} + ${input.processingTimes[j]} <= ${sI} + ${M} * ${y}`,
    ]);
  });
});
m.objective(minimize(expr`dot(${input.weights}, ${tardiness})`));
```

**PuLP (Python)**

```python
for j in range(n):
    prob += tardiness[j] >= starts[j] + p[j] - d[j]
for i in range(n):
    for j in range(i + 1, n):
        y = pulp.LpVariable(f"y_{i}_{j}", cat=pulp.LpBinary)
        prob += starts[i] + p[i] <= starts[j] + big_m * (1 - y)
        prob += starts[j] + p[j] <= starts[i] + big_m * y
prob += pulp.lpDot(w, tardiness)
prob.solve(pulp.HiGHS(msg=False))
```
