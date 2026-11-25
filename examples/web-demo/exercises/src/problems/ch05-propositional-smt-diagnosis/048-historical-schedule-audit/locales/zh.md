# #048. 历史分配记录合规审计 (m.verify)

<!-- section:scenario -->
在部署新规或复盘历史事件时，合规团队需要对照形式化的布尔与线性整数约束，对夜班排班、作业人数、加班时长、生产部署日志等既有运营记录进行审核。

给定布尔变量、有界整数变量、命名合规规则以及历史变量赋值，在不调用求解器搜索的情况下对该历史记录执行确定性审计，返回是否全部合规以及按字典序排列的违规规则 ID 列表。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `boolVars` | `string[]` | 布尔变量名列表 |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | 有界整数变量定义 |
| `rules` | `Array<{ id: string; expr: SmtFormula }>` | 命名合规规则列表 |
| `candidateValues` | `Record<string, StateValue>` | 待审计的历史赋值记录 |

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


<!-- section:hint1 -->
在模型中声明布尔变量和有界整数变量，并以每条合规规则的 ID 作为约束名称进行注册，以便按名称归因违规规则。随后直接针对模型验证给定的历史赋值，而无需运行求解器搜索。

<!-- section:hint2 -->
使用 `m.bool(input.boolVars)`、`m.integer(spec.name, { lb: spec.lb, ub: spec.ub })` 和 `m.constraint(compileSmt(r.expr, bools, ints), r.id)`。调用 `m.verify({ values: input.candidateValues })`（同步方法，无需 Z3 搜索），从 `report.violations` 中收集去重后的 `v.name` 并按字典序排序。
