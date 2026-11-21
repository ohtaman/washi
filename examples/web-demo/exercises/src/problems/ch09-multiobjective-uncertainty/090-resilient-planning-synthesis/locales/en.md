# #090. Resilient Planning & Recovery Synthesis

<!-- section:scenario -->
A grid planner pre-commits a binary set of supply units upfront, incurring each unit's fixed reservation cost. Under nominal conditions each unit provides its nominal capacity, but up to Gamma committed units may simultaneously lose part of their capacity; the surviving pre-committed capacity under that worst-case drop must still meet a required robust baseline.

Afterwards, one of several shock scenarios occurs according to known probabilities, bringing a realized demand level and forcing certain units offline. In each scenario, choose a recovered binary unit schedule avoiding offline units, paying a per-unit switching cost for every Hamming flip from the initial commitment and a per-unit elastic penalty for any unmet scenario demand, to **minimize fixed commitment cost plus expected recovery and shortfall cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `fixedCosts` | `number[]` | Stage-1 fixed commitment cost per unit |
| `capacities` | `number[]` | Nominal capacity provided by each unit |
| `dropAmounts` | `number[]` | Capacity loss per unit under Stage-1 budgeted disruption |
| `gamma` | `number` | Uncertainty budget $\Gamma \in [0, n]$ for Stage-1 capacity drops |
| `robustMinCap` | `number` | Minimum required surviving Stage-1 capacity against $\Gamma$ drops |
| `probs` | `number[]` | Scenario probabilities $p_s$ |
| `demands` | `number[]` | Realized demand target in each scenario $s$ |
| `offline` | `number[][]` | Binary outage matrix (`1` forces unit $j$ off in scenario $s$) |
| `disruptionCost` | `number` | Switching penalty per changed unit status ($w_{s,j} \ne y_j$) |
| `shortfallPenalty` | `number` | Elastic penalty per unit of unmet demand in scenario $s$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `committed` | `number[]` | Binary (`0`/`1`) Stage-1 pre-committed unit schedule |
| `recovered` | `number[][]` | Binary (`0`/`1`) Stage-2 recovered schedule per scenario ($S \times n$) |
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
Combine a Stage-1 binary commitment vector and its Bertsimas-Sim dual protection variables with scenario-indexed Stage-2 binary recovery schedules, continuous Hamming-flip variables, and non-negative demand-shortfall variables. Stage 1 ensures worst-case surviving capacity meets `robustMinCap`, while Stage 2 adapts each scenario's schedule around outages and minimizes expected switching plus shortfall costs.

<!-- section:hint2 -->
For the Stage-1 lower-bound robust constraint, subtract the dual worst-case capacity loss: $\text{dot}(\text{capacities}, y) - \Gamma z - \sum_j p_j \ge \text{robustMinCap}$ with $z + p_j \ge \text{dropAmounts}_j \cdot y_j$ ($z, p_j \ge 0$). In each scenario $s$, force $w_{s,j} = 0$ when `offline[s][j] === 1`, linearize $|w_{s,j} - y_j|$ using $d_{s,j} \ge w_{s,j} - y_j$ and $d_{s,j} \ge y_j - w_{s,j}$ (continuous $d_{s,j} \in [0, 1]$ suffices), and round binary `committed` and `recovered` outputs cleanly.