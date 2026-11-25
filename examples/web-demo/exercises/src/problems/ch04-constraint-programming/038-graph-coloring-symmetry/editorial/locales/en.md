## Approach

Assign each vertex a bounded integer color `colors[i]` in `[0, maxColors - 1]`, introduce a bounded integer variable `maxColor` bounded by `colors[i] <= maxColor` for all vertices, enforce `colors[u] != colors[v]` for every edge, and add canonical first-appearance value symmetry breaking (`colors[0] == 0` and `colors[i] <= 1 + max(colors[0..i-1])`) so color permutations collapse and minimizing `maxColor + 1` yields the exact minimum number of distinct colors used.

## Mathematical Model

Let $n = \text{numNodes} \ge 1$, $K = \text{maxColors}$, and $E = \text{edges}$:

$$
\begin{aligned}
\min \quad & c_{\max} + 1 \\
\text{s.t.} \quad & c_u \ne c_v && \forall (u, v) \in E \\
& c_0 = 0 \\
& c_i \le 1 + \max_{0 \le j < i} c_j && \forall i \in \{1, \dots, n - 1\} \\
& c_i \le c_{\max} && \forall i \in \{0, \dots, n - 1\} \\
& c_i, c_{\max} \in \{0, \dots, K - 1\} && \forall i \in \{0, \dots, n - 1\}
\end{aligned}
$$

## Key Points

- **Eliminating $K!$ color-permutation branches**: Any valid coloring that uses exactly $k$ distinct colors generates $k! \binom{K}{k}$ equivalent assignments by selecting and permuting labels from $\{0, \dots, K - 1\}$. Constraining `colors[0] == 0` and `colors[i] <= 1 + max(colors[0..i-1])` restricts search to canonical labelings where new colors appear in strict `0, 1, 2, ...` order.
- **Gap-free colors make `maxColor + 1` exact at optimality**: Because canonical numbering never skips a color index, the set of used colors is always `{0, ..., max_i colors[i]}`. Under minimization of `maxColor + 1`, every optimal solution satisfies `maxColor = max_i colors[i]`, so the used color set is `{0, ..., maxColor}` and `maxColor + 1` equals the exact number of distinct colors without needing binary color-usage indicators.
- Related references: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

In addition to requiring distinct colors at both endpoints of every edge, register the symmetry-breaking constraints that introduce new color numbers sequentially from the first vertex and the upper-bound constraints for `maxColor`, then minimize `maxColor + 1`.

**WaSHI (TypeScript)**

```ts
m.constraint(input.edges.map(([u, v]) => expr`${colors[u]} != ${colors[v]}`), "edge_diff");

// Value symmetry breaking: canonical first-appearance numbering
m.constraint(expr`${colors[0]} == 0`, "sym_first");
m.constraint(
  colors.slice(1).map((c, idx) => expr`${c} <= 1 + max(${colors.slice(0, idx + 1)})`),
  "sym_prefix"
);

m.constraint(colors.map((c) => expr`${c} <= ${maxColor}`), "max_color");
m.objective(minimize(expr`${maxColor} + 1`));
```
