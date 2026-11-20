## Approach

Assign each rectangle bounded integer coordinates `x[i]` in `[0, stripWidth - widths[i]]` and `y[i]` in `[0, maxHeight - heights[i]]`. For every pair `(i, j)` with `i < j`, state a 4-way non-overlap disjunction with `or(...)` (left, right, below, or above) and minimize `max(y[i] + heights[i])`.

## Mathematical Model

$$
\begin{aligned}
\min \quad & H = \max_{i} (y_i + h_i) \\
\text{s.t.} \quad & (x_i + w_i \le x_j) \lor (x_j + w_j \le x_i) \lor (y_i + h_i \le y_j) \lor (y_j + h_j \le y_i) && \forall i < j \\
& 0 \le x_i \le W - w_i, \quad 0 \le y_i \le H_{\max} - h_i, \quad x_i, y_i \in \mathbb{Z} && \forall i
\end{aligned}
$$

## Key Points

- **CP Disjunction (`or`) vs. MIP Big-M**: A standard Big-M MIP introduces $4 \binom{n}{2}$ binary direction selectors $l_{ij}, r_{ij}, b_{ij}, t_{ij}$ with $l_{ij} + r_{ij} + b_{ij} + t_{ij} \ge 1$ and large $M_x, M_y$ constants, yielding a very weak LP relaxation ($x_i = y_i = 0$ satisfies fractional $0.25$ on each selector). CP avoids Big-M dilution completely and propagates bounds directly via lazy clause generation as soon as any axis separation fails.
- **Tight strip height upper bound**: Summing `heights` gives a safe finite `y[i]` bound `maxHeight - heights[i]`, keeping Pumpkin's integer domains compact.
- Related references: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

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
