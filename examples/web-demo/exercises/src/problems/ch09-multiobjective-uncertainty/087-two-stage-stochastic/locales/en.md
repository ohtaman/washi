# #087. Two-Stage Stochastic Programming with Recourse

<!-- section:scenario -->
A food and daily-goods wholesaler must decide first-stage order quantities (in cases) for multiple products within a shared warehouse capacity limit (in cases) before uncertain customer demand is revealed. Each unit ordered upfront incurs a product-specific initial procurement cost (JPY/case).

Later, when one of the demand scenarios realizes according to known probabilities, second-stage recourse actions take place: demand exceeding available stock incurs an expensive emergency replenishment penalty (JPY/case), while unsold leftover stock recovers a smaller salvage value (JPY/case). Find the first-stage order quantities that minimize the sum of upfront order costs and expected second-stage net costs.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `orderCosts` | `number[]` | First-stage unit purchase cost per product (JPY/case) |
| `shortageCosts` | `number[]` | Second-stage penalty per case short (JPY) |
| `salvageValues` | `number[]` | Salvage credit per leftover case (JPY) |
| `warehouseCap` | `number` | Shared warehouse capacity limit on total first-stage orders (cases) |
| `probs` | `number[]` | Occurrence probability $p_s$ of each scenario $s$ |
| `demands` | `number[][]` | Scenario demand matrix ($S \times n$, cases) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `orders` | `number[]` | First-stage order quantity vector (non-negative, cases) |
| `expectedCost` | `number` | Minimized expected total cost across all scenarios (JPY) |

<!-- section:example -->
**Input**

```json
{
  "orderCosts": [4, 6],
  "shortageCosts": [14, 18],
  "salvageValues": [1, 2],
  "warehouseCap": 30,
  "probs": [0.5, 0.5],
  "demands": [
    [10, 8],
    [20, 16]
  ]
}
```

**Output**

```json
{
  "orders": [14, 16],
  "expectedCost": 184
}
```

Ordering `[14, 16]` uses $14 + 16 = 30 \le 30$ warehouse space for upfront cost $4(14) + 6(16) = 152$, earns salvage $20$ in Scenario 0, pays shortage $84$ in Scenario 1, and yields expected total cost $152 + 0.5(-20) + 0.5(84) =$ **184**.


<!-- section:hint1 -->
Formulate the deterministic equivalent linear program with one non-negative first-stage order vector shared across all scenarios, and scenario-indexed non-negative second-stage shortage and leftover vectors. Constrain total first-stage orders by warehouse capacity, link each scenario's recourse variables to its demand, and minimize upfront order cost plus probability-weighted expected recourse cost.

<!-- section:hint2 -->
Keep the first-stage order quantities unindexed by scenario (non-anticipativity), and watch the sign of salvage revenue in the minimization objective: because salvage recovers value, it must enter with a negative sign (`-salvageValues[j]`). Since `shortageCosts` exceeds `salvageValues`, an optimal solution will never incur both shortage and leftover on the same product-scenario pair.