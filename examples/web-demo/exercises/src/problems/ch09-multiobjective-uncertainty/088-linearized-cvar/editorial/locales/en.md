## Approach

Apply Rockafellar and Uryasev's (2000) LP reformulation of $\text{CVaR}_\alpha$: introduce an **unconstrained** scalar VaR threshold $\eta \in \mathbb{R}$ (`lb: -Infinity`) and non-negative scenario excess variables $u_s \ge L_s(w) - \eta$, then minimize expected portfolio loss plus $\lambda \cdot \left(\eta + \frac{1}{1-\alpha}\sum_s p_s u_s\right)$.

## Mathematical Model

$$
\begin{aligned}
\min_{w,\, \eta \in \mathbb{R},\, u \ge 0} \quad & -\sum_{s=0}^{S-1} p_s \left(\sum_{j=0}^{n-1} r_{s,j} w_j\right) + \lambda \left( \eta + \frac{1}{1 - \alpha} \sum_{s=0}^{S-1} p_s u_s \right) \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} w_j = 1, \quad 0 \le w_j \le w_{\max} && \forall j \\
& \sum_{j=0}^{n-1} r_{s,j} w_j + \eta + u_s \ge 0 && \forall s \in \{0, \dots, S-1\}
\end{aligned}
$$

## Key Points

- **Keep $\eta$ free (`lb: -Infinity`, `lowBound=None`)**: Both WaSHI (`m.continuous`) and PuLP (`pulp.LpVariable`) default `lb` to `0`. Whenever even the tail portfolio return is positive (making loss negative, as in Case 1 where $\eta^* = -0.0428$), clamping $\eta \ge 0$ distorts CVaR and ruins optimality (`-0.0596` vs. `-0.1742`).
- **Convexity of CVaR vs. non-convexity of VaR**: Direct quantile VaR requires binary indicators and is non-convex, whereas $\text{CVaR}_\alpha$ optimizes an exact convex epigraph with zero integer variables.
- Related definitions: [Guide & Glossary — Variable Bounds](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
const w = m.continuous(n, { lb: 0, ub: input.maxWeight, prefix: "w" });
const eta = m.continuous("eta", { lb: -Infinity, ub: Infinity });
const u = m.continuous(S, { lb: 0, prefix: "u" });

m.constraint(expr`sum(${w}) == 1`, "budget");
m.constraint(input.returns.map((row, s) => expr`dot(${row}, ${w}) + ${eta} + ${u[s]} >= 0`));
const cvarExpr = expr`${eta} + ${1 / (1 - input.alpha)} * dot(${input.probs}, ${u})`;
```

**PuLP (Python)**

```python
w = [pulp.LpVariable(f"w_{j}", lowBound=0, upBound=max_weight) for j in range(n)]
eta = pulp.LpVariable("eta", lowBound=None, upBound=None)
u = [pulp.LpVariable(f"u_{s}", lowBound=0) for s in range(S)]
prob += pulp.lpSum(w) == 1
for s in range(S):
    prob += pulp.lpDot(returns[s], w) + eta + u[s] >= 0
cvar_expr = eta + (1.0 / (1.0 - alpha)) * pulp.lpDot(probs, u)
```
