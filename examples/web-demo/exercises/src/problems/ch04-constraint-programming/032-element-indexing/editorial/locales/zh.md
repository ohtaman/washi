## 解题思路

为每项作业 $i \in \{0, \dots, n - 1\}$ 引入有界整数变量 $a_i \in \{0, \dots, m - 1\}$（`assignment[i]`）表示分配的机器编号，并记换装成本为 $c_{i,j}$（`costs[i][j]`）。对所有 $a_i$ 施加全异约束以保证机器互不共用，并最小化总换装成本 $\sum_{i=0}^{n-1} c_{i,\, a_i}$。在 WaSHI 的 Pumpkin 求解器中，这直接对应 `distinct(assignment)` 与 Element 索引原语 `at(input.costs[i], assignment[i])`。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} c_{i,\, a_i} \\
\text{s.t.} \quad & \text{AllDifferent}(a_0, \dots, a_{n-1}) \\
& a_i \in \{0, \dots, m - 1\} \cap \mathbb{Z} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## 核心要点

- **Element 约束与标准 0-1 MIP 指派模型的对比**：标准的 $n \times m$ 二元 MIP 指派模型需要 $n \times m$ 个 0-1 变量 $x_{i,j}$ 和 $n + m$ 条求和约束（每项作业和每台机器各一条），而 CP 模型只需 $n$ 个整数变量；`at(costs[i], assignment[i])` 会直接下沉为 Pumpkin 的原生 `element` 传播器。
- **从 0 开始的越界守卫与矩形指派**：`at(array, idx)` 自动强制 $0 \le \text{idx} < \text{array.length}$，对于 $n < m$ 的非方阵指派问题也无需补虚行即可直接建模。
- 参考资料：[指南与术语表 — 模型基本要素](?view=guide&lang=zh#building-blocks) / [常见优化问题类型](?view=guide&lang=zh#paradigms)

## 实现要点

对表示各作业机器编号的整数变量数组 `assignment` 施加 `distinct` 约束，最小化通过 `at(row, assignment[i])` 索引读取的成本总和，并交由 Pumpkin 求解。

**WaSHI (TypeScript)**

```ts
const assignment = m.integer(n, { lb: 0, ub: numMachines - 1, prefix: "assign" });

m.constraint(distinct(assignment), "distinct_machines");
m.objective(minimize(sum(input.costs.map((row, i) => at(row, assignment[i])))));
await m.solve({ solver: "pumpkin" });
```
