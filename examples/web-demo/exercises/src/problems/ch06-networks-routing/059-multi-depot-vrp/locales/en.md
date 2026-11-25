# #059. Multi-Depot Vehicle Routing Problem (MDVRP)

<!-- section:scenario -->
A distribution network operates $D$ regional depots (`0..D-1`) serving $C$ customers (`D..D+C-1`):

- Every customer must be visited exactly once by a single vehicle route.
- Each route must start and end at the same origin depot, with no travel between different depots.
- Each depot may dispatch at most its available fleet size and supply at most its total warehouse demand capacity.
- Every vehicle's cumulative load along its route must stay within `vehicleCapacity`.

Design the delivery routes from all depots to **minimize total travel distance**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `dist` | `number[][]` | $(D+C) \times (D+C)$ distance matrix (`0..D-1` depots, `D..D+C-1` customers) |
| `demands` | `number[]` | Demand at each node (0 at depots, positive at customers) |
| `vehicleCapacity` | `number` | Load capacity $Q$ per vehicle route |
| `depotMaxVehicles` | `number[]` | Maximum number of vehicles available at each depot `d` |
| `depotCapacities` | `number[]` | Maximum total customer demand served from each depot `d` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `routes` | `number[][]` | List of routes, each starting and ending at its origin depot `d` (`[d, ..., d]`) |
| `totalDistance` | `number` | Minimized total travel distance across all routes |

<!-- section:example -->
**Input**

```json
{
  "dist": [
    [0, 10, 3, 4, 9, 9],
    [10, 0, 9, 9, 4, 3],
    [3, 9, 0, 6, 7, 10],
    [4, 9, 6, 0, 8, 7],
    [9, 4, 7, 8, 0, 6],
    [9, 3, 10, 7, 6, 0]
  ],
  "demands": [0, 0, 4, 4, 4, 4],
  "vehicleCapacity": 9,
  "depotMaxVehicles": [1, 1],
  "depotCapacities": [8, 10]
}
```

**Output**

```json
{
  "routes": [
    [0, 3, 2, 0],
    [1, 5, 4, 1]
  ],
  "totalDistance": 26
}
```

Depot 0 serves `{2, 3}` (demand `8 <= 8`, distance $4 + 6 + 3 = 13$) and depot 1 serves `{4, 5}` (demand `8 <= 10`, distance $3 + 6 + 4 = 13$), giving total distance $13 + 13 =$ **26**.

<!-- section:hint1 -->
Model depot-indexed binary arc variables restricted to each depot `d` and the customer set `{D..D+C-1}` (omitting inter-depot arcs), plus one continuous cumulative-load variable per customer bounded by its demand and `vehicleCapacity`. Enforce that each customer is visited once across all depots, conserve flow per `(depot, customer)` pair, and cap each depot's dispatched vehicles and total served demand.

<!-- section:hint2 -->
Do not use a single unindexed arc variable `x[i][j]` across depots—that allows open paths starting at one depot and ending at another! Indexing arcs by depot `d` over `{d} ∪ Customers` ensures every route returns to its origin depot, and a single shared load-based MTZ constraint ($u_i - u_j + Q \sum_d x_{ijd} \le Q - q_j$, where $q_j$ is customer $j$'s demand) prevents customer subtours across all depots.
