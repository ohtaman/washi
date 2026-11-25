## 解题思路

建立按车辆编号的三下标 0-1 变量 $x_{ijk}$（$k \in \{0, \dots, K-1\}$）来分别施加各车流守恒、每车停靠上限 $S_{\max}$（`maxStopsPerVehicle`）以及同车配对等式 $\sum_j x_{p_r j k} = \sum_j x_{d_r j k}$；同时利用连续访问序变量 $t_i$ 约束 $t_{p_r} + 1 \le t_{d_r}$ 并消除子环，利用按 $\delta_{p_r} = +q_r, \delta_{d_r} = -q_r$ 增减的连续载重变量 $L_i \in [0, Q]$ 监控沿途载重。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{k=0}^{K-1} \sum_{i=0}^{N-1} \sum_{j \ne i} d_{ij} x_{ijk} \\
\text{s.t.} \quad & \sum_{k=0}^{K-1} \sum_{j \ne i} x_{ijk} = 1 && \forall i \ge 1 \\
& \sum_{j=1}^{N-1} x_{0jk} = \sum_{i=1}^{N-1} x_{i0k} \le 1, \quad \sum_{j \ne i} x_{jik} = \sum_{j \ne i} x_{ijk} && \forall i \ge 1,\; k \\
& \sum_{j \ne p_r} x_{p_r j k} = \sum_{j \ne d_r} x_{d_r j k}, \quad t_{p_r} + 1 \le t_{d_r} && \forall r,\; k \\
& t_i + 1 - t_j \le N\left(1 - \sum_{k=0}^{K-1} x_{ijk}\right) && \forall i \ge 1,\; j \ge 1,\; i \ne j \\
& L_i + \delta_j - L_j \le (Q + \max(0, \delta_j))\left(1 - \sum_{k=0}^{K-1} x_{ijk}\right) && \forall i \ge 0,\; j \ge 1,\; i \ne j \\
& \sum_{i \ge 1} \sum_{j \ne i} x_{ijk} \le S_{\max} && \forall k \\
& t_0 = 0,\; L_0 = 0,\quad 1 \le t_i \le N - 1,\; \max(0, \delta_i) \le L_i \le \min(Q, Q + \delta_i) && \forall i \ge 1 \\
& x_{ijk} \in \{0, 1\} && \forall i \ne j,\; k
\end{aligned}
$$

## 核心要点

- **为何多车配对需要三下标变量 $x_{ijk}$**：若仅用二下标弧 $x_{ij}$，无法约束取货点与送货点落在同一辆车上；引入车辆下标 $k$ 后，同车约束可简洁写成对每辆车的等式。
- **跨车辆共享的序位与载重变量**：由于每个客户站点在全部车辆中仅被访问一次，通过汇总弧 $y_{ij} = \sum_k x_{ijk}$，只需对每个站点维护一组 $t_i$ 和 $L_i$ 即可。
- **有符号货量变化支持交叉拼载**：取货增重、送货减重使模型既能在载重允许时实现拼载（`p_0 -> p_1 -> d_0 -> d_1`），也能在超重时自动改为先卸后取（`p_0 -> d_0 -> p_1 -> d_1`）。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

对每笔运输请求 `r` 遍历所有车辆 `vehicles`，注册取货点与送货点出度相等的同车约束，以及基于访问顺序变量 `t` 的先取后送约束。

**WaSHI (TypeScript)**

```ts
const vehicles = Array.from({ length: K }, (_, k) => k);
const nodes = Array.from({ length: n }, (_, j) => j);

input.requests.forEach((r) => {
  vehicles.forEach((k) => {
    const pOut = nodes.filter((j) => j !== r.pickup).map((j) => x[r.pickup][j]![k]);
    const dOut = nodes.filter((j) => j !== r.delivery).map((j) => x[r.delivery][j]![k]);
    m.constraint(expr`${sum(pOut)} == ${sum(dOut)}`);
  });
  m.constraint(expr`${t[r.pickup]} + 1 <= ${t[r.delivery]}`);
});
```

**PuLP (Python)**

```python
for r in requests:
    p, d = r["pickup"], r["delivery"]
    for k in range(max_vehicles):
        prob += pulp.lpSum(x[p][j][k] for j in range(n) if j != p) == pulp.lpSum(
            x[d][j][k] for j in range(n) if j != d
        )
    prob += t[p] + 1 <= t[d]
```
