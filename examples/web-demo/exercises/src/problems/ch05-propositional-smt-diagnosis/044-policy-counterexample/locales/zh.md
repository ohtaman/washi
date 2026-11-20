# #044. 安全策略反例搜索 (SMT)

<!-- section:scenario -->
安全策略引擎在布尔属性标志与有界整数属性上定义了一组访问规则，并要求所有合规状态都必须满足给定的安全不变量。

请使用反驳验证思路：将全部策略规则与安全不变量的逻辑否定联合加入 SMT 约束。若可满足，则返回破坏不变量的具体反例状态；若不可满足，则证明策略完全安全。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `boolVars` | `string[]` | 布尔属性名列表 |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | 有界整数属性声明 |
| `rules` | `SmtFormula[]` | 现行防火墙/安全策略规则 |
| `safeInvariant` | `SmtFormula` | 待证明或证伪的安全不变量 |

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
