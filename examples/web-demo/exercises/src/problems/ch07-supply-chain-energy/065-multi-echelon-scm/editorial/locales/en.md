## Approach

Combine binary facility-opening indicators for plants ($u_p$) and DCs ($w_d$) with continuous two-echelon flow matrices ($f_{p,d}$ and $g_{d,c}$), coupling capacity gates at each opened facility with exact transshipment conservation at every DC.

## Mathematical Model

$$
\begin{aligned}
\min_{u, w \in \{0,1\},\; f, g \ge 0} \quad & \sum_{p} F^P_p u_p + \sum_{d} F^D_d w_d + \sum_{p,d} c_{p,d} f_{p,d} + \sum_{d,c} c'_{d,c} g_{d,c} \\
\text{s.t.} \quad & \sum_{d} f_{p,d} \le C^P_p u_p && \forall p \\
& \sum_{p} f_{p,d} \le C^D_d w_d && \forall d \\
& \sum_{p} f_{p,d} = \sum_{c} g_{d,c} && \forall d \\
& \sum_{d} g_{d,c} \ge D_c && \forall c
\end{aligned}
$$

## Key Points

- **One capacity gate suffices per DC**: Because inflow equals outflow ($\sum_p f_{p,d} = \sum_c g_{d,c}$), bounding DC inflow by $C^D_d w_d$ automatically bounds DC outbound volume as well.
- **Joint fixed-charge vs. transport tradeoff**: Closing a nearby DC saves $F^D_d$ but forces longer cross-regional outbound routes $c'_{d,c}$, while tighter plant capacities can require opening a second plant upstream.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

**WaSHI (TypeScript)**

```ts
m.constraint(
  plantToDc.map((row, p) => expr`${sum(row)} <= ${input.plantCaps[p]} * ${openPlants[p]}`)
);
input.dcCaps.forEach((cap, d) => {
  const dcInflow = sum(plantToDc.map((row) => row[d]));
  const dcOutflow = sum(dcToCustomer[d]);
  m.constraint(expr`${dcInflow} <= ${cap} * ${openDcs[d]}`);
  m.constraint(expr`${dcInflow} - ${dcOutflow} == 0`);
});
```

**PuLP (Python)**

```python
for p in range(n_plants):
    prob += pulp.lpSum(plant_to_dc[p]) <= plant_caps[p] * open_plants[p]
for d in range(n_dcs):
    inflow = pulp.lpSum(plant_to_dc[p][d] for p in range(n_plants))
    outflow = pulp.lpSum(dc_to_cust[d])
    prob += inflow <= dc_caps[d] * open_dcs[d]
    prob += inflow == outflow
```
