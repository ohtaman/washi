# #054. Asymmetric TSP with MTZ Subtour Elimination

<!-- section:scenario -->
A courier vehicle starts at city 0, must visit every other city exactly once, and return to city 0. Because one-way streets and elevation changes affect travel time, the cost of traveling from city i to city j can differ from city j to city i.

Formulate the asymmetric Traveling Salesperson Problem as a mixed-integer program to find a single closed tour with no disconnected subtours and **minimize total tour cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `dist` | `number[][]` | $n \times n$ asymmetric travel cost matrix (`dist[i][j]` from `i` to `j`) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `tour` | `number[]` | Visit order of all $n$ cities starting at `0` (`tour[0] = 0`) |
| `totalCost` | `number` | Minimized total closed-cycle travel cost |

<!-- section:example -->
**Input**

```json
{
  "dist": [
    [0, 12, 2, 9],
    [10, 0, 14, 2],
    [3, 7, 0, 11],
    [8, 3, 6, 0]
  ]
}
```

**Output**

```json
{
  "tour": [0, 2, 1, 3],
  "totalCost": 19
}
```

Visiting `0 -> 2 -> 1 -> 3 -> 0` covers all four cities in one cycle with total cost $2 + 7 + 2 + 8 =$ **19**.

<!-- section:hint1 -->
Model one binary arc variable for every ordered pair of distinct cities, plus one continuous visit-order potential variable for each non-depot city. Enforce that every city has exactly one incoming arc and one outgoing arc, then minimize total arc distance.

<!-- section:hint2 -->
Degree constraints alone allow disconnected subtours. Add Miller-Tucker-Zemlin (MTZ) precedence constraints on non-depot arcs `(i, j)`—forcing $u_i + 1 \le u_j$ whenever `x[i][j] == 1` via $u_i - u_j + n x_{ij} \le n - 1$—so only a single tour anchored at city 0 is feasible, and reconstruct `tour` by following the chosen arcs from city 0.
