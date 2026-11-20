# #042. 基于 No-Good 割的解唯一性证明

<!-- section:scenario -->
找到一组可满足赋值只能说明规则系统无矛盾，但在配置验证与逻辑推理中，往往还需要证明该解是否唯一。

给定布尔变量名和命题规则，请先检验是否存在可行赋值；若存在解，进一步判定该解在所有真值组合中是否唯一，并输出判定结果。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `vars` | `string[]` | 布尔变量名列表 |
| `rules` | `PropFormula[]` | 命题逻辑规则列表 |

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
