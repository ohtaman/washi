## 解题思路

将每台机组的输出 $x_i$ 按运行区间拆分为分解变量 $x_{ik} \ge 0$，并与区间选择 0-1 变量 $y_{ik} \in \{0, 1\}$ 配对，施加 $\sum_k y_{ik} = 1$ 与 $L_{ik} y_{ik} \le x_{ik} \le U_{ik} y_{ik}$。这一凸包公式无需引入松散的 Big-M 即可同时刻画非连续间隙与不同斜率 $c_{ik}$。

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

- **为何变量分解比单一变量 Big-M 更强**：一方面，不同区间拥有不同的单位斜率 $c_{ik}$，目标函数要求将出力拆分为 $x_{ik}$；另一方面，$L_{ik} y_{ik} \le x_{ik} \le U_{ik} y_{ik}$ 直接刻画了析取区间并集 $\bigcup_k [L_{ik}, U_{ik}]$ 的**精确凸包**，使 LP 松弛最为紧凑。
- **停机状态的统一建模**：将停机视为 $k=0$ 的区间 $[0, 0]$（固定与单位成本皆为 $0$），即可用统一的 $\sum_k y_{ik} = 1$ 处理停机与运行选择。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

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
