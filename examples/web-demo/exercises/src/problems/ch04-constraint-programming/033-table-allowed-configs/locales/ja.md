# #033. テーブル制約（allowed）による互換構成の最適化

<!-- section:scenario -->
複数の部品で構成されるハードウェア構成を設計します。各部品 c には複数の候補オプションがあり、それぞれのコストが componentCosts[c] に与えられています。

allowedRules に列挙された正の互換テーブルでは指定部品の組が許容タプル表のいずれかに一致する必要があり、forbiddenRules に列挙された禁止テーブルでは指定組合せを選んでほしくありません。すべてのルールを満たす最安の部品構成を求めてください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `componentCosts` | `number[][]` | 各部品 `c` の選択肢 `opt` ごとの整数コスト `componentCosts[c][opt]` |
| `allowedRules` | `TableRule[]` | 指定部品列 `vars` の値が `tuples` 内のいずれかに一致する正のテーブル制約 |
| `forbiddenRules` | `TableRule[]` | 指定部品列 `vars` の値が `tuples` 内の組合せを禁止する負のテーブル制約 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `choices` | `number[]` | 各部品の選択オプション番号（`0` 〜 `componentCosts[c].length - 1`） |
| `totalCost` | `number` | 最小化された総構成コスト |

<!-- section:example -->
**入力例**

```json
{
  "componentCosts": [
    [10, 25, 45],
    [8, 18, 32],
    [5, 14, 28]
  ],
  "allowedRules": [
    {
      "vars": [0, 1],
      "tuples": [
        [0, 1],
        [1, 0],
        [1, 2],
        [2, 2]
      ]
    }
  ],
  "forbiddenRules": [
    {
      "vars": [1, 2],
      "tuples": [
        [1, 0],
        [0, 0]
      ]
    }
  ]
}
```

**出力例**

```json
{
  "choices": [0, 1, 1],
  "totalCost": 42
}
```

選択 `[0, 1, 1]` は `(0, 1)` が `allowedRules[0]` に含まれ、部品 `(1, 2)` の禁止ペア `(1, 0)`・`(0, 0)` も回避し、総コストは $10 + 18 + 14 =$ **42** です。
