# #096. Dantzig-Wolfe Decomposition

<!-- section:scenario -->
At a precision-parts manufacturer with multiple machining plants, each plant operates under its own local electric power capacity (in kWh) and per-product production upper bounds (in units) for items such as bearings, gears, and shafts, while all plants share a company-wide scarce raw material (specialty steel, in kg). This structure—coupling constraints tying together independent per-plant blocks—is a classic block-angular linear program.

Solve this block-angular linear program using Dantzig-Wolfe decomposition via WaSHI column generation, coordinating the shared raw material to return the optimal production allocations (non-negative real values, units) and total company profit.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `profits` | `number[][]` | Unit profit `profits[k][j]` for product $j$ at plant $k$ |
| `localUsages` | `number[][]` | Local power consumption per unit of product $j$ at plant $k$ (kWh) |
| `localCaps` | `number[]` | Local power capacity limit for plant $k$ (kWh) |
| `sharedUsages` | `number[][]` | Company-wide shared steel consumption per unit of product $j$ at plant $k$ (kg) |
| `sharedCap` | `number` | Company-wide specialty steel limit (kg) |
| `productCaps` | `number[][]` | Production upper bound for product $j$ at plant $k$ (units) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `allocations` | `number[][]` | Production quantities per plant and product (non-negative real values, `allocations[k][j]`, units) |
| `totalProfit` | `number` | Total company profit $\sum_k \sum_j \text{profits}[k][j] \cdot \text{allocations}[k][j]$ |

<!-- section:example -->
**Input**

```json
{
  "profits": [
    [12, 18, 10],
    [15, 11, 20]
  ],
  "localUsages": [
    [2, 3, 1],
    [3, 2, 4]
  ],
  "localCaps": [24, 30],
  "sharedUsages": [
    [1, 2, 1],
    [2, 1, 2]
  ],
  "sharedCap": 20,
  "productCaps": [
    [8, 6, 10],
    [6, 9, 5]
  ]
}
```

**Output**

```json
{
  "allocations": [
    [8, 0, 3],
    [0, 9, 0]
  ],
  "totalProfit": 225
}
```

Plant 0 uses $2(8) + 3(0) + 1(3) = 19 \le 24$ local power, Plant 1 uses $3(0) + 2(9) + 4(0) = 18 \le 30$, shared steel usage is $(8 + 3) + 9 = 20 \le 20$, and total profit is $(12 \times 8 + 10 \times 3) + 11 \times 9 = 126 + 99 =$ **225**.

<!-- section:hint1 -->
Keep the global shared-resource constraint and one convexity constraint per division in the master LP, seeded with an initial zero-production extreme point for each division. Each division's local capacity and product bounds form an independent LP pricing subproblem that proposes profitable extreme points.

<!-- section:hint2 -->
Run `solveColumnGeneration({ master, finalizeAsMIP: false, pricing })` with named master constraints (`shared_cap` and `conv_${k}`) so each division's convexity weights sum to one. In `pricing({ getDual })`, subtract the shared-resource dual cost from each product's unit profit, check whether the subproblem optimum exceeds the division's convexity dual (by more than $10^{-6}$), and reconstruct `allocations[k][j]` as the convex combination of the generated extreme points.
