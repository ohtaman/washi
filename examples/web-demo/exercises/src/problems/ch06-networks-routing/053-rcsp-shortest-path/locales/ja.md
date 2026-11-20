# #053. 資源制約付き最短路問題 (RCSP)

<!-- section:scenario -->
有向ネットワーク上で始点から終点まで 1 本の経路を選んでパケットを送信します。各枝には通過コストに加えて遅延や消費電力などの資源消費量が設定されており、選んだ単純パス全体の資源消費合計を上限以下に抑えなければなりません。

各枝の採否を表す 0-1 変数と始点から終点への単位フロー保存則、さらに総資源上限制約を組み合わせて、**経路コストの合計を最小化** してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `nodeCount` | `number` | 頂点数（`0 .. nodeCount - 1`） |
| `source` | `number` | 始点インデックス $s$ |
| `sink` | `number` | 終点インデックス $t$ |
| `maxResource` | `number` | パス全体の資源消費上限 $R$ |
| `edges` | `Array<{ from, to, cost, resource }>` | コスト `cost` と資源消費 `resource` を持つ有向枝 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `selected` | `number[]` | `edges` の各枝を採用するかを表す 0-1 配列 |
| `totalCost` | `number` | 選ばれた経路の最小総コスト |

<!-- section:example -->
**入力例**

```json
{
  "nodeCount": 5,
  "source": 0,
  "sink": 4,
  "maxResource": 10,
  "edges": [
    { "from": 0, "to": 1, "cost": 2, "resource": 6 },
    { "from": 0, "to": 2, "cost": 4, "resource": 3 },
    { "from": 1, "to": 3, "cost": 2, "resource": 5 },
    { "from": 1, "to": 4, "cost": 5, "resource": 6 },
    { "from": 2, "to": 1, "cost": 1, "resource": 2 },
    { "from": 2, "to": 3, "cost": 3, "resource": 4 },
    { "from": 3, "to": 4, "cost": 2, "resource": 3 }
  ]
}
```

**出力例**

```json
{
  "selected": [0, 1, 0, 0, 0, 1, 1],
  "totalCost": 9
}
```

経路 `0 -> 2 -> 3 -> 4` は資源消費 $3 + 4 + 3 = 10 \le 10$ を守り、総コストは $4 + 3 + 2 =$ **9** になります。
