## Approach

Over $T$ periods with customer demands $d_t$, production capacities $C_t$, unit production costs $c_t$, selling price $r$, holding cost $h$, backorder cost $p_b$, lost-sale penalty $p_l$, and initial inventory $I_{\text{init}}$, we introduce non-negative continuous variables for production $x_t$, actual shipments $s_t$, ending physical inventory $I_t$, ending backlog $b_t$, and permanent lost sales $l_t$. We enforce two coupled linear conservation equations per period—one for physical inventory and one for customer backlog—along with capacity bounds, demand bounds on lost sales, and $b_{T-1} = 0$ so all accepted orders eventually ship. Maximizing total shipment revenue minus production, holding, backorder, and lost-sale costs yields a pure linear program.

## Mathematical Model

$$
\begin{aligned}
\max_{x, s, I, b, l \ge 0} \quad & \sum_{t=0}^{T-1} \left( r s_t - c_t x_t - h I_t - p_b b_t - p_l l_t \right) \\
\text{s.t.} \quad & I_t = I_{t-1} + x_t - s_t && \forall t \;\; (I_{-1} = I_{\text{init}}) \\
& b_t = b_{t-1} + d_t - s_t - l_t && \forall t \;\; (b_{-1} = 0,\; b_{T-1} = 0) \\
& 0 \le x_t \le C_t, \quad 0 \le l_t \le d_t && \forall t
\end{aligned}
$$

## Key Points

- **Why a pure LP suffices (no binary indicator needed for $I_t \cdot b_t = 0$)**: Because $h > 0$ and $p_b > 0$, simultaneously holding positive inventory $I_t > 0$ and positive backlog $b_t > 0$ wastes $(h + p_b)\min(I_t, b_t)$ without increasing total deliveries, so optimality automatically keeps $I_t \cdot b_t = 0$.
- **Three-way demand response**: When period demand spikes above capacity, the model balances pre-building stock (paying $h$), deferring delivery via backorders (paying $p_b$), and declining unprofitable or unservable demand as lost sales (forgoing $r - c_t$ plus paying $p_l$).
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Pass each period's physical inventory conservation equation and backorder conservation equation to `m.constraint()` as arrays, and fix the final-period backorder to 0 via its variable upper bound. In WaSHI, construct each period's balance equation with `map` and `expr`; in PuLP, add the equality constraints inside a loop.

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.demands.map((_, t) => {
    const prevInv = t === 0 ? input.initialInventory : inventory[t - 1];
    return expr`${prevInv} + ${production[t]} - ${sales[t]} - ${inventory[t]} == 0`;
  })
);
m.constraint(
  input.demands.map((demand, t) => {
    const prevBack = t === 0 ? 0 : backlog[t - 1];
    return expr`${prevBack} + ${demand} - ${sales[t]} - ${lostSales[t]} - ${backlog[t]} == 0`;
  })
);
```

**PuLP (Python)**

```python
for t in range(T):
    prev_inv = initial_inventory if t == 0 else inventory[t - 1]
    prev_back = 0 if t == 0 else backlog[t - 1]
    prob += prev_inv + production[t] - sales[t] == inventory[t]
    prob += prev_back + demands[t] - sales[t] - lost_sales[t] == backlog[t]
```
