## 解题思路

创建 0-1 变量 `selected[j]`，为每个资源维度添加容量约束，并将前置依赖 `selected[a] <= selected[b]` 与互斥冲突 `selected[c] + selected[d] <= 1` 写成线性不等式，最大化总价值。

## 数学模型

$$
\begin{aligned}
\max \quad & \sum_{j=0}^{n-1} v_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} w_{k,j} x_j \le C_k && \forall k \in \{0, \dots, m-1\} \\
& x_a \le x_b && \forall (a, b) \in \mathcal{P} \\
& x_c + x_d \le 1 && \forall (c, d) \in \mathcal{I} \\
& x_j \in \{0, 1\} && \forall j
\end{aligned}
$$

## 核心要点

- **多维约束下单一性价比排序会失效**：某项目在资源 0 上性价比极高，却可能耗尽资源 1；必须同时联立全部维度才能找到全局最优解。
- **依赖图边与背包打包耦合**：$x_a \le x_b$ 自动把前置依赖的资源占用计入联动决策，$x_c + x_d \le 1$ 则阻止同时选用互斥高价项。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [模型基本要素](?view=guide&lang=zh#building-blocks)

## 实现要点

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.capacities.map((cap, k) => expr`dot(${input.weights[k]}, ${selected}) <= ${cap}`)
);
m.constraint(
  input.prerequisites.map(([a, b]) => expr`${selected[a]} <= ${selected[b]}`)
);
m.constraint(
  input.incompatibles.map(([c, d]) => expr`${selected[c]} + ${selected[d]} <= 1`)
);
```

**PuLP (Python)**

```python
for k, cap in enumerate(capacities):
    prob += pulp.lpDot(weights[k], selected) <= cap
for a, b in prerequisites:
    prob += selected[a] <= selected[b]
for c, d in incompatibles:
    prob += selected[c] + selected[d] <= 1
```
