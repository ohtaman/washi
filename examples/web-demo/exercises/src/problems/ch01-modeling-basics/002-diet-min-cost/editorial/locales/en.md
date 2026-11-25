## Approach

Let $x$ and $y$ be non-negative continuous decision variables representing the amounts of `oats` and `beans`, add two `>=` nutrient requirement constraints, and **minimize** total cost.

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

- **Upper bounds vs. lower bounds**: In **#001**, `<=` constraints kept `maximize` from growing profit without bound. Here, `minimize` tries to push cost down to 0, while the two `>=` constraints support it from below.
- **Why a blend beats a single ingredient**: Oats are cheaper per unit of protein (15) while beans are cheaper per unit of fiber (about 16.7). For the worked example (`minProtein = 8, minFiber = 9`), balancing both in a $3:2$ ratio keeps total cost lower than relying on either ingredient alone (the optimal ratio varies with the target minimums).
- Related definitions: [Guide & Glossary — Objectives & Constraints](?view=guide&lang=en#building-blocks).

## Key Implementation

Set the objective to minimize (`minimize` / `pulp.LpMinimize`) and add each nutrient's lower-bound constraint with `>=`. Checking the objective sense (maximize vs. minimize) together with the constraint inequality direction (`<=` vs. `>=`) is key.

**WaSHI (TypeScript)**

```ts
m.constraint(expr`2 * ${oats} + ${beans} >= ${input.minProtein}`, "protein");
m.constraint(expr`${oats} + 3 * ${beans} >= ${input.minFiber}`, "fiber");
```

**PuLP (Python)**

```python
prob += 2 * oats + beans >= min_protein
prob += oats + 3 * beans >= min_fiber
```
