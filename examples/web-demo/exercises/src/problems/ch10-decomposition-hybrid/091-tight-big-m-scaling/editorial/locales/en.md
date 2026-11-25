## Approach

Introduce a binary plant activation variable $y_i \in \{0, 1\}$ and a continuous production quantity $q_i \ge 0$ for each plant $i$, minimizing total fixed plus variable cost subject to total demand $\sum_i q_i \ge D$ and the tight linking constraint $q_i \le \min(C_i, D)\,y_i$. Clamping the upper bound at $\min(C_i, D)$ prevents oversized plants ($C_i > D$) from opening fractionally at $D / C_i$ in the relaxation. Solve the continuous LP relaxation first to obtain `lpBound`, then solve the MIP for the optimal integer plan.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \left( F_i y_i + c_i q_i \right) \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} q_i \ge D \\
& 0 \le q_i \le \min(C_i, D) \cdot y_i && \forall i \in \{0, \dots, n-1\} \\
& y_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## Key Points

- **Why naive Big-M fails**: In the LP relaxation, $y_i = q_i / M_i$ at optimality, so each unit produced at plant $i$ effectively incurs $c_i + F_i / M_i$. Using $M = 10^6$ or even an unclipped physical capacity (e.g., in the example, $C_0 = 500$ when $D = 60$) shrinks $F_i / M_i$, artificially depressing the LP lower bound and forcing branch-and-bound to explore weak nodes.
- **Demand-based tightening**: Because unit costs satisfy $c_i \ge 0$ and total demand is $D$, no optimal integer solution needs $q_i > D$ even under the inequality $\sum_i q_i \ge D$. Clamping $M_i = \min(C_i, D)$ therefore preserves every optimal integer solution while strengthening the LP relaxation without adding extra variables or cuts.
- **Numerical scaling**: Replacing huge arbitrary constants ($10^6$–$10^9$) with tight domain bounds also prevents ill-conditioned simplex basis matrices and floating-point feasibility drift.
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

Generate all plant linking constraints at once inside `quantities.map(...)` using `Math.min(input.capacities[i], input.demand)` as the tight upper bound, then call `await m.relax()` on the same model `m` to obtain the LP relaxation lower bound before solving the MIP with `await m.solve()`. In PuLP, build the continuous relaxation and the MIP by toggling `cat` between `pulp.LpContinuous` and `pulp.LpBinary`.

**WaSHI (TypeScript)**

```ts
m.constraint(
  quantities.map((qty, i) => {
    const tightM = Math.min(input.capacities[i], input.demand);
    return expr`${qty} <= ${tightM} * ${open[i]}`;
  })
);
m.constraint(expr`sum(${quantities}) >= ${input.demand}`, "demand");
m.objective(minimize(expr`dot(${input.fixedCosts}, ${open}) + dot(${input.unitCosts}, ${quantities})`));

await m.relax();
const lpBound = m.objectiveValue!;
await m.solve();
```

**PuLP (Python)**

```python
cat = pulp.LpContinuous if relax else pulp.LpBinary
open_vars = [pulp.LpVariable(f"open_{i}", 0, 1, cat=cat) for i in range(n)]
for i in range(n):
    tight_m = min(capacities[i], demand)
    prob += quantities[i] <= tight_m * open_vars[i]
```
