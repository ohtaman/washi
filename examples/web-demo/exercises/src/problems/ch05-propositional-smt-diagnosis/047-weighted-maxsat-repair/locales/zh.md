# #047. 加权 MaxSAT 策略修复

<!-- section:scenario -->
在生产服务器配置管理（如启用 TLS 加密、遗留 API、高速模式、审计日志等）中，安全上绝对不可违反的强制规则（硬规则）与便利性或运维方针相关的期望条件（软规则）可能会发生冲突。

给定配置项的布尔变量、必须满足的硬规则以及带有违背惩罚权重的软规则，请寻找一组满足全部硬规则且使被违背软规则总惩罚权重最小的配置赋值。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `vars` | `string[]` | 布尔变量名列表 |
| `hardRules` | `PropFormula[]` | 必须全部成立的硬规则列表 |
| `softRules` | `Array<{ id: string; weight: number; expr: PropFormula }>` | 带非负违背惩罚权重（`weight >= 0`）的软规则列表 |

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

裸字符串（`string`）引用 `vars` 中的布尔变量，`implies: [p, q]` 表示 $p \implies q$，`xor` 当且仅当其操作数中有奇数个为真时成立。

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `assignment` | `Record<string, boolean>` | 满足全部硬规则的布尔赋值 |
| `violatedRules` | `string[]` | 在 `assignment` 下违背的软规则 ID（按字典序） |
| `totalPenalty` | `number` | 最小化的违背软规则权重总和 |

<!-- section:example -->
**输入示例**

```json
{
  "vars": ["tls", "legacyApi", "fastMode", "audit"],
  "hardRules": [
    { "implies": ["fastMode", "legacyApi"] },
    { "not": { "and": ["tls", "legacyApi"] } }
  ],
  "softRules": [
    { "id": "S1", "weight": 5, "expr": "tls" },
    { "id": "S2", "weight": 2, "expr": "fastMode" },
    { "id": "S3", "weight": 4, "expr": { "implies": ["tls", "audit"] } }
  ]
}
```

**输出示例**

```json
{
  "assignment": {
    "tls": true,
    "legacyApi": false,
    "fastMode": false,
    "audit": true
  },
  "violatedRules": ["S2"],
  "totalPenalty": 2
}
```

令 `tls = true, legacyApi = false, fastMode = false, audit = true` 满足全部硬规则，仅违背 `S2`，总惩罚权重为 2。


<!-- section:hint1 -->
为 `vars` 声明布尔变量来表示系统状态，并为每条软规则配对一个二元松弛指示变量，当该软规则被允许违反时取 1。无条件强制所有硬规则，并最小化松弛指示变量的加权和。

<!-- section:hint2 -->
声明 `m.bool(input.vars)` 以及每条软规则 `k` 对应的 `m.binary(...)` 指示变量 `viol[k]`，并用 ``or(softExpr, expr`${viol[k]} == 1`)`` 保护每条软规则——在正权重下通过 `minimize(dot(weights, viol))` 与 `await m.solve({ solver: "z3" })` 求解时，只要软规则能够成立，就会自然保持 `viol[k] = 0`。
