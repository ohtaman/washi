# #010. Production Line Setup & Mixed Production

<!-- section:scenario -->
A factory operates several candidate production lines. Opening a line incurs a one-time fixed setup cost and unlocks continuous production up to that line's maximum capacity; if a line remains closed, its output **must be zero**.

Each unit produced on an active line earns a unit contribution margin and draws from a shared raw material supply. Choose which lines to open and how much to produce on each line to **maximize net profit** (total margin minus fixed setup costs) within the shared material limit.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `margins` | `number[]` | Profit margin per unit produced on each line |
| `fixedCosts` | `number[]` | Fixed setup cost incurred when opening each line |
| `capacities` | `number[]` | Maximum production capacity of each open line |
| `materialUsages` | `number[]` | Shared material consumed per unit on each line |
| `materialCap` | `number` | Total available shared raw material supply |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `open` | `number[]` | Binary (`0` or `1`) line-activation choices |
| `quantities` | `number[]` | Continuous non-negative production output per line |
| `netProfit` | `number` | Maximized net profit (margin minus fixed costs) |

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
