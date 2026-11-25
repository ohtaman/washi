# #086. Rolling-Horizon Planning (MPC)

<!-- section:scenario -->
A beverage bottling plant uses Model Predictive Control (MPC) to manage multi-period production and inventory of bottled beverages (in cases). At the start of each period, the planner observes the current realized inventory (in cases) and solves a lookahead linear program over the upcoming forecast window (truncated at the end of the planning horizon), minimizing total production cost, ending-inventory holding cost (JPY/case), and unmet-demand shortfall penalty (JPY/case) subject to per-period production capacity (cases) and inventory/shortfall balance.

Only the current period's production quantity is committed and executed. Actual demand then realizes for that period; unmet demand is lost (not backlogged), so actual ending inventory stays non-negative and shortfalls do not carry over to the next period before the window slides forward one period. Return the executed production quantities, realized ending inventories, realized shortfalls, and total accumulated realized cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `actualDemands` | `number[]` | Realized demand observed in each period after committing production (cases) |
| `forecastDemands` | `number[]` | Forecasted demand for each period referenced inside lookahead planning (cases) |
| `prodCosts` | `number[]` | Unit production cost in each period (JPY/case) |
| `prodCap` | `number` | Maximum production capacity per period (cases) |
| `holdCost` | `number` | Holding cost per case of ending inventory (JPY) |
| `shortfallPenalty` | `number` | Shortfall penalty per case of unmet demand (JPY) |
| `initialInventory` | `number` | Initial inventory before period 0 (cases) |
| `windowLen` | `number` | Lookahead window length in periods at each step (truncated at the horizon end) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `produced` | `number[]` | Committed production quantity in each period (cases) |
| `inventories` | `number[]` | Realized ending inventory after each period's demand (cases) |
| `shortfalls` | `number[]` | Realized unmet demand shortfall in each period (cases) |
| `totalCost` | `number` | Total accumulated realized production, holding, and shortfall cost (JPY) |

<!-- section:example -->
**Input**

```json
{
  "actualDemands": [10, 10, 30, 10],
  "forecastDemands": [10, 10, 30, 10],
  "prodCosts": [9, 13, 25, 11],
  "prodCap": 20,
  "holdCost": 2,
  "shortfallPenalty": 100,
  "initialInventory": 0,
  "windowLen": 2
}
```

**Output**

```json
{
  "produced": [20, 20, 10, 10],
  "inventories": [10, 20, 0, 0],
  "shortfalls": [0, 0, 0, 0],
  "totalCost": 860
}
```

Planning with `windowLen = 2` commits `[20, 20, 10, 10]`, maintaining realized inventories `[10, 20, 0, 0]` and zero shortfalls for total cost $(20 \times 9 + 20 \times 13 + 10 \times 25 + 10 \times 11) + 2 \times (10 + 20) =$ **860**.


<!-- section:hint1 -->
Simulate the planning horizon one period at a time while carrying forward the realized inventory. At each period, build and solve a fresh lookahead linear program over a bounded lookahead window with production, ending-inventory, and shortfall decisions for each period in the window.

<!-- section:hint2 -->
Inside each lookahead LP, optimize strictly against `forecastDemands` (truncated at the horizon end)—never peek at `actualDemands`. Commit only the first period's production decision from that LP, then update the true inventory and realized shortfall against `actualDemands[t]` and accumulate the realized period cost.