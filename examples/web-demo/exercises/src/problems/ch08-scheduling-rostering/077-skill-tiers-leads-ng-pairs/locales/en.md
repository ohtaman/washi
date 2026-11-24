# #077. Skill Coverage, Senior Leads & Incompatible Staff Pairs

<!-- section:scenario -->
An emergency department's nursing and paramedic team rosters $N$ staff members across $D$ days and $S$ shift types, with at most one shift per staff-day. Every active shift slot must meet its total staffing demand, include at least one senior lead, and satisfy minimum skill counts across $K$ certified skills (such as triage and emergency care).

Additionally, certain incompatible staff pairs cannot be assigned together to the same day and shift. Choose assignments minimizing total shift cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[][]` | Minimum total staff needed on day $d$, shift $s$ ($D \times S$) |
| `isSenior` | `number[]` | Binary (0/1) indicator of senior lead status per staff member |
| `staffSkills` | `number[][]` | Binary $N \times K$ matrix indicating whether staff $i$ holds skill $k$ |
| `skillDemands` | `number[][]` | Minimum staff with skill $k$ required on any active shift $s$ ($S \times K$) |
| `ngPairs` | `number[][]` | Pairs `[a, b]` forbidden from working the same `(d, s)` shift |
| `shiftCosts` | `number[][]` | Cost of assigning staff $i$ to shift $s$ ($N \times S$) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `schedule` | `number[][]` | $N \times D$ matrix (-1 for Off, or 0 to $S-1$ for assigned shift) |
| `totalCost` | `number` | Minimized total shift assignment cost |

<!-- section:example -->
**Input**

```json
{
  "demands": [
    [2, 1],
    [2, 1]
  ],
  "isSenior": [1, 1, 0, 0],
  "staffSkills": [
    [1, 0],
    [0, 1],
    [1, 1],
    [0, 1]
  ],
  "skillDemands": [
    [1, 1],
    [1, 0]
  ],
  "ngPairs": [[0, 2], [1, 3]],
  "shiftCosts": [
    [15, 20],
    [16, 18],
    [10, 14],
    [11, 15]
  ]
}
```

**Output**

```json
{
  "schedule": [
    [1, 1],
    [0, 0],
    [0, 0],
    [-1, -1]
  ],
  "totalCost": 92
}
```

On both days, shift 0 pairs senior 1 ([0, 1]) with junior 2 ([1, 1])—avoiding forbidden pair [0, 2]—while shift 1 assigns senior 0 ([1, 0]) to cover skill 0, yielding total cost $(20+20) + (16+16) + (10+10) =$ **92**.

<!-- section:hint1 -->
Introduce a three-dimensional binary variable for assigning staff member $i$ to shift $s$ on day $d$, with at most one shift per staff-day. Every active shift slot must simultaneously satisfy total headcount, senior leadership, per-skill coverage, and pairwise incompatibility rules.

<!-- section:hint2 -->
Only enforce the senior lead and skill-coverage inequalities on active shift slots where `demands[d][s] > 0`, so zero-demand shifts do not force unnecessary staffing. For each incompatible pair `[a, b]`, add $x_{a,d,s} + x_{b,d,s} \le 1$ per `(d, s)` slot so they cannot share the same shift while still being allowed on different shifts of the same day.
