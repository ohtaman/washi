## 解题思路

为每条无向边（$0 \le i < j < n$）定义二进制变量 $x_{ij} \in \{0, 1\}$，并从要求每座城市度数为 2 的 2-匹配松弛模型出发。每轮求解整数规划后抽取连通圈；若出现多个独立子环，则为所有子环 $S$ 添加 DFJ 割 $\sum_{i,j \in S, i < j} x_{ij} \le |S| - 1$ 并重算，直到只剩一条哈密顿回路。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{0 \le i < j < n} d_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_{j < i} x_{ji} + \sum_{j > i} x_{ij} = 2 && \forall i \in \{0, \dots, n-1\} \\
& \sum_{\substack{i, j \in S \\ i < j}} x_{ij} \le |S| - 1 && \forall \text{ 被分离的子环 } S \subsetneq V \\
& x_{ij} \in \{0, 1\} && \forall 0 \le i < j < n
\end{aligned}
$$

## 核心要点

- **按需生成指数级约束**：真子集共有 $2^n - 2$ 个，但仅对当前整数解中真正出现的子环添加惰性 DFJ 割，通常只需极少几轮迭代就能收敛到全局最优。
- **多割并行分离**：每轮把所有检测到的子环同时转化为割平面，比每次只加一条割能大幅减少重解次数（在 WaSHI 中也可通过 `master.solveBenders` 返回 `kind: "feasibility"` 割来实现）。
- **无向边模型天然排除二元子环**：每对城市只设一个无向边变量，因此不存在长度为 2 的子环，最小子环长度为 3；这也是为什么 $n = 5$ 首轮即可连通而 $n \ge 6$ 会出现 $3+3$ 等子环分裂。
- 概念参考：[指南与术语表 — 常见优化问题类型](?view=guide&lang=zh#paradigms) / [求解状态术语](?view=guide&lang=zh#solver-status)

## 实现要点

在 `while` 循环中保持同一个 `Model` 实例，调用 `await m.solve()` 求解；若尚未形成单一回路，则对找到的每个子环 `comp` 通过 `m.constraint(...)` 逐次添加 DFJ 割平面。

**WaSHI (TypeScript)**

```ts
while (true) {
  iterations++;
  await m.solve();
  const components = extractCycles(edges, n);
  if (components.length === 1) {
    finalTour = components[0];
    break;
  }
  components.forEach((comp, idx) => {
    const internalEdges = collectInternalEdges(comp, edges);
    m.constraint(expr`sum(${internalEdges}) <= ${comp.length - 1}`, `dfj_${iterations}_${idx}`);
  });
}
```

**PuLP (Python)**

```python
while True:
    iterations += 1
    prob.solve(pulp.HiGHS(msg=False))
    components = extract_cycles(edges, n)
    if len(components) == 1:
        final_tour = components[0]
        break
    for comp in components:
        prob += pulp.lpSum(edges[(min(a, b), max(a, b))] for i, a in enumerate(comp) for b in comp[i + 1:]) <= len(comp) - 1
```
