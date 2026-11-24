# #010. Production Line Setup & Mixed Production

<!-- section:scenario -->
A PET-bottle beverage bottling plant must decide which candidate production lines to open and how many bottles (in thousands) to produce on each active line. Opening a line incurs a fixed setup cost and unlocks continuous production up to that line's maximum capacity (nothing can be produced on a closed line).

Each thousand bottles produced on a line earns a fixed gross profit margin while consuming a specific amount of shared resin pellets (kg). Staying within the resin pellet stock limit, choose which lines to open and how much to produce to **maximize net profit** (total gross margin minus total fixed setup costs).

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `margins` | `number[]` | Gross profit margin per thousand bottles on each line |
| `fixedCosts` | `number[]` | Fixed setup cost incurred when opening each line |
| `capacities` | `number[]` | Maximum production capacity of each line (thousand bottles) |
| `materialUsages` | `number[]` | Resin pellets consumed per thousand bottles on each line (kg) |
| `materialCap` | `number` | Available resin pellet stock across the plant (kg) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `open` | `number[]` | Binary (`0` or `1`) line-activation choices |
| `quantities` | `number[]` | Continuous production output per line (thousand bottles) |
| `netProfit` | `number` | Maximized net profit (gross margin minus fixed costs) |

<!-- section:example -->
**Input**

```json
{
  "margins": [50, 40, 35],
  "fixedCosts": [600, 300, 250],
  "capacities": [30, 40, 25],
  "materialUsages": [2, 1.5, 1],
  "materialCap": 70
}
```

**Output**

```json
{
  "open": [0, 1, 1],
  "quantities": [0, 30, 25],
  "netProfit": 1525
}
```

Opening Lines 1 and 2 with `quantities = [0, 30, 25]` satisfies activation capacities and consumes $30 \times 1.5 + 25 \times 1 = 70 \le 70$ material, yielding net profit $(40 \times 30 + 35 \times 25) - (300 + 250) =$ **1,525**.
