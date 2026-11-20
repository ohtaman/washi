# #036. 累積資源制約付きスケジューリング（cumulative / RCPSP）

<!-- section:scenario -->
容量上限 capacity の共有再生可能資源（電力や人員など）のもとで n 個の作業を中断なしで実施します。各作業 i は処理時間 durations[i] のあいだ継続して demands[i] 単位の資源を消費します。

先行ペア [u, v] ごとに作業 u が終わってから作業 v を開始し、かつ任意の時刻において同時稼働中作業の需要合計が capacity を超えないように開始時刻 starts[i] >= 0 を定め、全体の完了時刻（メイクスパン）を最小化してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `capacity` | `number` | 共有再生可能資源の上限容量 |
| `durations` | `number[]` | 各作業の処理時間（整数） |
| `demands` | `number[]` | 各作業の稼働中の資源消費量（整数） |
| `precedences` | `number[][]` | `starts[u] + durations[u] <= starts[v]` を満たすべき先行ペア `[u, v]` |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `starts` | `number[]` | 各作業の非負整数開始時刻 |
| `makespan` | `number` | 最小化された総完了時刻 `max(starts[i] + durations[i])` |

<!-- section:example -->
**入力例**

```json
{
  "capacity": 3,
  "durations": [4, 3, 3, 2],
  "demands": [2, 2, 1, 2],
  "precedences": [
    [0, 3],
    [1, 3]
  ]
}
```

**出力例**

```json
{
  "starts": [0, 4, 0, 7],
  "makespan": 9
}
```

時刻 `[0, 3)` では作業 0 と作業 2 が並行して $2 + 1 = 3 \le 3$ を消費し、作業 0 完了後に作業 1 が `[4, 7)` で稼働、先行する作業 0・1 の完了後に作業 3 が `[7, 9)` で実行され、総完了時刻は **9** となります。
