## 解题思路

用二进制变量 `used[k]` 表示箱子启用状态、`assign[i][k]` 表示物品分配关系。通过前缀排序（`used[k] >= used[k+1]` 且对 $k > i$ 固定 `assign[i][k] = 0`）破除箱号对称性，再添加全局向上取整容量割 $\sum_k y_k \ge \lceil \sum_i w_i / B \rceil$ 与扩展极小覆盖不等式显著提升 LP 松弛下界。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{k=0}^{n-1} y_k \\
\text{s.t.} \quad & \sum_{k=0}^{n-1} x_{ik} = 1, \quad x_{ik} = 0 \; (\forall k > i), \quad y_k \ge y_{k+1} \\
& \sum_{i=0}^{n-1} w_i x_{ik} \le B y_k && \forall k \\
& \sum_{k=0}^{n-1} y_k \ge \left\lceil \frac{1}{B} \sum_{i=0}^{n-1} w_i \right\rceil \\
& \sum_{i \in E(C)} x_{ik} \le (|C| - 1) y_k && \forall k, \; \forall \text{ 极小覆盖 } C \\
& x_{ik}, y_k \in \{0, 1\}
\end{aligned}
$$

其中 $E(C) = C \cup \{j : w_j \ge \max_{i \in C} w_i\}$ 为极小覆盖 $C$ 的扩展覆盖集。

## 核心要点

- **对称性破除**：无序模型中启用 $m$ 个箱子会衍生 $m!$ 个等价解。约束 $x_{ik} = 0$（$k > i$，从而强制物品 0 在箱 0）与 $y_k \ge y_{k+1}$ 能消除重复搜索树并保留至少一个最优解。
- **扩展极小覆盖不等式**：若子集 $C$ 满足 $\sum_{i \in C} w_i > B$ 且去掉最轻物品后不超过 $B$，则任何比 $C$ 中最重物品更重的外部物品替换进 $C$ 仍超重，因此任意单个箱子至多容纳 $E(C)$ 中的 $|C| - 1$ 件物品。
- **抬升松弛下界**：将二元冲突覆盖、三元扩展覆盖与全局取整容量割结合，可把弱分数松弛值（如 `[6,6,6,2]` 或 `[4,4,4,4,4]` 上的 2.0）抬升至接近或等于整数最优值。
- 概念参考：[指南与术语表 — 常见优化问题类型](?view=guide&lang=zh#paradigms) / [模型基本要素](?view=guide&lang=zh#building-blocks)

## 实现要点

使用 `used.slice(0, -1).map(...)` 生成前缀顺序约束，通过嵌套 `buildExtendedCovers(...).flatMap(...)` 与 `used.map(...)` 批量生成扩展极小覆盖不等式，并依次执行 `await m.relax()` 与 `await m.solve()`。

**WaSHI (TypeScript)**

```ts
m.constraint(used.slice(0, -1).map((u, k) => expr`${u} >= ${used[k + 1]}`));
m.constraint(expr`sum(${used}) >= ${Math.ceil(totalWeight / input.binCapacity)}`, "global_cap");
m.constraint(
  buildExtendedCovers(input.weights, input.binCapacity).flatMap((cut) =>
    used.map((u, k) => expr`sum(${cut.items.map((i) => assign[i][k])}) <= ${cut.rhsMult} * ${u}`)
  )
);
await m.relax();
const lpBound = m.objectiveValue!;
await m.solve();
```

**PuLP (Python)**

```python
for k in range(n - 1):
    prob += used[k] >= used[k + 1]
prob += pulp.lpSum(used) >= math.ceil(sum(weights) / bin_cap)
for ext, rhs_mult in covers:
    for k in range(n):
        prob += pulp.lpSum(assign[i][k] for i in ext) <= rhs_mult * used[k]
```
