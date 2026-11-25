## 解题思路

应用 Bertsimas-Sim (2004) 鲁棒对偶重构：针对最坏波动内层最大化 $\max_{0 \le \delta \le 1,\, \sum \delta_j \le \Gamma} \sum_j \hat{a}_j x_j \delta_j$ 引入对偶变量 $z \ge 0$ 与 $p_j \ge 0$ 及线性不等式 $z + p_j \ge \hat{a}_j x_j$，将产能约束中的对抗波动项替换为 $\Gamma z + \sum_j p_j$ 并求解 LP。其中 $c_j, \bar{a}_j, \hat{a}_j, u_j, b$ 分别对应 `profits`、`nominalUsages`、`deviations`、`maxUnits` 和 `capacityCap`。

## 数学模型

$$
\begin{aligned}
\max_{x, z, p \ge 0} \quad & \sum_{j=0}^{n-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} \bar{a}_j x_j + \Gamma z + \sum_{j=0}^{n-1} p_j \le b \\
& z + p_j \ge \hat{a}_j x_j && \forall j \in \{0, \dots, n-1\} \\
& 0 \le x_j \le u_j && \forall j
\end{aligned}
$$

## 核心要点

- **无需枚举 $\binom{n}{\lfloor\Gamma\rfloor}$ 个子集即可精准线性化**：基于连续预算多面体 $\{0 \le \delta_j \le 1,\; \sum \delta_j \le \Gamma\}$ 的强对偶性，仅新增 $n+1$ 个变量与 $n$ 条约束就能精确覆盖整数乃至小数 $\Gamma$（如用例 3 中 $\Gamma = 2.5$）。
- **连接名义解（$\Gamma = 0$）与盒式保守解（$\Gamma = n$）**：$\Gamma = 0$ 虽取得最高名义利润（用例 1 为 237.14）却在波动下违规；$\Gamma = n$ 过于保守（用例 2 降至 172）；中间 $\Gamma$ 值则通过拉平头部波动暴露 $\hat{a}_j x_j$ 实现稳健分散（用例 0 三者均恰为 3）。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

将对偶变量 `z` 与 `p` 声明为非负连续变量，用 `input.deviations.map(...)` 注册各产品最坏偏差约束，并在产能约束左侧加上对偶保护项 $\Gamma z + \sum_j p_j$。

**WaSHI (TypeScript)**

```ts
const z = m.continuous("z", { lb: 0 });
const p = m.continuous(n, { lb: 0, prefix: "p" });
m.constraint(input.deviations.map((dev, j) => expr`${z} + ${p[j]} >= ${dev} * ${x[j]}`));
m.constraint(
  expr`dot(${input.nominalUsages}, ${x}) + ${input.gamma} * ${z} + sum(${p}) <= ${input.capacityCap}`
);
```

**PuLP (Python)**

```python
z = pulp.LpVariable("z", lowBound=0)
p = [pulp.LpVariable(f"p_{j}", lowBound=0) for j in range(n)]
for j in range(n):
    prob += z + p[j] >= deviations[j] * x[j]
prob += pulp.lpDot(nominal_usages, x) + gamma * z + pulp.lpSum(p) <= capacity_cap
```
