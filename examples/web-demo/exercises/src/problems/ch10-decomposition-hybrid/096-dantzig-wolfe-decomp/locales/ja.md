# #096. Dantzig-Wolfe 分解によるブロック角形構造 LP

<!-- section:scenario -->
精密部品メーカーの複数の加工工場において、各工場は固有のローカル電力容量（単位：kWh）と製品（ベアリング・ギア・シャフトなど）の生産上限（単位：個）のもとで操業しつつ、全社で共通の希少原材料（特殊鋼材、単位：kg）を共有しています。このように共有結合制約と工場ごとの独立ブロックからなる構造は典型的なブロック角形線形計画問題です。

WaSHI の列生成機能を用いた Dantzig-Wolfe 分解によりこのブロック角形線形計画問題を解き、共有原材料を調整しながら最適な生産量配分（非負の実数値、個）と全社総利益を返してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `profits` | `number[][]` | 工場 $k$ の製品 $j$ の単位利益 `profits[k][j]` |
| `localUsages` | `number[][]` | 工場 $k$ の製品 $j$ 1 個あたりのローカル電力消費量（kWh） |
| `localCaps` | `number[]` | 工場 $k$ のローカル電力容量上限（kWh） |
| `sharedUsages` | `number[][]` | 工場 $k$ の製品 $j$ 1 個あたりの全社共有鋼材消費量（kg） |
| `sharedCap` | `number` | 全社共有の特殊鋼材の上限（kg） |
| `productCaps` | `number[][]` | 工場 $k$ の製品 $j$ の生産量上限（個） |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `allocations` | `number[][]` | 各工場・各製品の生産量（非負の実数値、`allocations[k][j]`、個） |
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

工場 0 のローカル電力使用量は $2(8) + 3(0) + 1(3) = 19 \le 24$、工場 1 は $3(0) + 2(9) + 4(0) = 18 \le 30$、共有鋼材使用量は $(8 + 3) + 9 = 20 \le 20$ を満たし、総利益は $(12 \times 8 + 10 \times 3) + 11 \times 9 = 126 + 99 =$ **225** となります。

<!-- section:hint1 -->
主問題 LP には全社共有鋼材制約と工場ごとの凸結合制約だけを置き、各工場に生産量ゼロの初期端点列を与えておきます。各工場のローカル電力制約と製品上限は独立した LP 価格付け子問題となり、有望な端点を提案します。

<!-- section:hint2 -->
各工場の凸結合重みの和が 1 になるよう名前付き制約（`shared_cap` と `conv_${k}`）を持つ主問題で `solveColumnGeneration({ master, finalizeAsMIP: false, pricing })` を実行します。`pricing({ getDual })` では共有鋼材の双対価格を各製品の単位利益から差し引いて工場 $k$ のローカル LP を解き、最適値がその工場の凸結合双対変数より（$10^{-6}$ を超えて）大きければ列を提案し、最後に生成端点の凸結合として `allocations[k][j]` を復元してください。
