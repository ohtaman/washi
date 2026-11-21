# #063. Backorders & Lost Sales Inventory Planning

<!-- section:scenario -->
A manufacturer plans continuous production, shipments, inventory, temporary backorders, and permanent lost sales across multiple periods starting from a known initial inventory and zero initial backlog.

In each period, physical inventory equals prior inventory plus current production minus actual shipments, while unfulfilled accepted orders accumulate in backlog (which must clear to zero by the end of the final period) and any rejected current demand becomes a lost sale bounded by that period's demand. Each shipped unit earns a fixed unit price, while production, ending inventory, ending backlog, and lost sales each incur per-unit costs. Choose all continuous quantities to **maximize net profit**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[]` | Customer demand $d_t$ in period $t$ |
| `capacities` | `number[]` | Maximum production capacity $C_t$ in period $t$ |
| `prodCosts` | `number[]` | Unit production cost $c_t$ in period $t$ |
| `unitPrice` | `number` | Selling price $r$ per unit actually shipped |
| `holdCost` | `number` | Unit holding cost $h$ per period on ending inventory |
| `backorderCost` | `number` | Penalty $p_b$ per unit of ending backlog carried per period |
| `lostSalePenalty` | `number` | Goodwill penalty $p_l$ per unit of lost sales |
| `initialInventory` | `number` | Starting physical inventory $I_{-1}$ before period 0 |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `production` | `number[]` | Continuous production quantity $x_t \in [0, C_t]$ |
| `sales` | `number[]` | Actual units shipped $s_t \ge 0$ in period $t$ |
| `inventory` | `number[]` | Non-negative physical ending inventory $I_t$ |
| `backlog` | `number[]` | Non-negative ending backlog $b_t$ with $b_{T-1} = 0$ |
| `lostSales` | `number[]` | Permanently lost demand $l_t \in [0, d_t]$ |
| `netProfit` | `number` | Maximized net profit over the horizon |

<!-- section:example -->
**Input**

```json
{
  "demands": [30, 50, 20, 25],
  "capacities": [35, 30, 40, 30],
  "prodCosts": [10, 12, 10, 11],
  "unitPrice": 22,
  "holdCost": 1.5,
  "backorderCost": 3,
  "lostSalePenalty": 5,
  "initialInventory": 5
}
```

**Output**

```json
{
  "production": [35, 30, 30, 25],
  "sales": [30, 40, 30, 25],
  "inventory": [10, 0, 0, 0],
  "backlog": [0, 10, 0, 0],
  "lostSales": [0, 0, 0, 0],
  "netProfit": 1420
}
```

Pre-building 10 units in period 0 and backordering 10 units from period 1 to period 2 satisfies both balance equations with terminal backlog 0 and yields net profit $125(22) - (350 + 360 + 300 + 275) - 10(1.5) - 10(3) =$ **1,420**.


<!-- section:hint1 -->
Create five non-negative continuous vectors indexed by period: production, actual sales (shipments), ending physical inventory, ending backlog, and lost sales. Unlike standard lot sizing, physical inventory and customer-order backlog are tracked by two separate conservation chains.

<!-- section:hint2 -->
Physical inventory carries over from the prior period (`initialInventory` at $t = 0$), increases with production, and decreases with shipments; backlog carries over from zero initial backlog, increases with new demand, and decreases with both shipments and lost sales. Bound `lostSales[t]` by `demands[t]` and fix the terminal backlog $b_{T-1} = 0$ so all accepted orders are cleared by the end of the horizon.
