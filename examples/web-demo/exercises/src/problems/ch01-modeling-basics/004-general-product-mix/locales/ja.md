# #004. 一般形プロダクトミックス（m × n 行列）

<!-- section:scenario -->
**#002** では 2 種類の製品を手書きで記述しましたが、実務では製品数も資源数もデータによって変わります。

複数のフレーバー（連続値・非負の生産量）を作り、それぞれから単位利益が得られます。各製品の 1 単位生産には複数の共有原材料・資源が一定量ずつ消費され、各資源には利用上限があります。すべての資源上限を満たしつつ **総利益を最大化する各製品の生産量** を求めてください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `margins` | `number[]` | 製品 $j$ の単位利益 |
| `usages` | `number[][]` | `usages[k][j]` が製品 $j$ 1 単位あたりの資源 $k$ の消費量 |
| `capacities` | `number[]` | 資源 $k$ の利用上限 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `quantities` | `number[]` | 各製品の非負生産量（連続値） |
| `totalProfit` | `number` | 最大化された総利益 |

<!-- section:example -->
**入力例**

```json
{
  "margins": [500, 300],
  "usages": [
    [3, 1],
    [1, 2]
  ],
  "capacities": [90, 80]
}
```

**出力例**

```json
{
  "quantities": [20, 30],
  "totalProfit": 19000
}
```

製品 0 だけを作ると資源 0 の上限 90 で 30 個（利益 15,000）で止まりますが、`[20, 30]` の配合にすると資源 0（90）と資源 1（80）の両方を使い切り、総利益 **19,000** が最大になります。

<!-- section:hint1 -->
変数の配列 `quantities` と入力データの受け取りは用意済みです。資源インデックス `k = 0 .. capacities.length - 1` でループを回し、`dot(usages[k], quantities) <= capacities[k]` を追加しましょう。

<!-- section:hint2 -->
利益 `dot(margins, quantities)` を最大化し、`quantities` の各要素を整数に丸めずそのまま連続値として返してください（Case 2 の最適頂点は小数の `[6.6667, 46.6667, 0]` になります）。

<!-- section:formulation -->
$$
\begin{aligned}
\max \quad & \sum_{j=0}^{n-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} a_{k,j} x_j \le b_k && \forall k \in \{0, \dots, m-1\} \\
& x_j \ge 0 && \forall j \in \{0, \dots, n-1\}
\end{aligned}
$$
