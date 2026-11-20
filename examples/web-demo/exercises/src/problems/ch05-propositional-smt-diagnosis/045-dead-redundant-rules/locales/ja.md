# #045. デッドルール・冗長ルールの検出

<!-- section:scenario -->
規模の大きいルールベースには、条件部が決して満たされないデッドルールや、先行するルールの帰結としてすでに成り立つ冗長ルールが混入しがちです。

基本ルールと先行ルールを順次蓄積した文脈のもとで各ルールを先頭から順に検査し、発動条件が充足不能なルールをデッドルール、それ以外で含意が先行ルールからすでに導かれるルールを冗長ルールとして検出し、両方の ID リストを辞書順に返してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `vars` | `string[]` | 真偽値変数名の一覧 |
| `baseRules` | `PropFormula[]` | 常に成り立つ基本制約ルール |
| `rules` | `Array<{ id: string; condition: PropFormula; effect: PropFormula }>` | 順序付きの条件・帰結ルール一覧 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `deadRules` | `string[]` | 発動条件が充足不能なルール ID の配列（辞書順） |
| `redundantRules` | `string[]` | デッドでなく先行ルールから含意されるルール ID の配列（辞書順） |

<!-- section:example -->
**入力例**

```json
{
  "vars": ["guest", "admin", "mfa", "audit"],
  "baseRules": [
    { "implies": ["guest", { "not": "admin" }] },
    { "implies": ["admin", "mfa"] }
  ],
  "rules": [
    { "id": "R1", "condition": "admin", "effect": "audit" },
    { "id": "R2", "condition": { "and": ["guest", "admin"] }, "effect": "audit" },
    { "id": "R3", "condition": "admin", "effect": { "and": ["mfa", "audit"] } }
  ]
}
```

**出力例**

```json
{
  "deadRules": ["R2"],
  "redundantRules": ["R3"]
}
```

基本ルール `guest => not(admin)` により `R2` は発火不能（デッド）であり、`admin => mfa` と `R1`（`admin => audit`）から `R3` の帰結が常に従うため `R3` は冗長です。
