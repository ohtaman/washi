# #039. ケージ和付きラテン方陣パズル

<!-- section:scenario -->
パズル設計者は、盤面サイズ $N \times N$ のマス目に 1 から $N$ までの整数を埋め、すべての行とすべての列で 1 から $N$ の数字がちょうど 1 回ずつ現れるラテン方陣を作成しようとしています。

あらかじめ指定されたマスには所定の数字を固定し、さらにケージと呼ばれる各領域では含まれるマスの値がすべて互いに異なり、かつその合計が指定された目標和に一致する必要があります。目的関数なしの純粋な充足可能性パズルとして解を求めてください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `size` | `number` | 盤面のサイズ $N$（各マスは 1 から $N$ の整数） |
| `givens` | `number[][]` | 初期固定ヒント `[row, col, value]`（`row`, `col` は 0 始まり） |
| `cages` | `CageClue[]` | ケージのマス集合と目標和を表すヒント `{ cells, targetSum }` のリスト |

各 `CageClue` は `{ cells: [number, number][], targetSum: number }` の形式で、`cells` はケージ内の 0 始まり `[row, col]` 座標の配列です。

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `grid` | `number[][]` | 全制約を満たす $N \times N$ の整数盤面 |

<!-- section:example -->
**入力例**

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

**出力例**

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

各行・各列が {1, 2, 3, 4} の順列になり、固定ヒントと全ケージの和・相異条件（例：$2 + 3 = 5$、$3 + 2 + 1 = 6$）を満たしています。

<!-- section:hint1 -->
1 から $N$ の値をとる $N \times N$ の整数変数行列を定義します。各行・各列・各ケージに AllDifferent 制約を課し、固定ヒントとケージ合計値の等式制約を加えます。純粋な充足問題なので目的関数は不要です。

<!-- section:hint2 -->
各行に `distinct(row)`、各列 `c` に `distinct(grid.map((row) => row[c]))` を適用します。`input.cages` の各 `cage` に対して `vars = cage.cells.map(([r, c]) => grid[r][c])` を取り、`` expr`${sum(vars)} == ${cage.targetSum}` `` と `distinct(vars)` の両方を追加して `solver: "pumpkin"` で解いてください。
