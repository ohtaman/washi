## 解题思路

创建长度为 `margins.length` 的非负连续变量数组 `quantities`，将每一行资源消耗 `usages[k]` 映射为 `dot(...) <= capacities[k]` 约束，并最大化总利润 `dot(margins, quantities)`。

## 数学模型

$$
\begin{aligned}
\max \quad & \sum_{j=0}^{n-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} a_{k,j} x_j \le b_k && \forall k \in \{0, \dots, m-1\} \\
& x_j \ge 0 && \forall j \in \{0, \dots, n-1\}
\end{aligned}
$$

## 核心要点

- **使用 `.map()` 构建数据驱动约束**：与 **#001** 中手写固定约束不同，这里可以通过 `input.capacities.map(...)` 将任意数量的资源上限生成约束数组并一次传入 `m.constraint([...])`。
- **连续变量与小数最优解**：与将数量限制为整数的 **#003** 不同，本题将产量建模为连续变量（LP），因此最优解中可能包含小数。对于可行域有界且非空的 LP，最优解一定存在于多面体的某个顶点上，作为约束交点出现非整数值是很自然的。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

由于口味种类与材料设备数量随输入数据变化，请使用 `.map()`（WaSHI）或循环（PuLP）动态生成约束，并用 `dot` / `pulp.lpDot` 简洁地表达内积。

**WaSHI (TypeScript)**

```ts
const quantities = m.continuous(input.margins.length, { lb: 0, prefix: "q" });

m.constraint(
  input.capacities.map(
    (cap, k) => expr`dot(${input.usages[k]}, ${quantities}) <= ${cap}`
  )
);
m.objective(maximize(expr`dot(${input.margins}, ${quantities})`));
```

**PuLP (Python)**

```python
for k, cap in enumerate(capacities):
    prob += pulp.lpDot(usages[k], quantities) <= cap
prob += pulp.lpDot(margins, quantities)
prob.solve(pulp.HiGHS(msg=False))
```
