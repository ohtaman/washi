# #033. テーブル制約（allowed）による互換構成の最適化

<!-- section:scenario -->
システム設計者は、複数の部品で構成されるハードウェア構成において、各部品から候補オプションをちょうど 1 つずつ選択します。各部品には複数の候補オプションがあり、それぞれに整数の部品コスト（千円）が設定されています。

また、互換ルールでは指定された部品グループに対する選択オプションの組が許容タプル表のいずれかに一致する必要があり、禁止ルールでは指定された禁止タプル表のいずれにも一致してはなりません。すべてのルールを満たす最安の部品構成を求めてください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `componentCosts` | `number[][]` | 各部品 `c` の選択肢 `opt` ごとの整数コスト `componentCosts[c][opt]`（千円） |
| `allowedRules` | `TableRule[]` | 指定部品列 `vars` の選択値が `tuples` 内のいずれかの組み合わせに一致することを要求する正のテーブル制約 |
| `forbiddenRules` | `TableRule[]` | 指定部品列 `vars` の選択値が `tuples` 内のいずれの組み合わせにも一致しないことを要求する負のテーブル制約 |

各 `TableRule` は `{ vars: number[], tuples: number[][] }` の形式で、`vars` は 0 始まりの部品インデックス配列、`tuples` の各要素は `vars` と同じ長さのオプション番号配列です。

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `choices` | `number[]` | 各部品の選択オプション番号（`0` 〜 `componentCosts[c].length - 1`） |
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

選択 [0, 1, 1] では、部品 (0, 1) の選択タプル (0, 1) が `allowedRules[0]` に含まれ、部品 (1, 2) の選択タプル (1, 1) が禁止タプル (1, 0)・(0, 0) を回避しており、総コストは $10 + 18 + 14 =$ **42** 千円です。

<!-- section:hint1 -->
各部品に対して利用可能なオプション番号を値域とする整数決定変数を 1 つずつ定義します。正の互換性ルールと負の禁止ルールの両方を対象部品の変数タプルに対するテーブル制約として表現し、選択されたオプションコストの合計を最小化します。

<!-- section:hint2 -->
各ルールの `rule.vars` を対応する部品変数配列 `vars` へ写像したうえで、`input.allowedRules` には `allowed(vars, rule.tuples)`、`input.forbiddenRules` には `not(allowed(vars, rule.tuples))` を適用します。各部品のコストは `at(input.componentCosts[c], choices[c])` で参照し、その `sum(...)` を最小化して `solver: "pumpkin"` で解いてください。
