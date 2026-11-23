# #039. Cage-Sum Latin Grid Puzzle

<!-- section:scenario -->
A puzzle designer is creating a Latin square on an $N \times N$ grid filled with integers from 1 to $N$, where each digit from 1 to $N$ appears exactly once in every row and every column.

Pre-specified cells must be fixed to their given digits, and within each region called a cage, all cell values must be pairwise distinct and sum to the specified target sum. Solve this pure feasibility puzzle with no objective function.

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `size` | `number` | Grid dimension `N` (`1..N` digits per row and column) |
| `givens` | `number[][]` | Pre-filled cell clues `[row, col, value]` (`0`-based row/col) |
| `cages` | `CageClue[]` | Cage clues `{ cells, targetSum }` with distinct cell values summing to `targetSum` |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `grid` | `number[][]` | Solved `N × N` Latin grid with cage constraints satisfied |

<!-- section:example -->
**Input**

```json
{
  "size": 4,
  "givens": [[0, 0, 1], [1, 1, 4], [2, 3, 3]],
  "cages": [
    { "cells": [[0, 1], [0, 2]], "targetSum": 5 },
    { "cells": [[0, 3], [1, 3]], "targetSum": 6 },
    { "cells": [[1, 0], [2, 0], [2, 1]], "targetSum": 6 },
    { "cells": [[1, 2], [2, 2]], "targetSum": 5 },
    { "cells": [[3, 0], [3, 1]], "targetSum": 7 },
    { "cells": [[3, 2], [3, 3]], "targetSum": 3 }
  ]
}
```

**Output**

```json
{
  "grid": [
    [1, 2, 3, 4],
    [3, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 2, 1]
  ]
}
```

Every row and column is a permutation of {1, 2, 3, 4}, and all fixed clues as well as every cage's sum and distinctness rules (e.g., $2 + 3 = 5$, $3 + 2 + 1 = 6$) are satisfied.

<!-- section:hint1 -->
Introduce an $N \times N$ matrix of integer decision variables with domain `[1, n]`. Enforce all-different constraints on every row, every column, and every cage, alongside equality constraints for fixed givens and cage sums. No objective is needed for this pure feasibility puzzle.

<!-- section:hint2 -->
Apply `distinct(row)` to each row and `distinct(grid.map((row) => row[c]))` to each column `c`. For each `cage` in `input.cages`, gather `vars = cage.cells.map(([r, c]) => grid[r][c])` and constrain both `expr\`${sum(vars)} == ${cage.targetSum}\`` and `distinct(vars)`, then solve with `solver: "pumpkin"`.
