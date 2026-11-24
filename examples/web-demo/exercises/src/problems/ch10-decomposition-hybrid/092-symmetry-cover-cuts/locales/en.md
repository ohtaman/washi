# #092. Symmetry Breaking & Cover Cuts

<!-- section:scenario -->
A logistics warehouse shipping planner packs weighted parcels such as parts boxes (in kg) into identical shipping containers (bins) of fixed weight capacity (in kg), minimizing the number of containers used. Because containers are interchangeable, a naive MIP formulation suffers from massive symmetry and a weak fractional LP lower bound equal to total weight divided by container capacity.

Introduce symmetry-breaking constraints that fill containers in prefix order from index 0 and restrict each item to container indices no greater than its own item index (fixing the first item to container 0). Also add a rounded global capacity lower-bound cut (total weight divided by container capacity, rounded up) and extended minimal cover inequalities—minimal sets of items exceeding capacity augmented with any items at least as heavy—to strengthen the LP relaxation, and return the assignment, number of containers used, and strengthened LP relaxation objective value.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `weights` | `number[]` | Weight of each item $i \in \{0, \dots, n-1\}$ (kg) |
| `binCapacity` | `number` | Maximum total weight permitted in a single container (kg) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `assignments` | `number[]` | Container index assigned to each item (0-based, contiguous prefix with `assignments[0] = 0`) |
| `binsUsed` | `number` | Minimum number of containers used |
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

Assigning weights `[6]`, `[6]`, and `[6, 2]` to bins 0, 1, and 2 respects capacity 10 in every bin ($6 \le 10$, $6 \le 10$, $8 \le 10$) with prefix order 0..2, using **3** bins and achieving LP bound **3**.

<!-- section:hint1 -->
Use binary variables for whether each bin is used and whether each item is assigned to each bin, minimizing total used bins. Enforce that every item goes to one bin and each bin's total weight does not exceed capacity when used, plus prefix ordering across bins and item-index upper bounds on bin indices.

<!-- section:hint2 -->
To break symmetry, require consecutive bin usage to be non-increasing ($u_k \ge u_{k+1}$) and forbid assigning item $i$ to any bin $k > i$. For the strengthened LP bound, add the rounded global capacity cut $\sum_k u_k \ge \lceil \sum_i w_i / B \rceil$, and for every minimal cover $C$ ($\sum_{i \in C} w_i > B$ and removing its lightest item drops below or equal to $B$), extend it with $E(C) = C \cup \{j : w_j \ge \max_{i \in C} w_i\}$ and constrain $\sum_{i \in E(C)} x_{ik} \le (|C| - 1) u_k$ per bin $k$; then read `lpBound` via `m.relax()` before `m.solve()`.
