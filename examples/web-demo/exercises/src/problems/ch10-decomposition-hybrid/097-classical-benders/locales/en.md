# #097. Classical Benders Decomposition

<!-- section:scenario -->
A distribution company decides which candidate warehouses to open (incurring fixed opening costs) and how much product to ship from each opened warehouse to customer zones (second-stage continuous shipping). Every customer zone's demand must be fully met, and total shipments from each warehouse cannot exceed its capacity when open and must be 0 when closed. The goal is to minimize the total fixed opening cost plus shipping cost.

Because second-stage shipping becomes a pure continuous LP once warehouse openings are fixed, solve this two-stage problem using Classical Benders Decomposition via WaSHI until the lower and upper bounds converge, and return the optimal warehouse selections, shipment matrix, and total cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `fixedCosts` | `number[]` | Fixed opening cost for each candidate warehouse $i$ |
| `capacities` | `number[]` | Maximum supply capacity available at warehouse $i$ if opened |
| `demands` | `number[]` | Required shipment demand at each customer zone $j$ |
| `shippingCosts` | `number[][]` | Unit shipping cost `shippingCosts[i][j]` from warehouse $i$ to customer zone $j$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `open` | `number[]` | Binary warehouse selection vector (0 or 1) |
| `shipments` | `number[][]` | Non-negative shipment matrix `shipments[i][j]` |
| `totalCost` | `number` | Minimum total fixed plus shipping cost |

<!-- section:example -->
**Input**

```json
{
  "fixedCosts": [100, 120],
  "capacities": [50, 60],
  "demands": [30, 25, 20],
  "shippingCosts": [
    [2, 5, 3],
    [4, 2, 4]
  ]
}
```

**Output**

```json
{
  "open": [1, 1],
  "shipments": [
    [30, 0, 20],
    [0, 25, 0]
  ],
  "totalCost": 390
}
```

Opening both warehouses gives shipments of $30 + 20 = 50 \le 50$ at Warehouse 0 and $25 \le 60$ at Warehouse 1, meeting customer demands `[30, 25, 20]` with fixed cost $100 + 120 = 220$ and shipping cost $(2 \times 30 + 3 \times 20) + 2 \times 25 = 170$, for a total cost of $220 + 170 =$ **390**.

<!-- section:hint1 -->
Keep only the binary warehouse-opening variables and a non-negative second-stage cost estimator `theta` in the master MIP, minimizing fixed costs plus `theta`. For each candidate opening vector, evaluate the continuous shipping LP subproblem to generate either a feasibility cut (if total open capacity cannot cover total demand) or an optimality cut bounding `theta` from below.

<!-- section:hint2 -->
Call `await master.solveBenders({ theta, gapTolerance: 1e-5, subproblem })`. When the shipping LP is infeasible, solve a Phase-I minimum-slack LP (minimizing the sum of artificial demand-slack variables) to extract Farkas duals $\alpha_j$ (demand $\ge$) and $\beta_i \le 0$ (capacity $\le$), and emit `{ kind: "feasibility", constraint }` enforcing $\sum_j \alpha_j d_j + \sum_i \beta_i K_i y_i \le 0$. When feasible, emit `{ kind: "optimality", constraint, subproblemObjective }` for $\theta \ge \sum_j \alpha_j d_j + \sum_i \beta_i K_i y_i$, passing the full evaluated total cost (fixed opening cost plus shipping cost)—not just the shipping cost—as `subproblemObjective`. Finally, re-solve the shipping LP once at the optimal `open` vector to recover `shipments`.
