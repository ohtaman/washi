## 解题思路

声明带库存上界的连续变量 `amounts`（`0 <= x_i <= availabilities[i]`），加入总重量等式 `sum(amounts) == targetBatch`，再把各元素比例上下限换算为绝对重量上下限，最后最小化总成本 `dot(costs, amounts)`。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} c_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} x_i = B \\
& L_k B \le \sum_{i=0}^{n-1} p_{i,k} x_i \le U_k B && \forall k \\
& 0 \le x_i \le A_i && \forall i
\end{aligned}
$$

## 核心要点

- **借助固定总重线性化比例约束**：$\frac{\sum_i p_{i,k} x_i}{\sum_i x_i} \ge L_k$ 表面看是分式；但由于总重等式已将分母固定为常数 $B$（`targetBatch`），两边同乘 $B$ 即可消去分母，保持纯线性规划（LP）形式（分母可变的分式情形见第 2 章）。
- **提取元素列向量**：`compositions[i][k]` 以原料为行、元素为列，用 `input.compositions.map((row) => row[k])` 提取元素 $k$ 的列向量后即可直接传给 `dot(...)`。
- 概念参考：[指南与术语表 — 核心建模要素](?view=guide&lang=zh#building-blocks) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

由于 `compositions[i][k]` 以原料为行、元素为列，提取各元素的列向量并与 `amounts` 求内积，即可成对构建上下界约束。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${sum(amounts)} == ${input.targetBatch}`, "total_weight");

m.constraint(
  input.minRatios.flatMap((minRatio, k) => {
    const elemCol = input.compositions.map((row) => row[k]);
    return [
      expr`dot(${elemCol}, ${amounts}) >= ${minRatio * input.targetBatch}`,
      expr`dot(${elemCol}, ${amounts}) <= ${input.maxRatios[k] * input.targetBatch}`,
    ];
  })
);
```

**PuLP (Python)**

```python
prob += pulp.lpSum(amounts) == target

for k in range(n_elem):
    elem_expr = pulp.lpSum(compositions[i][k] * amounts[i] for i in range(n_raw))
    prob += elem_expr >= min_ratios[k] * target
    prob += elem_expr <= max_ratios[k] * target
```
