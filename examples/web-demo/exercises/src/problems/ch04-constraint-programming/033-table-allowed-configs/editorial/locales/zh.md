## 解题思路

为每个组件声明有界整数变量 `choices[c]`，分别用 `allowed(vars, tuples)` 与 `not(allowed(vars, tuples))` 表达正表允许组合与负表禁用组合，并通过 `at(componentCosts[c], choices[c])` 累加并最小化总配置成本。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{c=0}^{k-1} \text{cost}_{c,\, x_c} \\
\text{s.t.} \quad & (x_{v_1}, \dots, x_{v_r}) \in T^+ && \forall (V, T^+) \in \mathcal{R}_{\text{allowed}} \\
& (x_{v_1}, \dots, x_{v_r}) \notin T^- && \forall (V, T^-) \in \mathcal{R}_{\text{forbidden}} \\
& x_c \in \{0, \dots, |\text{cost}_c| - 1\} && \forall c
\end{aligned}
$$

## 核心要点

- **外延表约束与代数线性化对比**：在 MIP 中表达二元或三元非规则兼容表往往需要引入大量元组选择 0-1 变量；在 CP 中，`allowed()` 和 `not(allowed())` 直接映射到 Pumpkin 原生的 `table` 与 `negative_table` 传播器。
- **通过 `not(allowed(...))` 简洁表达稀疏禁忌**：只需列出少量冲突元组即可排除非法配置，无需人工枚举补集。
- 参考资料：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [常见优化问题类型](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.allowedRules.map((r) => allowed(r.vars.map((c) => choices[c]), r.tuples))
);
m.constraint(
  input.forbiddenRules.map((r) => not(allowed(r.vars.map((c) => choices[c]), r.tuples)))
);
m.objective(minimize(sum(input.componentCosts.map((costs, c) => at(costs, choices[c])))));
await m.solve({ solver: "pumpkin" });
```
