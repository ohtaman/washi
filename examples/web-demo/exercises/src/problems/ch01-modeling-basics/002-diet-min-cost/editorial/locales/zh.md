## 解题思路

将燕麦与豆类的用量设为非负连续决策变量，添加两条 `>=` 营养下限约束，并对总成本执行 **最小化（`minimize`）**。

## 数学模型

$$
\begin{aligned}
\min \quad & 30x + 50y \\
\text{s.t.} \quad & 2x + y \ge \text{minProtein} \\
& x + 3y \ge \text{minFiber} \\
& x, y \ge 0
\end{aligned}
$$

## 要点总结

- **上限约束与下限约束**：在 **#001** 中，由 `<=` 上限约束抑制 `maximize` 无限增大；而在本题中，`minimize` 会试图将成本压低至 0，两条 `>=` 下限约束则从下方支撑起可行解。
- **为什么混合配方比单一原料更省钱**：按单位营养成本来看，燕麦提供单位蛋白质更便宜（15），而豆类提供单位膳食纤维更便宜（约 16.7）。因此，以 $3:2$ 均衡搭配两者比只靠单一原料更能降低总成本。
- 术语参考：[指南与术语表 — 约束与目标函数](?view=guide&lang=zh#building-blocks)

## 核心代码片段

将目标函数设为最小化（`minimize` / `pulp.LpMinimize`），并使用 `>=` 添加各营养素的下限约束。关键在于把目标方向（最大化还是最小化）与约束不等号方向（`<=` 还是 `>=`）成对核对。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`2 * ${oats} + ${beans} >= ${input.minProtein}`, "protein");
m.constraint(expr`${oats} + 3 * ${beans} >= ${input.minFiber}`, "fiber");
```

**PuLP (Python)**

```python
prob += 2 * oats + beans >= min_protein
prob += oats + 3 * beans >= min_fiber
```
