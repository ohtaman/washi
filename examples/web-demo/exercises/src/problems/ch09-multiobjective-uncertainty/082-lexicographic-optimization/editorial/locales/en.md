## Approach

Solve two sequential MIPs: Stage 1 minimizes unmet demand `shortfall` under the crew budget to find $Z_1^*$, and Stage 2 adds the threshold constraint $\sum a_i x_i \ge D - (Z_1^* + \delta)$ while minimizing secondary operating cost $\sum c_i x_i$.

## Mathematical Model

$$
\begin{aligned}
\text{Stage 1:} \quad Z_1^* = \min_{x \in \{0,1\}^n,\, u \ge 0} \quad & u \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} r_i x_i \le R_{\max}, \quad \sum_{i=0}^{n-1} a_i x_i + u \ge D \\[6pt]
\text{Stage 2:} \quad \min_{x \in \{0,1\}^n} \quad & \sum_{i=0}^{n-1} c_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} r_i x_i \le R_{\max}, \quad \sum_{i=0}^{n-1} a_i x_i \ge D - (Z_1^* + \delta)
\end{aligned}
$$

## Key Points

- **Why two sequential solves beat big-weight scalarization**: Combining objectives into $W \cdot Z_1 + Z_2$ suffers from ill-conditioning when cost scales vary and cannot express bounded degradation ($Z_1 \le Z_1^* + \delta$ with $\delta > 0$), because $Z_1^*$ is unknown before Stage 1 solves.
- **Recomputing `obj1` from `x2` rather than returning a dummy slack variable**: In Stage 2, adding the coverage lower bound directly avoids having an unpenalized auxiliary `shortfall` variable float loosely up to $Z_1^* + \delta$ when actual coverage is tighter.
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Verdicts](?view=guide&lang=en#verdicts).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m1.constraint(expr`dot(${input.coverage}, ${x1}) + ${shortfall1} >= ${input.targetDemand}`);
m1.objective(minimize(shortfall1));
await m1.solve();
const bestObj1 = m1.objectiveValue!;

const m2 = new Model("LexicographicStage2");
const x2 = m2.binary(n, { prefix: "x" });
m2.constraint(expr`dot(${input.crews}, ${x2}) <= ${input.maxCrews}`);
m2.constraint(expr`dot(${input.coverage}, ${x2}) >= ${input.targetDemand - (bestObj1 + input.slack) - 1e-6}`);
m2.objective(minimize(expr`dot(${input.opCosts}, ${x2})`));
```

**PuLP (Python)**

```python
prob1 += pulp.lpDot(coverage, x1) + shortfall1 >= target_demand
prob1 += shortfall1
prob1.solve(pulp.HiGHS(msg=False))
best_obj1 = float(pulp.value(prob1.objective))

prob2 = pulp.LpProblem("lex_stage2", pulp.LpMinimize)
x2 = [pulp.LpVariable(f"x2_{i}", cat=pulp.LpBinary) for i in range(n)]
prob2 += pulp.lpDot(crews, x2) <= max_crews
prob2 += pulp.lpDot(coverage, x2) >= target_demand - (best_obj1 + slack) - 1e-6
prob2 += pulp.lpDot(op_costs, x2)
```
