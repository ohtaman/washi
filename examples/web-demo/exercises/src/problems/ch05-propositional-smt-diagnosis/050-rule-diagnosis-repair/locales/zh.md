# #050. 冲突诊断与最小代价修复综合实战

<!-- section:scenario -->
企业策略治理引擎在布尔属性与有界整数属性（如生产环境、MFA 认证、遗留兼容模式、审计日志与服务等级）上同时维护不可违背的硬规则与带惩罚权重的软偏好规则。输入保证全部硬规则联合可满足（因此总存在可行的软规则修复方案），且 `hardRules` 与 `softRules` 中的规则 ID 全局唯一。

请按以下步骤进行诊断与修复：
- **一致性检查**：先检查全部硬规则与软规则是否可以同时满足。
- **若一致**：返回空冲突核、空松弛集、零修复代价及一组可行赋值。
- **若不一致**：从全部规则中提取极小不可满足核心（MUS），并求出总权重最小的软规则松弛方案以及满足所有硬规则和剩余软规则的修复后赋值。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `boolVars` | `string[]` | 布尔属性名列表 |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | 有界整数变量定义 |
| `hardRules` | `Array<{ id: string; expr: SmtFormula }>` | 不可松弛的强制硬规则 |
| `softRules` | `Array<{ id: string; weight: number; expr: SmtFormula }>` | 带违背代价 `weight` 的软规则 |

`SmtFormula` 是由布尔变量名（`string`）、线性整数比较（`SmtCmp`）及逻辑连接词组成的递归联合类型：
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

裸字符串（`string`）叶节点引用 `boolVars` 中的布尔变量，`SmtCmp` 在 `intVars` 上求值线性比较 $\sum_k c_k v_k \mathrel{\text{sense}} \text{rhs}$（`terms` 将变量 $v_k$ 映射至系数 $c_k$），`implies: [a, b]` 表示 $a \implies b$，`xor` 当且仅当其操作数中有奇数个为真时成立。

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `consistent` | `boolean` | 硬规则与软规则联合可满足时为 `true` |
| `minimalCore` | `string[]` | 不一致时提取的极小不可满足核心（MUS）ID 列表（按字典序，一致时为 `[]`） |
| `relaxedRules` | `string[]` | 被松弛的软规则 ID（按字典序，一致时为 `[]`） |
| `repairCost` | `number` | 最小化的松弛软规则权重总和 |
| `repairedAssignment` | `Record<string, StateValue>` | 满足所有硬规则及保留软规则的修复后赋值 |

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

`{ H1, H2, S1, S2 }` 构成一个极小不可满足核心（MUS）；松弛软规则 `S2`（权重 2）对应 `repairCost = 2`，并在 `prod = mfa = audit = true, legacy = false, tier = 2` 下满足所有硬规则与其余软规则。


<!-- section:hint1 -->
在相同的布尔变量与有界整数变量上分三阶段组织求解：(1) 先检查所有硬规则与软规则的联合可满足性；(2) 若不可满足，则在全部命名规则上提取极小不可满足核心（MUS）；(3) 另建模型求解加权软规则松弛问题，求得最小代价修复方案。

<!-- section:hint2 -->
在一致性检查与 MUS 提取阶段，以每条硬规则与软规则的 `id` 作为约束名称注册约束，结合 `await m.check({ solver: "z3" })` 与 `res.unsatCore` 执行逐条删除收缩。在最小代价修复阶段，无条件保留所有硬规则，通过 ``or(softExpr, expr`${viol[k]} == 1`)`` 为每条软规则配对二元松弛指示变量 `viol[k]`，并用 `await m.solve({ solver: "z3" })` 最小化 `dot(weights, viol)`。
