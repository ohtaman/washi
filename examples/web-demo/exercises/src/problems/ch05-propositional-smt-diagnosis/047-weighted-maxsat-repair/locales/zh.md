# #047. 加权 MaxSAT 策略修复

<!-- section:scenario -->
当运营偏好与强制不变量发生冲突时，系统必须在严格满足所有硬规则的前提下，仅放松总代价最小的软规则子集。

给定布尔变量、必须满足的硬规则以及带有惩罚权重的软规则，请寻找一组满足全部硬规则且使被违背软规则总权重最小的布尔赋值。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `vars` | `string[]` | 布尔变量名列表 |
| `hardRules` | `PropFormula[]` | 必须全部成立的硬规则列表 |
| `softRules` | `Array<{ id: string; weight: number; expr: PropFormula }>` | 带违背惩罚权重的软规则列表 |

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

令 `tls = true, legacyApi = false, fastMode = false, audit = true` 满足全部硬规则，仅违背 `S2`，总惩罚权重为 `2`（优于违背 `S1` 的权重 `5`）。
