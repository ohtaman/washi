## Approach

Declare one finite-domain integer variable `assignment[i]` in `[0, m - 1]` per job, enforce `distinct(assignment)` so machines are unique, and evaluate the selected row cost directly with the Element constraint `at(input.costs[i], assignment[i])`.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} c_{i,\, a_i} \\
\text{s.t.} \quad & \text{AllDifferent}(a_0, \dots, a_{n-1}) \\
& a_i \in \{0, \dots, m - 1\} \cap \mathbb{Z} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## Key Points

- **CP Element (`at`) vs. 0-1 assignment matrix (as in `#007`)**: A binary-matrix MIP formulation (generalizing the $n \times n$ model in `#007` to rectangular $n \times m$ instances) requires $n \times m$ binary variables $x_{i,j}$ and $n + m$ sum constraints. With `at(costs[i], assignment[i])`, you use only $n$ integer variables and index directly by the decision variable via Pumpkin's native `element` propagator.
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
