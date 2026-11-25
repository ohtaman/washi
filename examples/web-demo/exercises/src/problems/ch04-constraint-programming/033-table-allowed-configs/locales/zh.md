# #033. 基于表约束（allowed）的兼容系统配置

<!-- section:scenario -->
系统设计人员正在为一套由 CPU、主板、内存、电源等多个组件组成的硬件系统选型。每个组件都有若干候选选项，并各自设有整数成本（千日元）。

此外，兼容规则要求指定组件组的选项取值必须匹配允许组合表中的某一项，而禁止规则则不允许选择指定的冲突组合。请找出满足所有规则的最省成本组件方案。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `componentCosts` | `number[][]` | 各组件 `c` 的选项 `opt` 对应的整数成本 `componentCosts[c][opt]`（千日元） |
| `allowedRules` | `TableRule[]` | 兼容规则列表，要求指定组件列 `vars` 的所选选项匹配 `tuples` 中的某一项 |
| `forbiddenRules` | `TableRule[]` | 禁止规则列表，不允许指定组件列 `vars` 的所选选项匹配 `tuples` 中的任一项 |

每个 `TableRule` 对象为 `{ vars: number[], tuples: number[][] }`，其中 `vars` 为从 0 开始的组件索引列表，`tuples` 中的每个元组长度与 `vars` 相同，按顺序对应各组件的选项编号。

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `choices` | `number[]` | 每个组件 `c` 选定的选项编号（0 到 `componentCosts[c].length - 1`） |
| `totalCost` | `number` | 最小化后的总配置成本（千日元） |

<!-- section:example -->
**输入示例**

```json
{
  "componentCosts": [
    [10, 25, 45],
    [8, 18, 32],
    [5, 14, 28]
  ],
  "allowedRules": [
    {
      "vars": [0, 1],
      "tuples": [
        [0, 1],
        [1, 0],
        [1, 2],
        [2, 2]
      ]
    }
  ],
  "forbiddenRules": [
    {
      "vars": [1, 2],
      "tuples": [
        [1, 0],
        [0, 0]
      ]
    }
  ]
}
```

**输出示例**

```json
{
  "choices": [0, 1, 1],
  "totalCost": 42
}
```

选择 [0, 1, 1] 中组件 (0, 1) 选定 (0, 1)（包含于 `allowedRules[0]`），组件 (1, 2) 选定 (1, 1)（避开了禁用元组 (1, 0) 与 (0, 0)），总成本为 $10 + 18 + 14 =$ **42** 千日元。

<!-- section:hint1 -->
为每个组件定义一个整数决策变量，其取值范围为该组件的可用选项索引。将兼容表和禁用表直接建模为对应组件变量元组上的表约束，并以所选选项成本之和作为最小化目标。

<!-- section:hint2 -->
对 `input.allowedRules` 中的每条规则使用 `allowed(vars, rule.tuples)`，对 `input.forbiddenRules` 中的每条规则使用 `not(allowed(vars, rule.tuples))`，其中 `vars` 由 `rule.vars` 映射到对应组件变量。使用 `at(costs, choices[c])` 读取各组件的选项成本，并对 `sum(...)` 最小化后用 `solver: "pumpkin"` 求解。
