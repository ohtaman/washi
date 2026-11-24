# #057. Theme Park Group Itinerary (Time Windows)

<!-- section:scenario -->
Up to K groups enter the theme park at the entrance (location 0) at opening time, must visit every designated attraction exactly once, and return to the entrance before closing time. Each attraction has an allowed start time window (from opening to cutoff) and a visit duration; if a group arrives early it may wait until the window opens, but starting after the cutoff is forbidden.

Plan up to K tour routes satisfying all time windows and the park closing time while **minimizing total walking travel time**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `travelTimes` | `number[][]` | $(n+1) \times (n+1)$ walking time matrix (0 is park entrance) |
| `earliest` | `number[]` | Earliest allowed visit start time at each node (`earliest[0] = 0`) |
| `latest` | `number[]` | Latest allowed visit start time at attractions; `latest[0]` is park closing deadline |
| `visitDurations` | `number[]` | Ride or show duration at each node (`visitDurations[0] = 0`) |
| `maxGroups` | `number` | Maximum number of group itineraries leaving gate 0 |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `itineraries` | `number[][]` | List of group itineraries, each starting and ending at 0 (`[0, ..., 0]`) |
| `totalCost` | `number` | Minimized sum of walking travel times across all itineraries |

<!-- section:example -->
**Input**

```json
{
  "travelTimes": [
    [0, 4, 7, 5, 3],
    [4, 0, 5, 4, 6],
    [7, 5, 0, 4, 7],
    [5, 4, 4, 0, 5],
    [3, 6, 7, 5, 0]
  ],
  "earliest": [0, 12, 5, 2, 14],
  "latest": [45, 18, 14, 9, 24],
  "visitDurations": [0, 3, 2, 3, 2],
  "maxGroups": 2
}
```

**Output**

```json
{
  "itineraries": [
    [0, 1, 0],
    [0, 3, 2, 4, 0]
  ],
  "totalCost": 27
}
```

Group `[0, 1, 0]` waits until `t = 12` at attraction 1 and returns at `19 <= 45` (walking time 8), while `[0, 3, 2, 4, 0]` starts visits at `t = [5, 12, 21]` within all windows and returns at `26 <= 45` (walking time 19), giving total travel time $8 + 19 =$ **27**.

<!-- section:hint1 -->
Model binary transition variables between every pair of distinct locations, continuous visit-start time variables bounded by `[earliest[i], latest[i]]`, and auxiliary visit-order potentials for attractions. Fix the entrance departure time, enforce attraction degree 1, and cap the balanced gate degree by `maxGroups`.

<!-- section:hint2 -->
Link visit-start times along active transitions `(i, j)` with instance-derived Big-M inequalities ($t_i + s_i + d_{ij} - t_j \le M_{ij}(1 - x_{ij})$ where $M_{ij} = \max(0, l_i + s_i + d_{ij} - e_j)$), and also enforce the park closing deadline on return arcs `(i, 0)`. Watch out for zero-time colocated attractions (`visitDurations + travelTimes == 0`): time constraints alone allow zero-duration attraction-only cycles, so include MTZ visit-order constraints on attraction arcs as well.
