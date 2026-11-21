# #096. Dantzig-Wolfe 分解によるブロック角度構造 LP

<!-- section:scenario -->
複数の製造部門を抱える企業において、各部門は固有のローカル設備容量と製品別生産上限のもとで操業しつつ、全社で単一の共有ボトルネック資源を奪い合っています。このように共有結合制約と部門ごとの独立ブロックからなる構造は典型的なブロック角度線形計画問題です。

WaSHI の列生成機能を用いた Dantzig-Wolfe 分解によりこのブロック角度線形計画問題を解き、共有資源を調整しながら最適な連続生産量配分と全社総利益を返してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `profits` | `number[][]` | 部門 $k$ の製品 $j$ の単位利益 `profits[k][j]` |
| `localUsages` | `number[][]` | 部門 $k$ の製品 $j$ 1 単位あたりのローカル資源消費量 |
| `localCaps` | `number[]` | 部門 $k$ のローカル資源容量上限 |
| `sharedUsages` | `number[][]` | 部門 $k$ の製品 $j$ 1 単位あたりの全社共有資源消費量 |
| `sharedCap` | `number` | 全社共有ボトルネック資源の上限 |
| `productCaps` | `number[][]` | 部門 $k$ の製品 $j$ の生産量上限 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `allocations` | `number[][]` | 各部門・各製品の連続生産量 `allocations[k][j]` |
| `totalProfit` | `number` | 全社総利益 $\sum_k \sum_j \text{profits}[k][j] \cdot \text{allocations}[k][j]$ |

<!-- section:example -->
**入力例**

```json
{
  "profits": [
    [12, 18, 10],
    [15, 11, 20]
  ],
  "localUsages": [
    [2, 3, 1],
    [3, 2, 4]
  ],
  "localCaps": [24, 30],
  "sharedUsages": [
    [1, 2, 1],
    [2, 1, 2]
  ],
  "sharedCap": 20,
  "productCaps": [
    [8, 6, 10],
    [6, 9, 5]
  ]
}
```

**出力例**

```json
{
  "allocations": [
    [8, 0, 3],
    [0, 9, 0]
  ],
  "totalProfit": 225
}
```

部門 0 のローカル使用量は `19 <= 24`、部門 1 は `18 <= 30`、共有資源使用量は `11 + 9 = 20 <= 20` となり、最大利益 **225** が得られます。

<!-- section:hint1 -->
主問題 LP には全社共有資源制約と部門ごとの凸結合制約だけを置き、各部門に生産量ゼロの初期端点列を与えておきます。各部門のローカル容量制約と製品上限は独立した LP 価格付け子問題となり、有望な端点を提案します。

<!-- section:hint2 -->
各部門の凸結合重みの和が $1$ になるよう名前付き制約（`shared_cap` と `conv_${k}`）を持つ主問題で `solveColumnGeneration({ master, finalizeAsMIP: false, pricing })` を実行します。`pricing({ getDual })` では共有資源の双対価格を各製品の単位利益から差し引いて部門 $k$ のローカル LP を解き、最適値がその部門の凸結合双対変数より（$10^{-6}$ を超えて）大きければ列を提案し、最後に生成端点の凸結合として `allocations[k][j]` を復元してください。
