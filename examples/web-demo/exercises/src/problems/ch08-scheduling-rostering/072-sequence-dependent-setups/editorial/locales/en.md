## Approach

Add a dummy depot node $n$ representing both the start and end of the machine schedule, create binary transition variables $x_{ij} \in \{0, 1\}$ for every ordered pair $i \ne j$ in $\{0, \dots, n\}$, propagate completion times along selected arcs with Big-M, and minimize total tardiness $\sum_j T_j$.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{n-1} T_j \\
\text{s.t.} \quad & \sum_{j \ne i} x_{ij} = 1, \quad \sum_{j \ne i} x_{ji} = 1 && \forall i \in \{0, \dots, n\} \\
& C_j \ge C_i + s_{ij} + p_j - M(1 - x_{ij}) && \forall i \ne j \in \{0, \dots, n-1\} \\
& C_j \ge p_j, \quad T_j \ge C_j - d_j, \quad T_j \ge 0 && \forall j \in \{0, \dots, n-1\} \\
& x_{ij} \in \{0, 1\} && \forall i \ne j
\end{aligned}
$$

## Key Points

- **Completion propagation eliminates subtours automatically**: Because $p_j > 0$ and $s_{ij} \ge 0$, any disconnected cycle among real jobs $\{0, \dots, n-1\}$ creates a strictly positive sum around the cycle and is therefore infeasible—just like Miller-Tucker-Zemlin (MTZ) potentials in TSP.
- **Safe Big-M when $i$ follows $j$**: With $C_k \in [p_k, H]$ where $H = \sum_k p_k + (n-1)\max_{a,b} s_{ab}$, the last job can have $C_i = H$ while the first has $C_j = p_j$. Choosing $M = H + \max_{a,b} s_{ab}$ guarantees $C_i + s_{ij} + p_j - C_j \le H + s_{ij} \le M$.
- **Why earliest-due-date fails**: Job 2 ($d_2 = 5$) looks urgent, but starting with $2 \to 0 \to 1$ triggers heavy setups ($s_{20}=3, s_{01}=5$) and pushes total tardiness to $11$ instead of $4$.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Add the degree-1 out-degree and in-degree constraints for every node and the Big-M completion-time propagation constraints for every ordered job pair. In WaSHI, use `forEach` and `filter` to constrain the non-self-loop variables together; in PuLP, express them with comprehensions.

**WaSHI (TypeScript)**

```ts
x.forEach((row, i) => {
  const outVars = row.filter((v): v is NonNullable<typeof v> => v !== null);
  const inVars = x.map((r) => r[i]).filter((v): v is NonNullable<typeof v> => v !== null);
  m.constraint([expr`${sum(outVars)} == 1`, expr`${sum(inVars)} == 1`]);
});
input.setupMatrix.forEach((row, i) => {
  row.forEach((setup, j) => {
    if (i === j) return;
    const step = setup + input.processingTimes[j];
    m.constraint(
      expr`${completions[j]} >= ${completions[i]} + ${step} - ${M} * (1 - ${x[i][j]!})`
    );
  });
});
```

**PuLP (Python)**

```python
for i in range(n + 1):
    prob += pulp.lpSum(x[(i, j)] for j in range(n + 1) if j != i) == 1
    prob += pulp.lpSum(x[(j, i)] for j in range(n + 1) if j != i) == 1
for i in range(n):
    for j in range(n):
        if i != j:
            prob += completions[j] >= completions[i] + s[i][j] + p[j] - big_m * (1 - x[(i, j)])
```
