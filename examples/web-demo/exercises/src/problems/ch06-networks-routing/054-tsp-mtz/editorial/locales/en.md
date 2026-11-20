## Approach

Introduce binary arc variables $x_{ij} \in \{0, 1\}$ ($i \ne j$) enforcing out-degree and in-degree equal to $1$ at every city, add continuous MTZ position potentials $u_i \in [1, n-1]$ for $i \ge 1$ with $u_i - u_j + n x_{ij} \le n - 1$, and minimize total cycle distance.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \sum_{j \ne i} d_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{j \ne i} x_{ij} = 1, \quad \sum_{j \ne i} x_{ji} = 1 && \forall i \in \{0, \dots, n-1\} \\
& u_i - u_j + n x_{ij} \le n - 1 && \forall i \ne j \in \{1, \dots, n-1\} \\
& x_{ij} \in \{0, 1\}, \quad 1 \le u_i \le n - 1
\end{aligned}
$$

## Key Points

- **Why assignment constraints alone fail**: Requiring out-degree = in-degree = 1 only guarantees a vertex-disjoint cycle cover—in the worked example, `0 <-> 2` (cost 5) and `1 <-> 3` (cost 5) would cheat with cost 10 instead of 19.
- **How MTZ breaks subtours**: Whenever arc $(i, j)$ is selected among non-depot cities ($x_{ij} = 1$), $u_j \ge u_i + 1$ forces potentials to strictly increase along the path. Summing around any cycle not containing city 0 would yield $0 \ge |C| > 0$, a contradiction. When $x_{ij} = 0$, $u_i - u_j \le n - 1$ always holds since $u_i \le n - 1$ and $u_j \ge 1$.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
for (let i = 1; i < n; i++) {
  for (let j = 1; j < n; j++) {
    if (i !== j) {
      m.constraint(expr`${u[i]!} - ${u[j]!} + ${n} * ${x[i][j]!} <= ${n - 1}`);
    }
  }
}
```

**PuLP (Python)**

```python
for i in range(1, n):
    for j in range(1, n):
        if i != j:
            prob += u[i] - u[j] + n * x[i][j] <= n - 1
```
