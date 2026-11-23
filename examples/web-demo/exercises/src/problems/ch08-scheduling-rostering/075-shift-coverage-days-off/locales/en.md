# #075. Staff Shift Coverage with Workload Bounds & Days Off

<!-- section:scenario -->
A large cafe schedules $N$ baristas (staff) across $D$ days and $S$ daily shift types (such as early and late shifts). Each staff member can work at most one shift per day, cannot work on their pre-approved required days off, and must work a total number of shifts within their personal minimum and maximum bounds.

Every day and shift type has a minimum staffing demand and a staff-specific assignment cost. Assign shifts (or off) to minimize total staffing cost while meeting all coverage demands and personal constraints.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[][]` | Required staff count for day $d$ and shift $s$ ($D \times S$) |
| `shiftCosts` | `number[][]` | Cost of assigning staff $i$ to shift $s$ ($N \times S$) |
| `minShifts` | `number[]` | Minimum total shifts required for each staff member |
| `maxShifts` | `number[]` | Maximum total shifts allowed for each staff member |
| `daysOff` | `number[][]` | List of day indices where each staff member must be off |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `schedule` | `number[][]` | $N \times D$ matrix (-1 for Off, or 0 to $S-1$ for shift) |
| `totalCost` | `number` | Minimized total shift assignment cost |

<!-- section:example -->
**Input**

```json
{
  "demands": [
    [1, 1],
    [1, 1],
    [1, 1]
  ],
  "shiftCosts": [
    [8, 12],
    [12, 14],
    [11, 18]
  ],
  "minShifts": [2, 2, 2],
  "maxShifts": [2, 3, 2],
  "daysOff": [[1], [], [2]]
}
```

**Output**

```json
{
  "schedule": [
    [1, -1, 0],
    [-1, 1, 1],
    [0, 0, -1]
  ],
  "totalCost": 70
}
```

Each staff member works 2 shifts within `[minShifts, maxShifts]` while respecting `daysOff` (staff 0 off on day 1, staff 2 off on day 2), covers [1, 1] shifts every day, and incurs cost $(12 + 8) + (14 + 14) + (11 + 11) =$ **70**.

<!-- section:hint1 -->
Introduce a three-dimensional binary decision variable for assigning staff member $i$ to shift $s$ on day $d$. The model balances per-staff-day exclusivity and leave rules against daily shift demand coverage and total workload bounds per staff member.

<!-- section:hint2 -->
On a staff member's required `daysOff`, fix all shift variables for that staff-day to zero (or restrict the daily sum to zero) rather than omitting them from workload totals. Because costs are non-negative, covering demands with $\ge$ inequalities avoids overstaffing unless needed to meet `minShifts`, and you can decode `schedule[i][d]` as the assigned shift index or -1 when all shifts on that day are zero.
