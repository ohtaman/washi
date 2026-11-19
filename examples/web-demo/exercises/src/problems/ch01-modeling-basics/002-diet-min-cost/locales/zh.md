# #002. 低成本营养配比（>= 与最小化）

<!-- section:scenario -->
混合燕麦与豆类（均为非负连续量），在满足每日最低营养需求的条件下最小化总成本：

- 1 份燕麦：成本 30，提供蛋白质 2、膳食纤维 1
- 1 份豆类：成本 50，提供蛋白质 1、膳食纤维 3

在给定最低要求 minProtein 和 minFiber 的条件下求出最省钱的配比。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `minProtein` | `number` | 所需蛋白质下限 |
| `minFiber` | `number` | 所需膳食纤维下限 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `oats` | `number` | 燕麦用量（$\ge 0$） |
| `beans` | `number` | 豆类用量（$\ge 0$） |
| `totalCost` | `number` | 最小化后的总成本 |

<!-- section:example -->
**输入示例**

```json
{
  "minProtein": 8,
  "minFiber": 9
}
```

**输出示例**

```json
{
  "oats": 3,
  "beans": 2,
  "totalCost": 190
}
```

使用 `3` 份燕麦和 `2` 份豆类时，刚好满足蛋白质 8 和膳食纤维 9，总成本达到最小 `190`。
