## 解题思路

将每台机组的输出 $x_i$ 按运行区间拆分为分解变量 $x_{ik} \ge 0$，并与区间选择 0-1 变量 $y_{ik} \in \{0, 1\}$ 配对，施加 $\sum_k y_{ik} = 1$、$L_{ik} y_{ik} \le x_{ik} \le U_{ik} y_{ik}$ 以及总需求约束 $\sum_{i,k} x_{ik} \ge \text{demand}$，同时最小化总成本 $\sum_{i,k} (F_{ik} y_{ik} + c_{ik} x_{ik})$。这一凸包建模无需引入松散的 Big-M 即可同时刻画非连续间隙、各区间固定费 $F_{ik}$ 与可变斜率 $c_{ik}$。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \sum_{k=0}^{K-1} \left(F_{ik} y_{ik} + c_{ik} x_{ik}\right) \\
\text{s.t.} \quad & \sum_{k=0}^{K-1} y_{ik} = 1 && \forall i \in \{0, \dots, n-1\} \\
& L_{ik} y_{ik} \le x_{ik} \le U_{ik} y_{ik} && \forall i, k \\
& \sum_{i=0}^{n-1} \sum_{k=0}^{K-1} x_{ik} \ge \text{demand} \\
& y_{ik} \in \{0, 1\}, \quad x_{ik} \ge 0 && \forall i, k
\end{aligned}
$$

## 核心要点

- **为何变量分解比单一变量 Big-M 更强**：一方面，不同运行区间拥有不同的单位斜率 $c_{ik}$，目标函数要求将出力拆分为 $x_{ik}$；另一方面，即便所有区间的斜率相同，在有界区间下 $L_{ik} y_{ik} \le x_{ik} \le U_{ik} y_{ik}$ 配合 $\sum_k y_{ik} = 1$ 与 $y_{ik} \ge 0$ 也能在提升后的 $(x, y)$ 空间中给出**单台机组 $i$ 自身**各互斥区间并集的**精确凸包（Balas 凸包定理）**。加入跨机组耦合的总需求约束 $\sum_{i,k} x_{ik} \ge \text{demand}$ 后，整体 LP 松弛本身虽不再保证整数性，但仍远比 Big-M 公式紧凑。
- **停机状态的统一建模**：将停机视为 $k=0$ 的区间 $[0, 0]$（固定与单位成本皆为 $0$），即可用统一的 $\sum_k y_{ik} = 1$ 处理停机与运行选择。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

使用 `flatMap` 批量注册每台机组仅启用一个区间的约束，以及用区间指示变量 `y[i][k]` 缩放输出变量 `x[i][k]` 上下界的凸包约束。

**WaSHI (TypeScript)**

```ts
m.constraint(y.map((row) => expr`${sum(row)} == 1`));
m.constraint(
  input.bandLbs.flatMap((lbs, i) =>
    lbs.flatMap((lb, k) => [
      expr`${x[i][k]} >= ${lb} * ${y[i][k]}`,
      expr`${x[i][k]} <= ${input.bandUbs[i][k]} * ${y[i][k]}`,
    ])
  )
);
m.constraint(expr`${sum(x.flat())} >= ${input.demand}`, "demand");
```

**PuLP (Python)**

```python
for i in range(n_units):
    prob += pulp.lpSum(y[i]) == 1
    for k in range(n_bands):
        prob += x[i][k] >= band_lbs[i][k] * y[i][k]
        prob += x[i][k] <= band_ubs[i][k] * y[i][k]
prob += pulp.lpSum(x[i][k] for i in range(n_units) for k in range(n_bands)) >= demand
```
