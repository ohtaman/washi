# #100. Integrated S&OP Audit & Rescheduling (Capstone)

<!-- section:scenario -->
In Sales & Operations Planning (S&OP) at a chemical and materials manufacturer, production planners are given mandatory equipment constraints on line operations alongside weighted soft policies from operations and sales teams. When policies mutually contradict or fail to leave enough capacity to meet demand, the contradiction must be resolved at minimum weight sacrifice before building the production schedule.

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

Each `PolicyRule` is a tagged object with `id: string` and one of the following `type` variants (where `line`, `lines`, `ifLine`, `thenLine` are 0-based line indices):
- `"must_run"`: `{ id, type: "must_run", line: number }` — requires `active[line] === 1`
- `"must_idle"`: `{ id, type: "must_idle", line: number }` — requires `active[line] === 0`
- `"min_active"`: `{ id, type: "min_active", lines: number[] }` — requires at least one `idx` in `lines` to satisfy `active[idx] === 1`
- `"implies"`: `{ id, type: "implies", ifLine: number, thenLine: number, thenActive: boolean }` — requires `active[ifLine] === 1 => active[thenLine] === (thenActive ? 1 : 0)`

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

Dropping the lowest-weight `soft_idle_2` ($10 < 18$) resolves the contradiction with `hard_min_backup`. Line activations `[1, 1, 1, 0]` provide total capacity $40 + 50 + 45 = 135 \ge 90$, incurring fixed cost $120 + 150 + 130 = 400$, production cost $8 \times 50 + 9 \times 40 = 760$, and one line-flip penalty $40 \times 1 = 40$, for a total cost of $400 + 760 + 40 =$ **1,200**.

<!-- section:hint1 -->
Split the problem into two sequential stages. Stage 1 finds a minimum-weight subset of soft rules to drop so that the remaining rules and total capacity can satisfy demand. Stage 2 fixes the surviving rule set and solves a production-rescheduling MIP for binary line activations, continuous production quantities, and deviations from `baselineActive`.

<!-- section:hint2 -->
In Stage 1, run an Implicit Hitting Set loop: build a Z3 model (`await smt.check({ solver: "z3" })`) linking boolean line variables to binary integers for capacity coverage, assert hard and non-dropped soft rules named by `rule.id`, and whenever `status === "Unsat"`, read `res.unsatCore` to add a hitting-set cut ($\sum_{r \in \text{core} \cap \text{soft}} \text{drop}_r \ge 1$) to a HiGHS binary drop-selection MIP minimizing $\sum_r w_r \text{drop}_r$. In Stage 2, model disruption with $\delta_i \ge y_i - \text{baseline}_i$ and $\delta_i \ge \text{baseline}_i - y_i$ in a HiGHS MIP over the retained rules.
