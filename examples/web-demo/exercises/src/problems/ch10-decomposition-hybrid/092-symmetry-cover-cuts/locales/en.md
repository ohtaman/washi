# #092. Symmetry Breaking & Cover Cuts

<!-- section:scenario -->
A logistics warehouse shipping planner packs weighted parcels such as parts boxes (items, in kg) into identical shipping containers (bins) of fixed weight capacity (in kg), minimizing the number of bins used. Because bins are interchangeable, a naive MIP formulation suffers from massive symmetry and a weak fractional LP lower bound equal to total weight divided by bin capacity.

Introduce the following constraints and strengthening cuts, and return the assignment, number of bins used, and strengthened LP relaxation objective value:
- **Symmetry breaking**: Fill bins in prefix order from index 0, and restrict each item to bin indices no greater than its own item index (fixing item 0 to bin 0).
- **Total capacity cut**: Add the rounded-up lower bound on the number of bins (total weight divided by bin capacity, rounded up).
- **Extended minimal cover inequalities**: Strengthen the LP relaxation using minimal item sets exceeding capacity augmented with any items at least as heavy as the heaviest item in the set.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `weights` | `number[]` | Weight of each item $i \in \{0, \dots, n-1\}$ (kg) |
| `binCapacity` | `number` | Maximum total weight permitted in a single bin (kg) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `assignments` | `number[]` | Bin index assigned to each item (0-based, contiguous prefix with `assignments[0] = 0`) |
| `binsUsed` | `number` | Minimum number of bins used |
| `lpBound` | `number` | Continuous LP relaxation objective after symmetry breaking, capacity cut, and cover cuts |

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

Assigning weights `[6]`, `[6]`, and `[6, 2]` to bins 0, 1, and 2 respects capacity 10 in every bin ($6 \le 10$, $6 \le 10$, $8 \le 10$) with prefix order 0..2, using **3** bins and yielding LP bound **3**.

<!-- section:hint1 -->
Use binary variables for whether each bin is used and whether each item is assigned to each bin, minimizing total used bins. Enforce that every item goes to one bin and each bin's total weight does not exceed capacity when used, plus prefix ordering across bins and item-index upper bounds on bin indices.

<!-- section:hint2 -->
To break symmetry, require consecutive bin usage to be non-increasing ($y_k \ge y_{k+1}$) and forbid assigning item $i$ to any bin $k > i$. For the strengthened LP bound, add the rounded global capacity cut $\sum_k y_k \ge \lceil \sum_i w_i / B \rceil$, and for every minimal cover $C$ extend it with all items at least as heavy as the heaviest item in $C$ to form $E(C)$ and enforce $\sum_{i \in E(C)} x_{ik} \le (|C| - 1) y_k$ on each bin $k$. In WaSHI, read `lpBound` via `m.relax()` before `m.solve()`; in PuLP, solve both a continuous relaxation (variables relaxed to $[0, 1]$) and the MIP.
