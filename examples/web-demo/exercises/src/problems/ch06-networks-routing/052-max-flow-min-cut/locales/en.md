# #052. Maximum Flow & Minimum s-t Cut

<!-- section:scenario -->
Consider a fiber-optic network between data centers where we want to send the maximum possible data flow (Gbps) from a source server (`source`) to a backup site (`sink`). The flow on each communication link (directed arc) cannot exceed its bandwidth capacity, and every relay router (intermediate node) must conserve flow with equal inflow and outflow.

Compute the maximum flow that can be sent from source to sink using a linear program, and extract an accompanying minimum s-t cut edge subset whose capacities sum to that maximum flow and sever every directed source-to-sink path.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `nodeCount` | `number` | Number of nodes `0 .. nodeCount - 1` |
| `source` | `number` | Source node index |
| `sink` | `number` | Sink node index |
| `edges` | `Array<{ from, to, cap }>` | Directed capacitated arcs |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `flows` | `number[]` | Non-negative flow on each arc (`0 <= flow <= cap`) |
| `cutEdges` | `number[]` | Distinct arc indices forming a minimum s-t cut |
| `maxFlow` | `number` | Maximum s-to-t flow (equals total capacity of `cutEdges`) |

<!-- section:example -->
**Input**

```json
{
  "nodeCount": 4,
  "source": 0,
  "sink": 3,
  "edges": [
    { "from": 0, "to": 1, "cap": 10 },
    { "from": 0, "to": 2, "cap": 5 },
    { "from": 1, "to": 2, "cap": 4 },
    { "from": 1, "to": 3, "cap": 4 },
    { "from": 2, "to": 3, "cap": 10 }
  ]
}
```

**Output**

```json
{
  "flows": [8, 5, 4, 4, 9],
  "cutEdges": [1, 2, 3],
  "maxFlow": 13
}
```

Net flow leaving node 0 is $8 + 5 =$ **13**, node 1 balances $8 = 4 + 4$, node 2 balances $5 + 4 = 9$, and removing `cutEdges = [1, 2, 3]` blocks every path from 0 to 3 with total cut capacity $5 + 4 + 4 =$ **13**.

<!-- section:hint1 -->
Model one non-negative continuous flow variable per directed arc bounded by its capacity. Enforce zero net flow conservation at every intermediate node (excluding `source` and `sink`), and maximize the net flow leaving `source`.

<!-- section:hint2 -->
Do not collect saturated edges blindly—a saturated arc inside a cycle or behind another bottleneck is not necessarily part of a minimum cut. Instead, run a BFS/DFS from `source` in the residual graph of the optimal flow (traversing `from -> to` when `flow < cap - 1e-6` and backward `to -> from` when `flow > 1e-6`) to find the reachable set $S$, then take all original arcs crossing from $S$ to $V \setminus S$.
