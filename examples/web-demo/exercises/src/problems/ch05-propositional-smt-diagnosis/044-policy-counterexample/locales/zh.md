# #044. 安全策略反例搜索 (SMT)

<!-- section:scenario -->
安全策略引擎在布尔属性标志与有界整数属性上定义了一组访问规则，并要求所有合规状态都必须满足给定的安全不变量。

请判断是否存在同时满足全部策略规则却违反安全不变量的状态。若存在，则返回具体的反例状态；若不存在，则确认策略无违规。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `boolVars` | `string[]` | 布尔属性名列表 |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | 有界整数属性声明 |
| `rules` | `SmtFormula[]` | 现行防火墙/安全策略规则 |
| `safeInvariant` | `SmtFormula` | 待证明或证伪的安全不变量 |

`SmtFormula` 是由布尔变量名（`string`）、线性整数比较（`SmtCmp`）及逻辑连接词组成的递归联合类型：
```ts
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

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `hasViolation` | `boolean` | 存在违规反例时为 `true`，证明安全时为 `false` |
| `counterexample` | `Record<string, boolean / number>` 或 `null` | 具体违规属性取值，安全时为 `null` |

<!-- section:example -->
**输入示例**

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

**输出示例**

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

该状态满足全部策略规则（`portTier = 1` 且 `external = true` 触发 `allowSsh = true`），却因 `mfaVerified = false` 违反了 `safeInvariant`。


<!-- section:hint1 -->
为 `boolVars` 中的每个条目声明布尔变量，为 `intVars` 中的每个条目声明有界整数变量，并使用 `compileSmt` 编译策略规则。要搜索反例，需向求解器询问是否存在满足所有策略规则但使安全不变量为假的状态。

<!-- section:hint2 -->
使用 `m.bool(input.boolVars)` 与 `m.integer(spec.name, { lb: spec.lb, ub: spec.ub })` 声明变量，加入 `input.rules` 中的所有规则并断言 `not(compileSmt(input.safeInvariant, bools, ints))`。调用 `await m.check({ solver: "z3" })`：若返回 `"Sat"`，则通过 `.value` 读取反例（整数用 `Math.round` 取整）；若返回 `"Unsat"`，则证明不变量恒成立。
