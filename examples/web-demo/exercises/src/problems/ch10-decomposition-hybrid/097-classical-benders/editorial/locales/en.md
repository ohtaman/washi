## Approach

Decompose Capacitated Facility Location into a binary MIP master (`open[i]`, second-stage cost estimator $\theta \ge 0$) and a continuous transportation LP subproblem evaluated inside `master.solveBenders`. When a candidate configuration $\bar{y}$ lacks capacity or fails LP feasibility, solve a Phase-I minimum-slack LP to generate a Farkas feasibility cut (`kind: "feasibility"`). Otherwise solve the shipping LP, read constraint duals, and return a tight optimality cut (`kind: "optimality"`) with `subproblemObjective`.

## Mathematical Model

$$
\begin{aligned}
\text{(Master)} \quad \min \quad & \sum_{i} f_i y_i + \theta \\
\text{s.t.} \quad & \text{feasibility \& optimality cuts}, \quad y_i \in \{0, 1\}, \ \theta \ge 0
\end{aligned}
$$

$$
\begin{aligned}
\text{(Sub}(\bar{y})\text{)} \quad \min \quad & \sum_{i,j} c_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{i} x_{ij} \ge d_j && \forall j \quad (\text{dual } \alpha_j \ge 0) \\
& \sum_{j} x_{ij} \le K_i \bar{y}_i && \forall i \quad (\text{dual } \beta_i \le 0), \quad x_{ij} \ge 0
\end{aligned}
$$

## Key Points

- **Strong-duality optimality cut**: By LP duality, $Q(\bar{y}) = \sum_j d_j \alpha_j + \sum_i K_i \beta_i \bar{y}_i$. Valid for every $y \in \{0,1\}^I$, the optimality cut is $\theta - \sum_i K_i \beta_i y_i \ge \sum_j d_j \alpha_j$.
- **Dual-derived feasibility cut**: Because `solveBenders` automatic mode throws an error when a subproblem is infeasible, we use a custom `subproblem` callback and solve a Phase-I minimum-slack LP ($\min \sum_j s_j$) whenever open capacity cannot cover demand. Its duals $(\alpha', \beta')$ yield the exact Farkas feasibility cut $\sum_i (-K_i \beta'_i) y_i \ge \sum_j d_j \alpha'_j$ (without supplying `subproblemObjective`, so upper bounds only track feasible solutions).
- **Shipping recovery**: After `solveBenders` terminates with optimal `open` values, solve the shipping LP one final time at the optimal `open` vector to obtain exact primal `shipments`.
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

Inside the `subproblem` callback of `master.solveBenders`, `buildShippingLp` builds either the Phase-I minimum-slack LP or the shipping LP while the cut-expression helpers assemble the Benders cut terms: when open supply capacity is insufficient, return a `kind: "feasibility"` cut; otherwise return a `kind: "optimality"` cut from the shipping LP duals along with `subproblemObjective`.

**WaSHI (TypeScript)**

```ts
const res = await master.solveBenders({
  theta,
  gapTolerance: 1e-5,
  subproblem: async ({ getMasterValue }) => {
    const yBar = open.map((v) => Math.round(getMasterValue(v)) || 0);
    if (sumCap(yBar) < totalDemand - 1e-6) {
      const p1 = buildShippingLp(input, yBar, true);
      await p1.sub.solve();
      const alpha = p1.demCons.map((c) => c.dual ?? 0);
      const beta = p1.capCons.map((c) => c.dual ?? 0);
      return { kind: "feasibility", constraint: expr`${farkasLhs(beta)} >= ${rhs(alpha)}` };
    }
    const p2 = buildShippingLp(input, yBar, false);
    await p2.sub.solve();
    const alpha = p2.demCons.map((c) => c.dual ?? 0);
    const beta = p2.capCons.map((c) => c.dual ?? 0);
    return {
      kind: "optimality",
      constraint: expr`${thetaLhs(theta, beta)} >= ${rhs(alpha)}`,
      subproblemObjective: fixedCost(yBar) + (p2.sub.objectiveValue ?? 0),
    };
  },
});
```
