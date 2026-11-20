# #022. Weighted L1 Target Tracking

<!-- section:scenario -->
An operations planner must set non-negative allocation levels across several channels within individual upper limits so their sum meets an exact total output target and their total spending stays within budget. Because the desired target levels may violate the budget or sum constraint, some channels must adjust upward or downward.

Each unit of deviation above or below a channel's target incurs a priority penalty weight. Choose the channel allocations to **minimize the weighted L1 deviation** from the target levels.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `targets` | `number[]` | Target allocation $\tau_i$ for channel $i$ |
| `weights` | `number[]` | Deviation penalty weight $w_i$ per unit |
| `upperBounds` | `number[]` | Maximum allowed allocation $u_i$ for channel $i$ |
| `costs` | `number[]` | Unit cost $c_i$ for channel $i$ |
| `budget` | `number` | Maximum allowable total spending |
| `totalOutput` | `number` | Required exact sum of allocations |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `allocations` | `number[]` | Chosen allocation $x_i$ for each channel |
| `totalDeviation` | `number` | Minimized weighted L1 deviation $\sum_i w_i \lvert x_i - \tau_i \rvert$ |

<!-- section:example -->
**Input**

```json
{
  "targets": [40, 30, 30],
  "weights": [3, 2, 1],
  "upperBounds": [60, 60, 60],
  "costs": [5, 2, 1],
  "budget": 230,
  "totalOutput": 100
}
```

**Output**

```json
{
  "allocations": [25, 30, 45],
  "totalDeviation": 60
}
```

Allocations `[25, 30, 45]` sum to $100$, spend $5 \times 25 + 2 \times 30 + 1 \times 45 = 230 \le 230$, and give weighted deviation $3 \lvert 25 - 40 \rvert + 2 \lvert 30 - 30 \rvert + 1 \lvert 45 - 30 \rvert =$ **60**.
