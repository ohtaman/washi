## Approach

Represent each transmitter's channel directly as a single bounded integer variable `channels[i]` in `[0, numChannels - 1]`, apply the global predicate `distinct(channels)` so no channel is reused, enforce `abs(channels[u] - channels[v]) >= 2` for interfering pairs, and minimize `dot(weights, channels)` with Pumpkin.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} w_i \, c_i \\
\text{s.t.} \quad & \text{AllDifferent}(c_0, \dots, c_{n-1}) \\
& |c_u - c_v| \ge 2 && \forall (u, v) \in E_{\text{adj}} \\
& c_i \in \{0, \dots, M - 1\} \cap \mathbb{Z} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## Key Points

- **Direct finite-domain variables vs. 0-1 matrices**: Instead of $n \times M$ binary variables $x_{i,c}$ as in MIP, CP assigns each entity one integer variable `channels[i]` with explicit finite bounds `{ lb: 0, ub: numChannels - 1 }` (required by Pumpkin's 32-bit integer propagators).
- **Native `distinct()` and `abs()`**: `distinct(channels)` propagates pairwise inequality without manual $\binom{n}{2}$ inequalities in user code, while `expr\`abs(\${channels[u]} - \${channels[v]}) >= 2\`` lowers to Pumpkin's `absolute` propagator without Big-M disjunctions.
- Related references: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
const channels = m.integer(n, { lb: 0, ub: input.numChannels - 1, prefix: "ch" });

m.constraint(distinct(channels), "distinct_channels");
m.constraint(
  input.adjacentConflicts.map(
    ([u, v]) => expr`abs(${channels[u]} - ${channels[v]}) >= 2`
  )
);

m.objective(minimize(expr`dot(${input.weights}, ${channels})`));
await m.solve({ solver: "pumpkin" });
```
