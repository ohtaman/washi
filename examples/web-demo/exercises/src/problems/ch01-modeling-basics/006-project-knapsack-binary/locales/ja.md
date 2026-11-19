# #006. プロジェクト採択計画（0-1 バイナリ変数）

<!-- section:scenario -->
ある開発チームが、限られた総予算の中で複数の候補プロジェクトから実施する案件を選定します。各案件は半分だけ実施することはできず、「採択する」か「採択しない」かの二択です。採択した案件は所定の費用を消費し、期待価値を生み出します。

総費用が予算上限を超えない範囲で、**採択プロジェクトの合計価値を最大化** してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `budget` | `number` | 利用可能な総予算上限 |
| `costs` | `number[]` | 各候補プロジェクトの必要コスト |
| `values` | `number[]` | 各候補プロジェクトの期待価値 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `selected` | `number[]` | 各案件の採択フラグ（`0` または `1`） |
| `totalValue` | `number` | 最大化された合計価値 |

<!-- section:example -->
**入力例**

```json
{
  "budget": 15,
  "costs": [4, 5, 7, 3, 6],
  "values": [10, 12, 16, 8, 13]
}
```

**出力例**

```json
{
  "selected": [0, 1, 1, 1, 0],
  "totalValue": 36
}
```

コスパ順に選ぶと予算が 3 余って合計価値 30 止まりになりますが、案件 1・2・3 を採択すると予算 $5 + 7 + 3 = 15$ をちょうど使い切り、最大価値 **36** を達成します。

<!-- section:hint1 -->
0-1 変数配列 `selected`（`m.binary(...)` / `h.addBinary(...)`）は宣言済みです。予算制約 `dot(input.costs, selected) <= input.budget` を追加し、`dot(input.values, selected)` を最大化してください。

<!-- section:hint2 -->
結果を返す際には `Math.round(v.value!)`（Python は `round(h.val(v))`）で整数丸めすると、微小誤差（`0.999999999` や `-0`）を防げます。

<!-- section:formulation -->
$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} v_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} c_i x_i \le B \\
& x_i \in \{0, 1\} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$
