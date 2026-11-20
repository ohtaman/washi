# #066. Cross-Docking Door & Flow Synchronization

<!-- section:scenario -->
A cross-dock terminal coordinates inbound delivery trucks and outbound linehaul trucks across dedicated inbound strip doors and outbound stack doors. Each inbound truck must be assigned to one inbound door (respecting door capacity), and each outbound truck must be assigned to one outbound door (respecting door capacity), while matching commodity supplies to outbound truck demands.

Every unit transferred from inbound truck $i$ (docked at inbound door $r$) to outbound truck $j$ (docked at outbound door $s$) incurs a door-pair handling cost and requires a door-pair transfer duration. Whenever any positive freight flows from inbound truck $i$ to outbound truck $j$, truck $j$ cannot depart earlier than truck $i$'s arrival time plus the transfer time between their assigned doors; any departure past truck $j$'s due time incurs a per-time-unit delay penalty. Choose door assignments, commodity flows, and outbound departure times to **minimize total handling and delay cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `supplies` | `number[][]` | Inbound commodity supply matrix ($N_{\text{in}} \times K$) |
| `demands` | `number[][]` | Outbound commodity demand matrix ($N_{\text{out}} \times K$) |
| `arrivalTimes` | `number[]` | Arrival time $a_i$ of inbound truck $i$ |
| `dueTimes` | `number[]` | Target due time $d_j$ of outbound truck $j$ |
| `inDoorCaps` | `number[]` | Maximum inbound trucks allowed at door $r$ |
| `outDoorCaps` | `number[]` | Maximum outbound trucks allowed at door $s$ |
| `handlingCosts` | `number[][]` | Per-unit transfer cost $c_{r,s}$ between doors $(r, s)$ |
| `transferTimes` | `number[][]` | Transfer duration $\tau_{r,s}$ between doors $(r, s)$ |
| `delayCost` | `number` | Tardiness penalty per unit time past `dueTimes[j]` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `inDoor` | `number[]` | Assigned inbound door index ($0 \dots R-1$) per inbound truck |
| `outDoor` | `number[]` | Assigned outbound door index ($0 \dots S-1$) per outbound truck |
| `flows` | `number[][][]` | Non-negative commodity flows ($N_{\text{in}} \times N_{\text{out}} \times K$) |
| `departures` | `number[]` | Non-negative departure time $t_j$ per outbound truck |
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

Pairing inbound 0 with outbound 2 on door `(0, 0)` and pairing inbounds 1–2 with outbounds 0–1 on door `(1, 1)` routes all 110 units at unit handling cost 2 with departures `[5, 5, 3] <= [6, 8, 7]` (zero delay), giving total cost $110 \times 2 =$ **220**.
