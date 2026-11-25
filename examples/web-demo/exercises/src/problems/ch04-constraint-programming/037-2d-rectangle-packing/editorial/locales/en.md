## Approach

Let `maxHeight = sum(heights)` ($H_{\max} = \sum_i h_i$) be a safe finite upper bound on strip height. Assign each rectangle bounded integer coordinates `x[i]` in `[0, stripWidth - widths[i]]` and `y[i]` in `[0, maxHeight - heights[i]]`. For every pair `(i, j)` with `i < j`, state a 4-way non-overlap disjunction with `or(...)` (left, right, below, or above) and minimize `max(y[i] + heights[i])`.

## Mathematical Model

$$
\begin{aligned}
\min \quad & H = \max_{i} (y_i + h_i) \\
\text{s.t.} \quad & (x_i + w_i \le x_j) \lor (x_j + w_j \le x_i) \lor (y_i + h_i \le y_j) \lor (y_j + h_j \le y_i) && \forall i < j \\
& 0 \le x_i \le W - w_i, \quad 0 \le y_i \le H_{\max} - h_i, \quad x_i, y_i \in \mathbb{Z} && \forall i
\end{aligned}
$$

## Key Points

- **CP Disjunction (`or`) vs. MIP Big-M**: A standard Big-M MIP introduces $4 \binom{n}{2}$ binary direction selectors $l_{ij}, r_{ij}, b_{ij}, t_{ij}$ with $l_{ij} + r_{ij} + b_{ij} + t_{ij} \ge 1$ and large $M_x, M_y$ constants, yielding a very weak LP relaxation (when $M_x, M_y$ are large enough, setting each selector to fractional $0.25$ allows $x_i = y_i = 0$ for all rectangles). CP avoids Big-M dilution completely and propagates bounds directly via lazy clause generation as soon as all but one separation fail (and learns conflict clauses from impossible placements).
- **Safe finite strip height upper bound**: Summing `heights` ($H_{\max} = \sum_i h_i$) gives a provably safe finite upper bound `maxHeight - heights[i]` for `y[i]`, keeping Pumpkin's integer domains bounded.
- Related references: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

For every pair of rectangles `i < j`, register a disjunctive constraint `or(...)` requiring separation along at least one of the four directions (left, right, below, or above), and minimize the maximum top coordinate across all rectangles.

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.widths.flatMap((_, i) =>
    input.widths.slice(i + 1).map((__, off) => {
      const j = i + 1 + off;
      return or(
        expr`${x[i]} + ${input.widths[i]} <= ${x[j]}`,
        expr`${x[j]} + ${input.widths[j]} <= ${x[i]}`,
        expr`${y[i]} + ${input.heights[i]} <= ${y[j]}`,
        expr`${y[j]} + ${input.heights[j]} <= ${y[i]}`
      );
    })
  )
);
m.objective(minimize(max(y.map((yi, i) => expr`${yi} + ${input.heights[i]}`))));
```
