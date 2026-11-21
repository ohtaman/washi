# #057. Vehicle Routing with Time Windows (VRPTW)

<!-- section:scenario -->
Up to K vehicles leave depot 0 at time earliest[0] and must serve every customer once before returning to depot 0 no later than latest[0]. Each location has a service time window [earliest[i], latest[i]] and a required service duration; if a vehicle arrives early it waits until earliest[i], but arriving after latest[i] is forbidden.

Route up to K vehicles from depot 0 to serve every customer within its time window and return before the depot deadline, **minimizing total travel cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `dist` | `number[][]` | $(n+1) \times (n+1)$ travel time and cost matrix (`0` is depot) |
| `earliest` | `number[]` | Earliest allowed service start time at each node (`earliest[0] = 0`) |
| `latest` | `number[]` | Latest allowed service start time at customers; `latest[0]` is depot return deadline |
| `service` | `number[]` | Service duration at each node (`service[0] = 0`) |
| `maxVehicles` | `number` | Maximum number of routes leaving depot `0` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `routes` | `number[][]` | List of routes, each starting and ending at `0` (`[0, ..., 0]`) |
| `totalCost` | `number` | Minimized sum of travel costs across all routes |

<!-- section:example -->
**Input**

```json
{
  "dist": [
    [0, 3, 6, 5, 4],
    [3, 0, 4, 4, 6],
    [6, 4, 0, 4, 8],
    [5, 4, 4, 0, 5],
    [4, 6, 8, 5, 0]
  ],
  "earliest": [0, 10, 4, 2, 12],
  "latest": [40, 16, 12, 8, 22],
  "service": [0, 2, 2, 3, 2],
  "maxVehicles": 2
}
```

**Output**

```json
{
  "routes": [
    [0, 1, 0],
    [0, 3, 2, 4, 0]
  ],
  "totalCost": 27
}
```

Route `[0, 1, 0]` waits until `t = 10` at customer 1 (distance 6), while `[0, 3, 2, 4, 0]` starts service at `t = [5, 12, 22]` within all windows and returns at `28 <= 40` (distance 21), giving total travel cost $6 + 21 =$ **27**.

<!-- section:hint1 -->
Model binary arc variables between every pair of distinct locations, continuous service-start time variables bounded by `[earliest[i], latest[i]]`, and auxiliary visit-order potentials for customers. Fix the depot departure time, enforce customer degree 1, and cap the balanced depot degree by `maxVehicles`.

<!-- section:hint2 -->
Link service-start times along active arcs `(i, j)` with instance-derived Big-M inequalities ($t_i + s_i + d_{ij} - t_j \le M_{ij}(1 - x_{ij})$ where $M_{ij} = \max(0, l_i + s_i + d_{ij} - e_j)$), and also enforce the depot return deadline on arcs `(i, 0)`. Watch out for zero-time colocated customers (`service + dist == 0`): time constraints alone allow zero-duration customer-only cycles, so include MTZ visit-order constraints on customer arcs as well.
