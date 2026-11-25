## アプローチ

車両 $k$ ごとに有向枝変数 $x_{ijk}$ を定義して各車両のフロー保存・訪問地点数上限 $S_{\max}$（`maxStopsPerVehicle`）・各依頼の同一車両ペアリング（$\sum_j x_{p_r j k} = \sum_j x_{d_r j k}$）を課し、訪問順ポテンシャル $t_i$ で先行関係 $t_{p_r} + 1 \le t_{d_r}$ と部分巡回路排除を行い、集荷で $+q_r$・配達で $-q_r$ 増減する連続積載量変数 $L_i \in [0, Q]$ を伝播させます。

## 数理モデル

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

## ポイント

- **なぜ車両添字付き $x_{ijk}$ が必要か**: 2 添字変数 $x_{ij}$ だけでは「集荷点と配達点が同じ車両ルートに乗る」というペアリング条件を直接書けません。車両 $k$ を添字に加えることで、各依頼・各車両ごとに 1 本の等式で同一車両性を表せます。
- **各地点共通の $t_i$ と $L_i$**: デポ以外の各地点は全車両を通じてちょうど 1 回だけ訪問されるため、順序変数 $t_i$ と積載量変数 $L_i$ は車両別に複製しなくても、集約枝 $y_{ij} = \sum_k x_{ijk}$ を介して共有できます。
- **符号付き需要 $\delta_j$ による混載判定**: 集荷で増加・配達で減少する $\delta_j$ を用いることで、容量に余裕があれば混載（`p_0 -> p_1 -> d_0 -> d_1`）、なければ逐次配送（`p_0 -> d_0 -> p_1 -> d_1`）を自動的に選択します。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

各輸送依頼 `r` ごとに全車両 `vehicles` を走査し、集荷点と配達点の出次数が一致する同一車両制約と、順序変数 `t` による集荷先行制約を登録します。

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
