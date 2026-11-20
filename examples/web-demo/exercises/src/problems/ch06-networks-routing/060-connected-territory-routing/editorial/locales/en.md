## Approach

Combine territory-assignment binaries $y_{ik}$ and hub binaries $h_{ik} \le y_{ik}$ with per-territory single-commodity flow ($s_{ik} \le n h_{ik}$, $f_{ek} \le (n-1) y_{uk}$, $f_{ek} \le (n-1) y_{vk}$) on `adjEdges` so every territory forms a connected component rooted at its chosen hub, then overlay intra-territory TSP arcs $x_{ij}$ coupled via $y_{ik} - y_{jk} \le 1 - x_{ij}$ and hub-anchored MTZ potentials.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{k=0}^{K-1}\sum_{i=0}^{n-1} F_i h_{ik} + \sum_{i=0}^{n-1}\sum_{j \ne i} d_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_k y_{ik} = 1, \quad \sum_i h_{ik} = 1, \quad h_{ik} \le y_{ik}, \quad L \le \sum_i \text{demands}_i y_{ik} \le U \\
& s_{ik} \le n h_{ik}, \quad 0 \le f_{u \to v, k} \le (n-1) y_{uk}, \quad 0 \le f_{u \to v, k} \le (n-1) y_{vk} \\
& s_{ik} + \text{inflow}_k(i) - \text{outflow}_k(i) = y_{ik} && \forall i, k \\
& \sum_{j \ne i} x_{ij} = \sum_{j \ne i} x_{ji} = 1, \quad y_{ik} - y_{jk} \le 1 - x_{ij} && \forall i \ne j, k \\
& u_i + 1 - u_j \le n\left(1 - x_{ij} + \sum_k h_{jk}\right) && \forall i \ne j
\end{aligned}
$$

## Key Points

- **Linearizing flow from an unknown hub**: Instead of writing the bilinear product $\left(\sum_j y_{jk}\right) h_{ik}$, introduce a continuous supply variable $s_{ik} \le n h_{ik}$. Only the chosen hub can inject positive flow, and summing $s_{ik} + \text{inflow}_k(i) - \text{outflow}_k(i) = y_{ik}$ over $i$ forces $s_{\text{hub}, k} = \sum_i y_{ik}$ automatically.
- **Hub-anchored MTZ resets at every territory hub**: Adding $\sum_k h_{jk}$ inside $n(1 - x_{ij} + \sum_k h_{jk})$ relaxes the MTZ step only when returning to a hub, forcing every cycle to include a hub while prohibiting cross-territory arcs via $y_{ik} = y_{jk}$.
- **Symmetry breaking on territory slots**: Enforcing $\sum_i i \cdot h_{ik} + 1 \le \sum_i i \cdot h_{i,k+1}$ orders territory labels canonically by hub index, trimming duplicate branch-and-bound search trees.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
for (let i = 0; i < n; i++) {
  m.constraint(expr`${sum(x[i].filter((v) => v !== null))} == 1`);
  m.constraint(expr`${sum(x.map((row) => row[i]).filter((v) => v !== null))} == 1`);
  for (let j = 0; j < n; j++) {
    if (i === j) continue;
    for (let k = 0; k < K; k++) {
      m.constraint(expr`${y[i][k]} - ${y[j][k]} <= 1 - ${x[i][j]!}`);
    }
    m.constraint(expr`${u[i]} + 1 - ${u[j]} <= ${n} * (1 - ${x[i][j]!} + ${sum(h[j])})`);
  }
}
```

**PuLP (Python)**

```python
for i in range(n):
    prob += pulp.lpSum(x[i][j] for j in range(n) if j != i) == 1
    prob += pulp.lpSum(x[j][i] for j in range(n) if j != i) == 1
    for j in range(n):
        if i != j:
            for k in range(num_t):
                prob += y[i][k] - y[j][k] <= 1 - x[i][j]
            h_j = pulp.lpSum(h[j][k] for k in range(num_t))
            prob += u[i] + 1 - u[j] <= n * (1 - x[i][j] + h_j)
```
