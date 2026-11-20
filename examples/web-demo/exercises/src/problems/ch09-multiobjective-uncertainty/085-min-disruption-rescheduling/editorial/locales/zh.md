## 解题思路

建立二进制排班矩阵变量 $x_{it}$，将不可用时段强制置零，加入时段人数等式和员工班次上限后，利用已知常数基准矩阵 $x^{\text{base}}_{it} \in \{0, 1\}$ 直接将汉明距离写为纯线性表达式并最小化。

## 数学模型

$$
\begin{aligned}
\min_{x \in \{0,1\}^{m \times T}} \quad & W \sum_{i,t} \left((1 - x^{\text{base}}_{it}) x_{it} + x^{\text{base}}_{it}(1 - x_{it})\right) + \sum_{i,t} c_i x_{it} \\
\text{s.t.} \quad & x_{it} = 0 && \forall (i,t):\; u_{it} = 1 \\
& \sum_{i=0}^{m-1} x_{it} = D_t && \forall t \in \{0, \dots, T-1\} \\
& \sum_{t=0}^{T-1} x_{it} \le S_i && \forall i \in \{0, \dots, m-1\}
\end{aligned}
$$

## 核心要点

- **对常基准矩阵的汉明距离无需额外辅助变量**：由于 $x^{\text{base}}_{it} \in \{0, 1\}$ 为已知常量，$|x_{it} - x^{\text{base}}_{it}|$ 在 $x^{\text{base}}_{it}=0$ 时等于 $x_{it}$，在 $x^{\text{base}}_{it}=1$ 时等于 $1-x_{it}$，天然呈线性，不需引入绝对值辅助变量。
- **级联替换与稳定-成本权衡**：受 `maxShifts` 约束时，单一缺勤会触发跨时段多员工替换；而 `disruptionWeight` 的大小决定了模型是“优先原样保留（用例 2）”还是“换用更便宜人员（用例 4）”。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [核心建模要素](?view=guide&lang=zh#building-blocks)

## 实现要点

**WaSHI (TypeScript)**

```ts
const hammingExpr = sum(
  x.flatMap((row, i) =>
    row.map((v, t) => {
      const b = input.baseline[i][t];
      return expr`(1 - ${b}) * ${v} + ${b} * (1 - ${v})`;
    })
  )
);
const assignCostExpr = sum(x.map((row, i) => expr`${input.workerCosts[i]} * ${sum(row)}`));
m.objective(minimize(expr`${input.disruptionWeight} * ${hammingExpr} + ${assignCostExpr}`));
```

**PuLP (Python)**

```python
hamming_expr = pulp.lpSum(
    (1 - baseline[i][t]) * x[i][t] + baseline[i][t] * (1 - x[i][t])
    for i in range(m_workers)
    for t in range(n_slots)
)
assign_expr = pulp.lpSum(
    worker_costs[i] * x[i][t] for i in range(m_workers) for t in range(n_slots)
)
prob += disruption_weight * hamming_expr + assign_expr
```
