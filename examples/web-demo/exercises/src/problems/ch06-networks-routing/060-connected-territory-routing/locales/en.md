# #060. Connected Territory Design & Hub Routing

<!-- section:scenario -->
A regional service planner must partition n zones into K contiguous sales territories, each anchored by one chosen hub zone. Every territory must form a single connected subgraph along the border adjacency graph (zero isolated exclaves), carry total zone demand within the specified balance bounds, and operate one closed routing tour visiting all zones in that territory.

Combine single-commodity flow connectivity, balanced demand constraints, hub selection, and intra-territory TSP routing into a unified MIP to **minimize total hub setup plus tour routing cost**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `numTerritories` | `number` | Number of contiguous territories $K$ to form |
| `demands` | `number[]` | Demand in each zone `0 .. n - 1` |
| `demandBounds` | `number[]` | Allowed `[minDemand, maxDemand]` range per territory (`minDemand > max(demands)`) |
| `hubCosts` | `number[]` | Fixed setup cost for choosing zone `i` as a territory hub |
| `adjEdges` | `number[][]` | Undirected `[u, v]` geographic adjacency pairs for territory contiguity |
| `dist` | `number[][]` | $n \times n$ travel cost matrix between zones for routing tours |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `territories` | `Array<{ hub, tour }>` | $K$ territories with chosen `hub` and closed cycle `[hub, ..., hub]` |
| `totalCost` | `number` | Minimized sum of hub setup costs and intra-territory tour distances |

<!-- section:example -->
**Input**

```json
{
  "numTerritories": 2,
  "demands": [3, 4, 3, 4, 3],
  "demandBounds": [6, 11],
  "hubCosts": [5, 12, 14, 10, 6],
  "adjEdges": [[0, 1], [1, 2], [2, 3], [3, 4], [1, 3]],
  "dist": [
    [0, 3, 6, 5, 8],
    [3, 0, 3, 3, 5],
    [6, 3, 0, 5, 5],
    [5, 3, 5, 0, 3],
    [8, 5, 5, 3, 0]
  ]
}
```

**Output**

```json
{
  "territories": [
    { "hub": 0, "tour": [0, 2, 1, 0] },
    { "hub": 4, "tour": [4, 3, 4] }
  ],
  "totalCost": 29
}
```

Territory `{0, 1, 2}` (demand `10 in [6, 11]`, connected via `0-1-2`) has hub `0` (cost 5) and tour `[0, 2, 1, 0]` (distance 12), while `{3, 4}` (demand `7 in [6, 11]`, connected via `3-4`) has hub `4` (cost 6) and tour `[4, 3, 4]` (distance 6), totaling $(5 + 6) + (12 + 6) =$ **29**.
