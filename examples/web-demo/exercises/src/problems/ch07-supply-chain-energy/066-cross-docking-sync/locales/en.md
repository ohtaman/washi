# #066. Cross-Docking Door & Flow Synchronization

<!-- section:scenario -->
A cross-dock terminal coordinates inbound delivery trucks and outbound linehaul trucks across dedicated inbound strip doors and outbound stack doors:

- Each inbound truck is assigned to one inbound door and each outbound truck to one outbound door, without exceeding any door's truck capacity.
- Non-negative continuous commodity flows move freight from inbound trucks to outbound trucks so that no inbound truck ships more than its supply of any commodity and every outbound truck's demand is met.
- Each unit transferred incurs a handling cost and requires a transfer duration determined by the assigned inbound–outbound door pair.
- Whenever any positive freight flows from an inbound truck to an outbound truck, that outbound truck cannot depart earlier than the inbound truck's arrival time plus the door-pair transfer time; any departure past an outbound truck's due time incurs a per-time-unit delay penalty.

Choose door assignments, continuous commodity flows, and outbound departure times to **minimize total handling and delay cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `supplies` | `number[][]` | Inbound commodity supply per inbound truck and commodity ($N_{\text{in}} \times K$) |
| `demands` | `number[][]` | Outbound commodity demand per outbound truck and commodity ($N_{\text{out}} \times K$) |
| `arrivalTimes` | `number[]` | Arrival time per inbound truck (length $N_{\text{in}}$) |
| `dueTimes` | `number[]` | Target due time per outbound truck (length $N_{\text{out}}$) |
| `inDoorCaps` | `number[]` | Maximum inbound trucks allowed per inbound door (length $R$) |
| `outDoorCaps` | `number[]` | Maximum outbound trucks allowed per outbound door (length $S$) |
| `handlingCosts` | `number[][]` | Per-unit transfer handling cost between inbound and outbound doors ($R \times S$) |
| `transferTimes` | `number[][]` | Transfer duration between inbound and outbound doors ($R \times S$) |
| `delayCost` | `number` | Tardiness penalty per unit time past an outbound truck's due time |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `inDoor` | `number[]` | Assigned inbound door index ($0 \dots R-1$) per inbound truck |
| `outDoor` | `number[]` | Assigned outbound door index ($0 \dots S-1$) per outbound truck |
| `flows` | `number[][][]` | Non-negative continuous commodity flows ($N_{\text{in}} \times N_{\text{out}} \times K$) |
| `departures` | `number[]` | Non-negative departure time per outbound truck (length $N_{\text{out}}$) |
| `totalCost` | `number` | Minimized total handling plus delay cost |

<!-- section:example -->
**Input**

```json
{
  "supplies": [
    [20, 15],
    [15, 25],
    [25, 10]
  ],
  "demands": [
    [15, 15],
    [25, 20],
    [20, 15]
  ],
  "arrivalTimes": [1, 3, 2],
  "dueTimes": [6, 8, 7],
  "inDoorCaps": [2, 2],
  "outDoorCaps": [2, 2],
  "handlingCosts": [
    [2, 5],
    [4, 2]
  ],
  "transferTimes": [
    [2, 5],
    [4, 2]
  ],
  "delayCost": 30
}
```

**Output**

```json
{
  "inDoor": [0, 1, 1],
  "outDoor": [1, 1, 0],
  "flows": [
    [
      [0, 0],
      [0, 0],
      [20, 15]
    ],
    [
      [15, 5],
      [0, 20],
      [0, 0]
    ],
    [
      [0, 10],
      [25, 0],
      [0, 0]
    ]
  ],
  "departures": [5, 5, 3],
  "totalCost": 220
}
```

Pairing inbound 0 with outbound 2 on door pair (0, 0) and pairing inbounds 1–2 with outbounds 0–1 on door pair (1, 1) routes all 110 units at unit handling cost 2 with departures [5, 5, 3] within due times [6, 8, 7] (zero delay), giving total cost $110 \times 2 =$ **220**.


<!-- section:hint1 -->
Use binary assignment matrices to assign each inbound truck to one inbound door and each outbound truck to one outbound door, binary indicators to record whether any freight moves between each inbound–outbound truck pair, and continuous variables for commodity flows, outbound departure times, and tardiness.

<!-- section:hint2 -->
Because handling cost and transfer time depend on the $(r, s)$ door pair while commodity flows are indexed by $(i, j, k)$, disaggregate total pair flow into door-pair variables $w_{i,j,r,s}$ linked to both door assignments (`x[i][r]` and `y[j][s]`). For time synchronization, enforce that outbound truck $j$'s departure time is at least `arrivalTimes[i] + transferTimes[r][s]` only when all three binaries (`x[i][r]`, `y[j][s]`, and `z[i][j]`) equal 1 using a tight Big-M equal to `max(arrivalTimes) + max(transferTimes)`.
