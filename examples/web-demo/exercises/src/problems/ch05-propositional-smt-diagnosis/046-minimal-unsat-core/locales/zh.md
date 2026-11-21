# #046. 极小不可满足核心 (MUS) 提取

<!-- section:scenario -->
当一组带名称的布尔或整数策略规则联合不可满足时，求解器最初返回的冲突核中仍可能夹杂非必需的冗余规则。

请提取不可再约简的极小不可满足子集（MUS）：即该子集本身不可满足，且删去其中任意一条规则后剩余子集均变为可满足，并将这些规则 ID 按字典序排列返回。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `boolVars` | `string[]` | 布尔变量名列表 |
| `intVars` | `Array<{ name: string; lb: number; ub: number }>` | 有界整数变量声明 |
| `rules` | `Array<{ id: string; expr: SmtFormula }>` | 存在冲突的命名规则集合 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `coreRules` | `string[]` | 极小不可满足核心的规则 ID 列表（按字典序） |

<!-- section:example -->
**输入示例**

```json
{
  "boolVars": ["a", "b", "c", "d"],
  "intVars": [],
  "rules": [
    { "id": "R1", "expr": "a" },
    { "id": "R2", "expr": { "implies": ["a", "b"] } },
    { "id": "R3", "expr": { "implies": ["a", "c"] } },
    { "id": "R4", "expr": { "not": "b" } },
    { "id": "R5", "expr": { "or": ["c", "d"] } },
    { "id": "R6", "expr": { "implies": ["c", "d"] } }
  ]
}
```

**输出示例**

```json
{
  "coreRules": ["R1", "R2", "R4"]
}
```

`{ R1, R2, R4 }` 联合不可满足（`a = true`、`a => b`、`not(b)`），且去掉这三条中的任意一条后其余规则均变得可满足。


<!-- section:hint1 -->
从求解器返回的原始冲突核等不可满足候选子集出发，依次检验每条规则是否不可或缺。每当移除某条规则后剩余子集仍然不可满足，就将该规则永久剔除。

<!-- section:hint2 -->
以规则 ID 作为约束名称注册每条规则（`m.constraint(compileSmt(r.expr, bools, ints), r.id)`），这样在 `"Unsat"` 时 `await m.check({ solver: "z3" })` 会返回 `res.unsatCore`。在逐条删除收缩中，为去掉 `ruleId` 后的候选子集构建新的 `Model` 进行检查；若仍为 `"Unsat"`，则将候选集收缩为 `res.unsatCore`（或移除 `ruleId`），最后将 `coreRules` 按字典序排序。
