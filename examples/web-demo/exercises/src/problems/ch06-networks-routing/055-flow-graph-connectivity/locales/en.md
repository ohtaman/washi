# #055. Rooted Connected Subgraph via Single-Commodity Flow

<!-- section:scenario -->
An infrastructure planner is expanding a regional network starting from root hub 0, which must always remain active. Each site has an activation prize (positive or negative), and each undirected candidate link between two sites incurs a construction cost and can only be built if both endpoints are active.

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
| `selectedNodes` | `number[]` | Binary (`0` or `1`) node selection (`selectedNodes[0] = 1`) |
| `selectedEdges` | `number[]` | Binary (`0` or `1`) link selection matching `edges` |
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

Activating nodes `{0, 2, 3, 4}` linked along `0-2-3-4` forms one connected tree from root `0`, earning $0 + 2 + 12 + 10 = 24$ in prizes minus $7 + 3 + 2 = 12$ in link costs for a net value of **12**.
