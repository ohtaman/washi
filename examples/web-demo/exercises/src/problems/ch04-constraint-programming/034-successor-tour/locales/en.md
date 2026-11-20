# #034. Successor-Variable Hamiltonian Tour

<!-- section:scenario -->
A delivery vehicle starts at depot 0, must visit every customer node 1 through n - 1 exactly once, and return to depot 0 in a single closed tour. Entry distances[i][j] gives the travel distance from node i directly to node j.

Choose the immediate successor next[i] visited after each node i so that the successor pointers form one connected Hamiltonian tour without any disconnected subtours, minimizing total travel distance.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `distances` | `number[][]` | `n × n` integer travel distance matrix (`distances[i][j]` from node `i` to `j`) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `next` | `number[]` | Immediate successor node (`0` to `n - 1`) visited directly after node `i` |
| `totalDistance` | `number` | Minimized total tour distance `sum(distances[i][next[i]])` |

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

Following `next = [1, 2, 3, 0]` traces the single closed tour `0 -> 1 -> 2 -> 3 -> 0` of length $2 + 4 + 2 + 6 =$ **14**.
