# #097. Classical Benders Decomposition

<!-- section:scenario -->
A distribution company decides which candidate warehouses to open (first-stage binary decisions incurring fixed activation costs) and how much product to ship from each opened facility to customer zones (second-stage continuous linear transportation recourse). Because second-stage shipping depends only on the fixed vector of opened warehouses, the problem decomposes naturally across stages.

Implement Classical Benders Decomposition with WaSHI solveBenders: optimize binary facility openings plus an auxiliary recourse estimator in the master problem, solve the continuous transportation LP subproblem (or Phase-I elastic feasibility LP when capacity is insufficient) to extract exact shadow prices, and feed Benders feasibility and optimality cuts back to the master until the lower and upper bounds close.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `fixedCosts` | `number[]` | Fixed opening cost for each candidate facility $i$ |
| `capacities` | `number[]` | Maximum supply capacity available at facility $i$ if opened |
| `demands` | `number[]` | Required shipment demand at each customer zone $j$ |
| `shippingCosts` | `number[][]` | Unit shipping cost `shippingCosts[i][j]` from facility $i$ to customer $j$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `open` | `number[]` | Binary facility selection vector ($0$ or $1$) |
| `shipments` | `number[][]` | Non-negative shipment matrix `shipments[i][j]` |
| `totalCost` | `number` | Minimum total fixed plus shipping cost |

<!-- section:example -->
**Input**

```json
{
  "fixedCosts": [100, 120],
  "capacities": [50, 60],
  "demands": [30, 25, 20],
  "shippingCosts": [
    [2, 5, 3],
    [4, 2, 4]
  ]
}
```

**Output**

```json
{
  "open": [1, 1],
  "shipments": [
    [30, 0, 20],
    [0, 25, 0]
  ],
  "totalCost": 390
}
```

Opening both warehouses yields fixed cost `100 + 120 = 220` plus shipping cost `60 + 60 + 50 = 170` for optimal total cost **390**.
