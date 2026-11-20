# #050. 矛盾診断と最小コスト修復の統合合成

<!-- section:scenario -->
ガバナンス基盤では、真偽値と有界整数の状態変数に対して、変更不可のハードルール群と重み付きのソフト希望ルール群が定義されています。

まずハード・ソフト全ルールの同時充足可能性を判定してください。整合する場合は空配列・修復コストゼロで充足解を返し、矛盾する場合は全ルール中から極小充足不能コア（MUS）を抽出したうえで、全ハードルールと残存ソフトルールを満たす最小重み修復（緩和ソフトルール集合と修復後割当）を合成してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `boolVars` | `string[]` | 真偽値属性名の一覧 |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | 有界整数変数の定義 |
| `hardRules` | `Array<{ id: string; expr: SmtFormula }>` | 緩和不可の必須ハードルール一覧 |
| `softRules` | `Array<{ id: string; weight: number; expr: SmtFormula }>` | 緩和コスト `weight` 付きのソフトルール一覧 |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `consistent` | `boolean` | ハード＋ソフト全ルールが同時に充足可能なら `true` |
| `minimalCore` | `string[]` | 矛盾時の極小充足不能コア ID 一覧（整合時は `[]`） |
| `relaxedRules` | `string[]` | 緩和されたソフトルール ID 一覧（辞書順、整合時は `[]`） |
| `repairCost` | `number` | 緩和されたソフトルール重みの最小合計 |
| `repairedAssignment` | `Record<string, boolean / number>` | 全ハードルールと残存ソフトルールを満たす修復後割当 |

<!-- section:example -->
**入力例**

```json
{
  "boolVars": ["prod", "mfa", "legacy", "audit"],
  "intVars": [{ "name": "tier", "lb": 1, "ub": 3 }],
  "hardRules": [
    { "id": "H1", "expr": { "implies": ["prod", "mfa"] } },
    { "id": "H2", "expr": { "not": { "and": ["mfa", "legacy"] } } },
    { "id": "H3", "expr": { "implies": ["prod", { "terms": { "tier": 1 }, "sense": ">=", "rhs": 2 }] } }
  ],
  "softRules": [
    { "id": "S1", "weight": 6, "expr": "prod" },
    { "id": "S2", "weight": 2, "expr": "legacy" },
    { "id": "S3", "weight": 4, "expr": "audit" }
  ]
}
```

**出力例**

```json
{
  "consistent": false,
  "minimalCore": ["H1", "H2", "S1", "S2"],
  "relaxedRules": ["S2"],
  "repairCost": 2,
  "repairedAssignment": {
    "prod": true,
    "mfa": true,
    "legacy": false,
    "audit": true,
    "tier": 2
  }
}
```

`{ H1, H2, S1, S2 }` が極小矛盾コアを構成しており、最安価なソフトルール `S2`（重み `2`）を緩和することで全ハード制約と残りのソフト制約をすべて満たせます。
