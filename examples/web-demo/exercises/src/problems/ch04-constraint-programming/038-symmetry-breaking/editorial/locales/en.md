## Approach

Channel integer host assignments `hosts[i]` with 0-1 indicators `assign[i][k]`, compute per-host loads `load[k]`, enforce capacity and anti-affinity inequalities `hosts[u] != hosts[v]`, and add ordering symmetry-breaking inequalities (`used[k] >= used[k + 1]` and `load[k] >= load[k + 1]`) so identical host permutations collapse before minimizing `sum(used)`.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{k=0}^{K-1} u_k \\
\text{s.t.} \quad & \sum_{k=0}^{K-1} b_{i,k} = 1, \quad h_i = \sum_{k=0}^{K-1} k \, b_{i,k} && \forall i \\
& L_k = \sum_{i=0}^{n-1} s_i b_{i,k}, \quad u_k \le L_k \le C \, u_k && \forall k \\
& h_u \ne h_v && \forall (u, v) \in E_{\text{conf}} \\
& u_k \ge u_{k+1}, \quad L_k \ge L_{k+1} && \forall k \in \{0, \dots, K-2\}
\end{aligned}
$$

## Key Points

- **Eliminating $K!$ symmetric search branches**: Because all $K$ hosts are identical, permuting host indices produces $K!$ equivalent solutions. Without symmetry breaking, Pumpkin must prove infeasibility at `usedHosts - 1` across every redundant host permutation; ordering `used[k] >= used[k + 1]` and `load[k] >= load[k + 1]` keeps only canonical non-increasing load sequences.
- **Avoid over-constraining two incompatible symmetry rules**: Either load-descending order (`load[k] >= load[k + 1]`) OR first-appearance canonical numbering (`hosts[0] == 0` and `hosts[i] <= max(hosts[0..i-1]) + 1`) is valid on its own, but enforcing both simultaneously is invalid when VM `0` does not belong to the heaviest host!
- Related references: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(input.conflicts.map(([u, v]) => expr`${hosts[u]} != ${hosts[v]}`));

// Break identical-host permutation symmetry (prefix active + non-increasing load)
m.constraint(used.slice(0, -1).map((u, k) => expr`${u} >= ${used[k + 1]}`));
m.constraint(load.slice(0, -1).map((ld, k) => expr`${ld} >= ${load[k + 1]}`));

m.objective(minimize(sum(used)));
```
