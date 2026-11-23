## 解题思路

为每个候选项目声明 0-1 二进制变量（`m.binary(...)` / `pulp.LpVariable(..., cat=pulp.LpBinary)`），添加预算上限约束 `dot(costs, selected) <= budget`，并最大化总收益 `dot(values, selected)`。

## 数学模型

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} v_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} c_i x_i \le B \\
& x_i \in \{0, 1\} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## 核心要点

- **为什么贪心法在 0-1 背包上会失效**：按“收益/成本”性价比贪心选择常常会留下无法塞入其他项目的剩余预算（如停在收益 `30`），而整数规划求解器能在全局组合中精准找到总收益 `36` 的最优方案。
- **二进制结果的读取**：WaSHI 会自动将 `Binary` 变量的 `v.value` 归一化为精确整数，可直接使用 `v.value!`；而在 PuLP (Python) 中，求解器浮点容差仍可能返回 `0.999999999` 或 `-0.0`，建议用 `round(pulp.value(v))` 取整。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

**WaSHI (TypeScript)**

```ts
const selected = m.binary(input.costs.length, { prefix: "sel" });

m.constraint(expr`dot(${input.costs}, ${selected}) <= ${input.budget}`, "budget");
m.objective(maximize(expr`dot(${input.values}, ${selected})`));
```

**PuLP (Python)**

```python
selected = [pulp.LpVariable(f"sel_{i}", cat=pulp.LpBinary) for i in range(n)]

prob += pulp.lpDot(costs, selected) <= budget
prob += pulp.lpDot(values, selected)
prob.solve(pulp.HiGHS(msg=False))
```
