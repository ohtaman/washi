# #096. Dantzig-Wolfe Decomposition

<!-- section:scenario -->
A corporation operates multiple independent production divisions, each facing its own local machine capacity and per-product market caps while competing for a single corporate-wide shared bottleneck resource. This creates a classic block-angular linear program where coupling constraints tie together otherwise independent divisional blocks.

Solve this block-angular linear program using Dantzig-Wolfe decomposition via WaSHI column generation, coordinating the shared resource across divisional subproblems to return the optimal continuous production allocations and total corporate profit.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `profits` | `number[][]` | Unit profit `profits[k][j]` for product $j$ in division $k$ |
| `localUsages` | `number[][]` | Division $k$ local resource consumption per unit of product $j$ |
| `localCaps` | `number[]` | Local capacity limit for division $k$ |
| `sharedUsages` | `number[][]` | Corporate shared resource consumption per unit of product $j$ in division $k$ |
| `sharedCap` | `number` | Global corporate shared resource limit |
| `productCaps` | `number[][]` | Upper production bound for product $j$ in division $k$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `allocations` | `number[][]` | Continuous production plan `allocations[k][j]` matching input dimensions |
| `totalProfit` | `number` | Total corporate profit $\sum_k \sum_j \text{profits}[k][j] \cdot \text{allocations}[k][j]$ |

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

Division 0 uses `19 <= 24` local capacity, Division 1 uses `18 <= 30`, total shared consumption is `11 + 9 = 20 <= 20`, and total profit reaches **225**.

<!-- section:hint1 -->
Keep the global shared-resource constraint and one convexity constraint per division in the master LP, seeded with an initial zero-production extreme point for each division. Each division's local capacity and product bounds form an independent LP pricing subproblem that proposes profitable extreme points.

<!-- section:hint2 -->
Run `solveColumnGeneration({ master, finalizeAsMIP: false, pricing })` with named master constraints (`shared_cap` and `conv_${k}`) so each division's convexity weights sum to one. In `pricing({ getDual })`, subtract the shared-resource dual cost from each product's unit profit, check whether the subproblem optimum exceeds the division's convexity dual (by more than $10^{-6}$), and reconstruct `allocations[k][j]` as the convex combination of the generated extreme points.
