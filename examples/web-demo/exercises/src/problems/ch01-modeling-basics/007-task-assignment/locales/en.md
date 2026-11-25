# #007. 1-to-1 Delivery Zone Assignment

<!-- section:scenario -->
A delivery depot has an equal number of couriers and delivery zones (such as North, East, and South), and assigning each courier to a zone incurs a known delivery cost (in thousand yen).

Find a 1-to-1 assignment where every courier is assigned to exactly one zone and every zone is assigned to exactly one courier, **minimizing total cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `costs` | `number[][]` | Square $n \times n$ assignment cost matrix (`costs[i][j]` is the cost in thousand yen for courier $i$ to cover zone $j$) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `assignment` | `number[]` | Array of length $n$ where `assignment[i]` is the zone index assigned to courier $i$ |
| `totalCost` | `number` | Minimized total cost (thousand yen) |

<!-- section:example -->
**Input**

```json
{
  "costs": [
    [9, 2, 7],
    [6, 4, 3],
    [5, 8, 1]
  ]
}
```

**Output**

```json
{
  "assignment": [1, 0, 2],
  "totalCost": 9
}
```

Assigning `[1, 0, 2]` gives each courier one distinct zone (each row and column has count 1) with total cost $2 + 6 + 1 =$ **9**.
