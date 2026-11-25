# #063. Backorders & Lost Sales Inventory Planning

<!-- section:scenario -->
A wireless earbud manufacturer plans continuous production, shipments, ending inventory, temporary backorders, and permanent lost sales across multiple periods, starting from a given initial inventory and zero initial backlog.

- **Production capacity**: Continuous production in each period is non-negative and cannot exceed that period's production capacity.
- **Physical inventory balance**: Ending physical inventory in each period is non-negative and equals prior-period inventory plus current production minus actual shipments.
- **Backlog and lost sales**: Unfulfilled accepted demand accumulates into non-negative ending backlog (prior backlog plus current demand minus actual shipments and lost sales), where lost sales in each period cannot exceed that period's demand and ending backlog in the final period must be zero.
- **Objective**: Each shipped unit earns a fixed selling price, while production, ending inventory, ending backlog, and lost sales each incur per-unit costs; choose all continuous quantities to **maximize net profit**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[]` | Customer demand in each period |
| `capacities` | `number[]` | Production capacity upper bound in each period |
| `prodCosts` | `number[]` | Unit production cost in each period |
| `unitPrice` | `number` | Selling price earned per unit actually shipped |
| `holdCost` | `number` | Unit holding cost per period on ending physical inventory |
| `backorderCost` | `number` | Penalty per unit of ending backlog carried per period |
| `lostSalePenalty` | `number` | Goodwill penalty per unit of lost sales |
| `initialInventory` | `number` | Starting physical inventory before period 0 |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `production` | `number[]` | Non-negative continuous production quantities per period (bounded by each period's capacity) |
| `sales` | `number[]` | Non-negative continuous actual units shipped per period |
| `inventory` | `number[]` | Non-negative continuous ending physical inventory per period |
| `backlog` | `number[]` | Non-negative continuous ending backlog per period (0 in the final period) |
| `lostSales` | `number[]` | Non-negative continuous lost sales per period (bounded by each period's demand) |
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

Carrying 10 units of ending inventory out of period 0 (initial stock 5 plus 5 extra units produced) and backordering 10 units from period 1 to period 2 satisfies both balance equations with terminal backlog 0 and yields net profit $125(22) - (350 + 360 + 300 + 275) - 10(1.5) - 10(3) =$ **1,420**.


<!-- section:hint1 -->
Create five non-negative continuous vectors indexed by period: production, actual sales (shipments), ending physical inventory, ending backlog, and lost sales. Unlike standard lot sizing, physical inventory and customer-order backlog are tracked by two separate conservation chains.

<!-- section:hint2 -->
Physical inventory carries over from the prior period (`initialInventory` at period 0), increases with production, and decreases with shipments; backlog carries over from zero initial backlog, increases with new demand, and decreases with both shipments and lost sales. Bound `lostSales[t]` by `demands[t]` and fix the final-period backlog to 0 so all accepted orders are cleared by the end of the horizon.
