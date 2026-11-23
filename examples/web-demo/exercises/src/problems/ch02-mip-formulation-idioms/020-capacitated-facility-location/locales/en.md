# #020. Capacitated Facility Location (CFLP)

<!-- section:scenario -->
A specialty coffee roaster must simultaneously decide which candidate roasteries to open and how many kilograms of roasted beans to ship each month from open roasteries to café stores. Opening a roastery incurs a fixed operating cost and allows shipping up to that roastery's monthly capacity (kg); closed roasteries cannot ship any beans.

While meeting every café store's monthly demand (kg), choose which roasteries to open and their continuous shipment quantities to **minimize total fixed operating cost plus shipping cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `fixedCosts` | `number[]` | Fixed operating cost of each candidate roastery $i$ |
| `capacities` | `number[]` | Monthly shipping capacity limit of candidate roastery $i$ (kg) |
| `demands` | `number[]` | Required monthly demand at café store $j$ (kg) |
| `unitCosts` | `number[][]` | Shipping cost per kg from roastery $i$ to café store $j$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `open` | `number[]` | Binary (`0` or `1`) opening choices per candidate roastery |
| `shipments` | `number[][]` | Non-negative continuous shipments (kg) from roastery $i$ to café store $j$ |
| `totalCost` | `number` | Minimized sum of fixed operating costs and shipping costs |

<!-- section:example -->
**Input**

```json
{
  "fixedCosts": [320, 260, 290],
  "capacities": [60, 50, 55],
  "demands": [25, 30, 20, 25],
  "unitCosts": [
    [4, 6, 9, 10],
    [7, 3, 5, 8],
    [10, 7, 4, 3]
  ]
}
```

**Output**

```json
{
  "open": [0, 1, 1],
  "shipments": [
    [0, 0, 0, 0],
    [20, 30, 0, 0],
    [5, 0, 20, 25]
  ],
  "totalCost": 985
}
```

Opening roasteries 1 and 2 satisfies capacity constraints (`50 <= 50` and `50 <= 55`) and café store demands `[25, 30, 20, 25]`, yielding total cost $(260 + 290) + (20 \times 7 + 30 \times 3 + 5 \times 10 + 20 \times 4 + 25 \times 3) =$ **985**.

<!-- section:hint1 -->
Combine a binary opening variable per roastery with a continuous shipment matrix from roasteries to café stores. You need one capacity-linking constraint per roastery over its row sum of shipments, and one demand-satisfaction constraint per café store over its column sum of shipments.

<!-- section:hint2 -->
Capping each roastery $i$'s total outflow (sum over all café stores $j$) at `capacities[i] * open[i]` simultaneously forbids shipments from closed roasteries and enforces the capacity limit on open ones. Include both fixed operating costs (`fixedCosts`) and unit shipping costs (`unitCosts`) in the minimization objective.
