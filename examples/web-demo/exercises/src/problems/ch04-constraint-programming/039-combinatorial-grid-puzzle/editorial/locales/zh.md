## 解题思路

建立取值在 `[1, N]` 的 $N \times N$ 整数网格 `grid[r][c]`，分别对每一行、每一列以及每个区域添加 `distinct()` 约束，固定已知提示格，并添加区域和等式 `sum(...) == targetSum`；无需设置目标函数，直接调用 `await m.solve({ solver: "pumpkin" })` 求解可行解。

## 数学模型

记 $N = \text{size}$，对每个区域 $k \in \{0, \dots, |\text{cages}| - 1\}$，记 $S_k = \text{cages}[k].\text{cells}$、$T_k = \text{cages}[k].\text{targetSum}$：

$$
\begin{aligned}
\text{find} \quad & g_{r,c} \in \{1, \dots, N\} && \forall r, c \in \{0, \dots, N-1\} \\
\text{s.t.} \quad & \text{AllDifferent}(g_{r,0}, \dots, g_{r,N-1}) && \forall r \in \{0, \dots, N-1\} \\
& \text{AllDifferent}(g_{0,c}, \dots, g_{N-1,c}) && \forall c \in \{0, \dots, N-1\} \\
& g_{r,c} = v && \forall (r, c, v) \in \text{givens} \\
& \sum_{(r,c) \in S_k} g_{r,c} = T_k, \quad \text{AllDifferent}\big((g_{r,c})_{(r,c) \in S_k}\big) && \forall k
\end{aligned}
$$

## 核心要点

- **纯可行性 CP 求解**：在 WaSHI 中省略 `m.objective(...)` 时目标函数默认为 `0`，直接调用 `await m.solve({ solver: "pumpkin" })` 即可求解纯可行性问题。CP 在这类谜题上的优势在于定义域传播与延迟子句生成（LCG / 冲突子句学习），无需依赖目标梯度即可高效剪枝并搜出合法网格。
- **`distinct` 与 `sum` 的联合传播**：区域和上下界过滤掉不可能的数字组合，同时行列 `distinct` 将已确定格的取值沿交叉区域级联传播。
- 参考资料：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [求解状态术语](?view=guide&lang=zh#solver-status)

## 实现要点

注册每行与每列的 `distinct` 约束、固定提示的等式约束以及每个区域的求和等式与 `distinct` 约束，然后在不设置目标函数的情况下运行 Pumpkin 求解。

**WaSHI (TypeScript)**

```ts
m.constraint(grid.map((row) => distinct(row)));
m.constraint(
  Array.from({ length: n }, (_, c) => distinct(grid.map((row) => row[c])))
);
m.constraint(input.givens.map(([r, c, val]) => expr`${grid[r][c]} == ${val}`));
m.constraint(
  input.cages.map((cage) => expr`${sum(cage.cells.map(([r, c]) => grid[r][c]))} == ${cage.targetSum}`)
);
m.constraint(
  input.cages.map((cage) => distinct(cage.cells.map(([r, c]) => grid[r][c])))
);
await m.solve({ solver: "pumpkin" });
```
