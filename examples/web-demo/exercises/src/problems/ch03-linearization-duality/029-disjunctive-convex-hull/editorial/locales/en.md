## Approach

Disaggregate each unit's output $x_i$ across its bands into $x_{ik} \ge 0$ paired with binary mode selector $y_{ik} \in \{0, 1\}$, enforcing $\sum_k y_{ik} = 1$ and $L_{ik} y_{ik} \le x_{ik} \le U_{ik} y_{ik}$. This convex-hull formulation models both forbidden gaps and band-specific slopes $c_{ik}$ directly without Big-M slack.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \sum_{k=0}^{K-1} \left(F_{ik} y_{ik} + c_{ik} x_{ik}\right) \\
\text{s.t.} \quad & \sum_{k=0}^{K-1} y_{ik} = 1 && \forall i \in \{0, \dots, n-1\} \\
& L_{ik} y_{ik} \le x_{ik} \le U_{ik} y_{ik} && \forall i, k \\
& \sum_{i=0}^{n-1} \sum_{k=0}^{K-1} x_{ik} \ge \text{demand} \\
& y_{ik} \in \{0, 1\}, \quad x_{ik} \ge 0 && \forall i, k
\end{aligned}
$$

## Key Points

- **Why disaggregation beats a single $x_i$ with Big-M**: First, different operating bands carry different linear cost slopes $c_{ik}$, so the objective needs separate $x_{ik}$ variables per band. Second, even with uniform slopes, the disaggregated inequalities $L_{ik} y_{ik} \le x_{ik} \le U_{ik} y_{ik}$ generate the **exact convex hull** of the union of disjoint intervals $\bigcup_k [L_{ik}, U_{ik}]$, avoiding weak Big-M LP relaxations.
- **Idle band uniformity**: Representing idle as band $k=0$ with $[L_{i0}, U_{i0}] = [0, 0]$ and $F_{i0} = c_{i0} = 0$ lets $\sum_k y_{ik} = 1$ treat idle and active modes cleanly in a single structure.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Register the constraints that each unit selects exactly one band and the convex-hull bounds scaling each band's output variable `x[i][k]` by its indicator `y[i][k]` in bulk using `flatMap`.

**WaSHI (TypeScript)**

```ts
m.constraint(y.map((row) => expr`${sum(row)} == 1`));
m.constraint(
  input.bandLbs.flatMap((lbs, i) =>
    lbs.flatMap((lb, k) => [
      expr`${x[i][k]} >= ${lb} * ${y[i][k]}`,
      expr`${x[i][k]} <= ${input.bandUbs[i][k]} * ${y[i][k]}`,
    ])
  )
);
m.constraint(expr`${sum(x.flat())} >= ${input.demand}`, "demand");
```

**PuLP (Python)**

```python
for i in range(n_units):
    prob += pulp.lpSum(y[i]) == 1
    for k in range(n_bands):
        prob += x[i][k] >= band_lbs[i][k] * y[i][k]
        prob += x[i][k] <= band_ubs[i][k] * y[i][k]
prob += pulp.lpSum(x[i][k] for i in range(n_units) for k in range(n_bands)) >= demand
```
