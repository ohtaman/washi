# #051. Minimum-Cost Flow & Total Unimodularity

<!-- section:scenario -->
A directed logistics network transports goods along capacitated arcs from supply nodes to demand nodes through intermediate transshipment hubs. Each node has an integer net supply (positive at sources, negative at sinks, and zero at transshipment hubs), and each directed arc carries a capacity limit and a per-unit shipping cost.

Model this problem as a pure continuous linear program to find non-negative arc flows that satisfy every node balance and capacity limit while **minimizing total shipping cost**. Because the network incidence matrix is totally unimodular with integer supplies and capacities, solving the continuous LP automatically yields integer flows.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `supplies` | `number[]` | Integer net supply at each node (`> 0` supply, `< 0` demand, `0` transshipment) |
| `edges` | `Array<{ from, to, cap, cost }>` | Directed arcs with capacity `cap` and unit cost `cost` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `flows` | `number[]` | Flow along each arc in `edges` (`0 <= flow <= cap`) |
| `totalCost` | `number` | Minimized total shipping cost |

<!-- section:example -->
**Input**

```json
{
  "supplies": [10, 0, 0, -10],
  "edges": [
    { "from": 0, "to": 1, "cap": 6, "cost": 2 },
    { "from": 0, "to": 2, "cap": 8, "cost": 4 },
    { "from": 1, "to": 2, "cap": 5, "cost": 1 },
    { "from": 1, "to": 3, "cap": 4, "cost": 3 },
    { "from": 2, "to": 3, "cap": 7, "cost": 2 }
  ]
}
```

**Output**

```json
{
  "flows": [6, 4, 2, 4, 6],
  "totalCost": 54
}
```

At node 0 outflow is $6 + 4 = 10$, nodes 1 and 2 have net balance $0$, node 3 receives $4 + 6 = 10$, and total cost is $6\times 2 + 4\times 4 + 2\times 1 + 4\times 3 + 6\times 2 =$ **54**.

<!-- section:hint1 -->
Model one non-negative continuous flow variable per directed arc, bounded above by its capacity. Organize the network constraints per node by balancing total outgoing flow minus total incoming flow against that node's net supply, and minimize the total shipping cost across all arcs.

<!-- section:hint2 -->
Because the directed node-arc incidence matrix is totally unimodular and all supplies and capacities are integers, every extreme-point optimal solution of the pure continuous LP is guaranteed to be integral—no integer or binary variables are needed. Return the continuous `v.value!` (or `float(pulp.value(v))` in Python) directly without rounding, normalizing `-0` to `0` if needed.
