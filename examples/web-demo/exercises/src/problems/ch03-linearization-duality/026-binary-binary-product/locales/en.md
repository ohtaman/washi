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


<!-- section:hint1 -->
Declare one binary decision variable per candidate module and one continuous auxiliary variable in $[0, 1]$ per listed interaction pair. Because the module choices are binary, the McCormick inequalities force the pair variables to take exact integer values `0` or `1` without needing extra binary declarations.

<!-- section:hint2 -->
Enforce the exact McCormick envelope for $w_k = x_i x_j$: two upper bounds ($w_k \le x_i$ and $w_k \le x_j$) prevent $w_k$ from turning on unless both modules are selected, and one lower bound ($w_k \ge x_i + x_j - 1$) forces $w_k$ to `1` whenever both are selected. Both directions are essential here because interaction weights $s$ can be either positive (synergy, where the solver would otherwise try to overstate $w_k$) or negative (conflict, where the solver would otherwise try to understate $w_k$). Round `pairProducts` cleanly when returning integer outputs.