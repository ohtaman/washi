# #027. LP 对偶变量与影子价格

<!-- section:scenario -->
电力公司的运行分析师正在求解一个发电出力分配计划，在各台发电机组出力上限（MW，非负连续量）的约束下最小化总发电成本（万元）。每台发电机组都有每 MW 的发电单价和最大出力容量，整体出力必须满足各地区的最低电力需求（MW），同时不超过燃料消耗量、排放配额等上限。

除了求得成本最低的各发电机组发电量外，还需要知道当每条最低需求约束或燃料/排放配额上限约束的右端项增加 1 单位时，最优成本会变化多少（即影子价格）。请求解该最小化 LP，并返回各发电机组的发电量、按最低需求约束在前且上限约束在后排列的影子价格，以及最小总成本。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `costs` | `number[]` | 发电机组 $i$ 的发电单价 $c_i$（万元/MW） |
| `capacities` | `number[]` | 发电机组 $i$ 的出力上限 $u_i$（$0 \le x_i \le u_i$，MW） |
| `yields` | `number[][]` | 最低需求约束的贡献系数矩阵 $A$ |
| `minRequirements` | `number[]` | 各地区的最低电力需求 $r_k$（$\sum_i A_{ki} x_i \ge r_k$，MW） |
| `resourceUsages` | `number[][]` | 燃料与排放配额约束的消耗系数矩阵 $E$ |
| `maxResources` | `number[]` | 燃料与排放配额上限 $b_l$（$\sum_i E_{li} x_i \le b_l$） |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `quantities` | `number[]` | 各发电机组的最优发电量 $x_i$（MW） |
| `duals` | `number[]` | 影子价格 $\partial z^* / \partial \text{rhs}$（依次为 `minRequirements` 与 `maxResources`） |
| `optimalCost` | `number` | 最小化后的总发电成本 $z^*$（万元） |

<!-- section:example -->
**输入示例**

```json
{
  "costs": [10, 14, 25],
  "capacities": [12, 20, 25],
  "yields": [
    [1, 2, 3],
    [2, 1, 2]
  ],
  "minRequirements": [30, 22],
  "resourceUsages": [
    [2, 1, 1]
  ],
  "maxResources": [20]
}
```

**输出示例**

```json
{
  "quantities": [4, 10, 2],
  "duals": [6, 5, -3],
  "optimalCost": 230
}
```

发电量 [4, 10, 2] 满足全部最低需求 [30, 22] 与上限 20，总成本达到 $10 \times 4 + 14 \times 10 + 25 \times 2 =$ **230** 万元，且与影子价格 [6, 5, -3] 的对偶评估值 $30(6) + 22(5) + 20(-3) = 230$ 一致。


<!-- section:hint1 -->
为每台发电机组声明一个界于 0 和其出力容量上限之间的连续变量。向模型添加最低需求约束和燃料/排放配额上限约束时，保留对这些约束对象的引用，以便在求解后读取它们的对偶值。

<!-- section:hint2 -->
求解最小化 LP 后，按先需求约束、后上限约束的顺序读取 WaSHI 中的 `c.dual!`（或 PuLP 中的 `c.pi`）。WaSHI 和 PuLP 均采用灵敏度约定 $\partial z^* / \partial \text{rhs}$：提高 $\ge$ 需求不会降低最小成本（故其对偶值 $\ge 0$），放宽 $\le$ 上限不会升高最小成本（故其对偶值 $\le 0$），而存在正松弛的约束其对偶值为 0。请直接保留求解器返回的带符号影子价格，不要自行取反。