# #041. ゼブラパズル（ロジックグリッド）

<!-- section:scenario -->
左から右へ並んだ各位置に対して、属性（家の色・ペット・飲み物など）を割り当てるロジックパズルです。

割当は次の条件をすべて満たす必要があります。
- **各位置への割当**: すべての位置に、各カテゴリからちょうど 1 つずつ属性値を割り当てる
- **値の重複禁止**: 同じカテゴリ内の各値は、ちょうど 1 つの位置にだけ現れる
- **ヒントの充足**: 与えられたヒント（特定位置の指定、同じ位置、含意、同じ位置の禁止、左右・隣接の位置関係）をすべて満たす

位置数、カテゴリごとの値リスト、ヒント一覧が与えられたとき、すべての条件を満たす割当が存在するかを判定し、充足可能なら完全な割当を 1 つ返してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `n` | `number` | 位置の数（左から右へ 0 から `n - 1`） |
| `categories` | `Record<string, string[]>` | カテゴリ名から `n` 個の相異なる属性値配列へのマップ |
| `clues` | `ZebraClue[]` | 構造化ヒント（`at`, `same`, `implies`, `notTogether`, `leftOf`, `nextTo`） |

`CategoryValue` を `[category: string, value: string]` として、各 `ZebraClue` は以下のいずれかです:
- `{ type: "at", position: number, category: string, value: string }`（0 始まりの位置 `position` に `category` の `value` を置く）
- `{ type: "same", a: CategoryValue, b: CategoryValue }`（`a` と `b` が同じ位置にある）
- `{ type: "implies", a: CategoryValue, b: CategoryValue }`（`a` が置かれた位置には `b` も置かれる）
- `{ type: "notTogether", a: CategoryValue, b: CategoryValue }`（`a` と `b` は同じ位置には置かれない）
- `{ type: "leftOf", left: CategoryValue, right: CategoryValue, immediate?: boolean }`（`immediate: true` なら `pos(right) === pos(left) + 1`、それ以外・既定 `false` なら `pos(left) < pos(right)`）
- `{ type: "nextTo", a: CategoryValue, b: CategoryValue }`（`|pos(a) - pos(b)| === 1`）

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `satisfiable` | `boolean` | すべてのヒントを満たす割当が存在すれば `true`、そうでなければ `false` |
| `assignment` | `Array<Record<string, string>>` または `null` | 各位置のカテゴリ別割当を表す長さ `n` の配列（充足不能なら `null`） |

<!-- section:example -->
**入力例**

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

**出力例**

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

位置 0 が red/cat/tea、位置 1 が green/bird/water、位置 2 が blue/dog/coffee となり、各カテゴリ・位置への重複ない割当とすべてのヒントを満たします。


<!-- section:hint1 -->
「ある位置にあるカテゴリの特定の値が割り当てられるか」を表す Boolean 決定変数を用意します。各位置・各カテゴリで値が1つだけ選ばれる制約と、各値が1つの位置にだけ現れる制約を課し、各ヒントを位置ごとの論理関係へ変換してください。

<!-- section:hint2 -->
`m.bool(...)` で Boolean 変数を宣言し、`or(...)`（少なくとも 1 つ）とペアごとの `not(and(...))`（高々 1 つ）でちょうど 1 つ（exact-one）制約を記述します。`same`・`implies`・`leftOf`・`nextTo` には `implies(...)` を使い、`await m.check({ solver: "z3" })` で `"Sat"` を判定してください。
