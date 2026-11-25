## 解题思路

将带容量选址问题拆分为 0-1 MIP 主问题（含 `open[i]` 与二阶段辅助估计变量 $\theta \ge 0$）和连续运输 LP 子问题，通过 `master.solveBenders` 协同迭代。当候选方案 $\bar{y}$ 总产能不足时，求解 Phase-I 最小松弛 LP 生成 Farkas 可行性割（`kind: "feasibility"`）；若可行，则读取运输 LP 对偶价格返回最优性割（`kind: "optimality"`）并上报 `subproblemObjective`。

## 数学模型

$$
\begin{aligned}
\text{(Master)} \quad \min \quad & \sum_{i} f_i y_i + \theta \\
\text{s.t.} \quad & \text{可行性割与最优性割约束}, \quad y_i \in \{0, 1\}, \ \theta \ge 0
\end{aligned}
$$

$$
\begin{aligned}
\text{(Sub}(\bar{y})\text{)} \quad \min \quad & \sum_{i,j} c_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{i} x_{ij} \ge d_j && \forall j \quad (\text{对偶变量 } \alpha_j \ge 0) \\
& \sum_{j} x_{ij} \le K_i \bar{y}_i && \forall i \quad (\text{对偶变量 } \beta_i \le 0), \quad x_{ij} \ge 0
\end{aligned}
$$

## 核心要点

- **基于强对偶的最优性割**：由线性规划对偶性得 $Q(\bar{y}) = \sum_j d_j \alpha_j + \sum_i K_i \beta_i \bar{y}_i$，对所有开仓决策有效的不等式为 $\theta - \sum_i K_i \beta_i y_i \ge \sum_j d_j \alpha_j$。
- **Phase-I 弹性可行性割**：`solveBenders` 的自动模式在子问题不可行时会抛出错误，因此需要自定义 `subproblem` 回调，在开放产能不足以满足需求时求解 Phase-I 最小松弛 LP（$\min \sum_j s_j$），利用其对偶变量 $(\alpha', \beta')$ 构造严格 Farkas 可行性割 $\sum_i (-K_i \beta'_i) y_i \ge \sum_j d_j \alpha'_j$，且此时不设置 `subproblemObjective`，以免污染上界。
- **还原最优运输流量**：`solveBenders` 收敛并确定最优 `open` 后，固定该开仓方案再解一次运输 LP 即可精确还原 `shipments` 矩阵。
- 概念参考：[指南与术语表 — 常见优化问题类型](?view=guide&lang=zh#paradigms) / [变量类型](?view=guide&lang=zh#variable-types)

## 实现要点

在 `master.solveBenders` 的 `subproblem` 回调中，`buildShippingLp` 负责构建运输 LP 或 Phase-I 最小松弛 LP，割平面辅助函数负责组装 Benders 割的各项表达式：当开放产能不足时从 Phase-I 松弛 LP 返回 `kind: "feasibility"` 割平面；可行时从运输 LP 的对偶价格返回 `kind: "optimality"` 割平面与 `subproblemObjective`。

**WaSHI (TypeScript)**

```ts
const res = await master.solveBenders({
  theta,
  gapTolerance: 1e-5,
  subproblem: async ({ getMasterValue }) => {
    const yBar = open.map((v) => Math.round(getMasterValue(v)) || 0);
    if (sumCap(yBar) < totalDemand - 1e-6) {
      const p1 = buildShippingLp(input, yBar, true);
      await p1.sub.solve();
      const alpha = p1.demCons.map((c) => c.dual ?? 0);
      const beta = p1.capCons.map((c) => c.dual ?? 0);
      return { kind: "feasibility", constraint: expr`${farkasLhs(beta)} >= ${rhs(alpha)}` };
    }
    const p2 = buildShippingLp(input, yBar, false);
    await p2.sub.solve();
    const alpha = p2.demCons.map((c) => c.dual ?? 0);
    const beta = p2.capCons.map((c) => c.dual ?? 0);
    return {
      kind: "optimality",
      constraint: expr`${thetaLhs(theta, beta)} >= ${rhs(alpha)}`,
      subproblemObjective: fixedCost(yBar) + (p2.sub.objectiveValue ?? 0),
    };
  },
});
```
