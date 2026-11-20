# #039. Cage-Sum Latin Grid Puzzle

<!-- section:scenario -->
Fill an N by N integer grid with digits from 1 to N so that every row and every column contains each digit from 1 to N exactly once.

Fixed clues in givens pin specific cells to given digits, and every region in cages specifies a list of cells whose values must be pairwise distinct and sum to targetSum. Solve this pure feasibility puzzle with no objective function.

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

Every row and column permutes `{1, 2, 3, 4}`, all givens match (`(0,0)=1, (1,1)=4, (2,3)=3`), and every cage sums cleanly with distinct entries (for example `2 + 3 = 5` and `3 + 2 + 1 = 6`).
