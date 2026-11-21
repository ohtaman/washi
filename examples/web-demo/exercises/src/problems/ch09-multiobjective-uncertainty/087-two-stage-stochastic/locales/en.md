# #087. Two-Stage Stochastic Programming with Recourse

<!-- section:scenario -->
Before uncertain customer demands materialize, a distributor commits continuous first-stage order quantities across several products within a shared warehouse capacity limit. Each unit ordered upfront incurs its upfront unit order cost.

Once one of several demand scenarios realizes according to known scenario probabilities, the distributor takes second-stage recourse for each product: unmet demand requires an expensive emergency shortage purchase, whereas unsold leftover inventory recovers a smaller unit salvage revenue. Choose non-negative first-stage orders within warehouse capacity to **minimize upfront order cost plus expected second-stage net recourse cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `orderCosts` | `number[]` | First-stage unit order cost per product |
| `shortageCosts` | `number[]` | Second-stage emergency penalty per unit short |
| `salvageValues` | `number[]` | Second-stage salvage credit per unit leftover |
| `warehouseCap` | `number` | Shared capacity limit on total first-stage orders |
| `probs` | `number[]` | Probability weights $p_s$ for each scenario $s$ |
| `demands` | `number[][]` | Scenario demand matrix ($S \times n$) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `orders` | `number[]` | Non-negative first-stage order quantities |
| `expectedCost` | `number` | Minimized expected total cost across all scenarios |

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