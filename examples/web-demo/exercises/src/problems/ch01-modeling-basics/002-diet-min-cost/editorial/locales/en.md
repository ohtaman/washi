## Approach

Declare non-negative continuous quantities `oats` and `beans`, write two `>=` nutrient requirement constraints, and **minimize** total cost `30 * oats + 50 * beans`.

## Mathematical Model

$$
\begin{aligned}
\min \quad & 30x + 50y \\
\text{s.t.} \quad & 2x + y \ge \text{minProtein} \\
& x + 3y \ge \text{minFiber} \\
& x, y \ge 0
\end{aligned}
$$

## Key Points

- **Lower bounds (`>=`) push cost up**: Unlike **#001** where `<=` caps stopped profit from growing, here `minimize` wants `0` of everything, and the two `>=` constraints force the solver up to the cheapest corner meeting both requirements.
- **Balanced mix beats single ingredients**: Meeting both `8` protein and `9` fiber with oats alone costs $9 \times 30 = 270$, whereas combining `(3, 2)` brings cost down to `190`.
- Related definitions: [Guide & Glossary — Objectives & Constraints](?view=guide&lang=en#building-blocks).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(expr`2 * ${oats} + ${beans} >= ${input.minProtein}`, "protein");
m.constraint(expr`${oats} + 3 * ${beans} >= ${input.minFiber}`, "fiber");
```

**Python (highspy)**

```python
h.addConstr(2 * oats + beans >= input_data["minProtein"])
h.addConstr(oats + 3 * beans >= input_data["minFiber"])
```
