## Approach

Formulate the dispatch problem as a continuous minimization LP with `capacities[i]` placed on variable upper bounds (`ub`), keep references to the `>=` requirement constraints and `<=` resource constraints, solve with HiGHS, and read `c.dual` (WaSHI) or `c.pi` (PuLP).

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

- **Shadow price sign in minimization**: A shadow price equals $\partial z^* / \partial \text{rhs}$. Raising a binding `>=` requirement ($r_k$) makes the problem harder and increases minimum cost ($y_k \ge 0$); raising a binding `<=` cap ($b_l$) relaxes the problem and decreases minimum cost ($\mu_l \le 0$). Both WaSHI (`c.dual`) and PuLP HiGHS (`c.pi`) report this exact derivative sign in `minimize` / `LpMinimize`.
- **Complementary slackness & bounds**: Any constraint with strictly positive slack has zero shadow price, and putting `capacities[i]` on variable `ub` (rather than explicit rows) keeps row duals strictly aligned with `minRequirements` and `maxResources`.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

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
req_constrs = [pulp.lpDot(yields[k], quantities) >= req for k, req in enumerate(min_reqs)]
cap_constrs = [pulp.lpDot(usages[l], quantities) <= cap for l, cap in enumerate(max_res)]
for con in req_constrs + cap_constrs:
    prob += con
prob += pulp.lpDot(costs, quantities)
prob.solve(pulp.HiGHS(msg=False))
duals = [0.0 if abs(c.pi) < 1e-9 else float(c.pi) for c in req_constrs + cap_constrs]
```
