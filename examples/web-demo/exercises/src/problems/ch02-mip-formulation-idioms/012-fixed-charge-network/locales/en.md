# #012. Fixed-Charge Network Design

<!-- section:scenario -->
A distribution company ships goods from several supply warehouses to retail stores over candidate shipping lanes. Before sending any flow along a lane, the company must open that lane by paying a one-time fixed contract cost, which unlocks continuous shipment flow up to the lane's capacity; unopened lanes must carry zero flow.

Each warehouse has a maximum supply stock, each store requires at least its demand, and every shipped unit incurs a per-unit freight rate. Decide which lanes to open and how much to ship along each lane to **minimize total fixed plus shipping cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `supplies` | `number[]` | Maximum supply available at each warehouse $i$ |
| `demands` | `number[]` | Required demand at each store $j$ |
| `fixedCosts` | `number[][]` | One-time fixed cost to open lane $(i, j)$ |
| `unitCosts` | `number[][]` | Freight cost per unit shipped along lane $(i, j)$ |
| `capacities` | `number[][]` | Maximum flow capacity on lane $(i, j)$ when open |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `open` | `number[][]` | Binary (`0` or `1`) matrix indicating open lanes |
| `shipments` | `number[][]` | Non-negative shipment flows on each lane $(i, j)$ |
| `totalCost` | `number` | Minimized total fixed and variable shipping cost |

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

Opening lanes `(0, 0)`, `(0, 1)`, and `(1, 2)` satisfies capacities (`30 <= 40`, `35 <= 40`, `25 <= 40`), supplies (`65 <= 65`, `25 <= 60`), and store demands `[30, 35, 25]`, for total cost $(120 + 40 + 90) + (30 \times 4 + 35 \times 5 + 25 \times 3) =$ **620**.

<!-- section:hint1 -->
Each lane $(i, j)$ has a binary opening variable and a continuous shipment variable. The model couples each lane's flow to its opening decision, while aggregating row sums for warehouse supplies and column sums for store demands.

<!-- section:hint2 -->
Use the lane capacity `capacities[i][j]` as the tight upper bound linking `shipments[i][j]` to `open[i][j]`, forcing unopened lanes to carry zero flow. Include both fixed opening costs (`fixedCosts`) and variable unit shipping costs (`unitCosts`) in the objective.
