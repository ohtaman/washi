## Approach

Formulate the pattern-selection Restricted Master Problem (RMP) as an LP choosing roll counts $\lambda_p$ for active cutting patterns to cover each item demand $d_i$, paired with a bounded knapsack pricing subproblem that maximizes dual value $\sum_i \pi_i a_i$ within the stock roll width to find patterns with negative reduced cost $1 - \sum_i \pi_i a_i < 0$. In WaSHI, seed `master` with one named demand constraint per item and single-item patterns via `master.column(...)`, then run `solveColumnGeneration({ master, finalizeAsMIP: true, pricing })`, reading duals via `getDual` and finalizing an integer plan once LP pricing converges.

## Mathematical Model

$$
\begin{aligned}
\text{(RMP LP)} \quad \min \quad & \sum_{p \in \mathcal{P}} \lambda_p \\
\text{s.t.} \quad & \sum_{p \in \mathcal{P}} a_{ip} \lambda_p \ge d_i && \forall i \in \{0, \dots, m-1\} \quad (\text{dual } \pi_i) \\
& \lambda_p \ge 0 && \forall p \in \mathcal{P}
\end{aligned}
$$

Integrality ($\lambda_p \in \mathbb{Z}_{\ge 0}$) is enforced after column generation converges when finalizing the MIP (`finalizeAsMIP: true`).

$$
\begin{aligned}
\text{(Pricing)} \quad \max \quad & \sum_{i=0}^{m-1} \pi_i a_i \\
\text{s.t.} \quad & \sum_{i=0}^{m-1} w_i a_i \le W, \quad a_i \in \mathbb{Z}_{\ge 0}
\end{aligned}
$$

## Key Points

- **Reduced cost criterion**: Each new roll pattern costs 1 in the master objective, so its reduced cost is $\bar{c} = 1 - \sum_i \pi_i a_i$. Whenever the knapsack optimum exceeds 1 ($\bar{c} < -10^{-5}$), adding that pattern improves the master LP relaxation.
- **Initial feasible basis**: Seeding one pure single-item pattern ($\lfloor W / w_i \rfloor$ copies of item $i$) guarantees the RMP starts feasible and produces finite dual prices on iteration 1.
- **Price-and-Branch (`finalizeAsMIP: true`)**: Once no improving column exists for the LP relaxation, `solveColumnGeneration` enforces integrality on all generated columns and solves the final MIP (unlike full Branch-and-Price, solving the MIP over root-LP columns alone is a primal heuristic in general).
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

Inside the `pricing` callback of `solveColumnGeneration`, read each item's dual price via `getDual` and solve a bounded knapsack subproblem over integer variables `a` to propose cutting patterns with negative reduced cost.

**WaSHI (TypeScript)**

```ts
const result = await solveColumnGeneration<number[]>({
  master,
  finalizeAsMIP: true,
  pricing: async ({ getDual }) => {
    const sub = new Model("KnapsackPricing");
    const a = input.widths.map((w, i) =>
      sub.integer(`a_${i}`, { lb: 0, ub: Math.floor(input.rollWidth / w) })
    );
    const duals = input.widths.map((_, i) => getDual(`demand_${i}`));
    sub.objective(maximize(expr`dot(${duals}, ${a})`));
    sub.constraint(expr`dot(${input.widths}, ${a}) <= ${input.rollWidth}`);
    await sub.solve();
    const rc = 1 - (sub.objectiveValue ?? 0);
    if (rc >= -1e-5) return null;
    const pat = a.map((v) => Math.round(v.value ?? 0));
    const coefficients = Object.fromEntries(
      pat.flatMap((c, i) => (c > 0 ? [[`demand_${i}`, c]] : []))
    );
    return { type: "Integer", cost: 1, coefficients, reducedCost: rc, meta: pat };
  },
});
```
