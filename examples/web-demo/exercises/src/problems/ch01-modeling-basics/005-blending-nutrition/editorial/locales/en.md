## Approach

Declare continuous raw-metal amounts bounded by `[0, availabilities[i]]`, enforce the exact batch total `sum(amounts) == targetBatch`, rewrite each percentage bound into an absolute mass bound using `targetBatch`, and minimize `dot(costs, amounts)`.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} c_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} x_i = B \\
& L_k B \le \sum_{i=0}^{n-1} p_{i,k} x_i \le U_k B && \forall k \\
& 0 \le x_i \le A_i && \forall i
\end{aligned}
$$

## Key Points

- **Linearizing ratio constraints with fixed batch weight**: Writing $\frac{\sum_i p_{i,k} x_i}{\sum_i x_i} \ge L_k$ directly looks nonlinear, because variables appear in the denominator. Since the equality constraint fixes $\sum_i x_i = B$ (`targetBatch`), multiplying both sides by $B$ keeps every constraint linear (**LP**). (Variable-denominator fractional blending is covered in Chapter 2.)
- **Extracting a column vector**: Because `compositions[i][k]` is indexed by `(rawMetal, element)`, `input.compositions.map((row) => row[k])` extracts element $k$'s share across all raw metals for `dot(...)`.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${sum(amounts)} == ${input.targetBatch}`, "total_weight");

m.constraint(
  input.minRatios.flatMap((minRatio, k) => {
    const elemCol = input.compositions.map((row) => row[k]);
    return [
      expr`dot(${elemCol}, ${amounts}) >= ${minRatio * input.targetBatch}`,
      expr`dot(${elemCol}, ${amounts}) <= ${input.maxRatios[k] * input.targetBatch}`,
    ];
  })
);
```

**PuLP (Python)**

```python
prob += pulp.lpSum(amounts) == target

for k in range(n_elem):
    elem_expr = pulp.lpSum(compositions[i][k] * amounts[i] for i in range(n_raw))
    prob += elem_expr >= min_ratios[k] * target
    prob += elem_expr <= max_ratios[k] * target
```
