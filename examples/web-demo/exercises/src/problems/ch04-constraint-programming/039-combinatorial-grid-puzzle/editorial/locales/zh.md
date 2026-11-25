## 解题思路

建立取值在 `[1, N]` 的 $N \times N$ 整数网格 `grid[r][c]`，分别对每一行、每一列以及每个区域添加 `distinct()` 约束，固定已知提示格，并添加区域和等式 `sum(...) == targetSum`；无需设置目标函数，直接调用 `await m.solve({ solver: "pumpkin" })` 求解可行解。

## 数学模型

$$
\begin{aligned}
\text{find} \quad & g_{r,c} \in \{1, \dots, N\} && \forall r, c \in \{0, \dots, N-1\} \\
\text{s.t.} \quad & \text{AllDifferent}(g_{r,0}, \dots, g_{r,N-1}) && \forall r \\
& \text{AllDifferent}(g_{0,c}, \dots, g_{N-1,c}) && \forall c \\
& g_{r,c} = v && \forall (r, c, v) \in \text{givens} \\
& \sum_{(r,c) \in S_k} g_{r,c} = T_k, \quad \text{AllDifferent}\big(\{g_{r,c} \mid (r,c) \in S_k\}\big) && \forall k
\end{aligned}
$$

## 核心要点

- **无目标函数的纯可行性 CP 求解**：即使没有需要优化的标量目标，CP 求解器也能通过约束传播与惰性子句生成（LCG）高效求得可行解。在 WaSHI 中省去 `m.objective(...)` 并直接调用 `await m.solve({ solver: "pumpkin" })` 即可求解。
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
