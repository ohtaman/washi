# #050. 矛盾診断と最小コスト修復

<!-- section:scenario -->
企業のポリシーガバナンス基盤では、真偽値と有界整数の状態変数（本番稼働、MFA、レガシー互換モード、監査ログ、サービスティアなど）に対して、変更できないハードルールと、違反時の重みが付いたソフトルール（希望条件）が定義されています。`hardRules` は常に同時充足可能（ソフトルールの緩和による修復解が必ず存在する）であり、ルール ID は `hardRules` と `softRules` を通じて一意です。

次の手順で診断と修復を行ってください。
- **整合性の判定**: まず、すべてのハードルールとソフトルールを同時に満たせるかを判定する
- **矛盾がない場合**: 空配列と修復コスト 0、および全ルールを満たす割当を返す
- **矛盾がある場合**: 全ルールから極小充足不能コア（MUS）を抽出したうえで、すべてのハードルールと残りのソフトルールを満たす、緩和コスト最小の修復案（緩和するソフトルールの一覧と修正後の割当）を求める

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `boolVars` | `string[]` | 真偽値属性名の一覧 |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | 有界整数変数の定義 |
| `hardRules` | `Array<{ id: string; expr: SmtFormula }>` | 緩和不可の必須ハードルール一覧 |
| `softRules` | `Array<{ id: string; weight: number; expr: SmtFormula }>` | 緩和コスト `weight` 付きのソフトルール一覧 |

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
| `consistent` | `boolean` | ハードルールとソフトルール全体が同時に充足可能なら `true` |
| `minimalCore` | `string[]` | 矛盾時の極小充足不能コア（MUS）の ID 一覧（辞書順、整合時は `[]`） |
| `relaxedRules` | `string[]` | 緩和されたソフトルール ID 一覧（辞書順、整合時は `[]`） |
| `repairCost` | `number` | 緩和されたソフトルール重みの最小合計 |
| `repairedAssignment` | `Record<string, StateValue>` | 全ハードルールと残存ソフトルールを満たす修復後割当 |

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

`{ H1, H2, S1, S2 }` が極小充足不能コア（MUS）を構成しており、ソフトルール `S2`（重み 2）を緩和すると `repairCost = 2` となり、`prod = mfa = audit = true, legacy = false, tier = 2` ですべてのハードルールと残りのソフトルールを満たします。


<!-- section:hint1 -->
同じ真偽値変数・有界整数変数のうえで 3 段階の処理を組みます。(1) まずハードルールとソフトルールの全集合が同時に充足可能かを判定し、(2) 充足不能であれば全名前付きルールから極小充足不能コア（MUS）を抽出し、(3) 別モデルで重み付きソフトルール緩和問題を解いて最小コストの修復案を求めます。

<!-- section:hint2 -->
整合性判定と MUS 抽出では、すべてのハードルール・ソフトルールをそれぞれの `id` で名前付き制約として登録し、`await m.check({ solver: "z3" })` と `res.unsatCore` を使った削除縮約を行います。最小重み修復では、ハードルールを無条件で課したうえで各ソフトルールに二値緩和指示変数 `viol[k]` を ``or(softExpr, expr`${viol[k]} == 1`)`` で結びつけ、`minimize(dot(weights, viol))` を `await m.solve({ solver: "z3" })` で解いてください。
