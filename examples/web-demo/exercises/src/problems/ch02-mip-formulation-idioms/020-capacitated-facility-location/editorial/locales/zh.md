## 解题思路

将表示烘焙工坊开设的 0-1 变量 $y_i$（`open[i]`）与表示咖啡门店配送量的连续变量 $x_{i,j}$（`shipments[i][j]`）结合，以 $\sum_j x_{i,j} \le C_i y_i$ 将每座工坊的总发货量限制在其发货能力 $C_i$（`capacities[i]`）以内，在满足各咖啡门店需求 $d_j$（`demands[j]`）的前提下，最小化固定运营费 $f_i$（`fixedCosts[i]`）与单位配送费 $c_{i,j}$（`unitCosts[i][j]`）构成的总成本。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{F-1} f_i y_i + \sum_{i=0}^{F-1} \sum_{j=0}^{D-1} c_{i,j} x_{i,j} \\
\text{s.t.} \quad & \sum_{j=0}^{D-1} x_{i,j} \le C_i y_i && \forall i \in \{0, \dots, F-1\} \\
& \sum_{i=0}^{F-1} x_{i,j} \ge d_j && \forall j \in \{0, \dots, D-1\} \\
& x_{i,j} \ge 0,\; y_i \in \{0, 1\} && \forall i, j
\end{aligned}
$$

## 核心要点

- **点级固定费用与弧级固定费用（#012）的对比**：#012 在每条运输路线上设开关，而 CFLP 在烘焙工坊节点上设开关，并将该工坊整行发货量的总和 $\sum_j x_{i,j}$ 与 $C_i y_i$ 关联。
- **通过分解约束收紧 LP 松弛**：在运输成本非负（$c_{i,j} \ge 0$）时，补充分解约束 $x_{i,j} \le \min(C_i, d_j) y_i$ 可剪除无益的超额发运同时保持整数最优解不变（若需求写为等式 `==` 则完整保持原整数可行域不变），从而消除根节点处的分数松弛（$y_i = d_j / C_i$）并加速分支定界。
- 概念参考：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

设置将每座烘焙工坊 `i` 的总发货量限制在 `capacities[i] * open[i]` 以下的耦合约束，以及确保各咖啡门店 `j` 收货总量满足其需求的约束，并最小化固定运营费与配送费之和。

**WaSHI (TypeScript)**

```ts
m.constraint(
  shipments.map((row, i) => expr`${sum(row)} <= ${input.capacities[i]} * ${open[i]}`)
);
m.constraint(
  input.demands.map(
    (demand, j) => expr`${sum(shipments.map((row) => row[j]))} >= ${demand}`
  )
);
m.objective(
  minimize(expr`dot(${input.fixedCosts}, ${open}) + dot(${input.unitCosts}, ${shipments})`)
);
```

**PuLP (Python)**

```python
for i in range(n_f):
    prob += pulp.lpSum(shipments[i][j] for j in range(n_d)) <= capacities[i] * open_vars[i]
for j in range(n_d):
    prob += pulp.lpSum(shipments[i][j] for i in range(n_f)) >= demands[j]
prob += pulp.lpDot(fixed_costs, open_vars) + pulp.lpSum(
    unit_costs[i][j] * shipments[i][j] for i in range(n_f) for j in range(n_d)
)
```
