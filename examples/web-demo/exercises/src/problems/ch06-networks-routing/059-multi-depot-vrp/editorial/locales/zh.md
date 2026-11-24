## 解题思路

为每个车场 $d$ 定义仅在子图 $V_d = \{d\} \cup C$ 上存在的 0-1 有向边变量 $x_{ijd}$，从而从结构上杜绝跨车场起止的非法路线；随后施加全客户单次访问约束、各车场的流守恒与派车/供货上限，以及跨车场共享的载重 MTZ 约束 $u_i - u_j + Q \sum_d x_{ijd} \le Q - \text{demands}[j]$。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{d \in D} \sum_{i \ne j \in V_d} \text{dist}_{ij} x_{ijd} \\
\text{s.t.} \quad & \sum_{d \in D} \sum_{j \in V_d \setminus \{i\}} x_{ijd} = 1 && \forall i \in C \\
& \sum_{j \in V_d \setminus \{i\}} x_{jid} = \sum_{j \in V_d \setminus \{i\}} x_{ijd} && \forall d \in D, i \in C \\
& \sum_{j \in C} x_{djd} = \sum_{i \in C} x_{idd} \le K_d, \quad \sum_{i \in C} \text{demands}[i] \sum_{j \in V_d \setminus \{i\}} x_{ijd} \le C_d && \forall d \in D \\
& u_i - u_j + Q \sum_{d \in D} x_{ijd} \le Q - \text{demands}[j] && \forall i \ne j \in C
\end{aligned}
$$

## 核心要点

- **通过变量域杜绝跨车场开放路径**：只为 $V_d = \{d\} \cup C$ 内部建立 $x_{ijd}$，车场 $d$ 的车辆根本无法驶入另一座车场 $d'$，无需额外引入 Big-M 车场归属连接约束。
- **跨车场共享载重变量 $u_i$**：由于每个客户只会被某个车场访问一次，将各车场的弧汇总为 $\sum_d x_{ijd}$，即可用单组 $u_i$ 同时完成全部车场的载重上限控制和子环消除。
- 概念参考：[指南与术语表 — 变量类型](?view=guide&lang=zh#variable-types) / [常见模型分类](?view=guide&lang=zh#paradigms)

## 实现要点

使用 `flatMap` 枚举不同客户对 `(ci, cj)`，并利用跨所有车场的边变量之和 `yij` 统一注册针对共享载重势能 `u` 的 MTZ 约束。

**WaSHI (TypeScript)**

```ts
m.constraint(
  customers.flatMap((ci, idxI) =>
    customers.flatMap((cj, idxJ) => {
      if (idxI === idxJ) return [];
      const yij = sum(x.map((xd) => xd.get(`${ci}_${cj}`)!));
      return [expr`${u[idxI]} - ${u[idxJ]} + ${Q} * ${yij} <= ${Q - input.demands[cj]}`];
    })
  )
);
```

**PuLP (Python)**

```python
for i in range(num_depots, n):
    for j in range(num_depots, n):
        if i != j:
            y_ij = pulp.lpSum(x[(i, j, d)] for d in range(num_depots))
            prob += u[i] - u[j] + q_cap * y_ij <= q_cap - demands[j]
```
