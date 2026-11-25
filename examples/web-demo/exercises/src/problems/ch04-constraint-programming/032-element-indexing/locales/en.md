# #032. Element-Indexed Machine Assignment

<!-- section:scenario -->
A production manager at an automotive parts factory is assigning multiple machining jobs—such as laser cutting and gear milling—to a pool of candidate CNC machines (at least as many machines as jobs). Each job must be assigned to a distinct CNC machine, and no machine may be shared by multiple jobs.

Every job-machine combination has an integer setup cost (in 1,000 JPY). Choose a distinct machine for every job so as to minimize the total setup cost (in 1,000 JPY).

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `costs` | `number[][]` | $n \times m$ integer setup cost matrix (`costs[i][j]` is the setup cost of assigning job `i` to machine `j` in 1,000 JPY, with $1 \le n \le m$) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `assignment` | `number[]` | Assigned machine index (0 to $m - 1$) for each job |
| `totalCost` | `number` | Minimized total setup cost (1,000 JPY) |

<!-- section:example -->
**Input**

```json
{
  "costs": [
    [10, 22, 30],
    [12, 25, 18],
    [16, 14, 24]
  ]
}
```

**Output**

```json
{
  "assignment": [0, 2, 1],
  "totalCost": 42
}
```

Assigning [0, 2, 1] uses three distinct machines and sums `costs[0][0] + costs[1][2] + costs[2][1]` $= 10 + 18 + 14 =$ **42** (1,000 JPY).

<!-- section:hint1 -->
Instead of a two-dimensional binary matrix of job-machine indicators, introduce one integer variable per job representing its assigned machine index across the candidate machines. Require all jobs to be assigned to distinct machines.

<!-- section:hint2 -->
Use `distinct(assignment)` to prevent two jobs from sharing a machine. Look up each job's setup cost with the CP element constraint `at(row, assignment[i])`, minimize their `sum(...)`, and solve using `solver: "pumpkin"`.
