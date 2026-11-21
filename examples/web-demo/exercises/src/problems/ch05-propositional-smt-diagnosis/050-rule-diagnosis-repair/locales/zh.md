# #050. 冲突诊断与最小代价修复综合实战

<!-- section:scenario -->
企业策略治理引擎在布尔属性与有界整数属性上同时维护不可违背的硬规则与带惩罚权重的软偏好规则。

请先检查全部硬规则与软规则是否联合一致：若一致，则返回空冲突核、空松弛集和零修复代价；若不一致，则从全部规则中提取极小不可满足核心（MUS），并合成使所有硬规则和未松弛软规则均满足的最小代价软规则松弛方案与修复后赋值。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `boolVars` | `string[]` | 布尔属性名列表 |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | 有界整数变量定义 |
| `hardRules` | `Array<{ id: string; expr: SmtFormula }>` | 不可松弛的强制硬规则 |
| `softRules` | `Array<{ id: string; weight: number; expr: SmtFormula }>` | 带违背代价 `weight` 的软规则 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `consistent` | `boolean` | 硬规则与软规则联合可满足时为 `true` |
| `minimalCore` | `string[]` | 不一致时提取的极小不可满足核心 ID（一致时为 `[]`） |
| `relaxedRules` | `string[]` | 被松弛的软规则 ID（按字典序，一致时为 `[]`） |
| `repairCost` | `number` | 最小化的松弛软规则权重总和 |
| `repairedAssignment` | `Record<string, boolean / number>` | 满足所有硬规则及保留软规则的修复后赋值 |

<!-- section:example -->
**输入示例**

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

**输出示例**

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

`{ H1, H2, S1, S2 }` 构成极小冲突核；松弛权重最低的软规则 `S2`（代价为 `2`）即可恢复所有硬规则与其余软规则的一致性。


<!-- section:hint1 -->
在相同的布尔变量与有界整数变量上分两阶段组织求解：先检查所有硬规则与软规则的联合可满足性；若不可满足，则在全部命名规则上提取极小不可满足核（MUS），并另建模型求解加权软规则松弛问题。

<!-- section:hint2 -->
在一致性检查与 MUS 提取阶段，以每条硬规则与软规则的 `id` 作为约束名称注册约束，结合 `await m.check({ solver: "z3" })` 与 `res.unsatCore` 执行逐条删除收缩。在最小代价修复阶段，无条件保留所有硬规则，通过 `or(softExpr, expr\`${viol[k]} == 1\`)` 为每条软规则配对二元松弛指示变量 `viol[k]`，并用 `await m.solve({ solver: "z3" })` 最小化 `dot(weights, viol)`。
