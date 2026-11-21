# #097. 古典的 Benders 分解による容量制約付き施設配置

<!-- section:scenario -->
物流企業がどの倉庫候補地を開設するか（固定費がかかる第 1 段階の 0-1 決定）と、開設された倉庫から各顧客ゾーンへどれだけ出荷するか（第 2 段階の連続輸送線形計画）を同時に最適化します。施設開設ベクトルを固定すると第 2 段階は純粋な連続 LP となるため、段階構造に沿った分解が可能です。

WaSHI の古典的 Benders 分解を用いて 0-1 施設開設決定と連続輸送リコースを分離し、上下界が収束した最適な施設選択・輸送量行列・総コストを返してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `fixedCosts` | `number[]` | 各候補施設 $i$ の開設固定費 |
| `capacities` | `number[]` | 施設 $i$ を開設した際の最大供給能力 |
| `demands` | `number[]` | 各顧客ゾーン $j$ の必要需要量 |
| `shippingCosts` | `number[][]` | 施設 $i$ から顧客 $j$ への単位輸送費 `shippingCosts[i][j]` |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `open` | `number[]` | 施設の開設可否を表す 0/1 ベクトル |
| `shipments` | `number[][]` | 非負輸送量行列 `shipments[i][j]` |
| `totalCost` | `number` | 固定費と輸送費の最小合計コスト |

<!-- section:example -->
**入力例**

```json
{
  "fixedCosts": [100, 120],
  "capacities": [50, 60],
  "demands": [30, 25, 20],
  "shippingCosts": [
    [2, 5, 3],
    [4, 2, 4]
  ]
}
```

**出力例**

```json
{
  "open": [1, 1],
  "shipments": [
    [30, 0, 20],
    [0, 25, 0]
  ],
  "totalCost": 390
}
```

両方の倉庫を開設すると固定費 `100 + 120 = 220`、輸送費 `60 + 60 + 50 = 170` となり、最適総コスト **390** を達成します。

<!-- section:hint1 -->
主問題 MIP には施設の開設を表す二値変数と非負の第 2 段階コスト推定変数 `theta` だけを置き、固定費と `theta` の和を最小化します。候補となる開設ベクトルごとに連続輸送 LP 子問題を評価し、総供給能力が総需要に満たない場合は実行可能性カット、実行可能な場合は `theta` の下界を与える最適性カットを返します。

<!-- section:hint2 -->
`await master.solveBenders({ theta, gapTolerance: 1e-5, subproblem })` を呼び出します。輸送 LP が実行不能なときは Phase-I 緩和 LP から双対価格 $\alpha_j$（需要 $\ge$）と $\beta_i \le 0$（容量 $\le$）を取り出して $\sum_j \alpha_j d_j + \sum_i \beta_i c_i y_i \le 0$ の `{ kind: "feasibility", constraint }` を返し、実行可能なときは $\theta \ge \sum_j \alpha_j d_j + \sum_i \beta_i c_i y_i$ の `{ kind: "optimality", constraint, subproblemObjective }` を返します。最後に最適 `open` で輸送 LP を再求解して `shipments` を復元してください。
