# #098. 論理ベース Benders 分解（MIP + Pumpkin CP）

<!-- section:scenario -->
自動車部品の加工工場において、旋盤・フライス・研削などの各加工工程を専用加工機へ割り当て、時間（単位：分）のスケジュールを組んで割当コスト合計を最小化します。
- 各工程をちょうど 1 台の加工機へ割り当てる。
- 同じ加工機に割り当てた工程は、時間が重ならないように順次処理する。
- 各工程は、準備完了時刻以降の整数時刻に開始する。
- 各工程は、自身の完了締切時刻かつ全加工機共通の計画期間上限までに完了する。

WaSHI の複数ソルバ連携による論理ベース Benders 分解（LBBD）を用いて、HiGHS の割当主問題と Pumpkin CP のスケジューリング子問題を組み合わせ、最適な加工機割当・実行可能な開始時刻・最小総コストを返してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `costs` | `number[][]` | 工程 $j$ を加工機 $m$ に割り当てるコスト `costs[j][m]` |
| `durations` | `number[]` | 工程 $j$ の処理時間（分、整数） |
| `releaseTimes` | `number[]` | 工程 $j$ の開始可能時刻（分） |
| `deadlines` | `number[]` | 工程 $j$ の完了締切時刻（分） |
| `horizon` | `number` | 全加工機共通の計画期間上限（分） |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `assignments` | `number[]` | 各工程に割り当てる加工機の 0 始まりインデックス |
| `starts` | `number[]` | 時間枠と非重複制約を満たす各工程の整数開始時刻 $s_j$ |
| `totalCost` | `number` | 割当コストの合計 $\sum_j \text{costs}[j][\text{assignments}[j]]$ |

<!-- section:example -->
**入力例**

```json
{
  "costs": [
    [10, 25],
    [12, 26],
    [30, 15],
    [28, 14]
  ],
  "durations": [4, 4, 3, 3],
  "releaseTimes": [0, 1, 2, 5],
  "deadlines": [6, 7, 10, 10],
  "horizon": 10
}
```

**出力例**

```json
{
  "assignments": [1, 0, 1, 1],
  "starts": [0, 2, 4, 7],
  "totalCost": 66
}
```

すべての工程が時間枠を満たして各加工機上で重複なく処理され（加工機 0 は `[2, 6]`、加工機 1 は `[0, 4]`, `[4, 7]`, `[7, 10]`）、総コストは $25 + 12 + 15 + 14 =$ **66** となります。

<!-- section:hint1 -->
主問題 MIP は工程の加工機割当のみを表す二値変数で構成し、各工程を 1 台の加工機へ割り当てて総コストを最小化します。時間枠や非重複の検証はすべて `master.solveBenders(...)` 内の加工機別 CP 子問題に委譲します。

<!-- section:hint2 -->
加工機 $m$ に割り当てられた工程集合 $S_m$ ごとに、整数開始時刻 $s_j \in [\text{releaseTimes}[j], \min(\text{deadlines}[j], \text{horizon}) - \text{durations}[j]]$ と `disjoint(...)` を持つ Pumpkin CP モデルを作り、`await sub.check({ solver: "pumpkin" })` を呼び出します。`Unsat` になった場合は貪欲削除で極小実行不能部分集合 $K \subseteq S_m$ に絞ってから、その組合せの同時割当を禁止するカット（ノーグッドカット） $\sum_{j \in K} x_{jm} \le |K| - 1$ を返してください。
