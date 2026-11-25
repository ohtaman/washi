# #045. 死规则与冗余规则检测

<!-- section:scenario -->
在维护和审计访问控制或业务审批等规则库时，需要识别触发条件永远无法满足的死规则，以及其结论已由先前规则保证的冗余规则。

每条触发规则表示「`condition` 蕴含 `effect`」。请在基础规则与排在前面的所有规则构成的累积上下文中按顺序逐条检查规则：若触发条件不可满足，则归为死规则；否则若该蕴含式在累积上下文中恒成立，则归为冗余规则，并将两类规则 ID 列表按字典序返回。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `vars` | `string[]` | 布尔变量名列表 |
| `baseRules` | `PropFormula[]` | 全局生效的基础背景规则 |
| `rules` | `Array<{ id: string; condition: PropFormula; effect: PropFormula }>` | 有序的条件-结论规则列表 |

`PropFormula` 为递归联合类型：
```ts
type PropFormula =
  | string
  | { not: PropFormula }
  | { and: PropFormula[] }
  | { or: PropFormula[] }
  | { implies: [PropFormula, PropFormula] }
  | { xor: PropFormula[] };
```
裸字符串（`string`）引用 `vars` 中的布尔变量，`{ implies: [p, q] }` 表示 $p \to q$，`{ xor: [...] }` 在奇数个操作数为真时成立。

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `deadRules` | `string[]` | 触发条件不可满足的死规则 ID（按字典序） |
| `redundantRules` | `string[]` | 非死规则但已被先前规则蕴含的冗余规则 ID（按字典序） |

<!-- section:example -->
**输入示例**

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

**输出示例**

```json
{
  "deadRules": ["R2"],
  "redundantRules": ["R3"]
}
```

由于基础规则包含 `guest => not(admin)`，`R2` 永不触发（死规则）；而 `admin => mfa` 与 `R1`（`admin => audit`）联合已推出 `R3` 的结论，故 `R3` 为冗余规则。


<!-- section:hint1 -->
按顺序处理 `input.rules`，维护由 `baseRules` 和此前所有触发规则的蕴含式组成的累积策略。对每条规则，先检验其触发条件在累积策略下是否可达；若可达，再检验当触发条件成立时其结论是否可能不成立。

<!-- section:hint2 -->
每次执行 Z3 检查（`await m.check({ solver: "z3" })`）时都创建一个带 `m.bool(input.vars)` 的新 `Model`，并通过 `compileFormula` 将待检列表中的每个 `PropFormula` 编译为约束。若 `prior` 加上 `r.condition` 返回 `"Unsat"` 则为死规则；否则若 `prior`、`r.condition` 与 `{ not: r.effect }` 联合返回 `"Unsat"` 则为冗余规则。进入下一条规则前始终将 `{ implies: [r.condition, r.effect] }` 追加到 `prior`，并将两个输出数组按字典序排序返回。
