# #099. Large Neighborhood Search (Fix-and-Optimize)

<!-- section:scenario -->
A manufacturing plant plans production over a discrete horizon. Each period has a fixed demand, a binary setup decision that unlocks production up to capacity while incurring a setup cost, a per-unit production cost, and an end-of-period inventory holding cost. Over long horizons, monolithic binary lot sizing can stall in branch-and-bound.

Implement the Fix-and-Optimize Large Neighborhood Search matheuristic starting from the given initial setup plan: sweep overlapping rolling windows across the horizon, unfixing only the binary setup variables inside the active window while leaving outside setups fixed and all continuous production and inventory flows free to re-balance, until a full sweep yields no further cost reduction.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[]` | Product demand required in period $t$ |
| `setupCosts` | `number[]` | Fixed machine setup cost incurred if period $t$ produces |
| `prodCosts` | `number[]` | Unit production cost in period $t$ |
| `holdCost` | `number` | Per-unit holding cost on end-of-period inventory |
| `capacities` | `number[]` | Maximum production capacity in period $t$ when setup is active |
| `initialPlan` | `number[]` | Feasible starting binary setup vector |
| `windowSize` | `number` | Number of consecutive periods unfixed in each LNS subproblem |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `setups` | `number[]` | Binary setup decisions ($0$ or $1$) across all periods |
| `production` | `number[]` | Continuous production quantities per period |
| `inventory` | `number[]` | End-of-period inventory quantities (starting from zero initial stock) |
| `totalCost` | `number` | Total setup, production, and inventory holding cost |

<!-- section:example -->
**Input**

```json
{
  "demands": [20, 25, 15, 30, 20, 25],
  "setupCosts": [120, 120, 120, 120, 120, 120],
  "prodCosts": [4, 4, 4, 4, 4, 4],
  "holdCost": 1,
  "capacities": [60, 60, 60, 60, 60, 60],
  "initialPlan": [1, 1, 1, 1, 1, 1],
  "windowSize": 3
}
```

**Output**

```json
{
  "setups": [1, 0, 0, 1, 0, 1],
  "production": [60, 0, 0, 50, 0, 25],
  "inventory": [40, 15, 0, 20, 0, 0],
  "totalCost": 975
}
```

Consolidating six setups down to three reduces setup cost to `360`, combined with production `540` and holding `75` for total cost **975**.
