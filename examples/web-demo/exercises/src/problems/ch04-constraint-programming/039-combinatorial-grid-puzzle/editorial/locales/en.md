## Approach

Create an $N \times N$ grid of bounded integer variables `grid[r][c]` in `[1, N]`, enforce `distinct` across every row, every column, and every cage, pin `givens`, and equate `sum(cageVars) == cage.targetSum`. Call `await m.solve({ solver: "pumpkin" })` directly as a pure feasibility model without an objective.

## Mathematical Model

$$
\begin{aligned}
\text{find} \quad & g_{r,c} \in \{1, \dots, N\} && \forall r, c \in \{0, \dots, N-1\} \\
\text{s.t.} \quad & \text{AllDifferent}(g_{r,0}, \dots, g_{r,N-1}) && \forall r \\
& \text{AllDifferent}(g_{0,c}, \dots, g_{N-1,c}) && \forall c \\
& g_{r,c} = v && \forall (r, c, v) \in \text{givens} \\
& \sum_{(r,c) \in S_k} g_{r,c} = T_k, \quad \text{AllDifferent}\big(\{g_{r,c} \mid (r,c) \in S_k\}\big) && \forall k
\end{aligned}
$$

## Key Points

- **Pure feasibility solving in WaSHI**: CP propagation works naturally on satisfaction problems even without a scalar objective to optimize. Calling `await m.solve({ solver: "pumpkin" })` without `m.objective(...)` finds a valid grid directly through constraint propagation and Lazy Clause Generation (LCG).
- **Combined `distinct` + `sum` propagation**: Even before choosing individual digits, `sum` bounds narrow valid digit combinations in each cage while row/column `distinct` propagates exclusions across intersecting cages.
- Related references: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Solver Statuses](?view=guide&lang=en#solver-status).

## Key Implementation

Register `distinct` constraints for every row and column, equality constraints for fixed clues, and both sum-equality and `distinct` constraints for every cage, then run Pumpkin with no objective function.

**WaSHI (TypeScript)**

```ts
m.constraint(grid.map((row) => distinct(row)));
m.constraint(
  Array.from({ length: n }, (_, c) => distinct(grid.map((row) => row[c])))
);
m.constraint(input.givens.map(([r, c, val]) => expr`${grid[r][c]} == ${val}`));
m.constraint(
  input.cages.map((cage) => expr`${sum(cage.cells.map(([r, c]) => grid[r][c]))} == ${cage.targetSum}`)
);
m.constraint(
  input.cages.map((cage) => distinct(cage.cells.map(([r, c]) => grid[r][c])))
);
await m.solve({ solver: "pumpkin" });
```
