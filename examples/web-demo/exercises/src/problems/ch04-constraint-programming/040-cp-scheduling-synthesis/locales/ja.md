# #040. 統合工場セル・スケジューリング（CP 総合）

<!-- section:scenario -->
製造セルの工程管理者は、複数の加工ジョブを処理するスケジュールを立てています。各ジョブには担当機械・加工時間（分）・稼働電力（kW）が決まっており、加工の整数開始時刻（分）と運転モードの両方を決定します。運転モードによって、機械外での前段取り時間（分）と加工後の機械外冷却・後処理時間（分）のバランスが変わります。

スケジュールは次の条件をすべて満たす必要があります。
- **前段取り完了**: 機械外の前段取りは全ジョブについて時刻 0 から並列に開始でき（先行ジョブの完了を待たない）、各ジョブは自身の前段取りが終わってから加工を開始すること
- **同じ機械の非重複**: 同じ機械を使うジョブ同士で加工区間が重ならないこと（前のジョブの加工終了時刻と次のジョブの加工開始時刻が一致するのは可。機械外の前段取りと後処理は機械を占有しない）
- **総電力の上限**: 同時に加工中のジョブの消費電力合計が工場の上限（kW）を超えないこと（機械外の前段取りと後処理は電力を消費しない）
- **先行関係**: 先行ジョブは加工と機械外の後処理まで完了してから、後続ジョブの加工を開始すること
- **モードの組**: 指定されたジョブの組では、許可された運転モードの組み合わせのみを選ぶこと

後処理を含めた全体の完了時刻（メイクスパン、分）を最小化してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `powerCap` | `number` | 工場全体で同時に消費できる電力の上限（kW） |
| `jobs` | `JobSpec[]` | 各ジョブの仕様（`duration`, `power`, `machine`, `setupTimes`, `postTimes`） |
| `precedences` | `number[][]` | 0 始まりの先行ペア `[u, v]` のリスト（ジョブ `u` の加工と後処理の完了後にジョブ `v` を開始） |
| `modeRules` | `ModeRule[]` | ジョブ組 `{ jobs: [u, v], allowedPairs }` の許可モード対テーブル |

型定義:
- `JobSpec`: `{ duration: number, power: number, machine: number, setupTimes: number[], postTimes: number[] }`（`duration` は加工時間［分］、`power` は稼働電力［kW］、`machine` は 0 始まりの担当機械番号、`setupTimes[m]`・`postTimes[m]` はモード `m` の機械外前段取り時間・後処理時間［分］）
- `ModeRule`: `{ jobs: [number, number], allowedPairs: number[][] }`（`jobs` は 0 始まりのジョブ番号ペア `[u, v]`、`allowedPairs` は許可される運転モードの組 `[modeA, modeB]` のリスト）

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `starts` | `number[]` | 各ジョブの整数開始時刻（分） |
| `modes` | `number[]` | 各ジョブの 0 始まり整数運転モード番号（`0 .. jobs[i].setupTimes.length - 1`） |
| `makespan` | `number` | 最小化された最大完了時刻（後処理完了まで、分） |

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

ジョブ 1（モード 0）は機械 0 で [0, 4) に加工して時刻 4 で機械 0 を解放し、機械外の後処理 [4, 6) を時刻 6 に完了します。続いて機械 0 でジョブ 0（モード 1、前段取り $2 \le 4$）が [4, 8) に加工し、並行して機械 1 でジョブ 2（モード 0、許可組 (0, 0)、同時電力 $1 + 3 = 4 \le 4$ kW）が [4, 8) の加工と [8, 11) の機械外後処理を行います。先行ジョブ 0・1 の完了（時刻 8・6）後にジョブ 3（モード 1）が機械 1 で [9, 11) に加工を終え、メイクスパンは **11** 分です。

<!-- section:hint1 -->
各ジョブに対して開始時刻 `starts[i]` と運転モード `modes[i]` の 2 種類の整数変数を定義します。モードに応じた前段取り・後処理時間、先行制約、機械ごとの非重複制約、全体の電力上限、モード互換テーブルを組み合わせてメイクスパンを最小化します。

<!-- section:hint2 -->
開始時刻の下限には `at(j.setupTimes, modes[i])`、先行制約とメイクスパンには `at(j.postTimes, modes[i])` を使います。機械ごとに `{ start: starts[i], duration: j.duration }` の `disjoint(...)` を、電力上限には `demand: j.power` の `cumulative(..., input.powerCap)` を、モード制約には `allowed([modes[u], modes[v]], rule.allowedPairs)` を追加して `solver: "pumpkin"` で解いてください。
