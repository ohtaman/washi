# #055. Rooted Connected Subgraph via Single-Commodity Flow

<!-- section:scenario -->
A city is expanding a disaster-prevention fiber-optic network starting from City Hall (vertex 0), which must always remain active, to connect local community centers and evacuation shelters. Each candidate facility (vertex) has a disaster-mitigation benefit prize (which may be negative), and each undirected candidate cable (edge) has a laying cost and can only be laid if both endpoint facilities are active.

Choose a subset of sites and links forming a single connected component containing root hub 0—with zero disconnected islands—to **maximize net value** (total prizes of selected sites minus total construction cost of selected links).

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `prizes` | `number[]` | Prize earned when activating each node `0 .. n - 1` |
| `edges` | `Array<{ u, v, cost }>` | Undirected candidate links with build `cost` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `selectedNodes` | `number[]` | Binary (0 or 1) node selection (`selectedNodes[0] = 1`) |
| `selectedEdges` | `number[]` | Binary (0 or 1) link selection matching `edges` |
| `netValue` | `number` | Maximized total node prizes minus link costs |

<!-- section:example -->
**Input**

```json
{
  "prizes": [0, 3, 2, 12, 10],
  "edges": [
    { "u": 0, "v": 1, "cost": 6 },
    { "u": 0, "v": 2, "cost": 7 },
    { "u": 2, "v": 3, "cost": 3 },
    { "u": 3, "v": 4, "cost": 2 },
    { "u": 1, "v": 3, "cost": 9 }
  ]
}
```

**Output**

```json
{
  "selectedNodes": [1, 0, 1, 1, 1],
  "selectedEdges": [0, 1, 1, 1, 0],
  "netValue": 12
}
```

Activating nodes `{0, 2, 3, 4}` linked along `0-2-3-4` forms one connected tree from root 0, earning $0 + 2 + 12 + 10 = 24$ in prizes minus $7 + 3 + 2 = 12$ in link costs for a net value of **12**.

<!-- section:hint1 -->
Model binary node-activation and undirected edge-selection variables, with the root node fixed as active. To guarantee connectivity back to the root, orient each undirected edge into two directed flow variables carrying a single commodity from root 0 to every other activated node.

<!-- section:hint2 -->
An edge can only be built if both endpoints are active ($w_e \le y_u, y_v$), and flow in either direction on edge $e$ can only be positive when $w_e = 1$ (bounded by $n - 1$). Root 0 emits one unit of commodity for each active non-root node ($\text{outflow}(0) - \text{inflow}(0) = \sum_{v \ge 1} y_v$), while every non-root node consumes $y_v$ units ($\text{inflow}(v) - \text{outflow}(v) = y_v$), making any disconnected high-prize island infeasible.
