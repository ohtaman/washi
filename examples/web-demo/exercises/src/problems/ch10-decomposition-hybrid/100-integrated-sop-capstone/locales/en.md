# #100. Integrated S&OP Audit & Rescheduling (Capstone)

<!-- section:scenario -->
In Sales & Operations Planning (S&OP), production planners inherit hard engineering mandates together with weighted soft management policies that may mutually contradict or collectively fail to cover aggregate customer demand. Before computing a production schedule, an engineer must isolate the contradiction and minimally repair the policy set.

Solve this two-phase hybrid problem using Z3 SMT conflict analysis and HiGHS mixed-integer programming. First, identify a minimum-weight subset of soft policies to drop so that all hard mandates and aggregate demand capacity are simultaneously satisfiable. Second, allocate production quantities and line activations under the retained policies to minimize fixed startup costs, unit production costs, and disruption penalties relative to the baseline schedule.

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

<!-- section:hint1 -->
Split the problem into two sequential stages. Stage 1 finds a minimum-weight subset of soft rules to drop so that the remaining rules and total capacity can satisfy demand. Stage 2 fixes the surviving rule set and solves a production-rescheduling MIP for binary line activations, continuous production quantities, and deviations from `baselineActive`.

<!-- section:hint2 -->
In Stage 1, run an Implicit Hitting Set loop: build a Z3 model (`await smt.check({ solver: "z3" })`) linking boolean line variables to binary integers for capacity coverage, assert hard and non-dropped soft rules named by `rule.id`, and whenever `status === "Unsat"`, read `res.unsatCore` to add a hitting-set cut ($\sum_{r \in \text{core} \cap \text{soft}} \text{drop}_r \ge 1$) to a HiGHS binary drop-selection MIP minimizing $\sum_r w_r \text{drop}_r$. In Stage 2, model disruption with $\delta_i \ge y_i - \text{baseline}_i$ and $\delta_i \ge \text{baseline}_i - y_i$ in a HiGHS MIP over the retained rules.
