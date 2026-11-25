## 解题思路

用有界整数变量 $c_r = \text{cols}[r]$（范围 $0 \dots N - 1$）表示第 $r$ 行皇后所在的列号，分别对 `cols`、`cols[r] + r` 与 `cols[r] - r` 施加全局约束 `distinct()` 以同时禁止同列与同对角线攻击，并用元素索引 `at(costMatrix[r], cols[r])` 汇总所选棋盘代价 $C_{r, c_r}$（其中 $C_{r, c} = \text{costMatrix}[r][c]$），在 Pumpkin 中最小化总代价。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{r=0}^{N-1} C_{r, c_r} \\
\text{s.t.} \quad & \text{AllDifferent}(c_0, \dots, c_{N-1}) \\
& \text{AllDifferent}(c_0 + 0, \dots, c_{N-1} + (N - 1)) \\
& \text{AllDifferent}(c_0 - 0, \dots, c_{N-1} - (N - 1)) \\
& c_r \in \{0, \dots, N - 1\} \cap \mathbb{Z} && \forall r \in \{0, \dots, N - 1\}
\end{aligned}
$$

## 核心要点

- **用三条 `distinct()` 代替 $3\binom{N}{2}$ 条成对不等式**：位于 $(r_1, c_1)$ 与 $(r_2, c_2)$ 的两个皇后互相攻击，当且仅当同列（$c_1 = c_2$）或共对角线（$c_1 + r_1 = c_2 + r_2$ 或 $c_1 - r_1 = c_2 - r_2$）。将这 $3\binom{N}{2}$ 条成对不等约束整合为三条 `distinct()`，即可直接触发 Pumpkin 的全局 AllDifferent 传播。
- **目标函数中的元素索引**：无需像 MIP 那样构造 $N^2$ 个 0-1 变量，直接通过 `at(costMatrix[r], cols[r])` 用整数决策变量索引各行代价数组即可。
- 参考资料：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见优化问题类型](?view=guide&lang=zh#paradigms)

## 实现要点

对每行的列变量 `cols` 与两个方向的对角线表达式施加 `distinct()`，最小化通过 `at(row, cols[r])` 索引的代价总和，并交由 Pumpkin 求解。

**WaSHI (TypeScript)**

```ts
const cols = m.integer(n, { lb: 0, ub: n - 1, prefix: "col" });

m.constraint(distinct(cols), "distinct_cols");
m.constraint(distinct(cols.map((c, r) => expr`${c} + ${r}`)), "distinct_diag_pos");
m.constraint(distinct(cols.map((c, r) => expr`${c} - ${r}`)), "distinct_diag_neg");

m.objective(minimize(sum(input.costMatrix.map((row, r) => at(row, cols[r])))));
await m.solve({ solver: "pumpkin" });
```
