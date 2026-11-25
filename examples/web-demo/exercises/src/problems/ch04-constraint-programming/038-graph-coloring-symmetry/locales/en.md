# #038. Graph Coloring with Symmetry Breaking

<!-- section:scenario -->
A radio spectrum planner is assigning frequency channels from a fixed pool of available channels (0-based integer indices) to wireless base stations (vertices) on an undirected interference graph. Any two base stations that interfere with each other (connected by an edge) must be assigned different channel numbers.

Among all valid interference-free channel assignments (colorings), minimize the total number of distinct channels (colors) used.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `numNodes` | `number` | Number of base stations (vertices, `0` to `numNodes - 1`) |
| `maxColors` | `number` | Number of available channel (color) indices (`0` to `maxColors - 1`) |
| `edges` | `number[][]` | List of interfering pairs (undirected edges `[u, v]`) requiring `colors[u] != colors[v]` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `colors` | `number[]` | Assigned color index in `[0, maxColors - 1]` for each vertex |
| `usedColors` | `number` | Minimized number of distinct colors used |

<!-- section:example -->
**Input**

```json
{
  "numNodes": 5,
  "maxColors": 5,
  "edges": [
    [0, 1],
    [1, 2],
    [2, 0],
    [2, 3],
    [3, 4]
  ]
}
```

**Output**

```json
{
  "colors": [0, 1, 2, 0, 2],
  "usedColors": 3
}
```

Every edge—(0, 1), (1, 2), (2, 0), (2, 3), and (3, 4)—has different channel numbers at its endpoints, using **3** distinct channels {0, 1, 2}.

<!-- section:hint1 -->
Introduce one integer color variable per vertex and an integer variable tracking the maximum color index used. Because color labels are interchangeable, enforce canonical first-appearance numbering across vertices so each new color is introduced in order without gaps, then minimize the number of used colors.

<!-- section:hint2 -->
Constrain each edge with `colors[u] != colors[v]`. Break color-permutation symmetry via `colors[0] == 0` and `colors[i] <= 1 + max(colors.slice(0, i))` for `i >= 1`, bound `colors[i] <= maxColor` for all `i`, and minimize `maxColor + 1` using `solver: "pumpkin"`.
