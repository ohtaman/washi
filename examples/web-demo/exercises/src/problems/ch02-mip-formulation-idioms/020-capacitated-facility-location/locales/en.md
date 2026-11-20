# #020. Capacitated Facility Location (CFLP)

<!-- section:scenario -->
A logistics network must decide which candidate distribution centers to open and how to route goods from open facilities to customer zones. Opening a facility incurs a one-time fixed operating cost and unlocks its total shipping capacity; closed facilities cannot ship any units.

Each customer zone requires at least its specified demand, and every shipped unit incurs a lane-specific transportation cost. Choose which facilities to open and the continuous shipment flows to **minimize total fixed plus transportation cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `fixedCosts` | `number[]` | Fixed opening cost of each candidate facility $i$ |
| `capacities` | `number[]` | Maximum total outflow capacity of each open facility $i$ |
| `demands` | `number[]` | Required demand at each customer zone $j$ |
| `unitCosts` | `number[][]` | Shipping cost per unit from facility $i$ to customer $j$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `open` | `number[]` | Binary (`0` or `1`) opening choices per facility |
| `shipments` | `number[][]` | Non-negative continuous shipments from facility $i$ to customer $j$ |
| `totalCost` | `number` | Minimized total fixed and shipping cost |

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

Opening facilities 1 and 2 ships `50 <= 50` and `50 <= 55` units while meeting customer demands `[25, 30, 20, 25]`, yielding total cost $(260 + 290) + (20 \times 7 + 30 \times 3 + 5 \times 10 + 20 \times 4 + 25 \times 3) =$ **985**.
