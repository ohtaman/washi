## Approach

Represent each row's queen column directly as a bounded integer variable `cols[r]` in `[0, N - 1]`. Apply `distinct()` to `cols`, `cols[r] + r`, and `cols[r] - r` to forbid column and diagonal attacks simultaneously, and minimize the sum of selected board weights `at(costMatrix[r], cols[r])` on Pumpkin.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{r=0}^{N-1} C_{r, c_r} \\
\text{s.t.} \quad & \text{AllDifferent}(c_0, \dots, c_{N-1}) \\
& \text{AllDifferent}(c_0 + 0, \dots, c_{N-1} + (N - 1)) \\
& \text{AllDifferent}(c_0 - 0, \dots, c_{N-1} - (N - 1)) \\
& c_r \in \{0, \dots, N - 1\} \cap \mathbb{Z} && \forall r \in \{0, \dots, N - 1\}
\end{aligned}
$$

## Key Points

- **Three `distinct()` calls instead of $\binom{N}{2}$ pairwise inequalities**: Two queens at $(r_1, c_1)$ and $(r_2, c_2)$ share a rising diagonal iff $c_1 + r_1 = c_2 + r_2$, and a falling diagonal iff $c_1 - r_1 = c_2 - r_2$. Using three `distinct()` constraints leverages Pumpkin's global all-different propagation cleanly.
- **Element indexing in the objective**: Rather than introducing $N^2$ binary placement variables $x_{r,c}$, `at(costMatrix[r], cols[r])` indexes the constant row array directly by the integer decision variable `cols[r]`.
- Related references: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
const cols = m.integer(n, { lb: 0, ub: n - 1, prefix: "col" });

m.constraint(distinct(cols), "distinct_cols");
m.constraint(distinct(cols.map((c, r) => expr`${c} + ${r}`)), "distinct_diag_pos");
m.constraint(distinct(cols.map((c, r) => expr`${c} - ${r}`)), "distinct_diag_neg");

m.objective(minimize(sum(input.costMatrix.map((row, r) => at(row, cols[r])))));
await m.solve({ solver: "pumpkin" });
```
