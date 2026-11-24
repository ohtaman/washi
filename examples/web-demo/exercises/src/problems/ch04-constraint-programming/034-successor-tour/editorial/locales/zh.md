## 解题思路

用 $n$ 个后继节点变量 `next[i]` 与 $n$ 个访问位次变量 `rank[i]`（均在 `[0, n - 1]`）建模：在 `distinct(next)` 与 `next[i] != i` 的基础上，通过 `implies` 和 `at(rank, next[i])` 要求除返回仓库 0 的边外位次严格递增 1，从而彻底消除子环并最小化总路程。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} d_{i,\, \text{next}_i} \\
\text{s.t.} \quad & \text{AllDifferent}(\text{next}), \quad \text{AllDifferent}(\text{rank}) \\
& \text{next}_i \ne i && \forall i \in \{0, \dots, n-1\} \\
& \text{rank}_0 = 0, \quad \text{rank}_{\text{next}_0} = 1 \\
& \text{next}_i \ne 0 \implies \text{rank}_{\text{next}_i} = \text{rank}_i + 1 && \forall i \in \{1, \dots, n-1\}
\end{aligned}
$$

## 核心要点

- **为何仅有 `distinct(next)` 与 `next[i] != i` 还不够**：无不动点置换仍可能分解成 `(0 <-> 1)` 与 `(2 <-> 3)` 这样的多个互不连通子环。要求所有不回到 `0` 的边都满足 `rank[next[i]] == rank[i] + 1`，任何不含节点 `0` 的环都会因位次单调递增而矛盾，进而只允许单一哈密顿回路。
- **紧凑的 $O(n)$ CP 表达**：将整数变量数组 `rank` 传入 `at(rank, next[i])`，避免 MIP 所需的 $O(n^2)$ 边二元变量和 MTZ Big-M 约束。
- 参考资料：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [常见优化问题类型](?view=guide&lang=zh#paradigms)

## 实现要点

除对后继变量 `next` 与位次变量 `rank` 施加互异与禁止自环约束外，还需通过 `implies` 与 `at(rank, nx)` 注册在所有非返回仓库的边上位次逐一递增 1 的约束。

**WaSHI (TypeScript)**

```ts
m.constraint(distinct(next), "distinct_next");
m.constraint(distinct(rank), "distinct_rank");
m.constraint(next.map((nx, i) => expr`${nx} != ${i}`));
m.constraint(expr`${rank[0]} == 0`, "rank_start");
m.constraint(expr`at(${rank}, ${next[0]}) == 1`, "rank_first_step");
m.constraint(
  next.slice(1).map((nx, idx) =>
    implies(expr`${nx} != 0`, expr`at(${rank}, ${nx}) == ${rank[idx + 1]} + 1`)
  )
);
m.objective(minimize(sum(input.distances.map((row, i) => at(row, next[i])))));
```
