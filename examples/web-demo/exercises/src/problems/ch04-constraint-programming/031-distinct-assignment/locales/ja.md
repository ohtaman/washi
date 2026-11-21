# #031. 重複禁止（distinct）の周波数チャネル割当

<!-- section:scenario -->
無線ネットワークにおいて、各送信局に 0 から numChannels - 1 までの整数周波数チャネルを 1 つずつ割り当てます。すべての送信局には互いに異なるチャネルを割り当てる必要があります。

さらに、干渉関係にある送信局ペアについては、割り当てるチャネル番号の差の絶対値が 2 以上でなければなりません。送信局 i にチャネル c を割り当てると重み付きコスト weights[i] * c が発生するとき、総コストを最小化してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `numChannels` | `number` | 利用可能なチャネル数（`0` 〜 `numChannels - 1`） |
| `weights` | `number[]` | 各送信局のチャネル重み（`sum(weights[i] * channels[i])`） |
| `adjacentConflicts` | `number[][]` | `abs(channels[u] - channels[v]) >= 2` が必要な干渉ペア `[u, v]` の配列 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `channels` | `number[]` | 各送信局に割り当てたチャネル番号（`0` 〜 `numChannels - 1`） |
| `totalCost` | `number` | 最小化された総コスト |

<!-- section:example -->
**入力例**

```json
{
  "numChannels": 4,
  "weights": [10, 6, 4],
  "adjacentConflicts": [
    [0, 1]
  ]
}
```

**出力例**

```json
{
  "channels": [0, 2, 1],
  "totalCost": 16
}
```

割当 `[0, 2, 1]` はすべて互いに異なり、干渉ペア `(0, 1)` でも $|0 - 2| = 2 \ge 2$ を満たし、総コストは $10 \times 0 + 6 \times 2 + 4 \times 1 =$ **16** です。

<!-- section:hint1 -->
各送信局に対して `[0, numChannels - 1]` の範囲をとる整数決定変数を 1 つずつ定義します。すべての送信局の重複禁止を AllDifferent グローバル制約で表し、各干渉ペアに対してチャネル差の分離制約を追加します。

<!-- section:hint2 -->
チャネル変数配列に `distinct(channels)` を課し、`input.adjacentConflicts` の各ペア `[u, v]` に対して `expr\`abs(${channels[u]} - ${channels[v]}) >= 2\`` を追加します。`minimize(expr\`dot(${input.weights}, ${channels})\`)` で重み付きコストを最小化し、`solver: "pumpkin"` で解いてください。
