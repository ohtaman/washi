# #037. 2次元矩形ストリップパッキング（選言制約）

<!-- section:scenario -->
板金加工の現場で、横幅 stripWidth が固定された帯状の鋼板に n 枚の矩形パーツ（回転不可）を隙間なく配置します。各パーツ i は整数幅 widths[i] と整数高さ heights[i] をもちます。

すべての矩形が帯幅 [0, stripWidth] の内側に収まり、かつ互いに面積が重ならないように各矩形の左下整数座標 (x[i], y[i]) を定め、必要な総高さ height を最小化してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `stripWidth` | `number` | 帯領域の固定横幅 |
| `widths` | `number[]` | 各矩形の横幅（`<= stripWidth`） |
| `heights` | `number[]` | 各矩形の高さ（整数） |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `x` | `number[]` | 各矩形の左下 x 座標（`0 <= x[i] <= stripWidth - widths[i]`） |
| `y` | `number[]` | 各矩形の左下 y 座標（`y[i] >= 0`） |
| `height` | `number` | 最小化された帯高さ `max(y[i] + heights[i])` |

<!-- section:example -->
**入力例**

```json
{
  "stripWidth": 6,
  "widths": [4, 2, 3],
  "heights": [3, 4, 2]
}
```

**出力例**

```json
{
  "x": [2, 0, 3],
  "y": [2, 0, 0],
  "height": 5
}
```

矩形 1（`2×4`）を `(0, 0)` に、矩形 2（`3×2`）を `(3, 0)` に配置し、その右上の空間 `(2, 2)` に矩形 0（`4×3`）を置くと、重なりなしで総高さ **5** に収まります。

<!-- section:hint1 -->
各矩形に対して 2 つの整数座標変数 $x_i \in [0, \text{stripWidth} - \text{widths}[i]]$ と $y_i \in [0, \text{maxHeight} - \text{heights}[i]]$ を導入します。相異なる 2 つの矩形は、左・右・下・上の 4 方向のいずれか少なくとも 1 つで分離されている必要があります。

<!-- section:hint2 -->
各ペア $i < j$ について、`or(...)` の中に 4 方向の分離不等式（`x[i] + widths[i] <= x[j]`、`x[j] + widths[j] <= x[i]`、`y[i] + heights[i] <= y[j]`、`y[j] + heights[j] <= y[i]`）を並べて非重複を強制します。目的関数 `minimize(max(y.map((yi, i) => expr\`${yi} + ${input.heights[i]}\`)))` を `solver: "pumpkin"` で解いてください。
