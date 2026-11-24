## 解题思路

为每个矩形声明有界整数左下坐标 `x[i]`（`[0, stripWidth - widths[i]]`）和 `y[i]`（`[0, maxHeight - heights[i]]`），对所有矩形对 `i < j` 添加四向不重叠析取 `or(...)`（左、右、下、上至少成立其一），并最小化 `max(y[i] + heights[i])`。

## 数学模型

$$
\begin{aligned}
\min \quad & H = \max_{i} (y_i + h_i) \\
\text{s.t.} \quad & (x_i + w_i \le x_j) \lor (x_j + w_j \le x_i) \lor (y_i + h_i \le y_j) \lor (y_j + h_j \le y_i) && \forall i < j \\
& 0 \le x_i \le W - w_i, \quad 0 \le y_i \le H_{\max} - h_i, \quad x_i, y_i \in \mathbb{Z} && \forall i
\end{aligned}
$$

## 核心要点

- **CP 原生析取 `or(...)` vs. MIP Big-M**：若改用 MIP Big-M 建模，每对矩形需要 4 个二元选择变量且必须满足求和 $\ge 1$；其 LP 松弛常取各 0-1 变量为 $0.25$ 从而允许矩形重叠在原点，松弛下界极弱。CP 通过延迟子句生成（LCG）直接在矛盾方向被禁用时触发域收窄，避免 Big-M 退化。
- **紧凑的高度上界**：取 `maxHeight = sum(heights)` 为纵坐标提供紧致的有限整数上界。
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
