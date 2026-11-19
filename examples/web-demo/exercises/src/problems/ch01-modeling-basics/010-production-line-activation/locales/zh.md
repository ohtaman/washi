# #010. 产线启停与混合生产计划

<!-- section:scenario -->
某工厂拥有多条候选产线，需要同时决定开启哪些产线以及每条已开启产线的生产量。开启某条产线需要支付固定开机成本，并解锁直至该产线产能上限的连续产量；如果保持产线关闭，则其产量 **必须为零**。

每条产线生产 1 单位产品会获得边际利润，同时消耗全厂共享的原材料预算。请在不超过共享原材料总供应量的前提下，统筹规划产线启停与产量以 **最大化净利润**（总毛利减去固定开机成本之和）。

<!-- section:io -->
### 输入

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `margins` | `number[]` | 各产线每单位产品的边际利润 |
| `fixedCosts` | `number[]` | 开启各产线所需支付的固定开机成本 |
| `capacities` | `number[]` | 各产线开启后的最大产能上限 |
| `materialUsages` | `number[]` | 各产线生产 1 单位耗用的共享原材料 |
| `materialCap` | `number` | 全厂共享原材料总供应上限 |

### 输出

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `open` | `number[]` | 各产线是否开启（`0` 或 `1`） |
| `quantities` | `number[]` | 各产线的非负连续产量 |
| `netProfit` | `number` | 最大化后的净利润（总毛利减去固定成本） |

<!-- section:example -->
**输入示例**

```json
{
  "margins": [50, 40, 35],
  "fixedCosts": [600, 300, 250],
  "capacities": [30, 40, 25],
  "materialUsages": [2, 1.5, 1],
  "materialCap": 70
}
```

**输出示例**

```json
{
  "open": [0, 1, 1],
  "quantities": [0, 30, 25],
  "netProfit": 1525
}
```

产线 0 虽单品毛利最高（50），但单位原材料收益仅 25 且固定成本高达 600。关闭产线 0 并在产线 1、2 分别生产 30 与 25，取得最大净利润 **1,525**。

<!-- section:hint1 -->
初始代码中已声明二进制数组 `open` 与连续数组 `quantities`。请对每条产线 $i$ 添加线性产能关联约束：
$$\text{quantities}[i] \le \text{capacities}[i] \cdot \text{open}[i]$$
当 `open[i] = 0` 时右端变为 `0`，从而强制关闭产线零产出。

<!-- section:hint2 -->
别忘了添加共享原材料总约束 `dot(input.materialUsages, quantities) <= input.materialCap`，并最大化净利润 `dot(input.margins, quantities) - dot(input.fixedCosts, open)`。

<!-- section:formulation -->
$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} m_i q_i - \sum_{i=0}^{n-1} F_i y_i \\
\text{s.t.} \quad & 0 \le q_i \le C_i y_i && \forall i \in \{0, \dots, n-1\} \\
& \sum_{i=0}^{n-1} a_i q_i \le M_{\text{cap}} \\
& y_i \in \{0, 1\} && \forall i
\end{aligned}
$$

这种“连续流量 $\le$ 产能 $\times$ 0-1开关”的混合建模模式，把第一章学到的连续 LP 与 0-1 决策结合到了一起，也为第 2 章的 Big-M 与固定费用网络选址打下基础。
