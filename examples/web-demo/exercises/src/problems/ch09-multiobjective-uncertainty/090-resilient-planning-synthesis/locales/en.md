# #090. Resilient Planning & Recovery Synthesis

<!-- section:scenario -->
A grid planner pre-commits a binary set of power-generation units upfront, incurring each unit's fixed reservation cost. Under nominal conditions each unit provides its nominal capacity, but in the Stage-1 robustness check each committed unit can lose any fraction in $[0, 1]$ of its maximum capacity drop, with the sum of these fractions across all units at most the given uncertainty budget `gamma` (which may be fractional); the surviving pre-committed capacity under the worst-case drop within that budget must still meet a required robust baseline.

Afterwards, one of several shock scenarios occurs according to known probabilities, bringing a realized demand level and forcing certain units offline. In each scenario, choose a recovered binary unit schedule avoiding offline units—where each active unit supplies its nominal capacity—paying a per-unit switching cost for each unit switched on or off relative to the initial commitment and a shortfall penalty per unit of unmet demand, to **minimize fixed commitment cost plus expected recovery and shortfall cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `fixedCosts` | `number[]` | Stage-1 fixed commitment cost per unit |
| `capacities` | `number[]` | Nominal capacity provided by each unit |
| `dropAmounts` | `number[]` | Maximum capacity drop per unit under Stage-1 budgeted disruption |
| `gamma` | `number` | Uncertainty budget for Stage-1 capacity drops (from 0 to the number of units; may be fractional) |
| `robustMinCap` | `number` | Minimum required surviving Stage-1 capacity against worst-case budgeted drops |
| `probs` | `number[]` | Occurrence probability of each scenario (sums to 1) |
| `demands` | `number[]` | Realized demand target in each scenario |
| `offline` | `number[][]` | Binary outage matrix indexed by [scenario][unit] (1 forces that unit offline) |
| `disruptionCost` | `number` | Switching cost per unit whose status changes from initial commitment |
| `shortfallPenalty` | `number` | Shortfall penalty per unit of unmet demand in any scenario |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `committed` | `number[]` | 0-1 Stage-1 pre-committed unit schedule |
| `recovered` | `number[][]` | 0-1 Stage-2 recovered schedule indexed by [scenario][unit] |
| `totalCost` | `number` | Minimized fixed cost plus expected recovery and shortfall cost |

<!-- section:example -->
**Input**

```json
{
  "fixedCosts": [120, 150, 90, 110],
  "capacities": [18, 22, 12, 16],
  "dropAmounts": [8, 10, 4, 6],
  "gamma": 1,
  "robustMinCap": 28,
  "probs": [0.6, 0.4],
  "demands": [24, 34],
  "offline": [
    [0, 0, 0, 0],
    [0, 1, 0, 0]
  ],
  "disruptionCost": 45,
  "shortfallPenalty": 30
}
```

**Output**

```json
{
  "committed": [0, 1, 0, 1],
  "recovered": [
    [0, 1, 0, 1],
    [1, 0, 0, 1]
  ],
  "totalCost": 296
}
```

Pre-committing `[0, 1, 0, 1]` costs $150 + 110 = 260$ and retains $22 + 16 - 10 = 28 \ge 28$ robust capacity; Scenario 0 needs zero changes, Scenario 1 swaps Unit 1 for Unit 0 (2 flips, capacity $34 \ge 34$), giving expected total cost $260 + 0.6(0) + 0.4(45 \times 2) =$ **296**.


<!-- section:hint1 -->
Combine a Stage-1 binary commitment vector and its Bertsimas-Sim dual protection variables with scenario-indexed Stage-2 binary recovery schedules, continuous switching-indicator variables, and non-negative demand-shortfall variables. Stage 1 ensures worst-case surviving capacity meets `robustMinCap`, while Stage 2 adapts each scenario's schedule around outages and minimizes expected switching plus shortfall costs.

<!-- section:hint2 -->
Watch three pitfalls: (1) because Stage-1 surviving capacity is a lower-bound constraint, *subtract* the Bertsimas-Sim dual worst-case drop from nominal committed capacity rather than adding it; (2) linearize the switching indicator $|w_{s,j} - y_j|$ using a continuous variable in $[0, 1]$ with two signed difference inequalities; and (3) fix every unit flagged offline in a scenario to 0 and round the binary `committed` and `recovered` outputs cleanly to 0 or 1.