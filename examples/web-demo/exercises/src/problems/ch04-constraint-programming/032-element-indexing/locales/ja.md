# #032. Element 制約（at）による機械・作業割当

<!-- section:scenario -->
工場で n 個の作業を m 台の候補機械（n <= m）へ割り当てます。各作業にはそれぞれ異なる 1 台の機械を割り当て、同じ機械を複数の作業で共有することはできません。

行列の要素 costs[i][j] は作業 i を機械 j に割り当てたときの整数段取りコストを表します。すべての作業が相異なる機械を受け持つように assignment[i] を決め、総コストを最小化してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `costs` | `number[][]` | `n × m` の整数コスト行列（`costs[i][j]` は作業 `i` を機械 `j` に割り当てるコスト、`n <= m`） |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `assignment` | `number[]` | 各作業に割り当てた機械番号（`0` 〜 `m - 1`） |
| `totalCost` | `number` | 最小化された総割当コスト |

<!-- section:example -->
**入力例**

```json
{
  "costs": [
    [10, 22, 30],
    [12, 25, 18],
    [16, 14, 24]
  ]
}
```

**出力例**

```json
{
  "assignment": [0, 2, 1],
  "totalCost": 42
}
```

割当 `[0, 2, 1]` は 3 つの異なる機械を選び、総コストは `costs[0][0] + costs[1][2] + costs[2][1]` $= 10 + 18 + 14 =$ **42** となります。

<!-- section:hint1 -->
$n \times m$ のバイナリ行列を作る代わりに、各作業に対して `[0, numMachines - 1]` の機械番号を表す整数変数を 1 つずつ定義します。すべての作業が相異なる機械を使うように制約します。

<!-- section:hint2 -->
機械の重複を防ぐために `distinct(assignment)` を追加します。各作業のコストは Element 制約 `at(row, assignment[i])` で参照できるため、`sum(input.costs.map((row, i) => at(row, assignment[i])))` を `minimize` し、`solver: "pumpkin"` で解いてください。
