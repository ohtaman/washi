# #098. Logic-Based Benders (MIP + Pumpkin CP)

<!-- section:scenario -->
In an automotive parts machining plant, machining operations (jobs)—such as turning, milling, or grinding—must be assigned to dedicated machines and scheduled in minutes to minimize total assignment cost:
- Assign every job to exactly one machine.
- Process jobs assigned to the same machine sequentially without overlapping in time.
- Start each job at an integer time on or after its release time.
- Complete each job by both its individual deadline and the common planning horizon.

Solve this problem using Logic-Based Benders Decomposition (LBBD) across WaSHI's multiple solvers, combining a HiGHS assignment master problem with Pumpkin CP scheduling subproblems to return the optimal machine assignments, feasible start times, and minimum total cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `costs` | `number[][]` | Cost `costs[j][m]` of assigning job $j$ to machine $m$ |
| `durations` | `number[]` | Processing duration of job $j$ (minutes, integer) |
| `releaseTimes` | `number[]` | Earliest start time of job $j$ (minutes) |
| `deadlines` | `number[]` | Completion deadline of job $j$ (minutes) |
| `horizon` | `number` | Common planning horizon limit across all machines (minutes) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `assignments` | `number[]` | 0-based machine index assigned to each job |
| `starts` | `number[]` | Integer start time $s_j$ of each job satisfying time-window and non-overlap constraints |
| `totalCost` | `number` | Total assignment cost $\sum_j \text{costs}[j][\text{assignments}[j]]$ |

<!-- section:example -->
**Input**

```json
{
  "costs": [
    [10, 25],
    [12, 26],
    [30, 15],
    [28, 14]
  ],
  "durations": [4, 4, 3, 3],
  "releaseTimes": [0, 1, 2, 5],
  "deadlines": [6, 7, 10, 10],
  "horizon": 10
}
```

**Output**

```json
{
  "assignments": [1, 0, 1, 1],
  "starts": [0, 2, 4, 7],
  "totalCost": 66
}
```

All jobs satisfy their time windows and run without overlap on each machine (`[2, 6]` on machine 0; `[0, 4]`, `[4, 7]`, `[7, 10]` on machine 1), giving a total cost of $25 + 12 + 15 + 14 =$ **66**.

<!-- section:hint1 -->
Formulate the master MIP with binary job-to-machine assignment variables only, ensuring every job is assigned to one machine at minimum total assignment cost. Delegate all time-window and non-overlap scheduling checks to independent per-machine CP subproblems via `master.solveBenders(...)`.

<!-- section:hint2 -->
For each machine $m$ with assigned jobs $S_m$, build a Pumpkin CP model with integer start times $s_j \in [\text{releaseTimes}[j], \min(\text{deadlines}[j], \text{horizon}) - \text{durations}[j]]$, enforce `disjoint(...)`, and call `await sub.check({ solver: "pumpkin" })`. Whenever a machine returns `Unsat`, optionally shrink $S_m$ to a minimal infeasible subset $K$ by greedy deletion and emit a feasibility no-good cut (forbidding that simultaneous assignment) $\sum_{j \in K} x_{jm} \le |K| - 1$.
