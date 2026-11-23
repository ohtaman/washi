## 解题思路

声明 0-1 变量 `selected[i]`，在预算约束之上将互斥分组（`<= 1`）、精确计数分组（`== count`）和至少选一分组（`>= 1`）直接写为对应变量求和的线性约束，并最大化总价值。

## 数学模型

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} v_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} c_i x_i \le B \\
& \sum_{i \in G} x_i \le 1 && \forall G \in \mathcal{G}_{\text{mutex}} \\
& \sum_{i \in G} x_i = k_G && \forall (G, k_G) \in \mathcal{G}_{\text{exact}} \\
& \sum_{i \in G} x_i \ge 1 && \forall G \in \mathcal{G}_{\ge 1} \\
& x_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## 核心要点

- **0-1 变量之和即“选中计数”**：由于 $x_i \in \{0, 1\}$，$\sum_{i \in G} x_i$ 精确等于集合 $G$ 内被选中的项目数量，由此可直接以 `<= 1`、`== k` 与 `>= 1` 统一表达互斥、定额与保底规则。
- **跨组重叠天然支持**：同一个项目同时出现在多个分组约束中时无需引入额外辅助变量，求解器会全局协调所有重叠约束。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [模型基本要素](?view=guide&lang=zh#building-blocks)

## 实现要点

在预算上限约束之外，分别遍历三类分组数组，对相应项目的二元变量 `selected[i]` 之和添加 `<= 1`、`== count`、`>= 1` 约束。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`dot(${input.costs}, ${selected}) <= ${input.budget}`, "budget");
m.constraint(
  input.mutexGroups.map((group) => expr`${sum(group.map((i) => selected[i]))} <= 1`)
);
m.constraint(
  input.exactGroups.map(
    (g) => expr`${sum(g.indices.map((i) => selected[i]))} == ${g.count}`
  )
);
m.constraint(
  input.atLeastOneGroups.map((group) => expr`${sum(group.map((i) => selected[i]))} >= 1`)
);
```

**PuLP (Python)**

```python
prob += pulp.lpDot(costs, selected) <= budget
for group in mutex_groups:
    prob += pulp.lpSum(selected[i] for i in group) <= 1
for rule in exact_groups:
    prob += pulp.lpSum(selected[i] for i in rule["indices"]) == rule["count"]
for group in at_least_one_groups:
    prob += pulp.lpSum(selected[i] for i in group) >= 1
```
