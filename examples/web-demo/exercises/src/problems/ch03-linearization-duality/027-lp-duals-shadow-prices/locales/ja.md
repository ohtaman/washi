# #027. LP の双対変数と潜在価格（Shadow Price）

<!-- section:scenario -->
運用アナリストは、各稼働ユニットの上下界のもとで連続量のコスト最小化ディスパッチ問題を解いています。各ユニットには単価と稼働容量の上界が設定されており、全体の稼働量は複数の最低要求量を満たしつつ、共有資源の上限以下に収める必要があります。

最小コストの稼働量だけでなく、各最低要求制約と共有資源上限制約の右辺値を 1 単位増やしたときに最適コストがどれだけ変化するかを表す潜在価格（シャドウプライス）も求められています。最小化 LP を解き、主変数・要求制約と資源上限制約をこの順に並べた潜在価格・最小コストを返してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `costs` | `number[]` | ユニット $i$ の単位コスト $c_i$ |
| `capacities` | `number[]` | 変数上界 $u_i$（$0 \le x_i \le u_i$） |
| `yields` | `number[][]` | 最低要求制約の係数行列 $A$ |
| `minRequirements` | `number[]` | 最低要求値 $r_k$（$\sum_i A_{ki} x_i \ge r_k$） |
| `resourceUsages` | `number[][]` | 共有資源上限の係数行列 $E$ |
| `maxResources` | `number[]` | 共有資源上限 $b_l$（$\sum_i E_{li} x_i \le b_l$） |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `quantities` | `number[]` | 最適な連続稼働量 $x_i$ |
| `duals` | `number[]` | 潜在価格 $\partial z^* / \partial \text{rhs}$（`minRequirements` 次に `maxResources` の順） |
| `optimalCost` | `number` | 最小化された総コスト $z^*$ |

<!-- section:example -->
**入力例**

```json
{
  "costs": [10, 14, 25],
  "capacities": [12, 20, 25],
  "yields": [
    [1, 2, 3],
    [2, 1, 2]
  ],
  "minRequirements": [30, 22],
  "resourceUsages": [
    [2, 1, 1]
  ],
  "maxResources": [20]
}
```

**出力例**

```json
{
  "quantities": [4, 10, 2],
  "duals": [6, 5, -3],
  "optimalCost": 230
}
```

稼働量 `[4, 10, 2]` は要求 `[30, 22]` と資源上限 `20` をすべて満たし総コスト $10 \times 4 + 14 \times 10 + 25 \times 2 =$ **230** を達成し、潜在価格 `[6, 5, -3]` による双対評価値 $30(6) + 22(5) + 20(-3) = 230$ と一致します。
