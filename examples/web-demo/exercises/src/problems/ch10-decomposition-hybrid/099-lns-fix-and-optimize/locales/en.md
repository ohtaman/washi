# #099. Fix-and-Optimize Matheuristic (Rolling-Window MIP)

<!-- section:scenario -->
At an injection-molding parts manufacturer's plant, plan multi-period production of plastic parts (in cases) across a planning horizon:
- Starting from zero initial inventory, meet each period's demand from prior ending inventory plus current production with no backorders, carrying any surplus into the next period.
- Production in a period requires an active 0-1 setup (such as mold changeover) and cannot exceed that period's capacity; otherwise production must be 0.
- Minimize total fixed setup, unit production, and end-of-period inventory holding costs (in JPY).

Because a single monolithic MIP can stall over long horizons, start from the given initial setup plan and window width, run rolling-window Fix-and-Optimize until a full sweep yields no cost reduction, and return the final setups, production quantities, inventory levels, and total cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[]` | Required demand in period $t$ (cases) |
| `setupCosts` | `number[]` | Fixed setup cost when performing a setup in period $t$ (JPY) |
| `prodCosts` | `number[]` | Production cost per case in period $t$ (JPY) |
| `holdCost` | `number` | Inventory holding cost per case of ending inventory (JPY) |
| `capacities` | `number[]` | Maximum production capacity in period $t$ when setup is active (cases) |
| `initialPlan` | `number[]` | Feasible initial 0/1 setup vector |
| `windowSize` | `number` | Number of consecutive periods unfixed in each Fix-and-Optimize subproblem |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `setups` | `number[]` | 0/1 setup vector across all periods |
| `production` | `number[]` | Production quantities per period (non-negative real values, cases) |
| `inventory` | `number[]` | Ending inventory levels (starting from zero initial inventory, cases) |
| `totalCost` | `number` | Sum of fixed setup, production, and inventory holding costs (JPY) |

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

Production stays within active capacities (`60`, `50`, `25` $\le 60$) and balances inventory in every period, yielding setup cost $120 \times 3 = 360$, production cost $4 \times 135 = 540$, and holding cost $1 \times (40 + 15 + 0 + 20 + 0 + 0) = 75$, totaling $360 + 540 + 75 =$ **975**.

<!-- section:hint1 -->
Maintain a current best binary setup vector initialized from `initialPlan` and sweep overlapping windows of length `windowSize` across the horizon. In each subproblem, only the setup decisions inside the active window are free binary variables while outside setups stay fixed and continuous production and inventory variables remain free across all periods.

<!-- section:hint2 -->
Model the full-horizon lot-sizing constraints in each sub-MIP: $0 \le p_t \le C_t y_t$ and inventory balance $I_{t-1} + p_t - d_t = I_t$ with $I_{-1} = 0$, fixing $y_t = \bar{y}_t$ for $t \notin [\text{start}, \text{start} + \text{windowSize})$. Accept a window solution whenever its objective strictly improves on the incumbent (by more than $10^{-6}$), and stop once a complete pass over all windows finds no improvement.
