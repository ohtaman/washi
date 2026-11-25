## アプローチ

通常のロットサイズ定式化 $(x_t, I_t, y_t)$ における連結制約 $x_t \le C_t y_t$ に代わり、「第 $t$ 期に生産して第 $k$ 期（$k \ge t$）の需要に充てる量」を表す分解変数 $w_{t,k} \ge 0$ を導入する **施設配置型再定式化（Facility-Location Reformulation）** を使うと、整数最適解を保ったまま LP 緩和の下界を大幅に強められます。

## 数理モデル

$$
\begin{aligned}
\min_{y \in \{0,1\}^T,\; w \ge 0} \quad & \sum_{t=0}^{T-1} F_t y_t + \sum_{t=0}^{T-1} \sum_{k=t}^{T-1} \left( c_t + \sum_{\tau=t}^{k-1} h_\tau \right) w_{t,k} \\
\text{s.t.} \quad & \sum_{t=0}^{k} w_{t,k} = d_k && \forall k \in \{0,\dots,T-1\} \\
& w_{t,k} \le d_k y_t && \forall 0 \le t \le k < T \\
& \sum_{k=t}^{T-1} w_{t,k} \le C_t y_t && \forall t \in \{0,\dots,T-1\}
\end{aligned}
$$

## ポイント

- **なぜ分解定式化（disaggregation）が強いのか**: 集約型 Big-M 制約 $x_t \le C_t y_t$ では、能力上限 $C_t$ が大きいほど LP 緩和で $y_t = x_t / C_t$ が小さく許され、固定段取り費 $F_t$ が過小評価されます。需要期別の上界 $w_{t,k} \le d_k y_t$ に分解すると $y_t \ge w_{t,k} / d_k$ が効き、能力制約なしロットサイズ問題の凸包（極限のタイトさ）が得られます。
- **元の $(x_t, I_t)$ の復元**: 生産量は $x_t = \sum_{k=t}^{T-1} w_{t,k}$、期末在庫は $I_t = \sum_{\tau=0}^t \sum_{k=t+1}^{T-1} w_{\tau,k}$ として一意に復元でき、在庫収支式も自動的に満たされます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

各需要期の需要充足制約・分解上界制約・各期の生産能力制約を `m.constraint()` に配列で渡します。WaSHI では `sum()` と `expr` テンプレートリテラルで各行の制約式を組み立て、PuLP では `pulp.lpSum` とループで同様に記述できます。

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
