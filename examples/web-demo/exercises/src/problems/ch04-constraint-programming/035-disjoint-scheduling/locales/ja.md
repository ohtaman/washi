# #035. 排他機械スケジューリング（disjoint）

<!-- section:scenario -->
工場で n 個の作業を中断なしで各担当機械上で実行します。各作業 i には処理時間 durations[i]、最早開始可能時刻 releaseTimes[i]、担当機械番号 machines[i] が指定されています。

同じ機械を使う作業どうしは時間帯が重なってはならず、先行制約ペア [u, v] ごとに作業 u が完全に終わってから作業 v を始める必要があります。全体の完了時刻（メイクスパン）を最小化する開始時刻 starts[i] を求めてください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `durations` | `number[]` | 各作業の処理時間（整数） |
| `releaseTimes` | `number[]` | 各作業の最早開始可能時刻 |
| `machines` | `number[]` | 各作業が使用する機械番号（`0..M-1`） |
| `precedences` | `number[][]` | `starts[u] + durations[u] <= starts[v]` を要求する先行ペア `[u, v]` |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `starts` | `number[]` | 各作業の開始時刻（整数） |
| `makespan` | `number` | 最小化された総完了時刻 `max(starts[i] + durations[i])` |

<!-- section:example -->
**入力例**

```json
{
  "durations": [4, 3, 5, 2],
  "releaseTimes": [0, 2, 0, 4],
  "machines": [0, 0, 0, 0],
  "precedences": [
    [0, 3]
  ]
}
```

**出力例**

```json
{
  "starts": [0, 6, 9, 4],
  "makespan": 14
}
```

機械 0 上で作業 0 `[0, 4)` → 作業 3 `[4, 6)` → 作業 1 `[6, 9)` → 作業 2 `[9, 14)` と重なりなく処理され、リリース時刻と先行関係 `0 -> 3` を満たして総完了時刻は **14** になります。

<!-- section:hint1 -->
各作業に対してリリース時刻以上 `horizon - durations[i]` 以下の整数開始時刻変数を定義します。先行制約に加えて、担当機械ごとに作業をグループ化し、各機械に対して非重複の選言（disjunctive）制約を適用します。

<!-- section:hint2 -->
各機械に割り当てられた作業の `{ start: starts[i], duration: input.durations[i] }` を集め、（空でなければ）`disjoint(tasks)` を追加してください。目的関数は `minimize(max(starts.map((s, i) => expr\`${s} + ${input.durations[i]}\`)))` として `solver: "pumpkin"` で解きます。
