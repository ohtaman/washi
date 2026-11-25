# #060. Connected Territory Design & Hub Routing

<!-- section:scenario -->
Partition $n$ zones into `numTerritories` disjoint sales territories satisfying the following rules:

- Choose exactly one hub zone in each territory.
- Each territory must form a single connected component along `adjEdges` (no isolated exclaves).
- The total zone demand of each territory must fall within `demandBounds`.
- Each territory operates one closed tour starting and ending at its hub that visits all of its zones directly via `dist` (tour legs are not restricted to `adjEdges`).

Find a feasible territory partition, hub selection, and set of tours to **minimize total hub setup cost plus tour distance**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `numTerritories` | `number` | Number of contiguous territories $K$ to form |
| `demands` | `number[]` | Demand in each zone `0 .. n - 1` |
| `demandBounds` | `number[]` | Allowed `[minDemand, maxDemand]` range per territory (`minDemand > max(demands)`) |
| `hubCosts` | `number[]` | Fixed setup cost for choosing zone `i` as a territory hub |
| `adjEdges` | `number[][]` | Undirected `[u, v]` geographic adjacency pairs for territory contiguity |
| `dist` | `number[][]` | $n \times n$ travel distance matrix between zones for routing tours |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `territories` | `Array<{ hub: number; tour: number[] }>` | $K$ territories with chosen `hub` and closed cycle `[hub, ..., hub]` |
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

Territory `{0, 1, 2}` (demand `10 in [6, 11]`, connected via `0-1-2`) has hub 0 (cost 5) and tour `[0, 2, 1, 0]` (distance 12), while `{3, 4}` (demand `7 in [6, 11]`, connected via `3-4`) has hub 4 (cost 6) and tour `[4, 3, 4]` (distance 6), totaling $(5 + 6) + (12 + 6) =$ **29**.

<!-- section:hint1 -->
Model binary zone-to-territory assignment variables and binary hub-selection indicators (a zone can only host a hub for the territory it belongs to), enforcing that each zone belongs to one territory, each territory has one hub, and territory demand lies within `demandBounds`. Add two coupled network layers: single-commodity flow over `adjEdges` per territory for geographic contiguity, and directed tour arcs with visit-order potentials for intra-territory TSP tours.

<!-- section:hint2 -->
For contiguity in territory `k`, let the chosen hub inject a continuous supply $s_{ik} \le n h_{ik}$ and send one unit of flow to every zone $i$ in $y_{ik}$ along `adjEdges` (with flow on `(u, v)` gated by both $y_{uk}$ and $y_{vk}$). For routing, prevent cross-territory tour arcs ($y_{ik} - y_{jk} \le 1 - x_{ij}$) and anchor MTZ subtour elimination at each territory's hub ($u_i + 1 - u_j \le n (1 - x_{ij} + \sum_k h_{jk})$) so the potential resets only when returning to a hub.
