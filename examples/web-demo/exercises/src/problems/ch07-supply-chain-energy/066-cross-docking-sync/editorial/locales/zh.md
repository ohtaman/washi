## 解题思路

为避免月台指派二进制变量 $(x_{i,r}, y_{j,s})$ 与车对车货流 $(f_{i,j,k})$ 的双线性乘积，引入按月台对拆解的连续转运流量 $w_{i,j,r,s} \ge 0$，并借助连线指示变量 $z_{i,j} \in \{0, 1\}$ 对到站时间加转运耗时约束进行大 M 线性化。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i,j,r,s} c_{r,s} w_{i,j,r,s} + \gamma_{\text{delay}} \sum_{j} T_j \\
\text{s.t.} \quad & \sum_{r} x_{i,r} = 1, \quad \sum_{i} x_{i,r} \le C^{\text{in}}_r && \forall i, r \\
& \sum_{s} y_{j,s} = 1, \quad \sum_{j} y_{j,s} \le C^{\text{out}}_s && \forall j, s \\
& \sum_{j} f_{i,j,k} \le A_{i,k}, \quad \sum_{i} f_{i,j,k} = B_{j,k} && \forall i, j, k \\
& \sum_{r,s} w_{i,j,r,s} = \sum_{k} f_{i,j,k} \le M_{i,j} z_{i,j} && \forall i, j \\
& \sum_{s} w_{i,j,r,s} \le M_{i,j} x_{i,r}, \quad \sum_{r} w_{i,j,r,s} \le M_{i,j} y_{j,s} && \forall i, j, r, s \\
& t_j \ge a_i + \tau_{r,s} - M_T (3 - x_{i,r} - y_{j,s} - z_{i,j}) && \forall i, j, r, s \\
& T_j \ge t_j - d_j, \quad T_j \ge 0 && \forall j
\end{aligned}
$$

其中 $M_{i,j} = \sum_k \min(A_{i,k}, B_{j,k})$，$M_T = \max_i a_i + \max_{r,s} \tau_{r,s}$。

## 核心要点

- **无需二次项的月台对费用线性化**：由于每辆车仅停靠唯一月台（$\sum_r x_{i,r} = 1, \sum_s y_{j,s} = 1$），通过限制 $\sum_s w_{i,j,r,s} \le M_{i,j} x_{i,r}$ 与 $\sum_r w_{i,j,r,s} \le M_{i,j} y_{j,s}$，仅需连续变量 $w_{i,j,r,s}$ 即可精确锁定实际发生的 $(r,s)$ 路径费用。
- **紧致构造两类 Big-M 上界**：车对之间货流上限 $M_{i,j}$ 取各品类供需交集之和，时间大 $M_T$ 取最大到站与最大搬运时间之和，兼顾模型严谨性与松弛紧度。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${pairFlowSum} <= ${maxPairFlow} * ${z[i][j]}`);
m.constraint(expr`${sum(w[i][j].flat())} - ${pairFlowSum} == 0`);
for (let r = 0; r < R; r++) {
  m.constraint(expr`${sum(w[i][j][r])} <= ${maxPairFlow} * ${x[i][r]}`);
}
for (let s = 0; s < S; s++) {
  m.constraint(expr`${sum(w[i][j].map((row) => row[s]))} <= ${maxPairFlow} * ${y[j][s]}`);
}
for (let r = 0; r < R; r++) {
  for (let s = 0; s < S; s++) {
    const rhs = input.arrivalTimes[i] + input.transferTimes[r][s] - 3 * bigMT;
    m.constraint(
      expr`${dep[j]} - ${bigMT} * ${x[i][r]} - ${bigMT} * ${y[j][s]} - ${bigMT} * ${z[i][j]} >= ${rhs}`
    );
  }
}
```

**PuLP (Python)**

```python
prob += pair_flow <= m_ij * z[i][j]
prob += pulp.lpSum(w[i][j][r][s] for r in range(R) for s in range(S)) == pair_flow
for r in range(R):
    prob += pulp.lpSum(w[i][j][r][s] for s in range(S)) <= m_ij * x[i][r]
for s in range(S):
    prob += pulp.lpSum(w[i][j][r][s] for r in range(R)) <= m_ij * y[j][s]
for r in range(R):
    for s in range(S):
        prob += dep[j] >= arrivals[i] + transfer_times[r][s] - big_m_t * (3 - x[i][r] - y[j][s] - z[i][j])
```
