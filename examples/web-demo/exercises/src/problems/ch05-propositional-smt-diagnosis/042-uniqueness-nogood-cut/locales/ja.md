# #042. No-Good カットによる解の一意性判定

<!-- section:scenario -->
セキュリティ設定や機能フラグ（認証方式・暗号化・監査ログの有効化など）の運用ルールでは、条件を満たす設定が単に 1 つ見つかるだけでなく、意図しない別解が残らないか（設定がただ 1 つに定まるか）を検証する必要があります。

システム管理者が設定検証を行う場面を想定し、真偽値変数と命題論理ルールのリストが与えられたとき、まず充足解が存在するかを判定し、存在する場合はそれが唯一の充足解であるか（一意性）も判定して報告してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `vars` | `string[]` | 真偽値変数名の一覧 |
| `rules` | `PropFormula[]` | 命題論理ルールのリスト |

`PropFormula` は再帰的な直和型です:
```ts
type PropFormula =
  | string
  | { not: PropFormula }
  | { and: PropFormula[] }
  | { or: PropFormula[] }
  | { implies: [PropFormula, PropFormula] }
  | { xor: PropFormula[] };
```

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `satisfiable` | `boolean` | 充足解が 1 つ以上存在すれば `true` |
| `assignment` | `Record<string, boolean>` または `null` | 見つかった充足解（充足不能なら `null`） |
| `unique` | `boolean` | 充足解がちょうど 1 つだけ存在するとき `true` |

<!-- section:example -->
**入力例**

```json
{
  "vars": ["a", "b", "c", "d"],
  "rules": [
    "a",
    { "implies": ["a", "b"] },
    { "xor": ["b", "c"] },
    { "implies": [{ "and": ["a", { "not": "c" }] }, "d"] }
  ]
}
```

**出力例**

```json
{
  "satisfiable": true,
  "assignment": {
    "a": true,
    "b": true,
    "c": false,
    "d": true
  },
  "unique": true
}
```

割当 `a = true, b = true, c = false, d = true` を各ルールに代入すると 4 本すべてが成り立ち、さらに `["a", "b", "c", "d"]` の他の真理値割当はいずれも全ルールを同時に満たさないため、`satisfiable: true` かつ `unique: true` となります。


<!-- section:hint1 -->
`vars` の各要素に対して真偽値変数を宣言し、すべてのルールをモデルに追加します。まず 1 回解いて充足割当を探し、見つかった場合はその真理値ベクトルを禁止して別の解が残るかを再確認します。

<!-- section:hint2 -->
`m.bool(input.vars)` と `await m.check({ solver: "z3" })` で最初の充足可能性を判定します。見つかった割当 `a` を排除するには、各変数 `v` について `a[v]` が真なら `not(bools[v])`、偽なら `bools[v]` を並べた `or(...)` による禁止節（no-good cut）を追加し、再度 `m.check({ solver: "z3" })` を実行して `"Unsat"` なら一意（`unique = true`）と判定します。
