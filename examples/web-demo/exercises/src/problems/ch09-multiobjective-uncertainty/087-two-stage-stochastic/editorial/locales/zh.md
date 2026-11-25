## 解题思路

建立确定性等价线性规划：以全情景共享的第一阶段变量 `orders`（$x_j \ge 0$）配对按情景索引的第二阶段追索变量 `shortage`（$u_{s,j} \ge 0$）和 `leftover`（$v_{s,j} \ge 0$）。用 $c_j, q_j, r_j, W_{\text{cap}}$ 分别表示 `orderCosts`、`shortageCosts`、`salvageValues` 和 `warehouseCap`，通过平衡方程 $x_j + u_{s,j} - v_{s,j} = d_{s,j}$ 与概率权重 $p_s$ 最小化期望总成本。

## 数学模型

$$
\begin{aligned}
\min_{x, u, v \ge 0} \quad & \sum_{j=0}^{n-1} c_j x_j + \sum_{s=0}^{S-1} p_s \sum_{j=0}^{n-1} \left( q_j u_{s,j} - r_j v_{s,j} \right) \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} x_j \le W_{\text{cap}} \\
& x_j + u_{s,j} - v_{s,j} = d_{s,j} && \forall s \in \{0, \dots, S-1\},\; j \in \{0, \dots, n-1\}
\end{aligned}
$$

## 核心要点

- **随机解的价值（VSS）**：若直接用平均需求 $\bar{d}_j = \sum_s p_s d_{s,j}$ 求解均值确定性问题，会忽视缺货罚金与余货残值的不对称性及仓库配额权衡，导致更高的真实期望成本（用例 0 中为 196.5 对比 184）。
- **非预期性与互补性**：全部情景共享同一个 $x_j$ 体现了“需求未知前的此时此地决策”，且 $q_j > r_j$ 保证了最优解下同一 $(s, j)$ 不会同时出现缺货与余货。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

在所有情景间共享第一阶段订货量 `orders`，用 `input.demands.flatMap(...)` 一次性注册各情景的收支等式，并用 `input.probs.map(...)` 组装第二阶段期望成本。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`sum(${orders}) <= ${input.warehouseCap}`, "warehouse_cap");
m.constraint(
  input.demands.flatMap((row, s) =>
    row.map((d, j) => expr`${orders[j]} + ${shortage[s][j]} - ${leftover[s][j]} == ${d}`)
  )
);
const stage2Expected = sum(
  input.probs.map((p, s) =>
    expr`${p} * (dot(${input.shortageCosts}, ${shortage[s]}) - dot(${input.salvageValues}, ${leftover[s]}))`
  )
);
m.objective(minimize(expr`dot(${input.orderCosts}, ${orders}) + ${stage2Expected}`));
```

**PuLP (Python)**

```python
prob += pulp.lpSum(orders) <= warehouse_cap
for s in range(S):
    for j in range(n):
        prob += orders[j] + shortage[s][j] - leftover[s][j] == demands[s][j]
stage2_expected = pulp.lpSum(
    probs[s] * (pulp.lpDot(shortage_costs, shortage[s]) - pulp.lpDot(salvage_values, leftover[s]))
    for s in range(S)
)
prob += pulp.lpDot(order_costs, orders) + stage2_expected
```
