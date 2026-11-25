## Approach

Declare binary variables $x_{j,i,t} \in \{0, 1\}$ assigning each procedure $j$ to a certified staff member $i$ in slot $t$, together with non-negative continuous overtime variables $o_i \ge 0$. Couple staff scheduling, slot preference penalties, overtime thresholds, and shared equipment capacity across every slot, and minimize total cost.

## Mathematical Model

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{J-1} \sum_{i=0}^{N-1} \sum_{t=0}^{T-1} (c_i + p_{j,t}) x_{j,i,t} + \sum_{i=0}^{N-1} c^{\text{ot}}_i o_i \\
\text{s.t.} \quad & \sum_{i=0}^{N-1} \sum_{t=0}^{T-1} x_{j,i,t} = 1 && \forall j \\
& \sum_{t=0}^{T-1} x_{j,i,t} = 0 && \forall i, j : \text{cert}_{i,j} = 0 \\
& \sum_{j=0}^{J-1} x_{j,i,t} \le 1 && \forall i, t \\
& \sum_{j=0}^{J-1} \sum_{i=0}^{N-1} e_j x_{j,i,t} \le E_{\text{cap}} && \forall t \\
& \sum_{j=0}^{J-1} \sum_{t=0}^{T-1} x_{j,i,t} \le M_i, \quad o_i \ge \sum_{j=0}^{J-1} \sum_{t=0}^{T-1} x_{j,i,t} - R_i, \quad o_i \ge 0 && \forall i \\
& x_{j,i,t} \in \{0, 1\} && \forall j, i, t
\end{aligned}
$$

## Key Points

- **Joint resource coupling beats sequential decomposition**: Assigning staff to procedures first without considering shared equipment $E_{\text{cap}}$ or slot preferences often creates slot bottlenecks that force expensive overtime or infeasible equipment peaks. Solving all three decisions on one coupled binary tensor $x_{j,i,t}$ captures every trade-off simultaneously.
- **Overtime epigraph without extra binaries**: Letting $\text{work}_i = \sum_{j,t} x_{j,i,t}$, because $o_i \ge 0$ and $o_i \ge \text{work}_i - R_i$ with positive penalty $c^{\text{ot}}_i > 0$, minimizing pushes $o_i$ cleanly to $\max(0, \text{work}_i - R_i)$.
- **Zeroing uncertified `(i, j)` pairs prunes search**: Enforcing $\text{cert}_{i,j} = 0 \implies \sum_t x_{j,i,t} = 0$ eliminates invalid staff-procedure combinations before branching.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Variable Types](?view=guide&lang=en#variable-types).

## Key Implementation

In addition to each staff member's per-slot exclusivity, maximum workload limit, and overtime epigraph constraints, construct the shared equipment capacity constraint for each timeslot. In WaSHI, generate the constraint arrays with `forEach` and `flatMap`; in PuLP, express them with loops and `pulp.lpSum`.

**WaSHI (TypeScript)**

```ts
input.staffCosts.forEach((_, i) => {
  m.constraint(
    Array.from({ length: T }, (__, t) =>
      expr`${sum(x.map((jobStaff) => jobStaff[i][t]))} <= 1`
    )
  );
  const staffLoad = sum(x.flatMap((jobStaff) => jobStaff[i]));
  m.constraint([
    expr`${staffLoad} <= ${input.maxLimits[i]}`,
    expr`${overtime[i]} >= ${staffLoad} - ${input.regularLimits[i]}`,
  ]);
});
m.constraint(
  Array.from({ length: T }, (_, t) => {
    const eqUsed = sum(
      x.flatMap((jobStaff, j) =>
        jobStaff.map((staffSlots) => expr`${input.equipNeeds[j]} * ${staffSlots[t]}`)
      )
    );
    return expr`${eqUsed} <= ${input.equipCap}`;
  })
);
```

**PuLP (Python)**

```python
for i in range(num_staff):
    for t in range(num_slots):
        prob += pulp.lpSum(x[j][i][t] for j in range(num_jobs)) <= 1
    staff_load = pulp.lpSum(x[j][i][t] for j in range(num_jobs) for t in range(num_slots))
    prob += staff_load <= max_limits[i]
    prob += overtime[i] >= staff_load - regular_limits[i]
for t in range(num_slots):
    prob += pulp.lpSum(equip_needs[j] * x[j][i][t] for j in range(num_jobs) for i in range(num_staff)) <= equip_cap
```
