## アプローチ

各デポ $d$ ごとに頂点集合を $V_d = \{d\} \cup C$ に制限した有向枝変数 $x_{ijd}$ を定義することで、異なるデポ間をまたぐ不正パスを構造上排除します。そのうえで全顧客の 1 回訪問制約、デポごとの車両台数・総供給容量制約、および顧客間で共有する積載量 MTZ 制約 $u_i - u_j + Q \sum_d x_{ijd} \le Q - \text{demands}[j]$ を課します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{d \in D} \sum_{i \ne j \in V_d} \text{dist}_{ij} x_{ijd} \\
\text{s.t.} \quad & \sum_{d \in D} \sum_{j \in V_d \setminus \{i\}} x_{ijd} = 1 && \forall i \in C \\
& \sum_{j \in V_d \setminus \{i\}} x_{jid} = \sum_{j \in V_d \setminus \{i\}} x_{ijd} && \forall d \in D, i \in C \\
& \sum_{j \in C} x_{djd} = \sum_{i \in C} x_{idd} \le K_d, \quad \sum_{i \in C} \text{demands}[i] \sum_{j \in V_d \setminus \{i\}} x_{ijd} \le C_d && \forall d \in D \\
& u_i - u_j + Q \sum_{d \in D} x_{ijd} \le Q - \text{demands}[j] && \forall i \ne j \in C
\end{aligned}
$$

## ポイント

- **デポ間移動の自然な禁止**: 各デポ $d$ の変数 $x_{ijd}$ を自分のデポ $d$ と顧客集合 $C$ のみで張ることで、別デポ $d'$ へ着地するオープンルートを Big-M なしで完全に禁止できます。
- **全デポ共通の積載ポテンシャル $u_i$**: 各顧客 $i \in C$ は全デポを通じて 1 回しか訪問されないため、積載量追跡変数 $u_i$ はデポごとに複製せず共通の 1 本で容量制約と部分巡回路排除を行えます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
for (let idxI = 0; idxI < customers.length; idxI++) {
  for (let idxJ = 0; idxJ < customers.length; idxJ++) {
    if (idxI === idxJ) continue;
    const ci = customers[idxI];
    const cj = customers[idxJ];
    const yij = sum(x.map((xd) => xd.get(`${ci}_${cj}`)!));
    m.constraint(
      expr`${u[idxI]} - ${u[idxJ]} + ${Q} * ${yij} <= ${Q - input.demands[cj]}`
    );
  }
}
```

**PuLP (Python)**

```python
for i in range(num_depots, n):
    for j in range(num_depots, n):
        if i != j:
            y_ij = pulp.lpSum(x[(i, j, d)] for d in range(num_depots))
            prob += u[i] - u[j] + q_cap * y_ij <= q_cap - demands[j]
```
