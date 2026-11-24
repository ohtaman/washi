## Approach

Build a set-covering Restricted Master Problem (`master`) with daily demand rows `0 >= demands[d]` and single-day starter shift columns registered via `master.column(...)`. Call `solveColumnGeneration({ master, finalizeAsMIP: true, pricing })`, where `pricing` solves a binary MIP subproblem over the $D$ days enforcing `1 <= sum(a) <= maxWorkDays` and sliding-window consecutive limits to find shift vectors with negative reduced cost.

## Mathematical Model

$$
\begin{aligned}
\text{(RMP)} \quad \min \quad & \sum_{p \in \mathcal{P}} \left(F + \sum_{d=0}^{D-1} c_d a_{dp}\right) \lambda_p \\
\text{s.t.} \quad & \sum_{p \in \mathcal{P}} a_{dp} \lambda_p \ge r_d && \forall d \in \{0, \dots, D-1\} \quad (\text{dual } \pi_d) \\
& \lambda_p \in \mathbb{Z}_{\ge 0} && \forall p \in \mathcal{P}
\end{aligned}
$$

$$
\begin{aligned}
\text{(Pricing)} \quad \max \quad & \sum_{d=0}^{D-1} (\pi_d - c_d) a_d \\
\text{s.t.} \quad & 1 \le \sum_{d=0}^{D-1} a_d \le M_{\text{work}} \\
& \sum_{d=t}^{t + M_{\text{consec}}} a_d \le M_{\text{consec}} && \forall t \in \{0, \dots, D - M_{\text{consec}} - 1\} \\
& a_d \in \{0, 1\} && \forall d \in \{0, \dots, D-1\}
\end{aligned}
$$

## Key Points

- **Reduced cost separation**: Moving `shiftCosts[d]` inside the pricing objective turns the column cost minus dual benefit into $\bar{c}(a) = F - \sum_d (\pi_d - c_d) a_d$. Any feasible binary schedule whose pricing maximum exceeds `baseCost` yields $\bar{c} < -10^{-5}$ and improves the LP master.
- **Sliding-window consecutive constraints**: Requiring the sum over every contiguous window of length `maxConsecutive + 1` to be at most `maxConsecutive` cleanly prevents any unbroken work streak longer than `maxConsecutive`.
- **Single-day initial columns**: Seeding one single-day pattern per positive-demand day guarantees initial master feasibility regardless of rule tightness.
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

In the pricing subproblem, compute each day's net gain coefficient with `input.shiftCosts.map(...)` to assemble the objective via `dot`, and register the consecutive work-day limits at once as sliding-window constraints using `Array.from` and `a.slice(...)`.

**WaSHI (TypeScript)**

```ts
const result = await solveColumnGeneration<number[]>({
  master,
  finalizeAsMIP: true,
  pricing: async ({ getDual }) => {
    const sub = new Model("ShiftPricing");
    const a = sub.binary(D, { prefix: "a" });
    const netGains = input.shiftCosts.map((c, d) => getDual(`demand_${d}`) - c);
    sub.objective(maximize(expr`dot(${netGains}, ${a})`));
    sub.constraint(expr`sum(${a}) >= 1`, "nonempty");
    sub.constraint(expr`sum(${a}) <= ${input.maxWorkDays}`, "max_work");
    const windowSize = input.maxConsecutive + 1;
    if (D >= windowSize) {
      sub.constraint(
        Array.from({ length: D - windowSize + 1 }, (_, t) =>
          expr`sum(${a.slice(t, t + windowSize)}) <= ${input.maxConsecutive}`
        )
      );
    }
    if ((await sub.solve()) !== "Optimal") return null;
    const reducedCost = input.baseCost - (sub.objectiveValue ?? 0);
    if (reducedCost >= -1e-5) return null;
    const pat = a.map((v) => Math.round(v.value ?? 0));
    return { type: "Integer", cost: patCost(pat), coefficients: toCoeffs(pat), reducedCost, meta: pat };
  },
});
```
