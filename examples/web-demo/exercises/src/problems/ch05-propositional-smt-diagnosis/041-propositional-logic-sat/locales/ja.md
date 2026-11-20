# #041. 命題論理 SAT（アクセス制御パズル）

<!-- section:scenario -->
自動セキュリティゲートでは、入館バッジ、多要素認証、VPN トンネル、手動オーバーライドなどの状態を表す真偽値フラグに対して複数の命題ルールが課されています。各ルールは否定、論理積、論理和、含意、排他的論理和を組み合わせて表現されます。

真偽値変数の名前一覧と命題論理ルールのリストが与えられたとき、すべてのルールを同時に満たす真理値割当が存在するかを判定し、充足可能な場合は有効な割当を 1 つ返してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `vars` | `string[]` | システム内の真偽値変数名の一覧 |
| `rules` | `PropFormula[]` | 変数名・`not`・`and`・`or`・`implies`・`xor` からなる命題論理式 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `satisfiable` | `boolean` | すべてのルールを満たす割当が存在すれば `true`、存在しなければ `false` |
| `assignment` | `Record<string, boolean>` または `null` | 各変数の真偽値割当（充足不能の場合は `null`） |

<!-- section:example -->
**入力例**

```json
{
  "vars": ["badge", "mfa", "vpn", "override"],
  "rules": [
    { "implies": ["badge", "mfa"] },
    { "xor": ["vpn", "override"] },
    { "or": ["badge", "vpn"] },
    { "not": "override" }
  ]
}
```

**出力例**

```json
{
  "satisfiable": true,
  "assignment": {
    "badge": true,
    "mfa": true,
    "vpn": true,
    "override": false
  }
}
```

`override = false` かつ `vpn = true` とすることで `not(override)` と `xor(vpn, override)`、`or(badge, vpn)` が成り立ち、`badge = true` から `mfa = true` も満たされます。
