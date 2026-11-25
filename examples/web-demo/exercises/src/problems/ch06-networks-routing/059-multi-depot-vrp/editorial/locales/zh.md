## 解题思路

为每个车场 $d \in \mathcal{D}$ 定义仅在子图 $V_d = \{d\} \cup \mathcal{C}$ 上存在的 0-1 有向边变量 $x_{ijd}$，从而从结构上杜绝跨车场起止的非法路线；随后施加全客户单次访问约束、各车场的流守恒与派车/供货上限，以及跨车场共享的载重 MTZ 约束 $u_i - u_j + Q \sum_d x_{ijd} \le Q - q_j$。

## 数学模型

$$
\begin{aligned}
\min \quad & \sum_{d \in \mathcal{D}} \sum_{i \ne j \in V_d} \text{dist}_{ij} x_{ijd} \\
\text{s.t.} \quad & \sum_{d \in \mathcal{D}} \sum_{j \in V_d \setminus \{i\}} x_{ijd} = 1 && \forall i \in \mathcal{C} \\
& \sum_{j \in V_d \setminus \{i\}} x_{jid} = \sum_{j \in V_d \setminus \{i\}} x_{ijd} && \forall d \in \mathcal{D},\; i \in \mathcal{C} \\
& \sum_{j \in \mathcal{C}} x_{djd} = \sum_{i \in \mathcal{C}} x_{idd} \le K_d, \quad \sum_{i \in \mathcal{C}} q_i \sum_{j \in V_d \setminus \{i\}} x_{ijd} \le S_d && \forall d \in \mathcal{D} \\
& u_i - u_j + Q \sum_{d \in \mathcal{D}} x_{ijd} \le Q - q_j && \forall i \ne j \in \mathcal{C} \\
& q_i \le u_i \le Q && \forall i \in \mathcal{C} \\
& x_{ijd} \in \{0, 1\} && \forall d \in \mathcal{D},\; i \ne j \in V_d
\end{aligned}
$$

其中 $\mathcal{D} = \{0, \dots, D-1\}$，$\mathcal{C} = \{D, \dots, D+C-1\}$，$V_d = \{d\} \cup \mathcal{C}$，$q_i = \text{demands}[i]$，$K_d = \text{depotMaxVehicles}[d]$，$S_d = \text{depotCapacities}[d]$，$Q = \text{vehicleCapacity}$。

## 核心要点

- **通过变量域杜绝跨车场开放路径**：只为 $V_d = \{d\} \cup \mathcal{C}$ 内部建立 $x_{ijd}$，车场 $d$ 的车辆根本无法驶入另一座车场 $d'$，无需额外引入 Big-M 车场归属连接约束。
- **跨车场共享载重变量 $u_i$**：由于每个客户 $i \in \mathcal{C}$ 只会被某个车场访问一次，将各车场的弧汇总为 $\sum_d x_{ijd}$，即可用单组 $u_i \in [q_i, Q]$ 同时完成全部车场的载重上限控制和子环消除。
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
            prob += u[i] - u[j] + vehicle_capacity * y_ij <= vehicle_capacity - demands[j]
```
