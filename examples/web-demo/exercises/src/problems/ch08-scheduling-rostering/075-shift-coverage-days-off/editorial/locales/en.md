## Approach

Introduce a 3D binary array $x_{i,d,s} \in \{0, 1\}$ indicating whether staff member $i$ works shift $s$ on day $d$. Enforce at most one shift per staff-day (zero on required days off), daily shift coverage, and personal shift-count bounds, then minimize total assignment cost.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{N-1} \sum_{d=0}^{D-1} \sum_{s=0}^{S-1} c_{i,s} x_{i,d,s} \\
\text{s.t.} \quad & \sum_{s=0}^{S-1} x_{i,d,s} = 0 && \forall i, \; d \in \text{Off}_i \\
& \sum_{s=0}^{S-1} x_{i,d,s} \le 1 && \forall i, \; d \notin \text{Off}_i \\
& \sum_{i=0}^{N-1} x_{i,d,s} \ge D_{d,s} && \forall d, s \\
& L_i \le \sum_{d=0}^{D-1} \sum_{s=0}^{S-1} x_{i,d,s} \le U_i && \forall i \\
& x_{i,d,s} \in \{0, 1\} && \forall i, d, s
\end{aligned}
$$

## Key Points

- **One-hot with Off option (`<= 1`)**: Allowing $\sum_s x_{i,d,s} \le 1$ naturally encodes "at most one shift or Off", and decoding with `findIndex(v === 1)` maps `Off` cleanly to `-1` and active shifts to `0..S-1`.
- **Required days off eliminate infeasible choices early**: Setting the day sum to `== 0` (or upper bound `0`) removes unavailable staff-day slots before branching.
- **Min-shift quotas can force higher-cost staff onto the schedule**: Even when one staff member has higher shift costs, `minShifts[i]` prevents starving them of hours and distributes workload fairly across the horizon.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

**WaSHI (TypeScript)**

```ts
x.forEach((staffDays, i) => {
  const offSet = new Set(input.daysOff[i]);
  staffDays.forEach((dayVars, d) => {
    m.constraint(offSet.has(d) ? expr`${sum(dayVars)} == 0` : expr`${sum(dayVars)} <= 1`);
  });
  const totalWorked = sum(staffDays.flat());
  m.constraint([
    expr`${totalWorked} >= ${input.minShifts[i]}`,
    expr`${totalWorked} <= ${input.maxShifts[i]}`,
  ]);
});
for (let d = 0; d < D; d++) {
  for (let s = 0; s < S; s++) {
    m.constraint(expr`${sum(x.map((staff) => staff[d][s]))} >= ${input.demands[d][s]}`);
  }
}
```

**PuLP (Python)**

```python
for i in range(num_staff):
    off_set = set(days_off[i])
    for d in range(num_days):
        day_sum = pulp.lpSum(x[i][d])
        prob += day_sum == 0 if d in off_set else day_sum <= 1
    total_i = pulp.lpSum(x[i][d][s] for d in range(num_days) for s in range(num_shifts))
    prob += total_i >= min_shifts[i]
    prob += total_i <= max_shifts[i]
```
