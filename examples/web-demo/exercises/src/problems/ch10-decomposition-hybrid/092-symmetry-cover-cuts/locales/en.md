# #092. Symmetry Breaking & Cover Cuts

<!-- section:scenario -->
Pack a list of weighted items into identical bins of fixed capacity while minimizing the number of used bins. Because bins are interchangeable, standard MIP formulations suffer from massive symmetry and a weak fractional LP lower bound equal to total weight divided by bin capacity.

Break symmetry by enforcing prefix bin usage, placing item 0 in bin 0, and restricting item i to bins up to i. Then tighten the LP relaxation with a rounded global capacity inequality and extended minimal cover cuts, returning the bin assignment, total bins used, and strengthened LP relaxation objective.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `weights` | `number[]` | Weight of each item $i \in \{0, \dots, n-1\}$ |
| `binCapacity` | `number` | Maximum total weight permitted in any single bin |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `assignments` | `number[]` | Zero-based bin index assigned to each item (prefix-ordered with `assignments[0] = 0`) |
| `binsUsed` | `number` | Minimum number of bins used |
| `lpBound` | `number` | Continuous LP relaxation objective after adding symmetry, capacity, and cover cuts |

<!-- section:example -->
**Input**

```json
{
  "weights": [6, 6, 6, 2],
  "binCapacity": 10
}
```

**Output**

```json
{
  "assignments": [0, 1, 2, 2],
  "binsUsed": 3,
  "lpBound": 3
}
```

Assigning weights `[6]`, `[6]`, and `[6, 2]` to bins `0`, `1`, and `2` respects capacity `10` in every bin (`6 <= 10`, `6 <= 10`, `8 <= 10`) with prefix order `0..2`, using **3** bins and achieving LP bound **3**.
