# #041. ゼブラパズル（ロジックグリッド）

<!-- section:scenario -->
左から右へ並んだ各位置に対して、属性を割り当てるロジックパズルです。

割り当ては次の条件をすべて満たす必要があります。
- **各位置への割り当て**: すべての位置に、各カテゴリからちょうど 1 つずつ属性値を割り当てる
- **値の重複禁止**: 同じカテゴリ内の各値は、ちょうど 1 つの位置にだけ現れる
- **ヒントの充足**: 与えられたヒント（特定位置の指定、同じ位置、含意、同じ位置の禁止、左右・隣接の位置関係）をすべて満たす

位置数、カテゴリごとの値リスト、ヒント一覧が与えられたとき、すべての条件を満たす割り当てが存在するかを判定し、充足可能なら完全な割り当てを 1 つ返してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `n` | `number` | 位置の数（左から右へ 0 から `n - 1`） |
| `categories` | `Record<string, string[]>` | カテゴリ名から `n` 個の相異なる属性値配列へのマップ |
| `clues` | `ZebraClue[]` | 構造化ヒント（`at`, `same`, `implies`, `notTogether`, `leftOf`, `nextTo`） |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `satisfiable` | `boolean` | すべてのヒントを満たす割り当てが存在すれば `true`、そうでなければ `false` |
| `assignment` | `Array<Record<string, string>>` or `null` | 各位置のカテゴリ別割り当てを表す長さ `n` の配列（充足不能なら `null`） |

<!-- section:example -->
**入力**

```json
{
  "n": 3,
  "categories": {
    "color": ["red", "blue", "green"],
    "pet": ["cat", "dog", "bird"],
    "drink": ["tea", "coffee", "water"]
  },
  "clues": [
    { "type": "at", "position": 0, "category": "color", "value": "red" },
    { "type": "same", "a": ["color", "red"], "b": ["drink", "tea"] },
    { "type": "leftOf", "left": ["color", "green"], "right": ["color", "blue"], "immediate": true },
    { "type": "implies", "a": ["color", "blue"], "b": ["pet", "dog"] },
    { "type": "nextTo", "a": ["pet", "cat"], "b": ["drink", "water"] },
    { "type": "notTogether", "a": ["color", "green"], "b": ["drink", "coffee"] }
  ]
}
```

**出力**

```json
{
  "satisfiable": true,
  "assignment": [
    { "color": "red", "pet": "cat", "drink": "tea" },
    { "color": "green", "pet": "bird", "drink": "water" },
    { "color": "blue", "pet": "dog", "drink": "coffee" }
  ]
}
```

位置 0 が red/cat/tea、位置 1 が green/bird/water、位置 2 が blue/dog/coffee となり、各カテゴリ・位置への重複ない割り当てとすべての位置ヒントを満たします。


<!-- section:hint1 -->
「ある位置にあるカテゴリの特定の値が割り当てられるか」を表す Boolean 決定変数を用意します。各位置・各カテゴリで値が1つだけ選ばれる制約と、各値が1つの位置にだけ現れる制約を課し、各ヒントを位置ごとの論理関係へ変換してください。

<!-- section:hint2 -->
`m.bool(...)` で Boolean 変数を宣言し、`or(...)`（少なくとも1つ）とペアごとの `not(and(...))`（高々1つ）で exact-one 制約を記述します。`same`・`implies`・`leftOf`・`nextTo` には `implies(...)` を使い、`await m.check({ solver: "z3" })` で `"Sat"` を判定してください。
