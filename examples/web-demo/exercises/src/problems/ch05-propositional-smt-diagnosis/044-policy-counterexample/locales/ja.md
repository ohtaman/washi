# #044. セキュリティポリシーの反例探索（SMT）

<!-- section:scenario -->
セキュリティポリシーエンジンでは、真偽値フラグと有界整数属性に関する運用ルール群に加えて、すべての許可状態が必ず満たすべき安全不変条件が定められています。

反駁による形式検証として、すべてのポリシールールと安全不変条件の否定を同時に制約してください。充足可能であれば不変条件を破る具体的な反例状態を返し、充足不能であれば安全性が証明されたことを報告してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `boolVars` | `string[]` | 真偽値属性の名前一覧 |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | 有界整数属性の定義 |
| `rules` | `SmtFormula[]` | 適用中のポリシールール一覧 |
| `safeInvariant` | `SmtFormula` | 検証対象の安全不変条件 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `hasViolation` | `boolean` | 反例状態が存在すれば `true`、安全が証明されれば `false` |
| `counterexample` | `Record<string, boolean / number>` または `null` | 具体的な違反状態の値（安全な場合は `null`） |

<!-- section:example -->
**入力例**

```json
{
  "boolVars": ["isAdmin", "mfaVerified", "external", "allowSsh"],
  "intVars": [{ "name": "portTier", "lb": 1, "ub": 4 }],
  "rules": [
    { "implies": ["allowSsh", { "terms": { "portTier": 1 }, "sense": "==", "rhs": 1 }] },
    { "implies": [{ "and": ["external", { "terms": { "portTier": 1 }, "sense": "==", "rhs": 1 }] }, "allowSsh"] },
    { "implies": [{ "and": ["isAdmin", "mfaVerified"] }, "allowSsh"] }
  ],
  "safeInvariant": { "implies": [{ "and": ["allowSsh", "external"] }, "mfaVerified"] }
}
```

**出力例**

```json
{
  "hasViolation": true,
  "counterexample": {
    "isAdmin": false,
    "mfaVerified": false,
    "external": true,
    "allowSsh": true,
    "portTier": 1
  }
}
```

`portTier = 1` かつ `external = true` から全ポリシールールに従って `allowSsh = true` が導かれる一方、`mfaVerified = false` のため `safeInvariant` に違反しています。
