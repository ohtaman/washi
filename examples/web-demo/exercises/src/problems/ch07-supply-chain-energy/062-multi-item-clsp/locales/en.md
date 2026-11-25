# #062. Multi-Item Capacitated Lot Sizing (CLSP)

<!-- section:scenario -->
A pastry workshop uses a single shared oven to bake multiple pastries (such as financiers and madeleines) over a multi-period horizon, starting with zero initial inventory for every item. Producing any positive amount of an item in a period requires setting up the oven for that item, which incurs a fixed setup cost and consumes fixed setup hours.

In each period, the total oven time consumed by all items—both unit processing time and setup time—cannot exceed that period's available oven hours. Choose the setup schedule, continuous production quantities, and end-of-period inventories to satisfy all item demands at **minimum total setup and holding cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[][]` | Demand per item and period (items × periods, indexed `[i][t]`) |
| `setupCosts` | `number[]` | Fixed setup cost per setup of each item (item-indexed) |
| `holdCosts` | `number[]` | Unit holding cost per period for each item (item-indexed) |
| `unitTimes` | `number[]` | Oven processing hours per unit of each item (item-indexed) |
| `setupTimes` | `number[]` | Fixed oven setup hours consumed per setup of each item (item-indexed) |
| `capacities` | `number[]` | Total available oven hours in each period (period-indexed) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `setups` | `number[][]` | Binary (0 or 1) setup matrix (items × periods) |
| `production` | `number[][]` | Non-negative continuous production quantities (items × periods) |
| `inventory` | `number[][]` | Non-negative ending inventory levels (items × periods) |
| `totalCost` | `number` | Minimized total setup and inventory holding cost |

<!-- section:example -->
**Input**

```json
{
  "demands": [
    [20, 30, 15, 25],
    [10, 25, 30, 15]
  ],
  "setupCosts": [120, 150],
  "holdCosts": [2, 2.5],
  "unitTimes": [1.5, 2.0],
  "setupTimes": [12, 15],
  "capacities": [110, 100, 115, 100]
}
```

**Output**

```json
{
  "setups": [
    [1, 1, 1, 1],
    [1, 1, 1, 1]
  ],
  "production": [
    [20, 30, 15, 25],
    [21, 14, 30, 15]
  ],
  "inventory": [
    [0, 0, 0, 0],
    [11, 0, 0, 0]
  ],
  "totalCost": 1107.5
}
```

Pre-building 11 units of item 1 in period 0 keeps period 1 oven usage at $12 + 15 + 1.5(30) + 2.0(14) = 100 \le 100$, giving total cost $4(120 + 150) + 11 \times 2.5 =$ **1,107.5**.


<!-- section:hint1 -->
Define per-item, per-period binary setup indicators, continuous production quantities, and non-negative ending inventory variables arranged as item-by-period matrices. The model combines independent per-item inventory balance chains with a shared oven-time constraint in every period.

<!-- section:hint2 -->
When linking item production to its setup binary, use a tight valid upper bound—such as the item's remaining cumulative demand from period $t$ onward—rather than an arbitrary large constant. In each period's oven-capacity constraint, sum both the variable processing time and the fixed setup time over all items.
