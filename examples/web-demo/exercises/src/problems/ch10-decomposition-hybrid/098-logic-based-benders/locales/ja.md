# #098. 論理ベース Benders 分解（MIP + Pumpkin CP）

<!-- section:scenario -->
製造工場において、各ジョブを複数の並列機械のいずれか 1 台へ割り当て、機械ごとの割当コスト合計を最小化します。割り当てられたジョブ集合は各機械上で時刻が重ならないように順次処理する必要があり、すべてのジョブについて準備完了時刻以降の開始、納期までの完了、および共通計画期間内の完了が求められます。

WaSHI の複数ソルバ連携による論理ベース Benders 分解（LBBD）を用いて、HiGHS の割当主問題と Pumpkin CP のスケジューリング子問題を組み合わせ、最適な機械割当・実行可能な開始時刻・最小総コストを返してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `costs` | `number[][]` | ジョブ $j$ を機械 $m$ に割り当てるコスト `costs[j][m]` |
| `durations` | `number[]` | ジョブ $j$ の処理時間（整数） |
| `releaseTimes` | `number[]` | ジョブ $j$ の開始可能時刻（リリース時刻） |
| `deadlines` | `number[]` | ジョブ $j$ の完了締切時刻（デッドライン） |
| `horizon` | `number` | 全機械共通の計画期間上限 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `assignments` | `number[]` | 各ジョブ $j$ に割り当てた機械番号 $m \in \{0, \dots, M-1\}$ |
| `starts` | `number[]` | 時間枠と非重複制約を満たす各ジョブの整数開始時刻 $s_j$ |
| `totalCost` | `number` | 割当コストの最小合計 $\sum_j \text{costs}[j][\text{assignments}[j]]$ |

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

ジョブ `0` と `1` は機械 `0` の方が安価ですが、両方を機械 `0` に載せると時間枠 `[0, 6]` と `[1, 7]` を同時に満たせません。ジョブ `0` を機械 `1` へ逃がすことで全機械が非重複（`[2, 6]` と `[0, 4], [4, 7], [7, 10]`）となり、最小コスト **66** を得ます。

<!-- section:hint1 -->
主問題 MIP はジョブの機械割当のみを表す二値変数で構成し、各ジョブを 1 台の機械へ割り当てて総コストを最小化します。時間枠や非重複の検証はすべて `master.solveBenders(...)` 内の機械別 CP 子問題に委譲します。

<!-- section:hint2 -->
機械 $m$ に割り当てられたジョブ集合 $S_m$ ごとに、整数開始時刻 $s_j \in [\text{releaseTimes}[j], \min(\text{deadlines}[j], \text{horizon}) - \text{durations}[j]]$ と `disjoint(...)` を持つ Pumpkin CP モデルを作り、`await sub.check({ solver: "pumpkin" })` を呼び出します。`Unsat` になった場合は貪欲削除で極小実行不能部分集合 $K \subseteq S_m$ に絞ってからノーグッドカット $\sum_{j \in K} x_{jm} \le |K| - 1$ を返してください。
