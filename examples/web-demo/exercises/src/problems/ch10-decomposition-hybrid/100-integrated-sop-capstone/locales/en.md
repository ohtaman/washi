# #100. Integrated S&OP Audit & Rescheduling (Capstone)

<!-- section:scenario -->
In Sales & Operations Planning (S&OP), production planners inherit hard engineering mandates together with weighted soft management policies that may mutually contradict or collectively fail to cover aggregate customer demand. Before computing a production schedule, an engineer must isolate the contradiction and minimally repair the policy set.

Build a two-phase WaSHI hybrid solver pipeline. First, use Z3 SMT feasibility checking and unsatCore conflict extraction inside an Implicit Hitting Set loop to drop the minimum-weight subset of soft policies needed to restore satisfiability across all hard mandates and total demand capacity. Second, solve a HiGHS mixed-integer program over the repaired policies to allocate production quantities while minimizing fixed startup costs, unit production costs, and disruption penalties relative to the baseline line schedule.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `capacities` | `number[]` | Maximum production capacity of line $i$ when active |
| `fixedCosts` | `number[]` | Fixed operating cost of running line $i$ |
| `prodCosts` | `number[]` | Unit production cost on line $i$ |
| `demand` | `number` | Aggregate customer demand to satisfy |
| `baselineActive` | `number[]` | Baseline binary operating plan ($0$ or $1$) |
| `disruptionPenalty` | `number` | Penalty incurred for each line whose active status differs from baseline |
| `hardRules` | `PolicyRule[]` | Mandatory non-negotiable operational constraints |
| `softRules` | `Array<PolicyRule & { weight: number }>` | Negotiable management rules with relaxation weights |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `droppedPolicies` | `string[]` | Rule IDs of dropped soft policies achieving minimum total drop weight |
| `activeAssignments` | `number[]` | Repaired binary line activation vector satisfying retained rules |
| `quantities` | `number[]` | Continuous production quantity assigned to each line |
| `totalCost` | `number` | Minimum sum of fixed, variable production, and disruption costs |

<!-- section:example -->
**Input**

```json
{
  "capacities": [40, 50, 45, 35],
  "fixedCosts": [120, 150, 130, 100],
  "prodCosts": [10, 8, 9, 12],
  "demand": 90,
  "baselineActive": [1, 1, 0, 0],
  "disruptionPenalty": 40,
  "hardRules": [{ "id": "hard_min_backup", "type": "min_active", "lines": [2, 3] }],
  "softRules": [
    { "id": "soft_run_0", "type": "must_run", "line": 0, "weight": 25 },
    { "id": "soft_idle_2", "type": "must_idle", "line": 2, "weight": 10 },
    { "id": "soft_idle_3", "type": "must_idle", "line": 3, "weight": 18 }
  ]
}
```

**Output**

```json
{
  "droppedPolicies": ["soft_idle_2"],
  "activeAssignments": [1, 1, 1, 0],
  "quantities": [0, 50, 40, 0],
  "totalCost": 1200
}
```

Dropping `soft_idle_2` (weight `10 < 18`) resolves the contradiction with `hard_min_backup`. Running `[1, 1, 1, 0]` incurs fixed cost `400`, production cost `760`, and one line flip penalty `40`, totaling **1200**.
