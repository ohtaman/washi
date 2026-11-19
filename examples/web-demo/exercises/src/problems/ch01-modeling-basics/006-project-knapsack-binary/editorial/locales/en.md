## Approach

Declare a binary (`0-1`) decision variable for each project (`m.binary(...)` / `h.addBinary(...)`), add the single budget constraint `dot(costs, selected) <= budget`, and maximize `dot(values, selected)`.

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
- **Clean binary extraction**: Normalize solved `0-1` variables with `Math.round(v.value!) || 0` (`round(h.val(v))` in Python) to prevent `0.999999999` or `-0`.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
const selected = m.binary(input.costs.length, { prefix: "sel" });

m.constraint(expr`dot(${input.costs}, ${selected}) <= ${input.budget}`, "budget");
m.objective(maximize(expr`dot(${input.values}, ${selected})`));
```

**Python (highspy)**

```python
selected = [h.addBinary(name=f"sel_{i}") for i in range(n)]

h.addConstr(h.qsum(costs[i] * selected[i] for i in range(n)) <= budget)
h.maximize(h.qsum(values[i] * selected[i] for i in range(n)))
```
