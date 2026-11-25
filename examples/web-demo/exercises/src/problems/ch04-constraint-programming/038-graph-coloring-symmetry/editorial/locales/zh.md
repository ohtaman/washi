## 解题思路

为每个顶点分配有界整数变量 `colors[i]`（范围 `0 .. maxColors - 1`），对每条边施加 `colors[u] != colors[v]`，并加入规范首次出现顺序的值对称破缺约束（`colors[0] == 0` 与 `colors[i] <= 1 + max(colors[0..i-1])`），从而消除颜色置换对称性，并直接用 `maxColor + 1` 最小化使用的颜色数量。

## 数学模型

$$
\begin{aligned}
\min \quad & c_{\max} + 1 \\
\text{s.t.} \quad & c_u \ne c_v && \forall (u, v) \in E \\
& c_0 = 0 \\
& c_i \le 1 + \max_{j < i} c_j && \forall i \in \{1, \dots, n - 1\} \\
& c_i \le c_{\max} && \forall i \in \{0, \dots, n - 1\} \\
& c_i, c_{\max} \in \{0, \dots, K - 1\} \cap \mathbb{Z}
\end{aligned}
$$

## 核心要点

- **消除多达 $K!$ 个对称颜色排列分支**：任意 $k$-着色方案通过重命名颜色编号都会产生 $k! \binom{K}{k}$ 个等价解。约束 `colors[0] == 0` 与 `colors[i] <= 1 + max(colors[0..i-1])` 将搜索空间限制在按 `0, 1, 2, ...` 顺序引入新颜色的规范解上。
- **无跳号性质使 `maxColor + 1` 精确等于所用颜色数**：由于规范编号不会跳过任何颜色编号，已用颜色集合恒为 `{0, ..., maxColor}`，无需额外引入颜色使用 0-1 指示变量即可直接最小化 `maxColor + 1`。
- 参考资料：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [常见优化问题类型](?view=guide&lang=zh#paradigms)

## 实现要点

除边两端颜色互异约束外，注册从首个顶点起按顺序引入新颜色编号的对称破缺约束以及最大颜色编号 `maxColor` 的上界约束，随后最小化 `maxColor + 1`。

**WaSHI (TypeScript)**

```ts
m.constraint(input.edges.map(([u, v]) => expr`${colors[u]} != ${colors[v]}`), "edge_diff");

// 值对称破缺：按首次出现顺序规范编号
m.constraint(expr`${colors[0]} == 0`, "sym_first");
m.constraint(
  colors.slice(1).map((c, idx) => expr`${c} <= 1 + max(${colors.slice(0, idx + 1)})`),
  "sym_prefix"
);

m.constraint(colors.map((c) => expr`${c} <= ${maxColor}`), "max_color");
m.objective(minimize(expr`${maxColor} + 1`));
```
