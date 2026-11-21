# #046. 極小充足不能コア（MUS）の抽出

<!-- section:scenario -->
名前付きルールの集合が充足不能（Unsat）であるとき、ソルバーが最初に返す矛盾コアには矛盾の本質に不要な余剰ルールが含まれていることがあります。

それ自体が充足不能であり、かつどの 1 ルールを取り除いても残りが充足可能になる極小充足不能部分集合（MUS）を抽出し、そのルール ID 一覧を辞書順にソートして返してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `boolVars` | `string[]` | 真偽値変数名の一覧 |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | 有界整数変数の定義 |
| `rules` | `Array<{ id: string; expr: SmtFormula }>` | 矛盾を含む名前付きルール一覧 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `coreRules` | `string[]` | 極小充足不能部分集合となるルール ID 一覧（辞書順） |

<!-- section:example -->
**入力例**

```json
{
  "boolVars": ["a", "b", "c", "d"],
  "intVars": [],
  "rules": [
    { "id": "R1", "expr": "a" },
    { "id": "R2", "expr": { "implies": ["a", "b"] } },
    { "id": "R3", "expr": { "implies": ["a", "c"] } },
    { "id": "R4", "expr": { "not": "b" } },
    { "id": "R5", "expr": { "or": ["c", "d"] } },
    { "id": "R6", "expr": { "implies": ["c", "d"] } }
  ]
}
```

**出力例**

```json
{
  "coreRules": ["R1", "R2", "R4"]
}
```

`{ R1, R2, R4 }` は充足不能（`a = true`、`a => b`、`not(b)`）であり、3 本のうちいずれか 1 本でも除くと残りは充足可能になります。


<!-- section:hint1 -->
ソルバーが返す元の矛盾コアなどを候補部分集合として開始し、各ルールが不可欠かどうかを順に調べます。あるルールを除いても残りの部分集合がなお充足不能であれば、そのルールを恒久的に取り除きます。

<!-- section:hint2 -->
各ルールをその ID で名前付き制約として登録する（`m.constraint(compileSmt(r.expr, bools, ints), r.id)`）と、`"Unsat"` 時に `await m.check({ solver: "z3" })` が `res.unsatCore` を返します。削除縮約では `ruleId` を除いた候補部分集合ごとに新しい `Model` を組んで検査し、依然 `"Unsat"` なら候補を `res.unsatCore` に縮める（または `ruleId` を除く）操作を繰り返し、最後に `coreRules` を辞書順でソートします。
