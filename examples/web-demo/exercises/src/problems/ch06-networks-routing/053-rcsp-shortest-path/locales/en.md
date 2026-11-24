# #053. Resource-Constrained Shortest Path (RCSP)

<!-- section:scenario -->
A packet must travel from a source node to a sink node across a directed network. Each directed arc has both a positive traversal cost and a resource consumption (such as delay or energy), and the selected simple path cannot exceed an overall resource budget.

Select a simple directed path from source to sink whose total resource consumption does not exceed the budget, **minimizing total path cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `nodeCount` | `number` | Number of nodes `0 .. nodeCount - 1` |
| `source` | `number` | Origin node index |
| `sink` | `number` | Destination node index |
| `maxResource` | `number` | Maximum total resource consumption allowed |
| `edges` | `Array<{ from, to, cost, resource }>` | Directed arcs with traversal `cost` and `resource` usage |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `selected` | `number[]` | Binary (0 or 1) vector indicating chosen arcs in `edges` |
| `totalCost` | `number` | Minimized total traversal cost along the chosen path |

<!-- section:example -->
**Input**

```json
{
  "nodeCount": 5,
  "source": 0,
  "sink": 4,
  "maxResource": 10,
  "edges": [
    { "from": 0, "to": 1, "cost": 2, "resource": 6 },
    { "from": 0, "to": 2, "cost": 4, "resource": 3 },
    { "from": 1, "to": 3, "cost": 2, "resource": 5 },
    { "from": 1, "to": 4, "cost": 5, "resource": 6 },
    { "from": 2, "to": 1, "cost": 1, "resource": 2 },
    { "from": 2, "to": 3, "cost": 3, "resource": 4 },
    { "from": 3, "to": 4, "cost": 2, "resource": 3 }
  ]
}
```

**Output**

```json
{
  "selected": [0, 1, 0, 0, 0, 1, 1],
  "totalCost": 9
}
```

Following arcs `0 -> 2 -> 3 -> 4` consumes $3 + 4 + 3 = 10 \le 10$ resource units and incurs a total cost of $4 + 3 + 2 =$ **9**.

<!-- section:hint1 -->
Model one binary decision variable per directed arc indicating whether it is included in the path. Organize the flow-conservation constraints per node to send one unit of flow from `source` to `sink`, add a global resource budget constraint, and minimize total traversal cost.

<!-- section:hint2 -->
Unlike unconstrained shortest paths, adding the resource knapsack constraint breaks total unimodularity, so binary variables (not continuous LP) are required to avoid fractional path splitting. Also, because all arc costs are positive, any disconnected cycle that could satisfy unit flow conservation would strictly increase the objective—making simple s-to-t paths automatically optimal without extra cycle-elimination constraints.
