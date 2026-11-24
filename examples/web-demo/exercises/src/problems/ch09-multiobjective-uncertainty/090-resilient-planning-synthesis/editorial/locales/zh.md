## 解题思路

将第九章的核心建模范式整合为统一的两阶段 MIP：通过 Bertsimas-Sim 对偶变量（$z, p_j$）保障第一阶段预承诺 $y_j$ 的鲁棒留存容量，利用线性化汉明差变量 $d_{s,j} \ge |w_{s,j} - y_j|$ 连接事前决策与情景恢复决策 $w_{s,j}$，并在各情景引入弹性需求缺口变量 $u_s \ge 0$。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{n-1} F_j y_j + \sum_{s=0}^{S-1} p_s \left( C_{\text{sw}} \sum_{j=0}^{n-1} d_{s,j} + C_{\text{sh}} u_s \right) \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} C_j y_j - \Gamma z - \sum_{j=0}^{n-1} p_j \ge C_{\text{rob}}, \quad z + p_j \ge \delta_j y_j && \forall j \\
& w_{s,j} = 0 && \forall (s,j): \text{offline}_{s,j} = 1 \\
& d_{s,j} \ge w_{s,j} - y_j, \quad d_{s,j} \ge y_j - w_{s,j} && \forall s, j \\
& \sum_{j=0}^{n-1} C_j w_{s,j} + u_s \ge D_s, \quad y_j, w_{s,j} \in \{0, 1\},\; z, p_j, d_{s,j}, u_s \ge 0
\end{aligned}
$$

## 核心要点

- **两个决策向量之间的汉明距离线性化**：与 `#085`（基准固定为常数）不同，此处 $y_j$ 与 $w_{s,j}$ 均为决策变量；引入非负变量及两道不等式 $d_{s,j} \ge w_{s,j} - y_j$、$d_{s,j} \ge y_j - w_{s,j}$，即可在 $C_{\text{sw}} > 0$ 时精确表达 $|w_{s,j} - y_j|$。
- **鲁棒、随机与弹性机制的协同作用**：Bertsimas-Sim 约束淘汰脆弱的第一阶段组合，随机追索在预留冗余与震后切换间取得平衡（用例 2），而弹性缺口松弛避免为极低概率峰值付出过高备用成本（用例 3）。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

通过 `input.dropAmounts.map(...)` 注册第一阶段鲁棒容量对偶约束，并用 `w.flatMap(...)` 批量生成各情景恢复计划与事前承诺之间汉明距离的线性不等式对。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`dot(${input.capacities}, ${y}) - ${input.gamma} * ${z} - sum(${p}) >= ${input.robustMinCap}`);
m.constraint(input.dropAmounts.map((drop, j) => expr`${z} + ${p[j]} >= ${drop} * ${y[j]}`));
m.constraint(
  w.flatMap((row, s) =>
    row.flatMap((wsj, j) => [expr`${diff[s][j]} >= ${wsj} - ${y[j]}`, expr`${diff[s][j]} >= ${y[j]} - ${wsj}`])
  )
);
```

**PuLP (Python)**

```python
prob += pulp.lpDot(capacities, y) - gamma * z - pulp.lpSum(p) >= robust_min_cap
for j in range(n):
    prob += z + p[j] >= drop_amounts[j] * y[j]
for s in range(S):
    for j in range(n):
        prob += diff[s][j] >= w[s][j] - y[j]
        prob += diff[s][j] >= y[j] - w[s][j]
```
