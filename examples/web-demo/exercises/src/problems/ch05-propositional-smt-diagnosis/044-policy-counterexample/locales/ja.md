# #044. セキュリティポリシーの反例探索（SMT）

<!-- section:scenario -->
セキュリティポリシーエンジンでは、真偽値フラグ（`isAdmin` や `mfaVerified` など）と有界整数属性（`portTier` や `clearance` など）に関する運用ルール群に加えて、すべての許可状態が必ず満たすべき安全不変条件が定められています。

すべてのポリシールールを満たしつつ安全不変条件に違反する状態が存在するかを判定してください。そのような状態が存在する場合は具体的な反例状態を返し、存在しない場合は違反がないことを報告してください。

<!-- section:io -->
### 入力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `boolVars` | `string[]` | 真偽値属性の名前一覧 |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | 有界整数属性の定義（`lb` と `ub` は両端を含む整数上下界） |
| `rules` | `SmtFormula[]` | 適用中のポリシールール一覧 |
| `safeInvariant` | `SmtFormula` | 検証対象の安全不変条件 |

`SmtFormula` は真偽値変数名（`string`）、線形整数比較（`SmtCmp`）、論理結合子からなる再帰的なユニオン型です:
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
文字列（`string`）は `boolVars` の変数参照を表し、`{ implies: [a, b] }` は $a \to b$、`{ xor: [...] }` は真となる引数が奇数個のとき真、`SmtCmp` は `terms` の各キー $k$（`intVars` の変数名）と係数 $c_k$ による線形比較 $\sum_k c_k v_k \mathrel{\text{sense}} \text{rhs}$ を表します。

### 出力

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `hasViolation` | `boolean` | 反例状態が存在すれば `true`、安全が証明されれば `false` |
| `counterexample` | `Record<string, StateValue>` または `null` | `hasViolation` が `true` のときは `boolVars` と `intVars` の全キーを含む具体的な違反状態の値、安全な場合は `null` |

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


<!-- section:hint1 -->
`boolVars` の各要素に真偽値変数、`intVars` の各要素に有界整数変数を作成し、`compileSmt` でポリシールールを変換します。反例を探すには、すべてのポリシールールを満たしつつ安全不変条件を偽にする状態が存在するかをソルバーに問い合わせます。

<!-- section:hint2 -->
`m.bool(input.boolVars)` と `m.integer(spec.name, { lb: spec.lb, ub: spec.ub })` を宣言し、`input.rules` の全ルールに加えて `not(compileSmt(input.safeInvariant, bools, ints))` を制約します。`await m.check({ solver: "z3" })` が `"Sat"` なら `.value` から反例を取得でき、`"Unsat"` なら安全不変条件が証明されます。
