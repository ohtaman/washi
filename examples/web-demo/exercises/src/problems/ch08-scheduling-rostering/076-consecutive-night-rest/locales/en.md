# #076. Rostering with Consecutive Workday Limits & Night-to-Day Rest

<!-- section:scenario -->
A 24-hour hospital ward schedules $N$ nurses over a $D$-day horizon across three daily shift types—Day (0), Evening (1), and Night (2)—to minimize total staffing cost subject to the following rules:

- Each staff member can work at most one shift per day (or take the day off).
- Every daily shift demand must be covered by at least its required headcount.
- No staff member may work more than a specified maximum number of consecutive days.
- Anyone working a Night shift (2) on day $d$ cannot work a Day shift (0) on day $d + 1$.

Both consecutive-day and Night-to-Day rules apply strictly over the non-cyclic horizon $0, \dots, D-1$ (with no wrap-around from day $D-1$ to day 0).

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `demands` | `number[][]` | Required staff per day $d$ for Day (0), Evening (1), and Night (2) ($D \times 3$) |
| `shiftCosts` | `number[][]` | Cost of assigning staff $i$ to shift $s \in \{0, 1, 2\}$ ($N \times 3$) |
| `maxConsecutiveDays` | `number` | Maximum consecutive working days $K$ allowed for any staff member |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `schedule` | `number[][]` | $N \times D$ matrix with -1 (Off), 0 (Day), 1 (Evening), or 2 (Night) |
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

Every staff member works at most 2 consecutive days and has zero Night (2) to Day (0) transitions, daily demands are satisfied, and total cost is $(10+10+10) + (14+14+14) + (11+12+11) + 15 =$ **121**.

<!-- section:hint1 -->
Use a three-dimensional binary assignment variable for staff member $i$, day $d$, and shift 0, 1, or 2. In addition to daily shift coverage and at most one shift per staff-day, you need two temporal coupling rules across adjacent days: a rolling consecutive-workday limit and a forbidden shift transition rule.

<!-- section:hint2 -->
Let $x_{i,d,s} \in \{0, 1\}$ indicate whether staff member $i$ works shift $s$ on day $d$. To cap consecutive working days at $K$, sum the daily working indicators ($\sum_s x_{i, \tau, s}$) over every rolling window of $K + 1$ consecutive days and bound that window sum by $K$; no auxiliary streak-counter variables are needed. Similarly, forbid Night-to-Day fatigue by bounding $x_{i,d,2} + x_{i,d+1,0} \le 1$ for every staff member $i$ and day $d < D - 1$.
