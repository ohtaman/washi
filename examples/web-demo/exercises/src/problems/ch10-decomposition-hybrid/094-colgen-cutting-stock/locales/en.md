# #094. Cutting Stock via Column Generation

<!-- section:scenario -->
A paper mill cuts standard stock rolls of fixed width into smaller item widths to satisfy customer demands while minimizing the total number of stock rolls consumed. Because the number of valid cutting patterns grows combinatorially with item types, enumerating every pattern upfront does not scale.

Start a Restricted Master Problem with simple single-item initial patterns and use WaSHI column generation to dynamically solve knapsack pricing subproblems from the master dual shadow prices until LP convergence, then finalize the restricted master as an integer program.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `rollWidth` | `number` | Width of each uncut standard stock roll |
| `widths` | `number[]` | Width of each requested item type $i$ |
| `demands` | `number[]` | Minimum required count of each item type $i$ |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `patterns` | `number[][]` | Selected integer cutting patterns (each of length `widths.length`) |
| `counts` | `number[]` | Non-negative integer roll counts used for each selected pattern |
| `totalRolls` | `number` | Total number of stock rolls consumed (`sum(counts)`) |

<!-- section:example -->
**Input**

```json
{
  "rollWidth": 100,
  "widths": [45, 36, 16],
  "demands": [10, 14, 20]
}
```

**Output**

```json
{
  "patterns": [
    [0, 2, 1],
    [1, 1, 1],
    [0, 1, 4]
  ],
  "counts": [1, 10, 3],
  "totalRolls": 14
}
```

Each pattern fits within `100` (`88`, `97`, `100 <= 100`), producing `[10, 15, 23] >= [10, 14, 20]` items across `1 + 10 + 3 =` **14** stock rolls.
