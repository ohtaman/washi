# #042. 基于 No-Good 割的解唯一性证明

<!-- section:scenario -->
安全配置与功能开关（如认证方式、加密、审计日志启用等）的运维规则通常需要同时验证两件事：是否存在满足全部规则的配置，以及该配置是否唯一确定（不存在其他合法备选方案）。

给定布尔变量名列表和命题逻辑规则列表，请先判定是否存在满足所有规则的赋值；若存在，则返回一组可行赋值，并报告该赋值是否为唯一解。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `vars` | `string[]` | 布尔变量名列表 |
| `rules` | `PropFormula[]` | 命题逻辑规则列表 |

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

纯字符串表示对 `vars` 中变量名的引用，`{ implies: [p, q] }` 表示 $p \to q$，而 `{ xor: [...] }` 当且仅当其子公式中有奇数个为 `true` 时成立。

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `satisfiable` | `boolean` | 至少存在一组可行赋值时为 `true` |
| `assignment` | `Record<string, boolean>` 或 `null` | 找到的可行赋值；不可满足时为 `null` |
| `unique` | `boolean` | 当且仅当可行赋值唯一时为 `true` |

<!-- section:example -->
**输入示例**

```json
{
  "vars": ["a", "b", "c", "d"],
  "rules": [
    "a",
    { "implies": ["a", "b"] },
    { "xor": ["b", "c"] },
    { "implies": [{ "and": ["a", { "not": "c" }] }, "d"] }
  ]
}
```

**输出示例**

```json
{
  "satisfiable": true,
  "assignment": {
    "a": true,
    "b": true,
    "c": false,
    "d": true
  },
  "unique": true
}
```

将赋值 `a = true, b = true, c = false, d = true` 代入四条规则均成立，且变量集 `["a", "b", "c", "d"]` 上不存在其他同时满足四条规则的赋值，因此 `satisfiable` 与 `unique` 均为 `true`。


<!-- section:hint1 -->
为 `vars` 中的每个变量声明一个布尔决策变量，并将所有规则加入模型。先求解一次以寻找初始可满足赋值；若存在解，则排除该精确真值向量并检查是否还存在第二个可满足赋值。

<!-- section:hint2 -->
使用 `m.bool(input.vars)` 与 `await m.check({ solver: "z3" })` 进行首次可满足性检查。要屏蔽已找到的赋值 `a`，可添加一条覆盖所有变量的 `or(...)` 禁止子句（no-good cut）：若 `a[v]` 为真则取 `not(bools[v])`，否则取 `bools[v]`；随后再次调用 `m.check({ solver: "z3" })`，当且仅当第二次返回 `"Unsat"` 时解唯一。
