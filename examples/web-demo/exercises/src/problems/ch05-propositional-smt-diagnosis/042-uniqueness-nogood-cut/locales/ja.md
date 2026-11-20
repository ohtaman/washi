# #042. No-Good カットによる解の一意性判定

<!-- section:scenario -->
充足解が 1 つ見つかるとルール体系の無矛盾性が示せますが、設定検証や論理パズルの解析では「その解がただ 1 つに定まるか（一意性）」を確認することがしばしば求められます。

真偽値変数と命題ルールが与えられたとき、まず充足解が存在するかを判定し、存在する場合はそれが唯一の充足解であるか（一意性）も判定して報告してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `vars` | `string[]` | 真偽値変数名の一覧 |
| `rules` | `PropFormula[]` | 命題論理ルールのリスト |

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
