## Approach

Assign a binary choice `tierSelected[s][k]` and a continuous quantity `tierQuantities[s][k]` to each supplier-tier bracket, allow at most one tier per supplier (`sum <= 1`), enforce semi-continuous tier intervals `minQty * y <= q <= maxQty * y`, require total purchases to meet `demand`, and minimize total cost.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{s} \sum_{k} p_{s,k} q_{s,k} \\
\text{s.t.} \quad & \sum_{k} y_{s,k} \le 1 && \forall s \\
& L_{s,k} y_{s,k} \le q_{s,k} \le U_{s,k} y_{s,k} && \forall s, k \\
& \sum_{s} \sum_{k} q_{s,k} \ge D \\
& q_{s,k} \ge 0,\; y_{s,k} \in \{0, 1\} && \forall s, k
\end{aligned}
$$

## Key Points

- **Why volume discounts require MIP (non-convexity)**: When minimizing cost, pure LP only models **convex** piecewise-linear functions with *increasing* marginal prices (e.g., tiered overtime surcharges). Both incremental volume discounts (decreasing marginal prices, which are concave) and all-units volume discounts (which drop earlier units' prices too, creating downward jumps at thresholds $L_{s,k}$) are non-convex and require binary variables.
- **Strategic over-purchasing and tier splitting**: Using `>= demand` allows buying slightly above `demand` when hitting the next tier threshold lowers the total bill (as in Case 1: buying `50` at `7.0` costs `350` vs `414` for `45` at `9.2`), and using `<= 1` lets unused suppliers stay completely off even when `minQty > 0`.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(tierSelected.map((row) => expr`${sum(row)} <= 1`));
m.constraint(
  input.suppliers.flatMap((tiers, s) =>
    tiers.flatMap((tier, k) => [
      expr`${tier.minQty} * ${tierSelected[s][k]} <= ${tierQuantities[s][k]}`,
      expr`${tierQuantities[s][k]} <= ${tier.maxQty} * ${tierSelected[s][k]}`,
    ])
  )
);
m.constraint(expr`${sum(tierQuantities.flat())} >= ${input.demand}`, "demand");
```

**PuLP (Python)**

```python
for s, tiers in enumerate(suppliers):
    prob += pulp.lpSum(tier_sel[s]) <= 1
    for k, tier in enumerate(tiers):
        prob += tier["minQty"] * tier_sel[s][k] <= tier_qty[s][k]
        prob += tier_qty[s][k] <= tier["maxQty"] * tier_sel[s][k]
prob += pulp.lpSum(q for row in tier_qty for q in row) >= demand
```
