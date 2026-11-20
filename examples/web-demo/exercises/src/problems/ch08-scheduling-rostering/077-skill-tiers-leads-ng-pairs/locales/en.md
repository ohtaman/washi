# #077. Skill Coverage, Senior Leads & Incompatible Staff Pairs

<!-- section:scenario -->
A department rosters $N$ staff members across $D$ days and $S$ shift types, with at most one shift per staff-day. Every active shift slot must meet its total staffing demand, include at least one senior lead, and satisfy minimum skill counts across $K$ certified skills.

Additionally, certain incompatible staff pairs cannot be assigned together to the same day and shift. Choose assignments minimizing total shift cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[][]` | Minimum total staff needed on day $d$, shift $s$ ($D \times S$) |
| `isSenior` | `number[]` | Binary (`0`/`1`) indicator of senior lead status per staff member |
| `staffSkills` | `number[][]` | Binary $N \times K$ matrix indicating whether staff $i$ holds skill $k$ |
| `skillDemands` | `number[][]` | Minimum staff with skill $k$ required on any active shift $s$ ($S \times K$) |
| `ngPairs` | `number[][]` | Pairs `[a, b]` forbidden from working the same `(d, s)` shift |
| `shiftCosts` | `number[][]` | Cost of assigning staff $i$ to shift $s$ ($N \times S$) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `schedule` | `number[][]` | $N \times D$ matrix with `-1` (Off) or `0..S-1` (assigned shift) |
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

On both days, shift 0 pairs senior 1 (`[0,1]`) with junior 2 (`[1,1]`)—avoiding forbidden pair `[0, 2]`—while shift 1 assigns senior 0 (`[1,0]`) to cover skill 0, yielding total cost $(20+20) + (16+16) + (10+10) =$ **92**.
