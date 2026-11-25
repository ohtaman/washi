# #080. Integrated Staff, Slot & Shared Equipment Scheduling

<!-- section:scenario -->
A clinical or manufacturing facility schedules $J$ procedures across $T$ time slots and $N$ staff members, jointly choosing staff, slots, and overtime to minimize total cost while satisfying the following rules:

- Every procedure is assigned to exactly one time slot and one staff member certified for it.
- Each staff member handles at most one procedure per time slot.
- Total shared equipment usage across all procedures in any time slot cannot exceed the pool capacity.
- Each staff member works at most their hard maximum number of total slots.
- Each staff member incurs a base cost per slot worked plus an extra overtime penalty for each slot worked beyond their regular slot quota.
- Each procedure incurs a slot preference penalty for the time slot assigned.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `certified` | `number[][]` | Binary $N \times J$ matrix indicating whether staff $i$ is certified for procedure $j$ |
| `equipNeeds` | `number[]` | Shared equipment units required by procedure $j$ |
| `equipCap` | `number` | Available shared equipment units per time slot |
| `slotPenalties` | `number[][]` | Preference/delay penalty for scheduling procedure $j$ in slot $t$ ($J \times T$) |
| `staffCosts` | `number[]` | Base wage cost per slot worked by staff $i$ |
| `regularLimits` | `number[]` | Regular slot threshold $R_i$ before overtime begins |
| `maxLimits` | `number[]` | Maximum total slots $M_i$ staff $i$ may work |
| `overtimeCosts` | `number[]` | Extra overtime penalty per slot above $R_i$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `assignedStaff` | `number[]` | Assigned staff index 0 to $N-1$ for each procedure $j$ |
| `assignedSlot` | `number[]` | Assigned timeslot index 0 to $T-1$ for each procedure $j$ |
| `overtime` | `number[]` | Non-negative overtime slots worked by each staff member $i$ |
| `totalCost` | `number` | Minimized total staff, overtime, and slot penalty cost |

<!-- section:example -->
**Input**

```json
{
  "certified": [
    [1, 1, 0, 1],
    [0, 1, 1, 0],
    [1, 0, 1, 1]
  ],
  "equipNeeds": [1, 2, 1, 1],
  "equipCap": 3,
  "slotPenalties": [
    [0, 6],
    [2, 5],
    [0, 4],
    [5, 0]
  ],
  "staffCosts": [20, 22, 18],
  "regularLimits": [1, 1, 1],
  "maxLimits": [2, 2, 2],
  "overtimeCosts": [15, 14, 16]
}
```

**Output**

```json
{
  "assignedStaff": [2, 0, 1, 2],
  "assignedSlot": [0, 1, 0, 1],
  "overtime": [0, 0, 1],
  "totalCost": 99
}
```

Slot 0 runs procedures 0 and 2 (equipment $1+1=2 \le 3$), slot 1 runs procedures 1 and 3 (equipment $2+1=3 \le 3$), staff 2 works 2 slots (1 overtime), and total cost is $(20 + 22 + 2 \times 18) + 16 \times 1 + (0 + 5 + 0 + 0) =$ **99**.

<!-- section:hint1 -->
Use a three-dimensional binary decision variable assigning procedure $j$ to staff member $i$ in timeslot $t$, paired with a non-negative overtime variable for each staff member. This couples procedure-level certification and slot preference with per-slot equipment pooling and per-staff workload limits.

<!-- section:hint2 -->
Exclude or fix to zero any `(j, i)` assignment where `certified[i][j] == 0`, and note that every procedure must be assigned to exactly one `(staff, slot)` pair. Enforce shared equipment capacity per slot $t$ across all procedures and staff, and linearize each staff member's overtime via $o_i \ge \text{work}_i - R_i$ with $o_i \ge 0$ and $\text{work}_i \le M_i$; because overtime costs are positive, $o_i$ is tight at the optimum without extra binaries.
