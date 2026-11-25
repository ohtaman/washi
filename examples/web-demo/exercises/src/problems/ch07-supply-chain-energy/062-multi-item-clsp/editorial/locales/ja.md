## アプローチ

$I$ 品目を $T$ 期間にわたって計画する問題において、各品目・各期の需要 $d_{i,t}$、固定段取り費 $F_i$、単位保管費 $h_i$、単位加工時間 $a_i$、段取り時間 $s_i$、各期のオーブン稼働可能時間 $H_t$ が与えられます。品目 $i$・期間 $t$ ごとに 0-1 段取り変数 $y_{i,t}$、連続生産量 $x_{i,t} \ge 0$、期末在庫 $I_{i,t} \ge 0$ を導入します。これらに対し品目別の在庫収支式、残存需要に基づく段取り連結制約、および加工時間と段取り時間の合計を抑える各期の共有オーブン時間制約を課して、総段取り費と総保管費の和を最小化します。

## 数理モデル

$$
\begin{aligned}
\min_{y \in \{0,1\}^{I \times T},\; x, I \ge 0} \quad & \sum_{i=0}^{I-1} \sum_{t=0}^{T-1} \left( F_i y_{i,t} + h_i I_{i,t} \right) \\
\text{s.t.} \quad & I_{i,t-1} + x_{i,t} - I_{i,t} = d_{i,t} && \forall i, t \;\; (I_{i,-1} = 0) \\
& x_{i,t} \le \left(\sum_{k=t}^{T-1} d_{i,k}\right) y_{i,t} && \forall i, t \\
& \sum_{i=0}^{I-1} \left( a_i x_{i,t} + s_i y_{i,t} \right) \le H_t && \forall t
\end{aligned}
$$

## ポイント

- **残存需要によるタイトな Big-M**: $x_{i,t} \le (\sum_{k=t}^{T-1} d_{i,k}) y_{i,t}$ と上界を残需要合計に絞ることで、最適解を失わずに LP 緩和を強く保てます。
- **段取り時間もオーブン能力を消費する**: $s_i y_{i,t}$ が容量制約に入るため、まとめ生産は固定費 $F_i$ の節約だけでなく、ボトルネック期の段取り時間 $s_i$ を空けて他品目を生産可能にする効果があります。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

品目別・期間別の在庫収支式と残存需要を用いた段取り連結制約に加え、各期で全品目の加工時間と段取り時間の合計を抑える設備能力制約を構築します。WaSHI では `forEach` と `map` で配列制約を組み立て、PuLP では `pulp.lpSum` で各期の合計を記述します。

**WaSHI (TypeScript)**

```ts
input.demands.forEach((itemDemands, i) => {
  itemDemands.forEach((demand, t) => {
    const prev = t === 0 ? 0 : inventory[i][t - 1];
    m.constraint(expr`${prev} + ${production[i][t]} - ${inventory[i][t]} == ${demand}`);
    const remDemand = itemDemands.slice(t).reduce((acc, d) => acc + d, 0);
    m.constraint(expr`${production[i][t]} <= ${remDemand} * ${setups[i][t]}`);
  });
});
m.constraint(
  input.capacities.map((cap, t) =>
    expr`${sum(
      input.demands.map(
        (_, i) =>
          expr`${input.unitTimes[i]} * ${production[i][t]} + ${input.setupTimes[i]} * ${setups[i][t]}`
      )
    )} <= ${cap}`
  )
);
```

**PuLP (Python)**

```python
for i in range(n_items):
    for t in range(T):
        prev = 0 if t == 0 else inventory[i][t - 1]
        prob += prev + production[i][t] - inventory[i][t] == demands[i][t]
        prob += production[i][t] <= sum(demands[i][t:]) * setups[i][t]
for t in range(T):
    prob += pulp.lpSum(
        unit_times[i] * production[i][t] + setup_times[i] * setups[i][t]
        for i in range(n_items)
    ) <= capacities[t]
```
