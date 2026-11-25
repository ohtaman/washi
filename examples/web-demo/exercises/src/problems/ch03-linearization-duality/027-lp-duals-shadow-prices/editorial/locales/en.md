## Approach

Model each generator's output as a continuous decision variable $x_i \in [0, u_i]$ (`capacities[i]` placed on variable upper bounds `ub`) subject to the regional minimum demand constraints (`>=`) and fuel/emissions cap constraints (`<=`), minimizing total generation cost $\sum_i c_i x_i$. Because each row dual represents the marginal cost sensitivity to its right-hand side, keep references to the demand and cap constraints, solve with HiGHS, and read `c.dual` (WaSHI) or `c.pi` (PuLP).

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} c_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} A_{ki} x_i \ge r_k && [\text{dual } y_k \ge 0] \quad \forall k \\
& \sum_{i=0}^{n-1} E_{li} x_i \le b_l && [\text{dual } \mu_l \le 0] \quad \forall l \\
& 0 \le x_i \le u_i && \forall i
\end{aligned}
$$

## Key Points

- **Shadow price sign & local validity in minimization**: Under non-degeneracy, a shadow price equals the local marginal rate $\partial z^* / \partial \text{rhs}$ within the current optimal basis (at a degenerate primal optimum, dual solutions need not be unique and one-sided rates can differ). Raising a binding `>=` demand ($r_k$) tightens the feasible region so minimum cost cannot decrease ($y_k \ge 0$); raising a binding `<=` cap ($b_l$) relaxes the feasible region so minimum cost cannot increase ($\mu_l \le 0$). Both WaSHI (`c.dual`) and PuLP HiGHS (`c.pi`) report this exact $\partial z^* / \partial \text{rhs}$ derivative sign in `minimize` / `LpMinimize`.
- **Complementary slackness & bounds**: Any constraint with strictly positive slack has zero shadow price, and putting `capacities[i]` on variable `ub` (rather than explicit rows) keeps row duals strictly aligned with `minRequirements` and `maxResources`.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Keep arrays of constraint handles for both the minimum demand constraints and the fuel/emissions cap constraints across `m.solve()`, then read `.dual` (or `.pi` in PuLP) from each constraint in order.

**WaSHI (TypeScript)**

```ts
const reqConstrs = input.minRequirements.map((req, k) =>
  m.constraint(expr`dot(${input.yields[k]}, ${quantities}) >= ${req}`, `req_${k}`)
);
const capConstrs = input.maxResources.map((cap, l) =>
  m.constraint(expr`dot(${input.resourceUsages[l]}, ${quantities}) <= ${cap}`, `cap_${l}`)
);
m.objective(minimize(expr`dot(${input.costs}, ${quantities})`));
await m.solve();
const duals = [...reqConstrs, ...capConstrs].map((c) => c.dual!);
```

**PuLP (Python)**

```python
req_constrs = [pulp.lpDot(yields[k], quantities) >= req for k, req in enumerate(min_requirements)]
cap_constrs = [pulp.lpDot(resource_usages[l], quantities) <= cap for l, cap in enumerate(max_resources)]
for con in req_constrs + cap_constrs:
    prob += con
prob += pulp.lpDot(costs, quantities)
prob.solve(pulp.HiGHS(msg=False))
duals = [0.0 if abs(c.pi) < 1e-9 else float(c.pi) for c in req_constrs + cap_constrs]
```
