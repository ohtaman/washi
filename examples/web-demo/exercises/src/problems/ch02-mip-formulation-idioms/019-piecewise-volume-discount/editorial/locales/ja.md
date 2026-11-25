## アプローチ

各サプライヤーの価格帯ごとに単価 $p_{s,k}$・範囲 $[L_{s,k}, U_{s,k}]$ に対応する 0-1 変数 $y_{s,k}$（`tierSelected[s][k]`）と連続数量 $q_{s,k}$（`tierQuantities[s][k]`）を置き、サプライヤーあたり高々 1 価格帯（$\sum_k y_{s,k} \le 1$）と半連続区間制約 $L_{s,k} y_{s,k} \le q_{s,k} \le U_{s,k} y_{s,k}$ を課したうえで、総発注量が需要 $D$（`demand`）以上になるよう総コストを最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{s} \sum_{k} p_{s,k} q_{s,k} \\
\text{s.t.} \quad & \sum_{k} y_{s,k} \le 1 && \forall s \\
& L_{s,k} y_{s,k} \le q_{s,k} \le U_{s,k} y_{s,k} && \forall s, k \\
& \sum_{s} \sum_{k} q_{s,k} \ge D \\
& q_{s,k} \ge 0,\; y_{s,k} \in \{0, 1\} && \forall s, k
\end{aligned}
$$

## ポイント

- **数量割引が非凸（MIP 必須）になる理由**: 費用最小化において純粋な LP で表現できるのは、限界単価が*増加*する**凸**区分線形コスト（残業割増など）だけです。超過分だけ安くなる「限界割引」（限界単価が減少する凹関数）も、閾値 $L_{s,k}$ で既発注分を含めて単価が下がり下方に不連続ジャンプする「全量割引」も非凸であるため 0-1 変数が不可欠です。
- **戦略的まとめ発注と最低発注量（MOQ）の両立**: 需要制約を `>= demand` とすることで、次の価格帯の閾値まで多めに買う方が総額を抑えられるケース（たとえば需要 45 に対し、50 以上で単価が 9.2 から 7.0 に下がる場合は 50 発注すると総額 350 となり 45 のときの 414 より安い）も逃さず、価格帯選択を `<= 1` とすることで最低発注量 `minQty > 0` があるサプライヤーの完全スキップも自然に表せます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

各サプライヤーの価格帯選択の和を 1 以下に抑えつつ、各帯の発注量 `tierQuantities[s][k]` を `minQty` と `maxQty` に選択変数 `tierSelected[s][k]` を掛けた範囲で挟み、全価格帯の発注量合計が `demand` 以上になる制約を加えます。

**WaSHI (TypeScript)**

```ts
m.constraint(tierSelected.map((row) => expr`${sum(row)} <= 1`));
m.constraint(
  input.suppliers.flatMap((tiers, s) =>
    tiers.flatMap((tier, k) => [
      expr`${tier.minQty} * ${tierSelected[s][k]} <= ${tierQuantities[s][k]}`,
      expr`${tierQuantities[s][k]} <= ${tier.maxQty} * ${tierSelected[s][k]}`,
    ])
  )
);
m.constraint(expr`${sum(tierQuantities.flat())} >= ${input.demand}`, "demand");
```

**PuLP (Python)**

```python
for s, tiers in enumerate(suppliers):
    prob += pulp.lpSum(tier_sel[s]) <= 1
    for k, tier in enumerate(tiers):
        prob += tier["minQty"] * tier_sel[s][k] <= tier_qty[s][k]
        prob += tier_qty[s][k] <= tier["maxQty"] * tier_sel[s][k]
prob += pulp.lpSum(q for row in tier_qty for q in row) >= demand
```
