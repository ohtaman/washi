# #007. 1対1のタスク割当問題

<!-- section:scenario -->
同じ数の作業者とタスクがあり、どの作業者にどのタスクを任せるかに応じてコストが決まっています。

**すべての作業者がちょうど 1 つのタスクを担当** し、かつ **すべてのタスクがちょうど 1 人に担当される** ように 1 対 1 で割り当てて、**合計コストを最小化** してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `costs` | `number[][]` | $n \times n$ の割当コスト行列（`costs[i][j]` は作業者 $i$ がタスク $j$ を行うコスト） |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `assignment` | `number[]` | 長さ $n$ の配列（`assignment[i]` は作業者 $i$ に割り当てるタスク番号） |
| `totalCost` | `number` | 最小化された合計コスト |

<!-- section:example -->
**入力例**

```json
{
  "costs": [
    [9, 2, 7],
    [6, 4, 3],
    [5, 8, 1]
  ]
}
```

**出力例**

```json
{
  "assignment": [1, 0, 2],
  "totalCost": 9
}
```

上から順に最安のタスクを選ぶ貪欲法では $2 + 3 + 5 = 10$ になりますが、全体で最適に割り当てると `[1, 0, 2]` の順で合計コスト **9**（$2 + 6 + 1$）になります。

<!-- section:hint1 -->
2次元 0-1 変数行列 `x[i][j]` は初期コードで宣言済みです：
- **行和の制約**（各作業者 $i$ はちょうど 1 タスク）：`sum(x[i]) == 1`
- **列和の制約**（各タスク $j$ はちょうど 1 人）：`sum(x.map((row) => row[j])) == 1`

<!-- section:hint2 -->
解いた後に `assignment[i]` を取り出すには、行 `i` の中で `Math.round(x[i][j].value!) === 1`（Python なら `round(h.val(x[i][j])) == 1`）となる列インデックス `j` を求めます。

<!-- section:formulation -->
$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \sum_{j=0}^{n-1} c_{i,j} x_{i,j} \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} x_{i,j} = 1 && \forall i \in \{0, \dots, n-1\} \\
& \sum_{i=0}^{n-1} x_{i,j} = 1 && \forall j \in \{0, \dots, n-1\} \\
& x_{i,j} \in \{0, 1\} && \forall i, j
\end{aligned}
$$
