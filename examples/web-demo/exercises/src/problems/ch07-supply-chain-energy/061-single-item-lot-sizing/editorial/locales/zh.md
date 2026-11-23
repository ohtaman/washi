## 解题思路

相比在聚合变量 $(x_t, I_t, y_t)$ 上直接写 $x_t \le C_t y_t$，引入拆解变量 $w_{t,k} \ge 0$（表示在第 $t$ 期生产并用于满足第 $k \ge t$ 期需求的产量）即可得到 **设施选址重构（Facility-Location Reformulation）**，在保持整数最优解完全等价的同时显著收紧 LP 松弛界。

## 数学模型

$$
\begin{aligned}
\min_{y \in \{0,1\}^T,\; w \ge 0} \quad & \sum_{t=0}^{T-1} F_t y_t + \sum_{t=0}^{T-1} \sum_{k=t}^{T-1} \left( c_t + \sum_{\tau=t}^{k-1} h_\tau \right) w_{t,k} \\
\text{s.t.} \quad & \sum_{t=0}^{k} w_{t,k} = d_k && \forall k \in \{0,\dots,T-1\} \\
& w_{t,k} \le d_k y_t && \forall 0 \le t \le k < T \\
& \sum_{k=t}^{T-1} w_{t,k} \le C_t y_t && \forall t \in \{0,\dots,T-1\}
\end{aligned}
$$

## 核心要点

- **为何变量拆解能加强 LP 松弛**：聚合式 $x_t \le C_t y_t$ 在产能 $C_t$ 较大时允许 LP 松弛只取极小的 $y_t = x_t / C_t$，严重低估开机成本 $F_t$；改写为 $w_{t,k} \le d_k y_t$ 后迫使 $y_t \ge w_{t,k} / d_k$，在无产能约束时直接达到凸包紧度，大幅减少分支定界搜索节点。
- **从 $w_{t,k}$ 还原 $(x_t, I_t)$**：第 $t$ 期产量为 $x_t = \sum_{k=t}^{T-1} w_{t,k}$，期末库存为 $I_t = \sum_{\tau=0}^t \sum_{k=t+1}^{T-1} w_{\tau,k}$，自然满足物料流守恒且 $I_{T-1} = 0$。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

将各需求期的需求满足约束、拆解上界约束和各期产能约束以数组形式传给 `m.constraint()`。在 WaSHI 中使用 `sum()` 和 `expr` 模板字面量构建每行约束式，在 PuLP 中则可用 `pulp.lpSum` 配合循环写出相同结构。

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.demands.map((demand, k) =>
    expr`${sum(Array.from({ length: k + 1 }, (_, t) => w[t][k - t]))} == ${demand}`
  )
);
m.constraint(
  w.flatMap((row, t) =>
    row.map((v, offset) => expr`${v} <= ${input.demands[t + offset]} * ${setups[t]}`)
  )
);
m.constraint(
  w.map((row, t) => expr`${sum(row)} <= ${input.capacities[t]} * ${setups[t]}`)
);
```

**PuLP (Python)**

```python
for k in range(T):
    prob += pulp.lpSum(w[(t, k)] for t in range(k + 1)) == demands[k]
for t in range(T):
    prob += pulp.lpSum(w[(t, k)] for k in range(t, T)) <= capacities[t] * setups[t]
    for k in range(t, T):
        prob += w[(t, k)] <= demands[k] * setups[t]
```
