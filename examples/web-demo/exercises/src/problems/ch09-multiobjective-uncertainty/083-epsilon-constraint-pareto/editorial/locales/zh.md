## 解题思路

遍历 `epsilons` 中的每一个排放上限 $\varepsilon_k$，分别建立在公共预算上限和副目标约束 $\sum e_j x_j \le \varepsilon_k$ 下最大化总利润的 MIP 并求解，依次记录每一点的最优选择方案与最大利润。

## 数学模型

$$
\begin{aligned}
\forall k \in \{0, \dots, K-1\}: \quad z(\varepsilon_k) = \max_{x \in \{0,1\}^n} \quad & \sum_{j=0}^{n-1} p_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} b_j x_j \le B_{\text{cap}} \\
& \sum_{j=0}^{n-1} e_j x_j \le \varepsilon_k
\end{aligned}
$$

## 核心要点

- **捕捉加权和法遗漏的非支撑帕累托点**：含二进制变量的离散 MIP 帕累托前沿可能是非凸的，线性加权和 $\max p^\top x - w\, e^\top x$ 只能求出上凸包上的点而跳过凹陷处的非支撑解（例如题面示例中的 $(e=6, p=45)$ 严格位于 $(0, 0)$ 与 $(11, 85)$ 连线下方）。通过扫描各阈值 $\varepsilon_k$，无论前沿是否凸都能求得对应阈值的精确最大利润 $z(\varepsilon_k)$（若同利润下存在并列解且需要严格非支配点，可在目标中加入微小排放惩罚项，即增广 $\varepsilon$-约束法）。
- **无需量纲缩放调参**：将排放直接写成显式物理约束，避免主观设定权重比例，并直接回答“排放不超过 $\varepsilon_k$ 时的最大利润是多少”的业务问题。
- 概念参考：[指南与术语表 — 常见优化问题类型](?view=guide&lang=zh#paradigms) / [模型基本要素](?view=guide&lang=zh#building-blocks)

## 实现要点

为 `input.epsilons` 中的每个排放阈值创建一个独立的 `Model`，使用 `dot(...)` 描述预算约束、排放约束与利润最大化，并依次调用 `await m.solve()` 求解。

**WaSHI (TypeScript)**

```ts
for (const [k, eps] of input.epsilons.entries()) {
  const m = new Model(`EpsilonPareto_${k}`);
  const x = m.binary(n, { prefix: "x" });
  m.constraint(expr`dot(${input.budgets}, ${x}) <= ${input.budgetCap}`);
  m.constraint(expr`dot(${input.emissions}, ${x}) <= ${eps}`);
  m.objective(maximize(expr`dot(${input.profits}, ${x})`));
  await m.solve();
  selections.push(x.map((v) => Math.round(v.value!) || 0));
  frontierProfits.push(m.objectiveValue!);
}
```

**PuLP (Python)**

```python
for k, eps in enumerate(epsilons):
    prob = pulp.LpProblem(f"epsilon_pareto_{k}", pulp.LpMaximize)
    x = [pulp.LpVariable(f"x_{j}", cat=pulp.LpBinary) for j in range(n)]
    prob += pulp.lpDot(budgets, x) <= budget_cap
    prob += pulp.lpDot(emissions, x) <= eps
    prob += pulp.lpDot(profits, x)
    prob.solve(pulp.HiGHS(msg=False))
    selections.append([round(pulp.value(v)) for v in x])
    frontier_profits.append(float(pulp.value(prob.objective)))
```
