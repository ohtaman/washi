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

- **`>=` 约束与最小化配合**：在 **#001** 中由 `<=` 上限约束限制利润增长；本题中 `minimize` 会把用量推向 `0`，而两条 `>=` 约束共同支撑起满足需求的最低成本解。
- **组合优于单一原料**：只买燕麦满足 9 份膳食纤维需要成本 `270`，组合使用 `(3, 2)` 只需成本 `190`。
- 术语参考：[指南与术语表 — 约束与目标函数](?view=guide&lang=zh#building-blocks)

## 核心代码片段

**WaSHI (TypeScript)**

```ts
m.constraint(expr`2 * ${oats} + ${beans} >= ${input.minProtein}`, "protein");
m.constraint(expr`${oats} + 3 * ${beans} >= ${input.minFiber}`, "fiber");
```

**Python (highspy)**

```python
h.addConstr(2 * oats + beans >= input_data["minProtein"])
h.addConstr(oats + 3 * beans >= input_data["minFiber"])
```
