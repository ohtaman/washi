# #079. e-Sportsリーグの試合会場・タイムスロット割当

<!-- section:scenario -->
e-Sportsリーグが、複数の試合候補を V 個の会場と S 個のタイムスロットに編成します。各試合には必要な配信時間、実施時に得られる視聴スコア、および会場ごとの適合マスクが定められており、未実施の試合はスコア 0 となります。

各「会場・スロット」枠には通常枠長があり、一定の延長上限までは 1 単位あたりの線形ペナルティを支払うことで延長できます。各試合を適合する会場とスロットに割り当て、合計視聴スコアから合計延長コストを引いた純スコアを最大化してください。

<!-- section:io -->
### Input

| Field | Type | Description |
| --- | --- | --- |
| `durations` | `number[]` | 各試合 $m$ の配信時間 $d_m$ |
| `scores` | `number[]` | 試合 $m$ を実施したときに得られる視聴スコア $p_m$ |
| `compatible` | `number[][]` | 試合 $m$ が会場 $v$ で開催可能かを表す $M \times V$ の 0/1 行列 |
| `numSlots` | `number` | 各会場のタイムスロット数 $S$ |
| `regularLength` | `number` | 各 `(venue, slot)` 枠の通常配信時間 $B$ |
| `maxOvertime` | `number` | 各 `(venue, slot)` 枠で許容される最大延長時間 $O_{\max}$ |
| `overtimeCost` | `number` | 通常配信時間を超えた延長 1 単位あたりのペナルティコスト |

### Output

| Field | Type | Description |
| --- | --- | --- |
| `assignedVenue` | `number[]` | 各試合の割当会場インデックス `0..V-1`（未実施は `-1`） |
| `assignedSlot` | `number[]` | 各試合の割当スロットインデックス `0..S-1`（未実施は `-1`） |
| `overtime` | `number[][]` | 各 `(venue, slot)` で使用した非負の延長時間 $o_{v,s}$（$V \times S$） |
| `netScore` | `number` | 最大化された合計視聴スコアから延長コストを引いた純スコア |

<!-- section:example -->
**Input**

```json
{
  "durations": [2, 4, 3, 3, 2],
  "scores": [55, 95, 70, 65, 18],
  "compatible": [
    [1, 1],
    [1, 0],
    [0, 1],
    [1, 1],
    [1, 1]
  ],
  "numSlots": 2,
  "regularLength": 3,
  "maxOvertime": 1,
  "overtimeCost": 25
}
```

**Output**

```json
{
  "assignedVenue": [1, 0, 1, 0, -1],
  "assignedSlot": [1, 0, 0, 1, -1],
  "overtime": [
    [1, 0],
    [0, 0]
  ],
  "netScore": 260
}
```

試合 0〜3 はそれぞれ適合会場（`compatible[m][v] = 1`）に配置され、会場 0 の負荷 `[4, 3]` と会場 1 の負荷 `[3, 2]` は通常枠長 `3`＋延長 `[[1, 0], [0, 0]]`（`maxOvertime = 1` 以内）に収まり、試合 4 は未実施（`-1`）で純スコア $(55 + 95 + 70 + 65) - 25 \times 1 =$ **260** となります。

<!-- section:hint1 -->
各試合をどの会場・どのスロットに割り当てるかを表す 3 次元のバイナリ決定変数と、各会場・スロット枠の延長時間を表す上限付きの非負連続変数を組み合わせます。各試合は適合する会場に高々 1 回だけ割り当てられ、各枠の合計配信時間は通常枠長と延長時間の和以下に収まる必要があります。

<!-- section:hint2 -->
`overtimeCost` が正で `netScore` を最大化しているため、連続変数（`m.continuous` / `pulp.LpVariable`）の延長時間は追加のバイナリ指標変数なしで自動的に `regularLength` を超えた超過分と一致します。不適合な `(m, v)` への割当を 0 に固定することと、未実施の試合を `assignedVenue`・`assignedSlot` の両方で `-1` と出力することを忘れないでください。
