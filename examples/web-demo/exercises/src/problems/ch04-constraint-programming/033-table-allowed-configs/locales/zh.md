# #033. 基于表约束（allowed）的兼容系统配置

<!-- section:scenario -->
一名工程师正在配置一套由多个离散组件组成的硬件系统。每个组件 c 都有若干候选规格，价格记录在 componentCosts[c] 中。

正表规则 allowedRules 要求所列组件选出的规格组合必须属于允许元组表之一，而负表规则 forbiddenRules 则禁止选出禁用表中出现的组合。请为每个组件选定规格以在满足全部表规则的同时最小化总成本。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `componentCosts` | `number[][]` | 各组件 `c` 的候选规格成本数组 `componentCosts[c][opt]` |
| `allowedRules` | `TableRule[]` | 正表约束 `{ vars, tuples }`，要求对应组件取值元组属于 `tuples` |
| `forbiddenRules` | `TableRule[]` | 负表约束 `{ vars, tuples }`，禁止对应组件取值元组出现在 `tuples` 中 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `choices` | `number[]` | 每个组件选定的规格索引（`0` 到 `componentCosts[c].length - 1`） |
| `totalCost` | `number` | 最小化后的系统总配置成本 |

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

方案 `[0, 1, 1]` 满足组件 `(0, 1)` 为 `(0, 1)` 在正表中、组件 `(1, 2)` 为 `(1, 1)` 未命中禁用表，总成本为 $10 + 18 + 14 =$ **42**。
