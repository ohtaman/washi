## 解题思路

为各团队声明带有上下界 `[minAlloc[i], maxAlloc[i]]` 的连续变量 `x`，加入总需求守恒等式 `sum(x) == totalDemand`，并利用 WaSHI 原生凸二次规划（HiGHS QP）最小化 `dot(unitCosts, x) + fairnessWeight * sum((x - mean)^2)`（其中 $\bar{x} = \text{totalDemand} / n$）。

## 数学模型

$$
\begin{aligned}
\min_{x} \quad & \sum_{i=0}^{n-1} c_i x_i + \lambda \sum_{i=0}^{n-1} \left(x_i - \bar{x}\right)^2 \qquad \left(\bar{x} = \frac{D}{n}\right) \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} x_i = D \\
& l_i \le x_i \le u_i && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## 核心要点

- **四种公平性度量的对比（线性总和 vs 最大最小 vs 极差 vs L2 方差）**：
  - **纯成本总和**（$\lambda = 0$）：把任务全部塞给成本最低的团队直到上限，分布最不均衡。
  - **最大最小（$\max \min_i x_i$）与极差（$\max_i x_i - \min_i x_i$）**：虽可用 LP 表达，但仅关注极端个体，对中间梯队的分配差异不敏感。
  - **L2 方差惩罚（$\lambda \sum_i (x_i - \bar{x})^2$）**：在 $\lambda > 0$ 时具有严格凸性，能够平滑地将所有团队的负载拉向均值 $\bar{x}$ 并保证唯一最优解。
- **WaSHI 原生 `QuadExpr` 支持**：展开 $(x_i - \bar{x})^2 = x_i^2 - 2\bar{x}x_i + \bar{x}^2$ 得到半正定对角矩阵 $2\lambda I$，直接用 ``expr`sum((${x} - ${mean})^2)` `` 即可构建并由 HiGHS 连同常数偏移 $\lambda n \bar{x}^2$ 精确求解。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
const mean = input.totalDemand / n;
const x = input.minAlloc.map((lb, i) =>
  m.continuous({ lb, ub: input.maxAlloc[i], name: `x_${i}` })
);
m.constraint(expr`sum(${x}) == ${input.totalDemand}`, "total_demand");
m.objective(
  minimize(
    expr`dot(${input.unitCosts}, ${x}) + ${input.fairnessWeight} * sum((${x} - ${mean})^2)`
  )
);
await m.solve();
```
