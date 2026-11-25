## 解题思路

设条带高度的安全有限上界为 `maxHeight = sum(heights)`（$H_{\max} = \sum_i h_i$）。为每个矩形声明有界整数左下坐标 `x[i]`（`[0, stripWidth - widths[i]]`）和 `y[i]`（`[0, maxHeight - heights[i]]`），对所有矩形对 `i < j` 添加四向不重叠析取 `or(...)`（左、右、下、上至少成立其一），并最小化 `max(y[i] + heights[i])`。

## 数学模型

$$
\begin{aligned}
\min \quad & H = \max_{i} (y_i + h_i) \\
\text{s.t.} \quad & (x_i + w_i \le x_j) \lor (x_j + w_j \le x_i) \lor (y_i + h_i \le y_j) \lor (y_j + h_j \le y_i) && \forall i < j \\
& 0 \le x_i \le W - w_i, \quad 0 \le y_i \le H_{\max} - h_i, \quad x_i, y_i \in \mathbb{Z} && \forall i
\end{aligned}
$$

## 核心要点

- **CP 原生析取 `or(...)` vs. MIP Big-M**：若改用 MIP Big-M 建模，每对矩形需要 4 个二元选择变量（满足求和 $\ge 1$）以及足够大的常数 $M_x, M_y$；当 $M_x, M_y$ 足够大时，其 LP 松弛可令各 0-1 变量均取 $0.25$ 从而允许所有矩形重叠在原点 $(0, 0)$，松弛下界极弱。CP 完全避免了 Big-M 退化，当四个分离方向中除一个以外均被排除时即刻触发边界传播，并通过延迟子句生成（LCG）从不可行的相对排布中学习冲突子句以加速剪枝。
- **安全的有限高度上界**：取所有矩形高度之和 `maxHeight = sum(heights)`（$H_{\max} = \sum_i h_i$），可保证包含全部可行排布并为 Pumpkin 提供有限的纵坐标整数域。
- 参考资料：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [常见优化问题类型](?view=guide&lang=zh#paradigms)

## 实现要点

对所有矩形对 `i < j` 注册要求在左、右、下、上至少一个方向上分离的析取约束 `or(...)`，并最小化所有矩形顶端高度的最大值。

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.widths.flatMap((_, i) =>
    input.widths.slice(i + 1).map((__, off) => {
      const j = i + 1 + off;
      return or(
        expr`${x[i]} + ${input.widths[i]} <= ${x[j]}`,
        expr`${x[j]} + ${input.widths[j]} <= ${x[i]}`,
        expr`${y[i]} + ${input.heights[i]} <= ${y[j]}`,
        expr`${y[j]} + ${input.heights[j]} <= ${y[i]}`
      );
    })
  )
);
m.objective(minimize(max(y.map((yi, i) => expr`${yi} + ${input.heights[i]}`))));
```
