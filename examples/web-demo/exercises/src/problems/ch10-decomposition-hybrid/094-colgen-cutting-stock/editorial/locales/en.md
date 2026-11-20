## Approach

Initialize the Restricted Master Problem (`master`) with demand constraints `0 >= demands[i]` and one single-item cutting pattern per item via `master.column(...)`. Call `solveColumnGeneration({ master, finalizeAsMIP: true, pricing })`, where `pricing` reads shadow prices via `getDual` and solves an integer knapsack subproblem to propose patterns with negative reduced cost $1 - \sum_i \pi_i a_i < 0$.

## Mathematical Model

$$
\begin{aligned}
\text{(RMP)} \quad \min \quad & \sum_{p \in \mathcal{P}} \lambda_p \\
\text{s.t.} \quad & \sum_{p \in \mathcal{P}} a_{ip} \lambda_p \ge d_i && \forall i \in \{0, \dots, m-1\} \quad (\text{dual } \pi_i) \\
& \lambda_p \in \mathbb{Z}_{\ge 0} && \forall p \in \mathcal{P}
\end{aligned}
$$

$$
\begin{aligned}
\text{(Pricing)} \quad \max \quad & \sum_{i=0}^{m-1} \pi_i a_i \\
\text{s.t.} \quad & \sum_{i=0}^{m-1} w_i a_i \le W, \quad a_i \in \mathbb{Z}_{\ge 0}
\end{aligned}
$$

## Key Points

- **Reduced cost criterion**: Each new roll pattern costs `1` in the master objective, so its reduced cost is $\bar{c} = 1 - \sum_i \pi_i a_i$. Whenever the knapsack optimum exceeds `1` ($\bar{c} < -10^{-5}$), adding that pattern improves the master LP relaxation.
- **Initial feasible basis**: Seeding one pure single-item pattern (`floor(W / w_i)` copies of item `i`) guarantees the RMP starts feasible and produces finite dual prices on iteration 1.
- **Price-and-Branch (`finalizeAsMIP: true`)**: Once no improving column exists for the LP relaxation, `solveColumnGeneration` automatically enforces integrality on all generated columns and solves the final MIP.
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

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
    return { type: "Integer", cost: 1, coefficients: toCoeffMap(pat), reducedCost: rc, meta: pat };
  },
});
```
