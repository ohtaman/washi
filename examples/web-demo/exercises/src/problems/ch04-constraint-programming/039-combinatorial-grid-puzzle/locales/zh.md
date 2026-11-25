# #039. 带区域和约束的拉丁方谜题

<!-- section:scenario -->
谜题设计者正计划制作一个 $N \times N$ 的拉丁方阵，在格子中填入 1 到 $N$ 的整数，使每一行和每一列中 1 到 $N$ 的数字恰好各出现一次。

预先指定的格子必须固定为给定数字，此外在称为“区域（cage）”的每个分区内，所含格子的数值必须互不相同，且总和等于指定的目标和。请作为无目标函数的纯可行性谜题求解。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `size` | `number` | 网格阶数 $N$（单元格填入 1 到 $N$ 的整数） |
| `givens` | `number[][]` | 已知提示格 `[row, col, value]`（行列索引从 0 开始） |
| `cages` | `CageClue[]` | 区域线索 `{ cells, targetSum }` 的列表，指定各区域的格子集合与目标和 |

每个 `CageClue` 对象为 `{ cells: [number, number][], targetSum: number }`，其中 `cells` 为区域内从 0 开始的 `[row, col]` 坐标列表。

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `grid` | `number[][]` | 满足所有拉丁方与区域线索的 $N \times N$ 二维数组 |

<!-- section:example -->
**输入示例**

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

**输出示例**

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

每行每列均为 {1, 2, 3, 4} 的排列，并满足全部固定提示与区域和、互异条件（例如 $2 + 3 = 5$、$3 + 2 + 1 = 6$）。

<!-- section:hint1 -->
定义一个取值为 1 到 $N$ 的 $N \times N$ 整数决策变量矩阵。对每一行、每一列以及每个区域（cage）施加全异约束，并添加已知提示格和区域求和等式约束。本题为纯可行性谜题，无需设置目标函数。

<!-- section:hint2 -->
对每行施加 `distinct(row)`，对每列 `c` 施加 `distinct(grid.map((row) => row[c]))`。对 `input.cages` 中的每个 `cage`，提取 `vars = cage.cells.map(([r, c]) => grid[r][c])`，同时约束 `` expr`${sum(vars)} == ${cage.targetSum}` `` 和 `distinct(vars)`，然后使用 `solver: "pumpkin"` 求解。
