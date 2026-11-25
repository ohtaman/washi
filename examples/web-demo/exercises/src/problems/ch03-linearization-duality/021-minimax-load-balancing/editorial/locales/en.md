## Approach

For $n$ jobs with workloads $w_i$ and $m$ servers, model the routing fraction $x_{ij} \in [0, \text{compatible}_{ij}]$ for each job-server pair and add one auxiliary continuous variable $t$ (the epigraph variable) representing the peak load. Define server $j$'s total load as $L_j = \sum_{i=0}^{n-1} w_i x_{ij}$, constrain $L_j \le t$ for every server, and minimize $t$.

## Mathematical Model

$$
\begin{aligned}
\min \quad & t \\
\text{s.t.} \quad & \sum_{j=0}^{m-1} x_{ij} = 1 && \forall i \in \{0, \dots, n-1\} \\
& \sum_{i=0}^{n-1} w_i x_{ij} \le t && \forall j \in \{0, \dots, m-1\} \\
& 0 \le x_{ij} \le \text{compatible}_{ij} && \forall i, j \\
& t \ge 0
\end{aligned}
$$

## Key Points

- **Epigraph reformulation**: Minimizing the nonlinear objective $\max_j L_j$ becomes a pure linear program by minimizing an upper bound $t$ coupled with $L_j \le t$ for every server $j$. Because we minimize $t$, at optimality $t$ is pushed down until it tightly equals the maximum server load $\max_j L_j$.
- **Zero-cost compatibility gating**: Setting each variable's upper bound directly to `compatible[i][j]` (0 or 1) automatically enforces $x_{ij} = 0$ on incompatible pairs without extra constraints.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Enforce that each row of `assignments` sums to 1 and that each server's total load is at most the upper-bound variable `peak`, then minimize `peak`.

**WaSHI (TypeScript)**

```ts
m.constraint(assignments.map((row) => expr`${sum(row)} == 1`));
m.constraint(
  Array.from({ length: nServers }, (_, j) => {
    const serverLoad = sum(
      input.weights.map((w, i) => expr`${w} * ${assignments[i][j]}`)
    );
    return expr`${serverLoad} <= ${peak}`;
  })
);
m.objective(minimize(peak));
```

**PuLP (Python)**

```python
for i in range(n_jobs):
    prob += pulp.lpSum(assignments[i]) == 1
for j in range(n_servers):
    prob += pulp.lpSum(weights[i] * assignments[i][j] for i in range(n_jobs)) <= peak
prob += peak
prob.solve(pulp.HiGHS(msg=False))
```
