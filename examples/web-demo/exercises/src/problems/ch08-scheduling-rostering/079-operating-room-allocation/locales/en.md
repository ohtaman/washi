# #079. Operating Room Surgical Case & Overtime Allocation

<!-- section:scenario -->
A hospital schedules candidate surgical cases into $R$ operating rooms across $S$ daily sessions. Each case has a required duration, a clinical priority score if scheduled, and a room compatibility mask; unscheduled cases earn zero score.

Every room-session block has a regular time capacity that may be extended up to a fixed overtime cap at a linear per-unit overtime penalty. Select which cases to admit and assign them to compatible room-session blocks to maximize total priority score minus total overtime cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `durations` | `number[]` | Duration $d_c$ of each surgical case $c$ |
| `priorities` | `number[]` | Priority reward $p_c$ earned if case $c$ is scheduled |
| `compatible` | `number[][]` | Binary $C \times R$ matrix indicating whether case $c$ can use room $r$ |
| `numSessions` | `number` | Number of sessions $S$ per operating room |
| `regularCapacity` | `number` | Regular duration capacity $B$ of each `(room, session)` block |
| `maxOvertime` | `number` | Maximum allowed overtime $O_{\max}$ per `(room, session)` block |
| `overtimeCost` | `number` | Penalty cost per unit of overtime above regular capacity |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `assignedRoom` | `number[]` | Room index `0..R-1` per case, or `-1` if unscheduled |
| `assignedSession` | `number[]` | Session index `0..S-1` per case, or `-1` if unscheduled |
| `overtime` | `number[][]` | Non-negative overtime $o_{r,s}$ used in each `(room, session)` ($R \times S$) |
| `netScore` | `number` | Maximized priority total minus overtime cost |

<!-- section:example -->
**Input**

```json
{
  "durations": [3, 4, 2, 3, 2],
  "priorities": [60, 85, 45, 70, 20],
  "compatible": [
    [1, 1],
    [1, 0],
    [0, 1],
    [1, 1],
    [1, 1]
  ],
  "numSessions": 2,
  "regularCapacity": 3,
  "maxOvertime": 1,
  "overtimeCost": 25
}
```

**Output**

```json
{
  "assignedRoom": [0, 0, 1, 1, -1],
  "assignedSession": [1, 0, 1, 0, -1],
  "overtime": [
    [1, 0],
    [0, 0]
  ],
  "netScore": 235
}
```

Cases 0–3 are each assigned to compatible rooms (`compatible[c][r] = 1`), with block loads `[4, 3]` in room 0 and `[3, 2]` in room 1 fitting within regular capacity `3` plus overtime `[[1, 0], [0, 0]]` (within `maxOvertime = 1`), case 4 unscheduled (`-1`), and net score $(60 + 85 + 45 + 70) - 25 \times 1 =$ **235**.
