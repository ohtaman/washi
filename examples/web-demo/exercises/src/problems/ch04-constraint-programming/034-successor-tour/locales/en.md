# #034. Successor-Variable Hamiltonian Tour

<!-- section:scenario -->
A delivery planner is routing a delivery vehicle that starts at the depot (node 0), visits every customer node exactly once, and returns to the depot in a single closed tour. Between any two nodes, an integer travel distance (in km) for direct travel is given.

Choose the immediate successor node visited right after each node so that all nodes are visited in a single closed loop without disconnected subtours, minimizing the total travel distance (in km).

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `distances` | `number[][]` | `n × n` integer travel distance matrix (`distances[i][j]` from node `i` to `j`, in km) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `next` | `number[]` | Immediate successor node (0 to `n - 1`) visited directly after node `i` |
| `totalDistance` | `number` | Minimized total travel distance of the tour (km) |

<!-- section:example -->
**Input**

```json
{
  "distances": [
    [0, 2, 7, 9],
    [2, 0, 4, 8],
    [7, 4, 0, 2],
    [6, 8, 2, 0]
  ]
}
```

**Output**

```json
{
  "next": [1, 2, 3, 0],
  "totalDistance": 14
}
```

When `next` is [1, 2, 3, 0], it forms the single closed tour 0 -> 1 -> 2 -> 3 -> 0 covering all nodes with total distance $2 + 4 + 2 + 6 =$ **14** km.

<!-- section:hint1 -->
Model one successor integer variable per node in `[0, n - 1]` with no self-loops and all distinct values. To rule out disconnected cycles (subtours), introduce an auxiliary visit-order rank variable per node starting at depot 0.

<!-- section:hint2 -->
Enforce `distinct(next)`, `distinct(rank)`, and `rank[0] == 0` along with `at(rank, next[0]) == 1`. For every customer node $i \ge 1$, link successor steps with ``implies(expr`${next[i]} != 0`, expr`at(${rank}, ${next[i]}) == ${rank[i]} + 1`)``, and minimize the sum of `at(distances[i], next[i])` across all nodes using `solver: "pumpkin"`.
