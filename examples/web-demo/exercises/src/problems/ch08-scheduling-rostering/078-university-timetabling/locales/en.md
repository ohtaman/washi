# #078. University Course Timetabling

<!-- section:scenario -->
A university schedules $C$ courses into $R$ lecture rooms and $T$ weekly timeslots. Each course must be assigned to exactly one room large enough for its enrolled class size and one timeslot, with at most one course occupying any room in a given timeslot.

Courses taught by the same teacher or sharing any student cohort cannot be placed in the same timeslot. Assign rooms and timeslots to maximize the total preference score across all courses.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `courseSizes` | `number[]` | Enrolled student count for each course $c$ |
| `roomCapacities` | `number[]` | Seating capacity for each room $r$ |
| `teachers` | `number[]` | Instructor ID assigned to each course $c$ |
| `cohorts` | `number[][]` | List of student cohort IDs attending each course $c$ |
| `slotScores` | `number[][]` | Preference score for placing course $c$ in timeslot $t$ ($C \times T$) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `rooms` | `number[]` | Assigned room index `0..R-1` for each course |
| `slots` | `number[]` | Assigned timeslot index `0..T-1` for each course |
| `totalScore` | `number` | Maximized sum of preference scores |

<!-- section:example -->
**Input**

```json
{
  "courseSizes": [45, 25, 30, 20],
  "roomCapacities": [50, 30],
  "teachers": [0, 0, 1, 2],
  "cohorts": [[0], [1], [0], [1]],
  "slotScores": [
    [10, 6, 4],
    [9, 8, 5],
    [10, 7, 3],
    [8, 9, 6]
  ]
}
```

**Output**

```json
{
  "rooms": [0, 0, 1, 1],
  "slots": [1, 0, 0, 1],
  "totalScore": 34
}
```

Courses 1 and 2 run in slot 0 (rooms 0 and 1, teachers 0 and 1, cohorts 1 and 0), while courses 0 and 3 run in slot 1 (rooms 0 and 1, teachers 0 and 2, cohorts 0 and 1), meeting all capacities and avoiding all conflicts for score $6 + 9 + 10 + 9 =$ **34**.

<!-- section:hint1 -->
Use a three-dimensional binary decision variable indicating whether course $c$ is placed in room $r$ at timeslot $t$. Each course must choose one feasible `(room, slot)` pair, while rooms, teachers, and student cohorts each act as mutual-exclusion cliques within every timeslot.

<!-- section:hint2 -->
Filter out or fix to zero any `(c, r)` pair where `courseSizes[c] > roomCapacities[r]` so oversized classes never enter small rooms. For teachers and cohorts, group all courses sharing the same teacher or the same cohort ID and bound the sum of their assignments across all rooms in each slot $t$ by $1$ — clique-level sums are much tighter than pairwise inequalities.
