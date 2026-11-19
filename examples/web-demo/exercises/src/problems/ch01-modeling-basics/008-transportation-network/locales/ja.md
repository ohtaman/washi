# #008. 輸送計画問題（2部グラフの需給モデル）

<!-- section:scenario -->
複数の倉庫から複数の店舗へ商品を配送する物流ネットワークを考えます。各倉庫には出荷可能な供給上限があり、各店舗には必要な需要量があり、倉庫と店舗の各ルートには 1 単位あたりの輸送単価が設定されています。

どの倉庫の供給上限も超えずにすべての店舗の需要を満たし、**総輸送コストを最小化する各ルートの配送量**（0 以上の連続値）を求めてください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `supplies` | `number[]` | 各倉庫 $i$ の供給可能上限 |
| `demands` | `number[]` | 各店舗 $j$ の必要需要量 |
| `unitCosts` | `number[][]` | 倉庫 $i$ から店舗 $j$ への 1 単位あたりの輸送単価 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `shipments` | `number[][]` | $S \times D$ の非負配送量行列 |
| `totalCost` | `number` | 最小化された総輸送コスト |

<!-- section:example -->
**入力例**

```json
{
  "supplies": [60, 80],
  "demands": [40, 50, 40],
  "unitCosts": [
    [4, 6, 8],
    [5, 3, 2]
  ]
}
```

**出力例**

```json
{
  "shipments": [
    [40, 10, 0],
    [0, 40, 40]
  ],
  "totalCost": 420
}
```

単価の安い倉庫 1 から店舗 1・2 へ全量 80 を送り、倉庫 0 が店舗 0 と店舗 1 の残り 10 を担当することで（倉庫 0 に在庫 10 を残して）、総輸送費 **420** が最小になります。

<!-- section:hint1 -->
2 次元の連続変数行列 `shipments[i][j] >= 0` は宣言済みです：
- **供給制約**（各倉庫 $i$ の行和）：`sum(shipments[i]) <= supplies[i]`
- **需要制約**（各店舗 $j$ の列和）：`sum(shipments.map((row) => row[j])) >= demands[j]`

<!-- section:hint2 -->
`sum_{i, j} unitCosts[i][j] * shipments[i][j]` を最小化してください。実は供給と需要がすべて整数のとき、輸送問題の制約行列が全ユニモジュラ性を持つため、連続変数 (`continuous`) のままでも端数が出ずに整数解へ落ちます。

<!-- section:formulation -->
$$
\begin{aligned}
\min_{x \ge 0} \quad & \sum_{i=0}^{S-1} \sum_{j=0}^{D-1} c_{i,j} x_{i,j} \\
\text{s.t.} \quad & \sum_{j=0}^{D-1} x_{i,j} \le S_i && \forall i \in \{0, \dots, S-1\} \\
& \sum_{i=0}^{S-1} x_{i,j} \ge D_j && \forall j \in \{0, \dots, D-1\}
\end{aligned}
$$
