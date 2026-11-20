# #076. Rostering with Consecutive Workday Limits & Night-to-Day Rest

<!-- section:scenario -->
A 24-hour facility staffs three daily shift types: Day (0), Evening (1), and Night (2). Each staff member can work at most one shift per day and every daily shift demand must be covered.

To prevent fatigue, no staff member may work more than a specified maximum number of consecutive days, and anyone working a Night shift on day $d$ cannot work a Day shift on day $d + 1$. Schedule shifts (or Off) to minimize total staffing cost.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[][]` | Required staff per day $d$ for Day (`0`), Evening (`1`), and Night (`2`) |
| `shiftCosts` | `number[][]` | Cost of assigning staff $i$ to shift $s \in \{0, 1, 2\}$ ($N \times 3$) |
| `maxConsecutiveDays` | `number` | Maximum consecutive working days $K$ allowed for any staff member |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `schedule` | `number[][]` | $N \times D$ matrix with `-1` (Off), `0` (Day), `1` (Evening), or `2` (Night) |
| `totalCost` | `number` | Minimized total shift assignment cost |

<!-- section:example -->
**Input**

```json
{
  "demands": [
    [1, 1, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1]
  ],
  "shiftCosts": [
    [10, 12, 15],
    [11, 13, 14],
    [12, 11, 16],
    [13, 14, 15]
  ],
  "maxConsecutiveDays": 2
}
```

**Output**

```json
{
  "schedule": [
    [0, 0, -1, 0],
    [2, -1, 2, 2],
    [1, -1, 0, 1],
    [-1, 2, -1, -1]
  ],
  "totalCost": 121
}
```

Every staff member works at most 2 consecutive days and has zero Night (`2`) to Day (`0`) transitions, daily demands are satisfied, and total cost is $(10+10+10) + (14+14+14) + (11+12+11) + 15 =$ **121**.
