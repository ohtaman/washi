# #049. SMT-LIRA Mode Selection & Time Windows

<!-- section:scenario -->
A logistics hub schedules incoming shipments at a single unloading dock. Each shipment uses either Standard mode or Express mode: Express mode incurs an express fee and unlocks its own continuous time window and shorter fractional processing duration, while at most a bounded integer number of shipments may use Express mode.

Every shipment must avoid a scheduled dock maintenance blackout interval, no two shipments may overlap on the dock, and finishing past a shipment's due time incurs a continuous tardiness penalty per unit time. Choose each shipment's mode and continuous start and end times to minimize total express fees plus tardiness penalties.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `shipments` | `ShipmentSpec[]` | Shipment windows (`stdWindow`, `expWindow`), durations (`stdDuration`, `expDuration`), `expFee`, `dueTime`, `tardinessPenalty` |
| `blackout` | `[number, number]` | Unavailable dock maintenance window `[bStart, bEnd]` |
| `maxExpress` | `number` | Maximum integer number of Express shipments allowed |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `express` | `boolean[]` | `true` if shipment uses Express mode, `false` for Standard |
| `startTimes` | `number[]` | Continuous unloading start time per shipment |
| `endTimes` | `number[]` | Continuous unloading completion time per shipment |
| `totalCost` | `number` | Minimized sum of express fees and tardiness penalties |

<!-- section:example -->
**Input**

```json
{
  "shipments": [
    {
      "stdWindow": [0, 6],
      "expWindow": [0, 6],
      "stdDuration": 2.5,
      "expDuration": 1.5,
      "expFee": 20,
      "dueTime": 3,
      "tardinessPenalty": 10
    },
    {
      "stdWindow": [0, 5],
      "expWindow": [0, 5],
      "stdDuration": 2,
      "expDuration": 1,
      "expFee": 15,
      "dueTime": 3,
      "tardinessPenalty": 12
    }
  ],
  "blackout": [3, 4],
  "maxExpress": 1
}
```

**Output**

```json
{
  "express": [false, true],
  "startTimes": [0, 4],
  "endTimes": [2.5, 5],
  "totalCost": 39
}
```

Shipment 0 runs in Standard mode over `[0, 2.5]` before the `[3, 4]` blackout (0 tardiness), and Shipment 1 switches to Express mode over `[4, 5]` with fee 15 and tardiness `12 * (5 - 3) = 24`, totaling 39.


<!-- section:hint1 -->
For each shipment, model a Boolean mode choice (Express vs. Standard) together with continuous start, end, and non-negative tardiness variables. Express mode unlocks a shorter duration and its own time window, while all shipments must avoid the dock blackout interval and never overlap each other.

<!-- section:hint2 -->
Pair each `m.bool(...)` mode variable with an `m.binary(...)` flag for arithmetic sums and objective terms (`sum(expFlag) <= maxExpress` and express fees). Use `implies(...)` and `not(...)` to enforce mode-dependent windows and durations, and use `or(...)` directly for both blackout avoidance (`end[i] <= blackout[0]` or `start[i] >= blackout[1]`) and pairwise non-overlap (`end[i] <= start[j]` or `end[j] <= start[i]`), solving with `await m.solve({ solver: "z3" })`.
