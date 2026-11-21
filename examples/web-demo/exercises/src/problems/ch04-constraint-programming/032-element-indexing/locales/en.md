# #032. Element-Indexed Machine Assignment

<!-- section:scenario -->
A workshop has n manufacturing jobs and m available machines, with n <= m. Each job must be assigned to a distinct machine, and no machine may process more than one job.

Entry costs[i][j] records the integer setup and preference cost of assigning job i to machine j. Choose a machine assignment[i] for each job so all assigned machines are distinct and total assignment cost is minimized.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `costs` | `number[][]` | `n × m` integer cost matrix (`costs[i][j]` = cost of job `i` on machine `j`, with `n <= m`) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `assignment` | `number[]` | Assigned machine index (`0` to `m - 1`) for each job |
| `totalCost` | `number` | Minimized total assignment cost |

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

Assigning `[0, 2, 1]` uses three distinct machines and sums `costs[0][0] + costs[1][2] + costs[2][1]` $= 10 + 18 + 14 =$ **42**.

<!-- section:hint1 -->
Instead of an $n \times m$ binary assignment matrix, introduce one integer variable per job representing its assigned machine index in `[0, numMachines - 1]`. Require all jobs to receive distinct machines.

<!-- section:hint2 -->
Use `distinct(assignment)` to prevent two jobs from sharing a machine. Look up each job's cost with the CP element constraint `at(row, assignment[i])`, and minimize `sum(input.costs.map((row, i) => at(row, assignment[i])))` using `solver: "pumpkin"`.
