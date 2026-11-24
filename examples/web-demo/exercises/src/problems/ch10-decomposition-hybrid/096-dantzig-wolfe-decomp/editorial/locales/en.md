## Approach

Construct a maximization Restricted Master Problem (`master`) containing the global coupling row `shared_cap` (`0 <= sharedCap`), one convexity constraint `conv_${k}` (`0 == 1`) per division, and zero-production starter columns (`init_${k}`). Invoke `solveColumnGeneration` with `finalizeAsMIP: false`, solve each division LP block independently in `pricing`, and reconstruct `allocations[k][j] = sum_p lambda_{kp} * x_{kpj}` from the optimal extreme-point weights.

## Mathematical Model

$$
\begin{aligned}
\text{(RMP)} \quad \max \quad & \sum_{k=0}^{K-1} \sum_{p \in \mathcal{P}_k} \left(\sum_j c_{kj} x_{kpj}\right) \lambda_{kp} \\
\text{s.t.} \quad & \sum_{k=0}^{K-1} \sum_{p \in \mathcal{P}_k} \left(\sum_j s_{kj} x_{kpj}\right) \lambda_{kp} \le S && (\text{dual } \pi) \\
& \sum_{p \in \mathcal{P}_k} \lambda_{kp} = 1 && \forall k \quad (\text{dual } \mu_k) \\
& \lambda_{kp} \ge 0 && \forall k, p
\end{aligned}
$$

$$
\begin{aligned}
\text{(Block } k\text{)} \quad \max \quad & \sum_j (c_{kj} - \pi s_{kj}) x_{kj} \\
\text{s.t.} \quad & \sum_j \ell_{kj} x_{kj} \le L_k, \quad 0 \le x_{kj} \le u_{kj}
\end{aligned}
$$

## Key Points

- **Reduced profit sign in maximization**: For a maximization master, `solveColumnGeneration` computes `rc = cost - dualContrib` and accepts columns with `rc > reducedCostTolerance`. Since the block subproblem maximizes $\sum_j (c_{kj} - \pi s_{kj}) x_{kj}$, the exact reduced profit of extreme point $x_{kp}$ is `sub.objectiveValue - getDual("conv_" + k)`.
- **Origin starter columns**: Because all coefficients and capacities are non-negative, the zero vector $x = 0$ is feasible for every block and ensures all convexity rows are satisfied cleanly at iteration 1.
- **Exact convex reconstruction**: Set `finalizeAsMIP: false` because this problem is continuous LP decomposition (`allocations` can be fractional); summing $\lambda_{kp} x_{kpj}$ across generated columns recovers the primal optimum of the original compact LP.
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

Inside the `pricing` callback, read the shared constraint's dual price `piShared`, build and solve each plant's block LP using `input.productCaps.entries()`, and return extreme points with positive reduced profit as `proposals`.

**WaSHI (TypeScript)**

```ts
const result = await solveColumnGeneration<DwColumnMeta>({
  master,
  finalizeAsMIP: false,
  pricing: async ({ getDual }) => {
    const piShared = getDual("shared_cap");
    const proposals: Array<ColumnProposal<DwColumnMeta>> = [];
    for (const [k, caps] of input.productCaps.entries()) {
      const muK = getDual(`conv_${k}`);
      const sub = new Model(`BlockPricing_${k}`);
      const x = caps.map((cap, j) => sub.continuous(`x_${k}_${j}`, { lb: 0, ub: cap }));
      const reducedUnits = input.profits[k].map((p, j) => p - piShared * input.sharedUsages[k][j]);
      sub.objective(maximize(expr`dot(${reducedUnits}, ${x})`));
      sub.constraint(expr`dot(${input.localUsages[k]}, ${x}) <= ${input.localCaps[k]}`);
      if ((await sub.solve()) !== "Optimal") continue;
      const rc = (sub.objectiveValue ?? 0) - muK;
      if (rc > 1e-6) proposals.push(/* { cost, coefficients: { shared_cap, conv_k: 1 }, reducedCost: rc } */);
    }
    return proposals.length > 0 ? proposals : null;
  },
});
```
