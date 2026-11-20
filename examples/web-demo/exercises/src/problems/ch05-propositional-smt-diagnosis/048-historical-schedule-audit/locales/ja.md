# #048. 実績割当データのルール監査（m.verify）

<!-- section:scenario -->
新しい運用規則を適用する前や過去のインシデント調査では、ソルバーによる探索を行うのではなく、記録された過去の実績データが形式制約を満たしているかを決定的に監査する必要があります。

真偽値変数・有界整数変数・名前付きルールからなるモデルを構築し、与えられた実績値マップに対して検証を実行して、全ルール適合の真偽と違反したルール ID の一覧（辞書順）を返してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `boolVars` | `string[]` | 真偽値変数名の一覧 |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | 有界整数変数の定義 |
| `rules` | `Array<{ id: string; expr: SmtFormula }>` | 名前付きコンプライアンスルール一覧 |
| `candidateValues` | `Record<string, boolean / number>` | 監査対象となる過去の実績値マップ |

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `valid` | `boolean` | すべてのルールが満たされていれば `true` |
| `violatedRules` | `string[]` | 違反したすべてのルール ID（辞書順） |

<!-- section:example -->
**入力例**

```json
{
  "boolVars": ["nightShift", "seniorOnDuty", "hazardFlag"],
  "intVars": [
    { "name": "crewCount", "lb": 1, "ub": 10 },
    { "name": "overtimeHours", "lb": 0, "ub": 12 }
  ],
  "rules": [
    { "id": "R1", "expr": { "implies": ["nightShift", "seniorOnDuty"] } },
    { "id": "R2", "expr": { "implies": ["hazardFlag", { "terms": { "crewCount": 1 }, "sense": ">=", "rhs": 4 }] } },
    { "id": "R3", "expr": { "terms": { "overtimeHours": 1 }, "sense": "<=", "rhs": 4 } }
  ],
  "candidateValues": {
    "nightShift": true,
    "seniorOnDuty": true,
    "hazardFlag": false,
    "crewCount": 3,
    "overtimeHours": 2
  }
}
```

**出力例**

```json
{
  "valid": true,
  "violatedRules": []
}
```

`candidateValues` に対して `R1`（`nightShift` と `seniorOnDuty` がともに `true`）、`R2`（`hazardFlag = false` で真）、`R3`（`overtimeHours = 2 <= 4`）のすべてが成立しています。
