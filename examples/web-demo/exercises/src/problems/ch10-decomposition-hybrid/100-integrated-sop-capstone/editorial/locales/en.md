## Approach

Chain **Z3 SMT** policy conflict diagnosis with **HiGHS MIP** operational rescheduling:

1. **Phase 1 (IHS Weighted MaxSAT Repair)**: Name every hard and active soft rule in Z3 (`smt.constraint(expr, rule.id)`) alongside capacity coverage $\sum_i C_i u_i \ge D$. Whenever `smt.check({ solver: "z3" })` returns `"Unsat"`, record the soft rule IDs in `res.unsatCore` as a hitting-set cut for a small HiGHS binary MIP minimizing dropped policy weight, and iterate until Z3 returns `"Sat"`.
2. **Phase 2 (Minimum-Disruption MIP)**: Fix the repaired rule set and solve a linear MIP over binary activations $y_i$, continuous production $q_i$, and deviation $\delta_i \ge |y_i - b_i|$ to minimize total fixed, production, and disruption costs.

## Mathematical Model

$$
\begin{aligned}
\text{(Phase 1 IHS)} \quad \min \quad & \sum_{r \in \mathcal{S}} w_r z_r \\
\text{s.t.} \quad & \sum_{r \in \mathcal{C} \cap \mathcal{S}} z_r \ge 1 && \forall \text{ Z3 core } \mathcal{C}, \quad z_r \in \{0, 1\}
\end{aligned}
$$

$$
\begin{aligned}
\text{(Phase 2 MIP)} \quad \min \quad & \sum_{i} \big(F_i y_i + c_i q_i + P_{\text{disrupt}} \delta_i\big) \\
\text{s.t.} \quad & 0 \le q_i \le C_i y_i, \quad \sum_i q_i \ge D, \quad \delta_i \ge y_i - b_i, \quad \delta_i \ge b_i - y_i \\
& \text{Retained rules } \mathcal{H} \cup \{r \in \mathcal{S} : z_r = 0\}, \quad y_i \in \{0, 1\}
\end{aligned}
$$

## Key Points

- **Implicit Hitting Set completeness**: Unlike dropping the single cheapest rule inside one core greedily, resolving a hitting-set MIP over *all* accumulated Z3 cores guarantees globally minimum drop weight across overlapping or nested conflicts.
- **Exact `implies` linearization**: In Phase 2, `ifLine => thenLine` becomes $y_{\text{if}} - y_{\text{then}} \le 0$, whereas `ifLine => !thenLine` becomes $y_{\text{if}} + y_{\text{then}} \le 1$.
- **Linear disruption term**: Using auxiliary linear constraints $\delta_i \ge y_i - b_i$ and $\delta_i \ge b_i - y_i$ avoids any constant offset in the linear objective while remaining exact at binary $y_i \in \{0, 1\}$.
- Related definitions: [Guide & Glossary — Problem Families](?view=guide&lang=en#paradigms) and [Solver Status](?view=guide&lang=en#solver-status).

## Key Implementation

In the Phase 1 Implicit Hitting Set loop, extract only the soft rules from the UNSAT core returned by `checkPolicyWithZ3` (falling back to `activeSoftIds(droppedSet)`, which returns the currently active soft rule IDs, if the core contains none), append them to `hittingSets`, and iterate while updating the minimum-weight `droppedSet` via `solveHittingSetMip` until `"Sat"` is reached.

**WaSHI (TypeScript)**

```ts
for (let iter = 0; iter <= 1 << input.softRules.length; iter++) {
  const audit = await checkPolicyWithZ3(input, droppedSet);
  if (audit.sat) break;
  const coreSoft = audit.core.filter((id) => softById.has(id));
  hittingSets.push(coreSoft.length > 0 ? coreSoft : activeSoftIds(droppedSet));
  droppedSet = await solveHittingSetMip(input.softRules, hittingSets);
}
```
