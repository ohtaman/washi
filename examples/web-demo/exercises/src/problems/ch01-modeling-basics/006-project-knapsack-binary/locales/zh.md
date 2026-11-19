# #006. 0-1 项目立项选择（二进制变量）

<!-- section:scenario -->
研发团队需要在有限的总预算内从若干候选项目中挑选立项方案。每个项目都是严格“全选或不选”的二元决策：立项就要支付全部所需经费并获得对应战略收益，放弃则不占预算。

请在不超出总预算上限的前提下，决策立项集合以 **最大化总收益**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `budget` | `number` | 总预算上限 |
| `costs` | `number[]` | 各候选项目的所需成本 |
| `values` | `number[]` | 各候选项目的预期收益 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `selected` | `number[]` | 各项目是否立项（`0` 或 `1`） |
| `totalValue` | `number` | 最大化后的总收益 |

<!-- section:example -->
**输入示例**

```json
{
  "budget": 15,
  "costs": [4, 5, 7, 3, 6],
  "values": [10, 12, 16, 8, 13]
}
```

**输出示例**

```json
{
  "selected": [0, 1, 1, 1, 0],
  "totalValue": 36
}
```

若按性价比贪心选择会剩余 3 单位无法利用的预算（收益仅 30）；改为立项项目 1、2、3 恰好用完 $5 + 7 + 3 = 15$ 预算，取得最大收益 **36**。

<!-- section:hint1 -->
初始代码中已声明二进制变量数组 `selected`（WaSHI 为 `m.binary(...)`，Python 为 `h.addBinary(...)`）。只需添加预算约束 `dot(costs, selected) <= budget` 并最大化 `dot(values, selected)`。

<!-- section:hint2 -->
构造返回值数组时请用 `Math.round(v.value!)`（Python 中用 `round(h.val(v))`），避免 `0.999999999` 或 `-0` 等浮点精度尾巴。

<!-- section:formulation -->
$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} v_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} c_i x_i \le B \\
& x_i \in \{0, 1\} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$
