# #040. 統合工場セル・スケジューリング（CP 総合）

<!-- section:scenario -->
製造セルの工程管理者は、複数の加工ジョブを処理するスケジュールを立てています。各ジョブには担当機械・処理時間（分）・稼働電力（kW）が決まっており、加工の開始時刻（分）と運転モードの両方を決定します。運転モードによって、時刻 0 から機外で行う前段取り時間（分）と加工後に機外で行う冷却・後処理時間（分）のバランスが変わりますが、前段取りも後処理も機械を占有せず工場の電力も消費しません。

スケジュールは次の条件をすべて満たす必要があります。
- **前段取り完了**: 各ジョブは時刻 0 から始まる機外前段取りが終わってから加工を開始すること
- **同じ機械の非重複**: 同じ機械を使うジョブ同士で、加工区間が時間帯として重ならないこと
- **総電力の上限**: 同時に加工中のジョブの消費電力合計が工場の上限（kW）を超えないこと
- **先行関係**: 先行ジョブは加工と後処理まで完了してから後続ジョブの加工を開始すること
- **モードの組**: 指定されたジョブの組では、許可されたモードの組み合わせのみを選ぶこと

後処理の冷却まで含めた全体の最大完了時刻（メイクスパン、分）を最小化してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `powerCap` | `number` | 工場全体で同時に消費できる電力の上限（kW） |
| `jobs` | `JobSpec[]` | 各ジョブの仕様（`duration`, `power`, `machine`, `setupTimes`, `postTimes`） |
| `precedences` | `number[][]` | ジョブ `u` がジョブ `v` に先行することを示す 0 始まりの先行ペア `[u, v]` のリスト |
| `modeRules` | `ModeRule[]` | ジョブ組 `{ jobs: [u, v], allowedPairs }` の許可モード対テーブル |

型定義:
- `JobSpec`: `{ duration: number, power: number, machine: number, setupTimes: number[], postTimes: number[] }`（時間は分、`power` は kW、`machine` は 0 始まり、`setupTimes[m]`・`postTimes[m]` はモード `m` における前段取り・後処理時間）
- `ModeRule`: `{ jobs: [number, number], allowedPairs: [number, number][] }`（`jobs` は 0 始まりのジョブ番号対 `[u, v]`、`allowedPairs` は許容される `[modes[u], modes[v]]` の組の配列）

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `starts` | `number[]` | 各ジョブの整数開始時刻（分） |
| `modes` | `number[]` | 各ジョブの選択運転モード番号（0 始まり） |
| `makespan` | `number` | 後処理冷却まで含めた全ジョブの最大完了時刻（メイクスパン、分） |

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

ジョブ 1（モード 0）は機械 0 で [0, 4) に加工し機外後処理を含め $4 + 2 = 6$ 分で完了します。機械 0 が空く時刻 4 からジョブ 0（モード 1、前段取り $2 \le 4$）が [4, 8) で加工して 8 分で完了し、並行してジョブ 2（モード 0、合計電力 $1 + 3 = 4 \le 4$ kW）が機械 1 で [4, 8) に加工し後処理を含め $8 + 3 = 11$ 分で完了します。ジョブ 3（モード 1）は先行するジョブ 0（8 分）・ジョブ 1（6 分）の完了後に [9, 11) で加工して 11 分で完了し、メイクスパンは $\max(8, 6, 11, 11) =$ **11** 分です。

<!-- section:hint1 -->
各ジョブに対して開始時刻 `starts[i]` と運転モード `modes[i]` の 2 種類の整数変数を定義します。モードに応じた前段取り・後処理時間、先行制約、機械ごとの非重複制約、全体の電力上限、モード互換テーブルを組み合わせてメイクスパンを最小化します。

<!-- section:hint2 -->
開始時刻の下限には `at(j.setupTimes, modes[i])`、先行制約とメイクスパンには `at(j.postTimes, modes[i])` を使います。機械ごとに `{ start: starts[i], duration: j.duration }` の `disjoint(...)` を、電力上限には `demand: j.power` の `cumulative(..., input.powerCap)` を、モード制約には `allowed([modes[u], modes[v]], rule.allowedPairs)` を追加して `solver: "pumpkin"` で解いてください。
