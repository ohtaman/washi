# #048. 历史调度记录合规审计 (m.verify)

<!-- section:scenario -->
在部署新规或复盘历史调度事件时，审计系统无需执行求解搜索，而是直接对照形式化布尔与线性整数规则对既有记录进行确定性校验。

请根据输入构造包含布尔变量、有界整数变量和命名规则的模型，对候选历史赋值运行校验，返回整体是否合规以及所有违规规则 ID（按字典序排列）。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `boolVars` | `string[]` | 布尔变量名列表 |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | 有界整数变量定义 |
| `rules` | `Array<{ id: string; expr: SmtFormula }>` | 命名合规规则列表 |
| `candidateValues` | `Record<string, boolean / number>` | 待审计的历史赋值记录 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `valid` | `boolean` | 当且仅当全部规则均成立时为 `true` |
| `violatedRules` | `string[]` | 所有违背规则的 ID 列表（按字典序） |

<!-- section:example -->
**输入示例**

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

**输出示例**

```json
{
  "valid": true,
  "violatedRules": []
}
```

在 `candidateValues` 下，`R1`（`nightShift` 与 `seniorOnDuty` 均为 `true`）、`R2`（`hazardFlag = false` 自动成立）和 `R3`（`overtimeHours = 2 <= 4`）均满足要求。
