## アプローチ

各デポ $d \in \mathcal{D}$ ごとに頂点集合を $V_d = \{d\} \cup \mathcal{C}$ に制限した有向枝変数 $x_{ijd}$ を定義することで、異なるデポ間をまたぐ不正パスを構造上排除します。そのうえで全顧客の 1 回訪問制約、デポごとの車両台数・総供給容量制約、および顧客間で共有する積載量 MTZ 制約 $u_i - u_j + Q \sum_d x_{ijd} \le Q - q_j$ を課します。

## 数理モデル

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

ここで $\mathcal{D} = \{0, \dots, D-1\}$、$\mathcal{C} = \{D, \dots, D+C-1\}$、$V_d = \{d\} \cup \mathcal{C}$、$q_i = \text{demands}[i]$、$K_d = \text{depotMaxVehicles}[d]$、$S_d = \text{depotCapacities}[d]$、$Q = \text{vehicleCapacity}$ です。

## ポイント

- **デポ間移動の自然な禁止**: 各デポ $d$ の変数 $x_{ijd}$ を自分のデポ $d$ と顧客集合 $\mathcal{C}$ のみで張ることで、別デポ $d'$ へ着地するオープンルートを Big-M なしで完全に禁止できます。
- **全デポ共通の積載ポテンシャル $u_i$**: 各顧客 $i \in \mathcal{C}$ は全デポを通じて 1 回しか訪問されないため、積載量追跡変数 $u_i \in [q_i, Q]$ はデポごとに複製せず共通の 1 本で容量制約と部分巡回路排除を行えます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

異なる顧客ペア `(ci, cj)` を `flatMap` で列挙し、全デポにわたる移動変数和 `yij` を用いて共通の積載ポテンシャル `u` に対する MTZ 制約をまとめて登録します。

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
