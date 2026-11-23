# #056. Capacitated Vehicle Routing Problem (CVRP)

<!-- section:scenario -->
A fleet of up to K identical delivery vehicles is stationed at depot 0, each carrying a uniform load capacity. Every customer location has a positive delivery demand and must be visited exactly once by a single route that begins and ends at depot 0, without exceeding the vehicle capacity along any route.

Formulate the Capacitated Vehicle Routing Problem as a mixed-integer program to eliminate subtours, satisfy vehicle capacity and fleet limits, and **minimize total travel distance**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `dist` | `number[][]` | $(n+1) \times (n+1)$ distance matrix (0 is depot, `1..n` are customers) |
| `demands` | `number[]` | Demand at each node (`demands[0] = 0`, positive for customers) |
| `capacity` | `number` | Load capacity $Q$ of each vehicle |
| `maxVehicles` | `number` | Maximum number of routes leaving depot 0 |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `routes` | `number[][]` | List of routes, each starting and ending at 0 (`[0, ..., 0]`) |
| `totalDistance` | `number` | Minimized sum of distances across all routes |

<!-- section:example -->
**Input**

```json
{
  "dist": [
    [0, 5, 7, 5, 6],
    [5, 0, 3, 6, 9],
    [7, 3, 0, 9, 12],
    [5, 6, 9, 0, 4],
    [6, 9, 12, 4, 0]
  ],
  "demands": [0, 4, 5, 4, 5],
  "capacity": 10,
  "maxVehicles": 2
}
```

**Output**

```json
{
  "routes": [
    [0, 1, 2, 0],
    [0, 3, 4, 0]
  ],
  "totalDistance": 30
}
```

Route `[0, 1, 2, 0]` carries demand $4 + 5 = 9 \le 10$ with distance $5 + 3 + 7 = 15$, route `[0, 3, 4, 0]` carries $4 + 5 = 9 \le 10$ with distance $5 + 4 + 6 = 15$, and total distance is $15 + 15 =$ **30**.

<!-- section:hint1 -->
Model one binary arc variable for every ordered pair of distinct nodes, and one continuous cumulative-load variable per customer bounded between that customer's demand and the vehicle capacity. Enforce out-degree and in-degree equal to 1 at every customer, and cap the balanced depot out-degree and in-degree by `maxVehicles`.

<!-- section:hint2 -->
Track cumulative delivered load along customer-to-customer arcs with load-based MTZ constraints ($u_i - u_j + Q x_{ij} \le Q - d_j$ for distinct customers $i, j$). This single family simultaneously prevents disconnected subtours and ensures no route's total demand exceeds $Q$; reconstruct each route by following outgoing arcs from depot 0 until returning to 0.
