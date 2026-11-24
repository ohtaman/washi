# #079. e-Sports League Match & Venue Scheduling

<!-- section:scenario -->
An e-sports league schedules candidate tournament matches across V arenas and S broadcast timeslots. Each match has a required broadcast duration, a viewership priority score if scheduled, and a venue compatibility mask; unscheduled matches earn zero score.

Every venue-slot block has a regular broadcast length that may be extended up to a fixed overtime cap at a linear per-unit overtime penalty. Select which matches to broadcast and assign them to compatible venue-slot blocks to maximize total viewership score minus total overtime cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `durations` | `number[]` | Duration $d_m$ of each match $m$ |
| `scores` | `number[]` | Viewership score $p_m$ earned if match $m$ is scheduled |
| `compatible` | `number[][]` | Binary $M \times V$ matrix indicating whether match $m$ can be hosted at venue $v$ |
| `numSlots` | `number` | Number of timeslots $S$ per venue |
| `regularLength` | `number` | Regular broadcast length $B$ of each `(venue, slot)` block |
| `maxOvertime` | `number` | Maximum allowed overtime $O_{\max}$ per `(venue, slot)` block |
| `overtimeCost` | `number` | Penalty cost per unit of overtime above regular length |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `assignedVenue` | `number[]` | Venue index 0 to $V-1$ per match, or -1 if unscheduled |
| `assignedSlot` | `number[]` | Timeslot index 0 to $S-1$ per match, or -1 if unscheduled |
| `overtime` | `number[][]` | Non-negative overtime $o_{v,s}$ used in each `(venue, slot)` ($V \times S$) |
| `netScore` | `number` | Maximized viewership total minus overtime cost |

<!-- section:example -->
**Input**

```json
{
  "durations": [2, 4, 3, 3, 2],
  "scores": [55, 95, 70, 65, 18],
  "compatible": [
    [1, 1],
    [1, 0],
    [0, 1],
    [1, 1],
    [1, 1]
  ],
  "numSlots": 2,
  "regularLength": 3,
  "maxOvertime": 1,
  "overtimeCost": 25
}
```

**Output**

```json
{
  "assignedVenue": [1, 0, 1, 0, -1],
  "assignedSlot": [1, 0, 0, 1, -1],
  "overtime": [
    [1, 0],
    [0, 0]
  ],
  "netScore": 260
}
```

Matches 0–3 are each assigned to compatible venues (`compatible[m][v] = 1`), with block loads [4, 3] at venue 0 and [3, 2] at venue 1 fitting within regular length 3 plus overtime [[1, 0], [0, 0]] (within `maxOvertime = 1`), match 4 unscheduled (-1), and net score $(55 + 95 + 70 + 65) - 25 \times 1 =$ **260**.

<!-- section:hint1 -->
Use a three-dimensional binary decision for assigning each match to a venue and timeslot, paired with a continuous non-negative overtime variable for each venue-slot block bounded above by the overtime cap. Each match can be scheduled at most once in a compatible venue, and each block's total match duration must fit within its regular length plus its overtime.

<!-- section:hint2 -->
Because `overtimeCost` is positive and you are maximizing `netScore`, the continuous overtime variables (`m.continuous` / `pulp.LpVariable`) naturally take the exact excess above `regularLength` without needing extra binary indicator variables. Remember to fix incompatible `(m, v)` assignments to zero and decode unscheduled matches as -1 in both `assignedVenue` and `assignedSlot`.
