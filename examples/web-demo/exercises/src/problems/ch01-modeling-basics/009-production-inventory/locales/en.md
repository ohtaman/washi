# #009. Multi-Period Production & Inventory

<!-- section:scenario -->
A factory plans regular production, overtime production, and end-of-period inventory across multiple consecutive time periods, starting from a known initial inventory level.

In every period, regular and overtime production cannot exceed their respective period capacities, warehouse storage cannot exceed the holding cap, and beginning inventory plus total output minus customer demand must equal ending inventory (all non-negative). Furthermore, ending inventory after the final period must meet or exceed a required safety stock threshold. Schedule regular production, overtime production, and inventory levels to **minimize total production and holding cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[]` | Customer demand in each period $t$ |
| `regCap` | `number[]` | Maximum regular production capacity in each period $t$ |
| `otCap` | `number[]` | Maximum overtime production capacity in each period $t$ |
| `invCap` | `number` | Warehouse storage capacity in every period |
| `initialInventory` | `number` | Opening stock before period 0 |
| `minFinalInventory` | `number` | Minimum required ending stock after the last period |
| `regCost` | `number` | Unit regular production cost |
| `otCost` | `number` | Unit overtime production cost |
| `holdCost` | `number` | Unit holding cost per period |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `regular` | `number[]` | Regular production schedule across periods |
| `overtime` | `number[]` | Overtime production schedule across periods |
| `inventory` | `number[]` | End-of-period inventory schedule across periods |
| `totalCost` | `number` | Minimized total production and holding cost |

<!-- section:example -->
**Input**

```json
{
  "demands": [80, 140, 120, 70],
  "regCap": [100, 100, 100, 100],
  "otCap": [40, 40, 40, 40],
  "invCap": 60,
  "initialInventory": 10,
  "minFinalInventory": 10,
  "regCost": 20,
  "otCost": 32,
  "holdCost": 3
}
```

**Output**

```json
{
  "regular": [100, 100, 100, 80],
  "overtime": [0, 10, 20, 0],
  "inventory": [30, 0, 0, 10],
  "totalCost": 8680
}
```

Using spare regular capacity in Period 0 stores 30 units at 3/unit holding cost instead of paying a 12/unit overtime premium in Period 1, achieving minimum cost **8,680**.

<!-- section:hint1 -->
The `regular`, `overtime`, and `inventory` decision arrays (with period capacities and final safety-stock lower bound) are ready in the starter code. Write the **inventory flow-conservation equation** connecting period $t-1$ to period $t$:
$$\text{prevInventory} + \text{regular}[t] + \text{overtime}[t] - \text{inventory}[t] == \text{demands}[t]$$
where `prevInventory = initialInventory` when $t = 0$ and `inventory[t - 1]` for $t \ge 1$.

<!-- section:hint2 -->
Minimize `regCost * sum(regular) + otCost * sum(overtime) + holdCost * sum(inventory)`, solve, and return `{ regular, overtime, inventory, totalCost }`.

<!-- section:formulation -->
$$
\begin{aligned}
\min_{r, o, I \ge 0} \quad & \sum_{t=0}^{T-1} \left( c_r r_t + c_o o_t + c_h I_t \right) \\
\text{s.t.} \quad & I_t = I_{t-1} + r_t + o_t - d_t && \forall t \;\; (I_{-1} = I_{\text{init}}) \\
& 0 \le r_t \le R_t, \; 0 \le o_t \le O_t, \; 0 \le I_t \le I_{\max} && \forall t \\
& I_{T-1} \ge I_{\min,\text{end}}
\end{aligned}
$$

Inventory balance equations (`stock_next = stock_prev + inflow - outflow`) form a network-flow backbone appearing in supply chains, energy storage, and cash management.
