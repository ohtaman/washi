# #045. 死规则与冗余规则检测

<!-- section:scenario -->
大型策略规则库常常积累大量无法触发的死规则以及已被先前规则完全蕴含的冗余规则。

请在基础规则与此前已激活规则构成的累积上下文中按顺序逐条检查规则：若触发条件不可满足，则归为死规则；否则若该蕴含式在累积上下文中恒成立，则归为冗余规则，并将两类规则 ID 列表按字典序返回。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `vars` | `string[]` | 布尔变量名列表 |
| `baseRules` | `PropFormula[]` | 全局生效的基础背景规则 |
| `rules` | `Array<{ id: string; condition: PropFormula; effect: PropFormula }>` | 有序的条件-结论规则列表 |

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
