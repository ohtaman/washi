## Approach

Introduce binary setup indicators $y_{i,t}$, non-negative integer production releases $x_{i,t}$, and continuous non-negative ending inventories $I_{i,t}$ across the item–period grid. Link each release to its setup via a per-period capacity gate and couple the BOM echelons through time-shifted inventory balance equations—where parent releases $x_{j,t}$ trigger immediate child demand $\sum_j r_{i,j} x_{j,t}$ while item $i$'s own releases arrive after $L_i$ periods—to minimize total setup, production, and holding costs.

## Mathematical Model

$$
\begin{aligned}
\min_{y \in \{0,1\}^{N \times T},\; x \in \mathbb{Z}_{\ge 0}^{N \times T},\; I \ge 0} \quad & \sum_{i=0}^{N-1} \sum_{t=0}^{T-1} \left( F_i y_{i,t} + c_i x_{i,t} + h_i I_{i,t} \right) \\
\text{s.t.} \quad & I_{i,t-1} + x_{i, t - L_i} - D_{i,t} - \sum_{j=0}^{N-1} r_{i,j} x_{j,t} = I_{i,t} && \forall i, t \\
& 0 \le x_{i,t} \le C_i y_{i,t} && \forall i, t
\end{aligned}
$$

Here $r_{i,j} = \text{bom}[i][j]$, $D_{i,t} = \text{externalDemands}[i][t]$, $L_i = \text{leadTimes}[i]$, $I_{i,-1} = \text{initialInventory}[i]$, $F_i = \text{setupCosts}[i]$, $c_i = \text{prodCosts}[i]$, $h_i = \text{holdCosts}[i]$, and $C_i = \text{capacities}[i]$, with $x_{i, t - L_i} \equiv 0$ whenever $t < L_i$.

## Key Points

- **Time-shifted arrivals vs. immediate component consumption**: Releasing a parent batch at $t$ draws child inventory at $t$, whereas the parent itself enters finished stock at $t + L_j$. This single shifted index links all BOM echelons cleanly without duplicating lead-time states.
- **Lot sizing propagates upstream**: Batching a downstream item to save a downstream setup cost $F_j$ automatically creates spiky dependent demand at its release period, which can force upstream subassemblies to smooth production earlier via their own inventories.
- Related definitions: [Guide & Glossary — Variable Types](?view=guide&lang=en#variable-types) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

For each item and period, construct the setup-linking constraint and the inventory balance equation incorporating lead-time-shifted arrivals and BOM-exploded dependent demand. In WaSHI, extract non-zero parent terms from `bom[i]` and sum them with `sum()`; in PuLP, express dependent demand with a comprehension.

**WaSHI (TypeScript)**

```ts
input.externalDemands.forEach((extRow, i) => {
  const L = input.leadTimes[i];
  extRow.forEach((extDemand, t) => {
    m.constraint(expr`${production[i][t]} <= ${input.capacities[i]} * ${setups[i][t]}`);
    const prevInv = t === 0 ? input.initialInventory[i] : inventory[i][t - 1];
    const arrival = t >= L ? production[i][t - L] : 0;
    const depTerms = input.bom[i]
      .map((ratio, j) => (ratio !== 0 ? expr`${ratio} * ${production[j][t]}` : null))
      .filter((term): term is NonNullable<typeof term> => term !== null);
    const depExpr = depTerms.length > 0 ? sum(depTerms) : 0;
    m.constraint(expr`${prevInv} + ${arrival} - ${depExpr} - ${inventory[i][t]} == ${extDemand}`);
  });
});
```

**PuLP (Python)**

```python
for i in range(n_items):
    L = lead_times[i]
    for t in range(T):
        prob += production[i][t] <= capacities[i] * setups[i][t]
        prev_inv = initial_inventory[i] if t == 0 else inventory[i][t - 1]
        arrival = production[i][t - L] if t >= L else 0
        dep_demand = pulp.lpSum(
            bom[i][j] * production[j][t] for j in range(n_items) if bom[i][j] != 0
        )
        prob += prev_inv + arrival - dep_demand - inventory[i][t] == external_demands[i][t]
```
