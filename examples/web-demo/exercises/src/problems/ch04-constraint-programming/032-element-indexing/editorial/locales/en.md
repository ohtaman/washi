## Approach

Introduce one finite-domain integer variable $a_i \in \{0, \dots, m - 1\}$ (`assignment[i]`) for each job $i \in \{0, \dots, n - 1\}$, with setup costs $c_{i,j}$ (`costs[i][j]`). Enforce an all-different constraint across all $a_i$ so no machine is shared, and minimize the total setup cost $\sum_{i=0}^{n-1} c_{i,\, a_i}$. In WaSHI on Pumpkin, this maps directly to `distinct(assignment)` and variable-indexed lookup `at(input.costs[i], assignment[i])`.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} c_{i,\, a_i} \\
\text{s.t.} \quad & \text{AllDifferent}(a_0, \dots, a_{n-1}) \\
& a_i \in \{0, \dots, m - 1\} \cap \mathbb{Z} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## Key Points

- **CP Element (`at`) vs. a standard 0-1 MIP assignment matrix**: A standard MIP assignment formulation requires $n \times m$ binary variables $x_{i,j}$ and $n + m$ sum constraints (one per job and one per machine). With `at(costs[i], assignment[i])`, the CP model uses only $n$ integer variables and indexes each row directly by the decision variable via Pumpkin's native `element` propagator.
- **0-based bounds guard**: `at(array, idx)` automatically constrains $0 \le \text{idx} < \text{array.length}$ and supports rectangular $n \le m$ tables without dummy rows.
- Related references: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Enforce `distinct` on the integer machine-index array `assignment` for all jobs, minimize the sum of costs looked up via `at(row, assignment[i])`, and solve on Pumpkin.

**WaSHI (TypeScript)**

```ts
const assignment = m.integer(n, { lb: 0, ub: numMachines - 1, prefix: "assign" });

m.constraint(distinct(assignment), "distinct_machines");
m.objective(minimize(sum(input.costs.map((row, i) => at(row, assignment[i])))));
await m.solve({ solver: "pumpkin" });
```
