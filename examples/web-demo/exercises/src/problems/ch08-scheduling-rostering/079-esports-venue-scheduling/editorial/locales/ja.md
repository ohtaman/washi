## 解法の方針

試合の割当を表すバイナリ変数 $x_{m,v,s} \in \{0, 1\}$（不適合な会場では 0 固定）と、有界連続な延長時間変数 $o_{v,s} \in [0, O_{\max}]$ を導入します。各試合は高々 1 回のみ編成可能とし、各会場・スロット枠の合計配信時間を $B + o_{v,s}$ で抑え、合計視聴スコアから延長コストを引いた純スコアを最大化します。

## 数理モデル

$$
\begin{aligned}
\max \quad & \sum_{m=0}^{M-1} \sum_{v=0}^{V-1} \sum_{s=0}^{S-1} p_m x_{m,v,s} - c_{\text{ot}} \sum_{v=0}^{V-1} \sum_{s=0}^{S-1} o_{v,s} \\
\text{s.t.} \quad & \sum_{v=0}^{V-1} \sum_{s=0}^{S-1} x_{m,v,s} \le 1 && \forall m \\
& \sum_{s=0}^{S-1} x_{m,v,s} = 0 && \forall m, v : \text{compat}_{m,v} = 0 \\
& \sum_{m=0}^{M-1} d_m x_{m,v,s} \le B + o_{v,s} && \forall v, s \\
& 0 \le o_{v,s} \le O_{\max} && \forall v, s \\
& x_{m,v,s} \in \{0, 1\} && \forall m, v, s
\end{aligned}
$$

## 押さえるべきポイント

- **選択的編成（`<= 1`）により延長時間が費用対効果の判断になる**: すべての試合を実施する必要がないため、視聴スコア増分 $p_m$ が延長コスト $c_{\text{ot}} \cdot \Delta o$ を上回る場合のみ延長枠へ追加されます（例題で延長単価 25 に対し試合 4 のスコア 18 が見送られる理由です）。
- **連続スラック変数 $o_{v,s}$ による弾力的な枠拡張**: 固定上限 $B$ を $B + o_{v,s}$（$0 \le o_{v,s} \le O_{\max}$）に置き換えることで、余分なバイナリ変数なしに区分線形なペナルティを表現できます。
- **会場適合マスクによる設備制約の表現**: 不適合な `(m, v)` の割当を 0 に固定することで、専用ステージ要件を満たしつつ分枝限定法の探索空間を削減できます。
- 関連用語: [ガイド＆用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装のポイント

**WaSHI (TypeScript)**

```ts
x.forEach((matchVenues, m) => {
  model.constraint(expr`${sum(matchVenues.flat())} <= 1`);
  matchVenues.forEach((venueSlots, v) => {
    if (input.compatible[m][v] === 0) model.constraint(expr`${sum(venueSlots)} == 0`);
  });
});
for (let v = 0; v < V; v++) {
  for (let s = 0; s < S; s++) {
    const load = sum(x.map((matchVenues, m) => expr`${input.durations[m]} * ${matchVenues[v][s]}`));
    model.constraint(expr`${load} <= ${input.regularLength} + ${overtime[v][s]}`);
  }
}
```

**PuLP (Python)**

```python
for m in range(num_matches):
    prob += pulp.lpSum(x[m][v][s] for v in range(num_venues) for s in range(num_slots)) <= 1
    for v in range(num_venues):
        if compatible[m][v] == 0:
            prob += pulp.lpSum(x[m][v]) == 0
for v in range(num_venues):
    for s in range(num_slots):
        prob += pulp.lpSum(durations[m] * x[m][v][s] for m in range(num_matches)) <= reg_len + overtime[v][s]
```
