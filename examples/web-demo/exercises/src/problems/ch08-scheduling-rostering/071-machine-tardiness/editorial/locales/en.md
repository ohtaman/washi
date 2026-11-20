## Approach

Introduce continuous start-time variables $S_j \ge r_j$ and non-negative tardiness variables $T_j \ge 0$ for every job, link them via $T_j \ge S_j + p_j - d_j$, and enforce non-overlap between every pair of jobs $(i, j)$ using binary precedence variables $y_{ij} \in \{0, 1\}$ and Big-M disjunctions.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{n-1} w_j T_j \\
\text{s.t.} \quad & S_j \ge r_j, \quad T_j \ge S_j + p_j - d_j, \quad T_j \ge 0 && \forall j \\
& S_i + p_i \le S_j + M(1 - y_{ij}) && \forall i < j \\
& S_j + p_j \le S_i + M y_{ij} && \forall i < j \\
& y_{ij} \in \{0, 1\} && \forall i < j
\end{aligned}
$$

## Key Points

- **Disjunctive precedence avoids time discretization**: Choosing $y_{ij} = 1$ forces $i$ before $j$, while $y_{ij} = 0$ forces $j$ before $i$. Unlike time-indexed binary variables, this works seamlessly with fractional release dates or durations.
- **Tight valid Big-M**: Any compacted optimal schedule completes within $H = \max_k r_k + \sum_k p_k$. Bounding $S_j \le H - p_j$ ensures $M = H$ is always large enough to deactivate the unchosen inequality while keeping the LP relaxation as tight as possible.
- **Inserted idle time beats greedy non-delay rules**: Because $w_1 = 5$ in the example, idling briefly from $t = 0$ to $t = 2$ to run job 1 first avoids a much larger weighted penalty.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(
  tardiness.map(
    (T, j) => expr`${T} >= ${starts[j]} + ${input.processingTimes[j]} - ${input.dueDates[j]}`
  )
);
for (let i = 0; i < n; i++) {
  for (let j = i + 1; j < n; j++) {
    const y = m.binary(`y_${i}_${j}`);
    m.constraint([
      expr`${starts[i]} + ${input.processingTimes[i]} <= ${starts[j]} + ${M} * (1 - ${y})`,
      expr`${starts[j]} + ${input.processingTimes[j]} <= ${starts[i]} + ${M} * ${y}`,
    ]);
  }
}
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
