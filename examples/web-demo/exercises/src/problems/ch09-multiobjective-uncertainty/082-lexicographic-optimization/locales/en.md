# #082. Two-Stage Lexicographic Optimization

<!-- section:scenario -->
An emergency operations center selects a binary subset of candidate service units within a total crew budget to serve a target demand level. Because service continuity takes strict priority over budget savings, objectives are optimized lexicographically in two stages.

First, find the minimum achievable unmet demand shortfall within the crew budget. Next, lock unmet demand to stay at most that Stage-1 minimum plus an allowed degradation slack, and select units to **minimize total secondary operating cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `coverage` | `number[]` | Demand capacity provided by each unit when selected |
| `crews` | `number[]` | Crew count required by each unit |
| `opCosts` | `number[]` | Secondary operating cost incurred by each selected unit |
| `maxCrews` | `number` | Hard upper limit on total allocated crews |
| `targetDemand` | `number` | Target demand coverage level |
| `slack` | `number` | Allowed extra unmet demand beyond Stage-1 minimum (`0` for strict) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `selected` | `number[]` | Binary (`0` or `1`) unit selection choices |
| `obj1` | `number` | Resulting unmet demand shortfall (`max(0, targetDemand - covered)`) |
| `obj2` | `number` | Minimized secondary operating cost within Stage-1 tolerance |

<!-- section:example -->
**Input**

```json
{
  "coverage": [10, 12, 15, 8],
  "crews": [2, 3, 4, 2],
  "opCosts": [300, 180, 260, 120],
  "maxCrews": 6,
  "targetDemand": 22,
  "slack": 0
}
```

**Output**

```json
{
  "selected": [0, 0, 1, 1],
  "obj1": 0,
  "obj2": 380
}
```

Selecting units 2 and 3 uses $4 + 2 = 6 \le 6$ crews and covers $15 + 8 = 23 \ge 22$ demand (`obj1 = 0`), with secondary operating cost $260 + 120 =$ **380**.


<!-- section:hint1 -->
Solve two sequential mixed-integer programs over binary unit-selection variables and the crew-capacity constraint. Stage 1 introduces a non-negative continuous shortfall variable to find the smallest achievable unmet demand; Stage 2 fixes that minimum shortfall bound (plus any allowed slack) as a hard constraint and minimizes secondary operating cost.

<!-- section:hint2 -->
Avoid combining both objectives with a single large weight, which can fail to preserve strict priority or respect the exact degradation tolerance `slack`. In Stage 2, enforce $\text{covered} \ge \text{targetDemand} - (\text{bestObj1} + \text{slack})$ (with a small tolerance if needed for floating-point `bestObj1`, or compute `obj1` cleanly from the Stage-2 `selected` vector via `Math.max(0, targetDemand - covered)`), and round binary selections using `Math.round(v.value!)` in WaSHI or `round(pulp.value(v))` in PuLP.