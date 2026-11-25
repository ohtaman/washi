## 解题思路

为各团队声明连续分配变量 $x_i \in [l_i, u_i]$，在总需求守恒约束 $\sum_i x_i = D$ 下，利用 WaSHI 原生凸二次规划（HiGHS QP）直接最小化凸二次目标函数 $\sum_i c_i x_i + \lambda \sum_i (x_i - \bar{x})^2$（其中 $\bar{x} = D / n$ 为已知的平均分配量）。

## 数学模型

$$
\begin{aligned}
\min_{x} \quad & \sum_{i=0}^{n-1} c_i x_i + \lambda \sum_{i=0}^{n-1} \left(x_i - \bar{x}\right)^2 \qquad \left(\bar{x} = \frac{D}{n}\right) \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} x_i = D \\
& l_i \le x_i \le u_i && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## 核心要点

- **公平性度量的对比**：纯成本总和（$\lambda = 0$）会把任务集中到成本最低的团队直至上限 $u_i$，导致分配极度不均衡。虽然最大最小（$\max \min_i x_i$）与极差（$\max_i x_i - \min_i x_i$）可用 LP 表达，但仅约束极端个体，对中间梯队的差异不敏感。相比之下，L2 方差惩罚（$\lambda \sum_i (x_i - \bar{x})^2$）在 $\lambda > 0$ 时具有严格凸性，能平滑地将所有团队的负载拉向均值 $\bar{x}$ 并保证唯一最优解。
- **WaSHI 原生 `QuadExpr` 支持**：展开 $(x_i - \bar{x})^2 = x_i^2 - 2\bar{x}x_i + \bar{x}^2$ 得到半正定对角海森矩阵 $2\lambda I \succeq 0$。WaSHI 的 `expr` 模板字面量可将平方偏差和直接构建为 `QuadExpr`，并由 HiGHS 连同常数偏移 $\lambda n \bar{x}^2$ 一并精确求解。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

预先将平均分配量 `mean` 作为输入常数计算出来，用 `minAlloc.map(...)` 创建带上下界的连续变量，然后直接通过 `expr` 将平方偏差 $(x_i - \bar{x})^2$ 作为凸二次目标函数传入。

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
