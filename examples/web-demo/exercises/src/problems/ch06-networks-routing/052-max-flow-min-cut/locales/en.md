# #052. Maximum Flow & Minimum s-t Cut

<!-- section:scenario -->
A directed communication network connects a designated source node to a designated sink node through capacitated links. Every intermediate node must conserve flow with zero net gain or loss, and flow on each link cannot exceed its capacity.

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

Net flow leaving node 0 is $8 + 5 =$ **13**, node 1 balances $8 = 4 + 4$, node 2 balances $5 + 4 = 9$, and removing `cutEdges = [1, 2, 3]` blocks every path from `0` to `3` with total cut capacity $5 + 4 + 4 =$ **13**.
