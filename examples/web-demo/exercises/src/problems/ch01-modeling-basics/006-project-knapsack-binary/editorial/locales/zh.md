## 解题思路

将每项防灾设备是否安装定义为 **0-1 二进制变量** $x_i \in \{0, 1\}$，在总费用不超过预算 $B$ 的约束下最大化预期总评分。在 WaSHI（以及 PuLP）中，可以使用 `m.binary(...)` / `LpBinary` 和 `dot` / `lpDot` 简洁地表达。

## 数学模型

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} v_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} c_i x_i \le B \\
& x_i \in \{0, 1\} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## 核心要点

- **为什么贪心法无法得到最优解（0-1 背包）**：仅按性价比（评分/费用）从高到低挑选，可能会留下零头预算而无法达到全局最优（示例中总评分为 36）。使用 MIP 求解器则能从全部组合中找出最优集合。
- **0-1 变量的读取**：在 PuLP (Python) 中，由于浮点容差可能会返回 `0.999999999` 或 `-0.0`，读取时请用 `round(pulp.value(v))` 取整。在 WaSHI 中，`Binary` 变量的 `v.value` 会在内部自动归一化为整数，因此可直接使用 `v.value!`。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

用 `m.binary(...)`（PuLP 为 `cat=pulp.LpBinary`）表示各设备的选择状态，并通过 `dot` / `pulp.lpDot` 简洁地编写预算约束和目标函数之和。

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
