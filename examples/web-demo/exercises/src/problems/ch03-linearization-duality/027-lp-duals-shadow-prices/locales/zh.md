# #027. LP 对偶变量与影子价格

<!-- section:scenario -->
运营分析师需要在各产能单元的上下界范围内求解一个连续成本最小化调度模型。每个单元都有单位成本与产能上界，整体调度既要满足多项最低产出需求，又不能超过共享资源上限。

除最优调度量外，管理层还需要每条最低需求约束与共享资源上限约束的边际影子价格（右端项增加 1 单位时最优成本的变化率）。请将该模型构建为最小化 LP，并返回原变量调度量、按最低需求约束在前且共享资源约束在后排列的影子价格向量，以及最小总成本。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `costs` | `number[]` | 单元 $i$ 的单位调度成本 $c_i$ |
| `capacities` | `number[]` | 变量上界 $u_i$（$0 \le x_i \le u_i$） |
| `yields` | `number[][]` | 最低需求约束系数矩阵 $A$ |
| `minRequirements` | `number[]` | 最低需求下限 $r_k$（$\sum_i A_{ki} x_i \ge r_k$） |
| `resourceUsages` | `number[][]` | 共享资源上限系数矩阵 $E$ |
| `maxResources` | `number[]` | 共享资源上限 $b_l$（$\sum_i E_{li} x_i \le b_l$） |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `quantities` | `number[]` | 最优连续调度量 $x_i$ |
| `duals` | `number[]` | 影子价格 $\partial z^* / \partial \text{rhs}$（依次为 `minRequirements` 与 `maxResources`） |
| `optimalCost` | `number` | 最小化后的总成本 $z^*$ |

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

调度量 `[4, 10, 2]` 满足最低需求 `[30, 22]` 与资源上限 `20`，成本为 $10 \times 4 + 14 \times 10 + 25 \times 2 =$ **230**；影子价格 `[6, 5, -3]` 满足对偶值 $30(6) + 22(5) + 20(-3) = 230$。
