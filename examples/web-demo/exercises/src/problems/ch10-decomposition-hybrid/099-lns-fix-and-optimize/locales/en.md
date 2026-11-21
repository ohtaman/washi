# #099. Large Neighborhood Search (Fix-and-Optimize)

<!-- section:scenario -->
A manufacturing plant plans production over a discrete horizon. Each period has a fixed demand, a binary setup decision that unlocks production up to capacity while incurring a setup cost, a per-unit production cost, and an end-of-period inventory holding cost. Over long horizons, monolithic binary lot sizing can stall in branch-and-bound.

Use Fix-and-Optimize Large Neighborhood Search starting from the given initial setup plan and window size to iteratively improve the lot-sizing schedule until a full sweep yields no further cost reduction, returning the final setups, production, inventory, and total cost.

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

<!-- section:hint1 -->
Maintain a current best binary setup vector initialized from `initialPlan` and sweep overlapping windows of length `windowSize` across the horizon. In each subproblem, only the setup decisions inside the active window are free binary variables while outside setups stay fixed and continuous production and inventory variables remain free across all periods.

<!-- section:hint2 -->
Model the full-horizon lot-sizing constraints in each sub-MIP: $0 \le p_t \le C_t y_t$ and inventory balance $I_{t-1} + p_t - d_t = I_t$ with $I_{-1} = 0$, fixing $y_t = \bar{y}_t$ for $t \notin [\text{start}, \text{start} + \text{windowSize})$. Accept a window solution whenever its objective strictly improves on the incumbent (by more than $10^{-6}$), and stop once a complete pass over all windows finds no improvement.
