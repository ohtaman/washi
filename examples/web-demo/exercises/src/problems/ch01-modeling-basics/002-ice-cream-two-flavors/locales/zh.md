# #002. 双口味冰淇淋工坊（添加约束）

<!-- section:scenario -->
一家冰淇淋工坊在有限的 **牛奶** 和 **糖** 库存内生产 **香草** 与 **巧克力** 两种口味（产量均为非负实数）。

初始代码中已经声明好决策变量、牛奶上限约束和利润最大化目标，唯独 **缺少糖的库存上限约束**。

1. 先直接运行初始代码，你会看到提示糖用量超出库存上限的 **VIOLATION** 反馈。
2. 在模型中补充糖用量不超过总库存的线性约束后重新运行，即可获得 **AC**。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `milkCap` | `number` | 牛奶库存上限 |
| `sugarCap` | `number` | 糖库存上限 |
| `vanillaProfit` | `number` | 每升香草口味的利润 |
| `chocoProfit` | `number` | 每升巧克力口味的利润 |
| `vanillaMilk` | `number` | 每升香草耗用的牛奶 |
| `vanillaSugar` | `number` | 每升香草耗用的糖 |
| `chocoMilk` | `number` | 每升巧克力耗用的牛奶 |
| `chocoSugar` | `number` | 每升巧克力耗用的糖 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `vanilla` | `number` | 香草口味产量（升） |
| `chocolate` | `number` | 巧克力口味产量（升） |
| `totalProfit` | `number` | 最大化后的总利润 |

<!-- section:example -->
**输入示例**

```json
{
  "milkCap": 90,
  "sugarCap": 80,
  "vanillaProfit": 500,
  "chocoProfit": 300,
  "vanillaMilk": 3,
  "vanillaSugar": 1,
  "chocoMilk": 1,
  "chocoSugar": 2
}
```

**输出示例**

```json
{
  "vanilla": 20,
  "chocolate": 30,
  "totalProfit": 19000
}
```

若只做高毛利的香草口味，牛奶用尽只能做出 30 升（利润 15,000）；混合生产 20 升香草与 30 升巧克力恰好用完 90 份牛奶与 80 份糖，总利润可达 **19,000**。

<!-- section:hint1 -->
复制上方牛奶约束的写法，将系数和上限替换为 `input.vanillaSugar`、`input.chocoSugar` 与 `input.sugarCap` 即可。

<!-- section:hint2 -->
为什么缺了糖约束时初始代码会给出 90 升巧克力？因为每单位牛奶下巧克力能赚 `300/1 = 300`，高于香草的 `500/3 = 166.7`，于是求解器全产巧克力导致糖用量 `180 > 80`。

<!-- section:formulation -->
$$
\begin{aligned}
\max \quad & p_v v + p_c c \\
\text{s.t.} \quad & m_v v + m_c c \le M_{\text{cap}} \\
& s_v v + s_c c \le S_{\text{cap}} \\
& v, c \ge 0
\end{aligned}
$$
