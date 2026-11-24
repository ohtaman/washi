# #040. 統合工場セル・スケジューリング（CP 総合）

<!-- section:scenario -->
製造セルの工程管理者は、複数の加工ジョブを処理するスケジュールを立てています。各ジョブには担当機械・処理時間（分）・稼働電力（kW）が決まっており、開始時刻（分）と運転モードの両方を決定します。運転モードは機械外での前段取り時間（分）と処理後の冷却・後処理時間（分）のトレードオフを持ちます。

各ジョブは前段取り完了後に開始でき、同一機械上の非重複制約・工場全体の消費電力上限（kW）・後処理完了を待つ先行制約・指定ジョブ組のモード互換表をすべて満たす必要があります。全体の完了時刻（メイクスパン、分）を最小化してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `powerCap` | `number` | 工場全体で同時に消費できる電力の上限（kW） |
| `jobs` | `JobSpec[]` | 各ジョブの仕様（`duration`, `power`, `machine`, `setupTimes`, `postTimes`） |
| `precedences` | `number[][]` | `starts[u] + duration[u] + postTimes[u][modes[u]] <= starts[v]` を要求する先行ペア `[u, v]` |
| `modeRules` | `ModeRule[]` | ジョブ組 `{ jobs: [u, v], allowedPairs }` の許可モード対テーブル |

型定義:
- `JobSpec`: `{ duration: number, power: number, machine: number, setupTimes: number[], postTimes: number[] }`（時間は分、`power` は kW、`machine` は 0 始まり、`setupTimes[m]`・`postTimes[m]` はモード `m` における前段取り・後処理時間）
- `ModeRule`: `{ jobs: [number, number], allowedPairs: [number, number][] }`（`jobs` は 0 始まりのジョブ番号対 `[u, v]`、`allowedPairs` は許容される `[modes[u], modes[v]]` の組の配列）

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `starts` | `number[]` | 各ジョブの整数開始時刻（分） |
| `modes` | `number[]` | 各ジョブの選択運転モード番号 |
| `makespan` | `number` | 最小化された総完了時刻 `max(starts[i] + duration[i] + postTimes[i][modes[i]])`（分） |

<!-- section:example -->
**入力例**

```json
{
  "powerCap": 4,
  "jobs": [
    { "duration": 4, "power": 1, "machine": 0, "setupTimes": [0, 2], "postTimes": [2, 0] },
    { "duration": 4, "power": 2, "machine": 0, "setupTimes": [0, 2], "postTimes": [2, 0] },
    { "duration": 4, "power": 3, "machine": 1, "setupTimes": [0, 3], "postTimes": [3, 0] },
    { "duration": 2, "power": 2, "machine": 1, "setupTimes": [0, 2], "postTimes": [1, 0] }
  ],
  "precedences": [[0, 3], [1, 3]],
  "modeRules": [{ "jobs": [1, 2], "allowedPairs": [[0, 0], [1, 1]] }]
}
```

**出力例**

```json
{
  "starts": [4, 0, 4, 9],
  "modes": [1, 0, 0, 1],
  "makespan": 11
}
```

ジョブ 1（モード 0）が [0, 4) + 後処理 2 = 6 分で完了した後、機械 0 上のジョブ 0（モード 1、前段取り $2 \le 4$）が [4, 8) に実行され、ジョブ 2（モード 0、電力 $1 + 3 = 4 \le 4$ kW）が [4, 8) + 後処理 3 = 11 分、ジョブ 3（モード 1）が [9, 11) に収まり、メイクスパンは **11** 分です。

<!-- section:hint1 -->
各ジョブに対して開始時刻 `starts[i]` と動作モード `modes[i]` の 2 種類の整数変数を定義します。モードに応じた前段取り・後処理時間、先行制約、機械ごとの非重複制約、全体の電力上限、モード互換テーブルを組み合わせてメイクスパンを最小化します。

<!-- section:hint2 -->
開始時刻の下限には `at(j.setupTimes, modes[i])`、先行制約とメイクスパンには `at(j.postTimes, modes[i])` を使います。機械ごとに `{ start: starts[i], duration: j.duration }` の `disjoint(...)` を、電力上限には `demand: j.power` の `cumulative(..., input.powerCap)` を、モード制約には `allowed([modes[u], modes[v]], rule.allowedPairs)` を追加して `solver: "pumpkin"` で解いてください。
