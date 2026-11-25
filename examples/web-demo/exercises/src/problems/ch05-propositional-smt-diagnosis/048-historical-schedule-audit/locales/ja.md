# #048. 実績割当データのルール監査（m.verify）

<!-- section:scenario -->
新しい運用規則を適用する前や過去のインシデント調査では、夜勤シフトの配置、作業員数、残業時間、本番デプロイの記録といった過去の実績ログが、形式的な真偽値・整数制約を満たしているかを監査する必要があります。

真偽値変数・有界整数変数・名前付きコンプライアンスルールと過去の実績割当データを受け取り、ソルバーによる探索を行わずに決定的に監査を実行して、全ルール適合の真偽と違反したルール ID の一覧（辞書順）を返してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `boolVars` | `string[]` | 真偽値変数名の一覧 |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | 有界整数変数の定義 |
| `rules` | `Array<{ id: string; expr: SmtFormula }>` | 名前付きコンプライアンスルール一覧 |
| `candidateValues` | `Record<string, StateValue>` | 監査対象となる過去の実績値マップ |

`SmtFormula` は真偽値変数名（`string`）、線形整数比較（`SmtCmp`）、論理結合子からなる再帰的な直和型です:
```ts
type StateValue = boolean | number;
type SmtCmp = { terms: Record<string, number>; sense: "<=" | ">=" | "==" | "!="; rhs: number };
type SmtFormula =
  | string
  | { not: SmtFormula }
  | { and: SmtFormula[] }
  | { or: SmtFormula[] }
  | { implies: [SmtFormula, SmtFormula] }
  | { xor: SmtFormula[] }
  | SmtCmp;
```

文字列（`string`）の葉は `boolVars` の真偽値変数を参照し、`SmtCmp` は `intVars` 上の線形和 $\sum_k c_k v_k \mathrel{\text{sense}} \text{rhs}$（`terms` が変数 $v_k$ と係数 $c_k$ の対応）を評価します。また `implies: [a, b]` は $a \implies b$ を表し、`xor` は真となる部分式が奇数個のとき成立します。

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


<!-- section:hint1 -->
真偽値変数と有界整数変数をモデルに宣言し、各コンプライアンスルールをルール ID を名前として登録することで、違反ルールを名前で特定できるようにします。その後、ソルバーを実行せずに実績値マップをモデルに対して直接検証します。

<!-- section:hint2 -->
`m.bool(input.boolVars)`、`m.integer(spec.name, { lb: spec.lb, ub: spec.ub })`、および `m.constraint(compileSmt(r.expr, bools, ints), r.id)` を使います。`m.verify({ values: input.candidateValues })`（同期呼び出しで Z3 探索は不要）を実行し、`report.violations` から重複を除いた `v.name` を辞書順にソートして返してください。
