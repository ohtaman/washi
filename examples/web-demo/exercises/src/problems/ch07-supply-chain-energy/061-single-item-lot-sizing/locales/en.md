# #061. Single-Item Dynamic Lot Sizing

<!-- section:scenario -->
A frozen food factory must schedule production and inventory of its flagship frozen Sanuki udon over multiple consecutive periods starting from zero initial inventory. Whenever production takes place in a period, the factory incurs a fixed setup cost and can produce continuously up to that period's capacity; otherwise, production in that period must be zero.

Every unit produced incurs a period-specific unit production cost, and any surplus carried to the next period incurs a per-unit holding cost. Determine the binary setup schedule, production quantities, and end-of-period inventory levels to meet all period demands at **minimum total cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[]` | Product demand in each period $t$ |
| `setupCosts` | `number[]` | Fixed setup cost if production occurs in period $t$ |
| `prodCosts` | `number[]` | Unit production cost in period $t$ |
| `holdCosts` | `number[]` | Unit holding cost on ending inventory of period $t$ |
| `capacities` | `number[]` | Maximum production capacity in period $t$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `setups` | `number[]` | Binary (0 or 1) setup decisions per period |
| `production` | `number[]` | Non-negative continuous production quantities |
| `inventory` | `number[]` | Non-negative end-of-period inventory levels |
| `totalCost` | `number` | Minimized sum of setup, production, and holding costs |

<!-- section:example -->
**Input**

```json
{
  "demands": [20, 50, 10, 40],
  "setupCosts": [180, 180, 180, 180],
  "prodCosts": [10, 12, 10, 14],
  "holdCosts": [2, 2, 2, 2],
  "capacities": [80, 80, 80, 80]
}
```

**Output**

```json
{
  "setups": [1, 0, 1, 0],
  "production": [70, 0, 50, 0],
  "inventory": [50, 0, 40, 0],
  "totalCost": 1740
}
```

Setting up only in periods 0 and 2 yields ending inventories [50, 0, 40, 0] within the per-period capacity of 80, for total cost $(180 \times 2) + (70 \times 10 + 50 \times 10) + (50 \times 2 + 40 \times 2) =$ **1,740**.


<!-- section:hint1 -->
Model a binary setup variable, a continuous production quantity, and a non-negative ending inventory variable for each period across the planning horizon. Alternatively, you can disaggregate production by which future period's demand it serves, then recover total production and ending inventory from those flow variables.

<!-- section:hint2 -->
Link production in period $t$ to its setup indicator via the period capacity (`production[t] <= capacities[t] * setups[t]`), and enforce period-by-period inventory flow conservation starting from zero initial inventory. Tightening the setup-linking constraint—or using a facility-location disaggregation that bounds each period-$t$-to-period-$k$ flow by period $k$'s demand times period $t$'s setup binary—significantly strengthens the LP relaxation.
