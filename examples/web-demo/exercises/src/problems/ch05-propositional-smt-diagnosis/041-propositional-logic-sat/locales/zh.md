# #041. 命题逻辑可满足性 (SAT) 与访问互锁

<!-- section:scenario -->
自动化安全闸门通过一组布尔标志位管理门禁刷卡、多因素认证、VPN 隧道以及人工旁路开关等状态。每条安全规则均由否定、合取、析取、蕴含和异或等命题逻辑算子组合而成。

给定布尔变量名列表和命题规则列表，请判断是否存在能够同时满足所有规则的真值赋值；若存在，请返回其中一组有效赋值。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `vars` | `string[]` | 系统中的布尔变量名列表 |
| `rules` | `PropFormula[]` | 由变量名及 `not`、`and`、`or`、`implies`、`xor` 构成的命题公式列表 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `satisfiable` | `boolean` | 存在可满足赋值时为 `true`，否则为 `false` |
| `assignment` | `Record<string, boolean>` 或 `null` | 每个变量的布尔赋值；不可满足时为 `null` |

<!-- section:example -->
**输入示例**

```json
{
  "vars": ["badge", "mfa", "vpn", "override"],
  "rules": [
    { "implies": ["badge", "mfa"] },
    { "xor": ["vpn", "override"] },
    { "or": ["badge", "vpn"] },
    { "not": "override" }
  ]
}
```

**输出示例**

```json
{
  "satisfiable": true,
  "assignment": {
    "badge": true,
    "mfa": true,
    "vpn": true,
    "override": false
  }
}
```

当 `override = false` 且 `vpn = true` 时，`not(override)`、`xor(vpn, override)` 与 `or(badge, vpn)` 均成立，且由 `badge = true` 蕴含 `mfa = true`。


<!-- section:hint1 -->
为 `vars` 中的每个条目创建一个布尔决策变量，并补全 `compileFormula`，将所有命题联结词映射到 WaSHI 逻辑原语。`rules` 中的每一条规则都作为模型的一条约束加入。

<!-- section:hint2 -->
使用 `m.bool(input.vars)` 声明布尔变量，在 `compileFormula` 中补全 `implies(...)` 与 `xor(...)`，然后调用 `await m.check({ solver: "z3" })` 进行无目标函数的可满足性检查。当状态为 `"Sat"` 时，从 `bools[name].value` 读取各变量真值；否则返回 `satisfiable: false` 与 `assignment: null`。
