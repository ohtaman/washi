## 解题思路

在二进制变量 $x_{i,d,s} \in \{0, 1\}$ 上施加每人每天至多一班约束，针对每个有效 `(d, s)` 班次依次添加总人数、资深负责人及各项技能的覆盖不等式，再对所有互斥对 $(a, b)$ 施加同班互斥约束 $x_{a,d,s} + x_{b,d,s} \le 1$，最小化总成本。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{N-1} \sum_{d=0}^{D-1} \sum_{s=0}^{S-1} c_{i,s} x_{i,d,s} \\
\text{s.t.} \quad & \sum_{s=0}^{S-1} x_{i,d,s} \le 1 && \forall i, d \\
& \sum_{i=0}^{N-1} x_{i,d,s} \ge D_{d,s}, \quad \sum_{i=0}^{N-1} L_i x_{i,d,s} \ge 1 && \forall (d, s) : D_{d,s} > 0 \\
& \sum_{i=0}^{N-1} A_{i,k} x_{i,d,s} \ge R_{s,k} && \forall (d, s) : D_{d,s} > 0, \; \forall k \\
& x_{a,d,s} + x_{b,d,s} \le 1 && \forall (a, b) \in \text{NG}, \; \forall d, s \\
& x_{i,d,s} \in \{0, 1\} && \forall i, d, s
\end{aligned}
$$

## 核心要点

- **同一分配向量的多属性覆盖**：对于任意班次 `(d, s)`，人数需求、资深带班标识（$L_i$）及多技能资质（$A_{i,k}$）均可直接对同一排班列向量做线性点积约束。
- **多技能人员与互斥约束的博弈**：具备多项技能的员工可同时满足多个技能门槛，但互斥对限制可能阻止其与最低成本资深带班同班。
- **按 `(d, s)` 索引互斥约束**：写作 $x_{a,d,s} + x_{b,d,s} \le 1$ 可保证互斥两人不在同一班次共事，但同一天仍可分派至不同班次。
- 概念参考：[指南与术语表 — 基本建模要素](?view=guide&lang=zh#building-blocks) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

**WaSHI (TypeScript)**

```ts
for (let d = 0; d < D; d++) {
  for (let s = 0; s < S; s++) {
    if (input.demands[d][s] <= 0) continue;
    const col = x.map((staff) => staff[d][s]);
    m.constraint([
      expr`${sum(col)} >= ${input.demands[d][s]}`,
      expr`dot(${input.isSenior}, ${col}) >= 1`,
    ]);
    for (let k = 0; k < K; k++) {
      if (input.skillDemands[s][k] > 0) {
        const coeffs = input.staffSkills.map((sk) => sk[k]);
        m.constraint(expr`dot(${coeffs}, ${col}) >= ${input.skillDemands[s][k]}`);
      }
    }
  }
}
for (const [a, b] of input.ngPairs) {
  for (let d = 0; d < D; d++) {
    for (let s = 0; s < S; s++) {
      m.constraint(expr`${x[a][d][s]} + ${x[b][d][s]} <= 1`);
    }
  }
}
```

**PuLP (Python)**

```python
for d in range(num_days):
    for s in range(num_shifts):
        if demands[d][s] <= 0:
            continue
        col = [x[i][d][s] for i in range(num_staff)]
        prob += pulp.lpSum(col) >= demands[d][s]
        prob += pulp.lpDot(is_senior, col) >= 1
        for k in range(num_skills):
            if skill_demands[s][k] > 0:
                prob += pulp.lpSum(staff_skills[i][k] * x[i][d][s] for i in range(num_staff)) >= skill_demands[s][k]
for a, b in ng_pairs:
    for d in range(num_days):
        for s in range(num_shifts):
            prob += x[a][d][s] + x[b][d][s] <= 1
```
