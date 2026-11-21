# #058. Pickup & Delivery Vehicle Routing (PDP)

<!-- section:scenario -->
Up to K identical vehicles operate out of depot 0 to serve paired pickup-and-delivery requests, each with a pickup location, a delivery location, and a load demand. Both endpoints of each request must be served by the same vehicle with pickup visited strictly before delivery, while never exceeding vehicle capacity or the per-vehicle stop limit.

Formulate the Pickup and Delivery Problem as a mixed-integer program to **minimize total route distance**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `dist` | `number[][]` | $N \times N$ travel distance matrix (`0` is depot, `1..N-1` are pickup/delivery stops) |
| `requests` | `Array<{ pickup, delivery, demand }>` | Paired requests with pickup node, delivery node, and load `demand` |
| `capacity` | `number` | Vehicle load capacity $Q$ |
| `maxVehicles` | `number` | Maximum number of active routes leaving depot `0` |
| `maxStopsPerVehicle` | `number` | Maximum number of non-depot stops visited by any single route |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `routes` | `number[][]` | List of routes, each starting and ending at `0` (`[0, ..., 0]`) |
| `totalDistance` | `number` | Minimized sum of travel distances across all routes |

<!-- section:example -->
**Input**

```json
{
  "dist": [
    [0, 2, 7, 4, 8],
    [2, 0, 5, 1, 6],
    [7, 5, 0, 4, 1],
    [4, 1, 4, 0, 5],
    [8, 6, 1, 5, 0]
  ],
  "requests": [
    { "pickup": 1, "delivery": 2, "demand": 3 },
    { "pickup": 3, "delivery": 4, "demand": 4 }
  ],
  "capacity": 7,
  "maxVehicles": 1,
  "maxStopsPerVehicle": 4
}
```

**Output**

```json
{
  "routes": [
    [0, 1, 3, 2, 4, 0]
  ],
  "totalDistance": 16
}
```

Route `[0, 1, 3, 2, 4, 0]` picks up request 0 (`load = 3`) and request 1 (`load = 7 <= 7`) before delivering `2` (`load = 4`) and `4` (`load = 0`), obeying pairing, precedence, and stop limits with distance $2 + 1 + 4 + 1 + 8 =$ **16**.

<!-- section:hint1 -->
Index binary arc variables by vehicle `k` so you can enforce same-vehicle pairing directly. Also introduce continuous visit-order variables and continuous cumulative-load variables per location, enforcing that every non-depot stop is visited once, flow is conserved per vehicle, and each vehicle's total stops stay within `maxStopsPerVehicle`.

<!-- section:hint2 -->
Because load rises at pickups and drops at deliveries, standard monotonic MTZ load variables cannot be used for subtour elimination—keep separate visit-order variables $t_i$ (with $t_0 = 0$) for subtour elimination and pickup-before-delivery precedence ($t_p + 1 \le t_d$), and separate load variables $L_i \in [0, Q]$ with $L_0 = 0$ that update by $+q_r$ at pickups and $-q_r$ at deliveries via Big-M linking along active arcs.
