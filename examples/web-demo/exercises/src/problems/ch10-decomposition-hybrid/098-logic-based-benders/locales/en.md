# #098. Logic-Based Benders (MIP + Pumpkin CP)

<!-- section:scenario -->
In an automotive parts machining plant, each machining operation (job)—such as turning, milling, or grinding—must be assigned to one of several dedicated machines to minimize total machine assignment cost. The jobs assigned to each machine must be processed sequentially without overlapping in time (in minutes), and every job must start on or after its release time, finish by its deadline, and complete within a common planning horizon.

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
| `assignments` | `number[]` | Machine index $m \in \{0, \dots, M-1\}$ assigned to each job $j$ |
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

Jobs 0 and 1 are cheaper on machine 0, yet placing both on machine 0 cannot satisfy time windows `[0, 6]` and `[1, 7]` simultaneously. Assigning job 0 to machine 1 keeps all intervals non-overlapping (`[2, 6]` on machine 0; `[0, 4]`, `[4, 7]`, `[7, 10]` on machine 1), giving total cost $25 + 12 + 15 + 14 =$ **66**.

<!-- section:hint1 -->
Formulate the master MIP with binary job-to-machine assignment variables only, ensuring every job is assigned to one machine at minimum total assignment cost. Delegate all time-window and non-overlap scheduling checks to independent per-machine CP subproblems via `master.solveBenders(...)`.

<!-- section:hint2 -->
For each machine $m$ with assigned jobs $S_m$, build a Pumpkin CP model with integer start times $s_j \in [\text{releaseTimes}[j], \min(\text{deadlines}[j], \text{horizon}) - \text{durations}[j]]$, enforce `disjoint(...)`, and call `await sub.check({ solver: "pumpkin" })`. Whenever a machine returns `Unsat`, optionally shrink $S_m$ to a minimal infeasible subset $K$ by greedy deletion and emit a feasibility no-good cut $\sum_{j \in K} x_{jm} \le |K| - 1$.
