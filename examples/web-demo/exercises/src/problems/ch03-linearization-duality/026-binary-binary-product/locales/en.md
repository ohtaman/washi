# #026. Quadratic Binary Synergy & Conflict Selection

<!-- section:scenario -->
A product engineering team selects a subset of candidate modules to build within a fixed budget. Each module has a standalone value and a development cost, while certain pairs of modules interact when both are built together: synergistic pairs add a bonus value, whereas overlapping or conflicting pairs impose a penalty.

Choose which modules to build and compute the exact pairwise activation indicators so total cost stays within budget and **total value (standalone plus pairwise interactions) is maximized**.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `values` | `number[]` | Standalone value $r_i$ of module $i$ |
| `costs` | `number[]` | Cost $c_i$ of module $i$ |
| `budget` | `number` | Available budget limit $B$ |
| `pairs` | `number[][]` | Interaction list `[i, j, s]` where `s` can be positive (synergy) or negative (conflict) |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `selected` | `number[]` | Binary (`0` or `1`) module selection choices $x_i$ |
| `pairProducts` | `number[]` | Binary pair indicators $w_k = x_i x_j$ for each entry in `pairs` |
| `totalValue` | `number` | Maximized standalone plus interaction value |

<!-- section:example -->
**Input**

```json
{
  "values": [40, 35, 30, 25],
  "costs": [30, 25, 20, 15],
  "budget": 60,
  "pairs": [
    [0, 1, 25],
    [1, 2, -20],
    [0, 3, 10],
    [2, 3, 15]
  ]
}
```

**Output**

```json
{
  "selected": [1, 1, 0, 0],
  "pairProducts": [1, 0, 0, 0],
  "totalValue": 100
}
```

Selecting modules 0 and 1 (`[1, 1, 0, 0]`) spends $30 + 25 = 55 \le 60$, activates only pair `(0, 1)` (`pairProducts = [1, 0, 0, 0]`), and yields $40 + 35 + 25 =$ **100**.
