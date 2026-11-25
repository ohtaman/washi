## Approach

Declare a **0-1 binary decision variable** $x_i \in \{0, 1\}$ for whether each equipment item is installed, and maximize the total expected score subject to the total cost not exceeding the budget $B$. In WaSHI (and PuLP), this is written concisely with `m.binary(...)` / `LpBinary` and `dot` / `lpDot`.

## Mathematical Model

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} v_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} c_i x_i \le B \\
& x_i \in \{0, 1\} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## Key Points

- **Why greedy fails on 0-1 knapsack**: Picking items in decreasing score-to-cost order can leave unusable leftover budget and miss the global optimum (score 36 in the example). An exact MIP solver uses branch-and-bound with LP relaxation bounds to prove and find the globally optimal subset without exhaustively enumerating all combinations.
- **Clean binary extraction**: In PuLP (Python), floating-point tolerances can still return 0.999999999 or -0.0, so round outputs with `round(pulp.value(v))`. In WaSHI, `Binary` `v.value` entries are automatically normalized to exact integers, so `v.value!` can be used directly.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Represent each item's selection with `m.binary(...)` (`cat=pulp.LpBinary` in PuLP), and express the budget constraint and objective sum concisely using `dot` / `pulp.lpDot`.

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
