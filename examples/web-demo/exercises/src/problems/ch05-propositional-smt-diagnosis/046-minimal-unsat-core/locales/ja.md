# #046. 極小充足不能コア（MUS）の抽出

<!-- section:scenario -->
名前付きルールの集合が充足不能（Unsat）であるとき、ソルバーが最初に返す矛盾コアには矛盾の本質に不要な余剰ルールが含まれていることがあります。

Z3 の unsatCore から開始して削除縮約（deletion-based contraction）を適用し、それ自体が充足不能であり、かつどの 1 ルールを取り除いても充足可能になる極小充足不能部分集合（MUS）を抽出してください。

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
