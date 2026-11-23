## Approach

Declare a binary (`0-1`) decision variable for each project (`m.binary(...)` / `pulp.LpVariable(..., cat=pulp.LpBinary)`), add the single budget constraint `dot(costs, selected) <= budget`, and maximize `dot(values, selected)`.

## Mathematical Model

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} v_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} c_i x_i \le B \\
& x_i \in \{0, 1\} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## Key Points

- **Why greedy fails on 0-1 knapsack**: Picking projects in decreasing value-to-cost order can leave unusable leftover budget (for example stopping at value `30` with `3` budget left over), whereas an exact binary solver packs the budget tightly to `36`.
- **Clean binary extraction**: WaSHI automatically normalizes `Binary` `v.value` entries to exact integers, so `v.value!` can be used directly. In PuLP (Python), solver tolerances can still return `0.999999999` or `-0.0`, so round outputs with `round(pulp.value(v))`.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
const selected = m.binary(input.costs.length, { prefix: "sel" });

m.constraint(expr`dot(${input.costs}, ${selected}) <= ${input.budget}`, "budget");
m.objective(maximize(expr`dot(${input.values}, ${selected})`));
```

**PuLP (Python)**

```python
selected = [pulp.LpVariable(f"sel_{i}", cat=pulp.LpBinary) for i in range(n)]

prob += pulp.lpDot(costs, selected) <= budget
prob += pulp.lpDot(values, selected)
prob.solve(pulp.HiGHS(msg=False))
```
