# #047. 重み付き MaxSAT によるルール修復

<!-- section:scenario -->
必須の不変条件（ハードルール）と運用上の希望条件（ソフトルール）が衝突するとき、すべてのハードルールを厳守しつつ、違反するソフトルールのペナルティ重みの合計を最小限に抑える必要があります。

真偽値変数、ハードルール、および重み付きソフトルールが与えられたとき、ハードルールをすべて満たしながら違反ソフトルールの総ペナルティを最小化する真理値割当を求めてください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `vars` | `string[]` | 真偽値変数名の一覧 |
| `hardRules` | `PropFormula[]` | 必ずすべて満たすべきハードルール一覧 |
| `softRules` | `Array<{ id: string; weight: number; expr: PropFormula }>` | 違反ペナルティ重み付きのソフトルール一覧 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `assignment` | `Record<string, boolean>` | 全ハードルールを満たす真理値割当 |
| `violatedRules` | `string[]` | `assignment` のもとで違反したソフトルール ID（辞書順） |
| `totalPenalty` | `number` | 最小化された違反ソフトルール重みの合計 |

<!-- section:example -->
**入力例**

```json
{
  "vars": ["tls", "legacyApi", "fastMode", "audit"],
  "hardRules": [
    { "implies": ["fastMode", "legacyApi"] },
    { "not": { "and": ["tls", "legacyApi"] } }
  ],
  "softRules": [
    { "id": "S1", "weight": 5, "expr": "tls" },
    { "id": "S2", "weight": 2, "expr": "fastMode" },
    { "id": "S3", "weight": 4, "expr": { "implies": ["tls", "audit"] } }
  ]
}
```

**出力例**

```json
{
  "assignment": {
    "tls": true,
    "legacyApi": false,
    "fastMode": false,
    "audit": true
  },
  "violatedRules": ["S2"],
  "totalPenalty": 2
}
```

`tls = true, legacyApi = false, fastMode = false, audit = true` とすると全ハードルールを満たし、違反は `S2` のみで最小ペナルティ合計 `2` となります（`S1` を破る場合の重み `5` より小さい値です）。
