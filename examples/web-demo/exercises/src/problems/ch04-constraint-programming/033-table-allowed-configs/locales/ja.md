# #033. テーブル制約（allowed）による互換構成の最適化

<!-- section:scenario -->
システム設計者は、CPU・マザーボード・メモリ・電源ユニットなど複数の部品からなるハードウェアシステムを設計しています。各部品には複数の候補オプションがあり、それぞれに整数コスト（千円）が設定されています。

また、互換ルールでは指定された部品の組が許容されるオプションの組み合わせのいずれかに一致する必要があり、禁止ルールでは指定された組み合わせを選んではなりません。すべてのルールを満たす最安の部品構成を求めてください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `componentCosts` | `number[][]` | 各部品 `c` のオプション `opt` ごとの整数コスト `componentCosts[c][opt]`（千円） |
| `allowedRules` | `TableRule[]` | 指定部品列 `vars` の選択オプションが `tuples` 内のいずれかに一致することを求める互換ルール |
| `forbiddenRules` | `TableRule[]` | 指定部品列 `vars` の選択オプションが `tuples` 内のいずれにも一致してはならない禁止ルール |

各 `TableRule` は `{ vars: number[], tuples: number[][] }` の形式で、`vars` は 0 始まりの部品インデックス配列、`tuples` の各要素は `vars` と同じ長さのオプション番号配列です。

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `choices` | `number[]` | 各部品 `c` の選択オプション番号（0 〜 `componentCosts[c].length - 1`） |
| `totalCost` | `number` | 最小化された総構成コスト（千円） |

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

選択 [0, 1, 1] は部品 (0, 1) に (0, 1) を選んで `allowedRules[0]` を満たし、部品 (1, 2) には (1, 1) を選んで禁止タプル (1, 0)・(0, 0) を回避しており、総コストは $10 + 18 + 14 =$ **42** 千円です。

<!-- section:hint1 -->
各部品に対して利用可能なオプション番号を値域とする整数決定変数を 1 つずつ定義します。互換ルールと禁止ルールの両方を対象部品の変数タプルに対するテーブル制約として表現し、選択されたオプションのコスト合計を最小化します。

<!-- section:hint2 -->
`input.allowedRules` には `allowed(vars, rule.tuples)`、`input.forbiddenRules` には `not(allowed(vars, rule.tuples))` を適用し、`rule.vars` を対応する部品変数へ写像します。各部品のオプションコストは `at(costs, choices[c])` で参照し、その `sum(...)` を最小化して `solver: "pumpkin"` で解いてください。
