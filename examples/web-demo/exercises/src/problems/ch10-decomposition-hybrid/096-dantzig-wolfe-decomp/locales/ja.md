# #096. Dantzig-Wolfe 分解によるブロック角度構造 LP

<!-- section:scenario -->
複数の製造部門を抱える企業において、各部門は固有のローカル設備容量と製品別生産上限のもとで操業しつつ、全社で単一の共有ボトルネック資源を奪い合っています。このように共有結合制約と部門ごとの独立ブロックからなる構造は典型的なブロック角度線形計画問題です。

WaSHI の列生成機能を用いて Dantzig-Wolfe 分解を実装してください。主問題には全社共有制約と各部門の凸結合制約のみを保持し、双対価格を受け取った各部門の部分問題を独立に解いて改善端点を提案させ、最終的に得られた凸結合重みから元の連続生産量ベクトルを再構成します。

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
