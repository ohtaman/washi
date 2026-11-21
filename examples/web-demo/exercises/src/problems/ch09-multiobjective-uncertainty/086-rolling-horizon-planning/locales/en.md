# #086. Rolling-Horizon Planning (MPC)

<!-- section:scenario -->
A plant operates over a finite horizon using Model Predictive Control. At the start of each period, the planner observes the current realized inventory and solves a finite lookahead linear program over the next window of forecasted demands, subject to per-period production capacity, inventory holding cost, and unmet-demand shortfall penalties.

However, only the immediate production decision for the current period is committed. Actual demand then realizes for that period, updating ending inventory and any realized shortfall before the horizon slides forward one step. Return the committed decisions, realized inventory and shortfall trajectories, and total realized cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `actualDemands` | `number[]` | Realized customer demand observed after committing each period |
| `forecastDemands` | `number[]` | Demand forecasts used inside each lookahead window |
| `prodCosts` | `number[]` | Unit production cost in each period $t$ |
| `prodCap` | `number` | Maximum production capacity per period |
| `holdCost` | `number` | Unit holding cost on ending inventory per period |
| `shortfallPenalty` | `number` | Penalty cost per unit of unmet demand |
| `initialInventory` | `number` | Starting inventory before period 0 |
| `windowLen` | `number` | Lookahead window length $H$ at each decision step |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `produced` | `number[]` | Committed production quantity in each period $t$ |
| `inventories` | `number[]` | Realized ending inventory after period $t$ demand |
| `shortfalls` | `number[]` | Realized unmet demand shortfall in period $t$ |
| `totalCost` | `number` | Total accumulated realized production, holding, and shortfall cost |

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