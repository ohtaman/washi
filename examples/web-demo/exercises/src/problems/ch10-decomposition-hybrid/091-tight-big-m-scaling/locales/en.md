# #091. Tight Big-M & Formulation Scaling

<!-- section:scenario -->
A manufacturer must select which plants to open and how much to produce at each open plant to satisfy total product demand at minimum fixed-plus-variable cost. Several plants have physical capacities far larger than total demand, so using an arbitrary huge Big-M constant (or even the raw plant capacity) severely weakens the continuous LP relaxation.

Formulate the linking constraints using the tightest instance-derived Big-M bound for each plant, and return both the optimal integer solution and the LP relaxation objective of that tight formulation.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `fixedCosts` | `number[]` | Fixed setup cost incurred when plant $i$ is opened |
| `unitCosts` | `number[]` | Unit production cost at plant $i$ |
| `capacities` | `number[]` | Physical maximum capacity of plant $i$ |
| `demand` | `number` | Total production demand that must be satisfied |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `open` | `number[]` | Binary (`0` or `1`) plant-activation decisions |
| `quantities` | `number[]` | Continuous non-negative production output per plant |
| `totalCost` | `number` | Optimal integer objective (fixed plus variable cost) |
| `lpBound` | `number` | Continuous LP relaxation objective under tight Big-M |

<!-- section:example -->
**Input**

```json
{
  "fixedCosts": [1000, 200, 450],
  "unitCosts": [10, 12, 11],
  "capacities": [500, 40, 80],
  "demand": 60
}
```

**Output**

```json
{
  "open": [0, 0, 1],
  "quantities": [0, 0, 60],
  "totalCost": 1110,
  "lpBound": 1050
}
```

Opening plant 2 yields $60 \le 80$ output meeting demand $60$ at total cost $450 + 11 \times 60 =$ **1,110**, while the tight Big-M LP relaxation achieves lower bound **1,050**.
