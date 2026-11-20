# #061. Single-Item Dynamic Lot Sizing

<!-- section:scenario -->
A factory must schedule production of a single product over multiple consecutive periods starting from zero initial inventory. Whenever production takes place in a period, the factory incurs a fixed setup cost and can produce continuously up to that period's capacity; otherwise, production in that period must be zero.

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
| `setups` | `number[]` | Binary (`0` or `1`) setup decisions per period |
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

Setting up only in periods 0 and 2 yields ending inventories `[50, 0, 40, 0]` within capacities `80`, for total cost $(180 \times 2) + (70 \times 10 + 50 \times 10) + (50 \times 2 + 40 \times 2) =$ **1,740**.
