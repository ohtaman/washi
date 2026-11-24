## Approach

Declare continuous per-period vectors `regular`, `overtime`, and `inventory` with their capacity and safety-stock variable bounds, link consecutive periods with flow-conservation equalities, and minimize total production and holding cost.

## Mathematical Model

$$
\begin{aligned}
\min_{r, o, I \ge 0} \quad & \sum_{t=0}^{T-1} \left( c_r r_t + c_o o_t + c_h I_t \right) \\
\text{s.t.} \quad & I_t = I_{t-1} + r_t + o_t - d_t && \forall t \;\; (I_{-1} = I_{\text{init}}) \\
& 0 \le r_t \le R_t, \; 0 \le o_t \le O_t, \; 0 \le I_t \le I_{\max} && \forall t \\
& I_{T-1} \ge I_{\min,\text{end}}
\end{aligned}
$$

## Key Points

- **State transition as flow conservation**: Each period links `prev + inflow - outflow == next`, where `prev` is constant `initialInventory` at $t = 0$ and `inventory[t - 1]` for $t \ge 1$. The same time-expanded structure models battery storage, cash balance, and water reservoirs.
- **Bounds instead of redundant inequality rows**: Encoding `0 <= regular[t] <= regCap[t]`, `0 <= overtime[t] <= otCap[t]`, `0 <= inventory[t] <= invCap`, and `inventory[T - 1] >= minFinalInventory` directly on variable declarations keeps the constraint matrix minimal.
- Related definitions: [Guide & Glossary — Core Building Blocks](?view=guide&lang=en#building-blocks) and [Problem Families](?view=guide&lang=en#paradigms).

## Key Implementation

Only period 0 (`t === 0`) references the constant `initialInventory`; all subsequent periods link to the previous period's variable `inventory[t - 1]` to form the inventory-balance equalities.

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.demands.map((demand, t) => {
    const prev = t === 0 ? input.initialInventory : inventory[t - 1];
    return expr`${prev} + ${regular[t]} + ${overtime[t]} - ${inventory[t]} == ${demand}`;
  })
);
m.objective(
  minimize(
    expr`${input.regCost} * ${sum(regular)} + ${input.otCost} * ${sum(overtime)} + ${input.holdCost} * ${sum(inventory)}`
  )
);
```

**PuLP (Python)**

```python
for t in range(T):
    prev = init_inv if t == 0 else inventory[t - 1]
    prob += prev + regular[t] + overtime[t] - inventory[t] == demands[t]

prob += (
    reg_cost * pulp.lpSum(regular)
    + ot_cost * pulp.lpSum(overtime)
    + hold_cost * pulp.lpSum(inventory)
)
prob.solve(pulp.HiGHS(msg=False))
```
