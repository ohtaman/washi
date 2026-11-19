## アプローチ

各期の通常生産 `regular`・残業生産 `overtime`・期末在庫 `inventory` を能力上限・最終安全在庫下限つき連続変数として宣言し、連続する期間どうしを在庫収支等式で結んで総コストを最小化します。

## 数理モデル

$$
\begin{aligned}
\min_{r, o, I \ge 0} \quad & \sum_{t=0}^{T-1} \left( c_r r_t + c_o o_t + c_h I_t \right) \\
\text{s.t.} \quad & I_t = I_{t-1} + r_t + o_t - d_t && \forall t \;\; (I_{-1} = I_{\text{init}}) \\
& 0 \le r_t \le R_t, \; 0 \le o_t \le O_t, \; 0 \le I_t \le I_{\max} && \forall t \\
& I_{T-1} \ge I_{\min,\text{end}}
\end{aligned}
$$

## ポイント

- **フロー保存則による時間結合**: 各時刻で「前期在庫 ＋ 当期生産 − 当期需要 ＝ 期末在庫」が成り立ち、`t = 0` のみ定数 `initialInventory` を参照します。この時間展開ネットワーク構造は蓄電池運用や資金繰り計画にもそのまま応用できます。
- **能力・倉庫上限は変数の上下界で表現**: `regCap[t]`・`otCap[t]`・`invCap`・最終期の `minFinalInventory` はすべて変数宣言時の `lb`/`ub` に入れられるため、余計な制約行を増やさず簡潔にモデル化できます。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.demands.map((demand, t) => {
    const prev = t === 0 ? input.initialInventory : inventory[t - 1];
    return expr`${prev} + ${regular[t]} + ${overtime[t]} - ${inventory[t]} == ${demand}`;
  })
);
m.objective(
  minimize(
    expr`${input.regCost} * ${sum(regular)} + ${input.otCost} * ${sum(overtime)} + ${input.holdCost} * ${sum(inventory)}`
  )
);
```

**Python (highspy)**

```python
for t in range(T):
    prev = init_inv if t == 0 else inventory[t - 1]
    h.addConstr(prev + regular[t] + overtime[t] - inventory[t] == demands[t])

h.minimize(
    reg_cost * h.qsum(regular) + ot_cost * h.qsum(overtime) + hold_cost * h.qsum(inventory)
)
```
