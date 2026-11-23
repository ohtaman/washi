# #012. Fixed-Charge Network Design

<!-- section:scenario -->
A produce wholesaler is designing which candidate truck routes to use to ship seasonal apples (tons) from multiple regional collection centers to multiple supermarkets. Using a route requires first paying a fixed charter contract fee to open it, after which continuous quantities can be shipped up to the route's load capacity (tons); unopened routes must carry zero flow.

While respecting each collection center's supply limit and meeting every supermarket's demand, **minimize the sum of fixed contract fees across all open routes and variable shipping costs proportional to shipment volume**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `supplies` | `number[]` | Supply limit at each collection center $i$ (tons) |
| `demands` | `number[]` | Required demand at each supermarket $j$ (tons) |
| `fixedCosts` | `number[][]` | Fixed charter contract cost to open route $(i, j)$ |
| `unitCosts` | `number[][]` | Shipping cost per ton on route $(i, j)$ |
| `capacities` | `number[][]` | Maximum load capacity when route $(i, j)$ is open (tons) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `open` | `number[][]` | Binary (`0` or `1`) matrix indicating whether each route is open |
| `shipments` | `number[][]` | Non-negative continuous shipment quantities (tons) on route $(i, j)$ |
| `totalCost` | `number` | Minimized sum of fixed contract fees and shipping costs |

<!-- section:example -->
**Input**

```json
{
  "supplies": [65, 60],
  "demands": [30, 35, 25],
  "fixedCosts": [
    [120, 40, 260],
    [250, 280, 90]
  ],
  "unitCosts": [
    [4, 5, 8],
    [3, 2, 3]
  ],
  "capacities": [
    [40, 40, 30],
    [35, 45, 40]
  ]
}
```

**Output**

```json
{
  "open": [
    [1, 1, 0],
    [0, 0, 1]
  ],
  "shipments": [
    [30, 35, 0],
    [0, 0, 25]
  ],
  "totalCost": 620
}
```

Opening routes `(0, 0)`, `(0, 1)`, and `(1, 2)` satisfies load capacities, collection-center supply limits ($65 \le 65$, $25 \le 60$), and supermarket demands `[30, 35, 25]`, for total cost $(120 + 40 + 90) + (30 \times 4 + 35 \times 5 + 25 \times 3) =$ **620**.

<!-- section:hint1 -->
Each route $(i, j)$ has a binary opening variable and a continuous shipment variable. Couple each route's shipment to its opening decision, while using row sums for collection-center supply limits and column sums for supermarket demand floors.

<!-- section:hint2 -->
Use the route load capacity `capacities[i][j]` as a tight upper bound linking `shipments[i][j]` to `open[i][j]`, forcing unopened routes to carry zero flow. Include both fixed contract fees (`fixedCosts`) and unit shipping costs (`unitCosts`) in the objective.
