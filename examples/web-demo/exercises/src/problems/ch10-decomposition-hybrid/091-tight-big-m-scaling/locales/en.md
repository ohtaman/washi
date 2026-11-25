# #091. Tight Big-M & Formulation Scaling

<!-- section:scenario -->
A beverage manufacturer's production planner must decide which bottling plants to operate and how much to produce at each plant (in cases) to satisfy total demand (in cases) while minimizing fixed plus variable production costs. A closed plant produces nothing, while an open plant cannot exceed its physical capacity. When some plants have physical capacities far exceeding total demand, using an arbitrary huge constant or raw plant capacity as Big-M severely weakens the continuous LP relaxation lower bound.

Formulate the linking constraints between plant activation and production quantity using the tightest upper bound (tight Big-M) derivable from the input data for each plant, and return both the optimal integer solution and the LP relaxation objective value of that tight formulation.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `fixedCosts` | `number[]` | Fixed cost incurred when plant $i$ is operated |
| `unitCosts` | `number[]` | Production cost per case at plant $i$ |
| `capacities` | `number[]` | Physical maximum production capacity of plant $i$ (cases) |
| `demand` | `number` | Total demand to satisfy (cases) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `open` | `number[]` | Activation choice for each plant (0 or 1) |
| `quantities` | `number[]` | Production quantity at each plant (non-negative real values, cases) |
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

Opening plant 2 yields $60 \le 80$ output meeting demand 60 at total cost $450 + 11 \times 60 =$ **1,110**, while the tight Big-M LP relaxation yields an LP lower bound of **1,050**.

<!-- section:hint1 -->
Model a binary open/close decision and a continuous non-negative production quantity for each plant. Minimize total fixed setup costs plus variable production costs subject to meeting total demand and linking each plant's output to its open indicator.

<!-- section:hint2 -->
No single plant ever needs to produce more than total demand, so the tightest Big-M for plant $i$ is $M_i = \min(\text{capacities}[i], \text{demand})$ rather than raw capacity or an arbitrary large constant. In WaSHI, build the MIP once and call `await m.relax()` to read `lpBound` before calling `await m.solve()`; in PuLP, solve both a continuous relaxation (with binary variables relaxed to $[0, 1]$) and the MIP.
