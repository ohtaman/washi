## アプローチ

$T$ 期間にわたる顧客需要 $d_t$、生産能力上限 $C_t$、単位生産コスト $c_t$、販売単価 $r$、保管費 $h$、バックオーダー遅延ペナルティ $p_b$、機会損失ペナルティ $p_l$、期首在庫 $I_{\text{init}}$ のもとで、各期の生産量 $x_t$・出荷販売量 $s_t$・期末実在庫 $I_t$・期末バックオーダー $b_t$・機会損失 $l_t$ を非負の連続変数として導入します。各期の状態を実在庫の保存式とバックオーダーの保存式の 2 本の線形等式で結び付け、生産能力上限・機会損失の需要上限および最終期の $b_{T-1} = 0$ を課します。出荷売上から生産費・保管費・遅延ペナルティ・機会損失ペナルティを差し引いた純利益を最大化する純粋な線形計画（LP）として定式化できます。

## 数理モデル

$$
\begin{aligned}
\max_{x, s, I, b, l \ge 0} \quad & \sum_{t=0}^{T-1} \left( r s_t - c_t x_t - h I_t - p_b b_t - p_l l_t \right) \\
\text{s.t.} \quad & I_t = I_{t-1} + x_t - s_t && \forall t \;\; (I_{-1} = I_{\text{init}}) \\
& b_t = b_{t-1} + d_t - s_t - l_t && \forall t \;\; (b_{-1} = 0,\; b_{T-1} = 0) \\
& 0 \le x_t \le C_t, \quad 0 \le l_t \le d_t && \forall t
\end{aligned}
$$

## ポイント

- **0-1 変数なしで $I_t \cdot b_t = 0$ が成り立つ理由**: 保管費 $h > 0$ と遅延ペナルティ $p_b > 0$ がどちらも正であるため、在庫とバックオーダーを同時に持つと総出荷量が増えないまま $(h + p_b)\min(I_t, b_t)$ だけ損をします。よって線形計画のまま自然にどちらか一方がゼロになります。
- **3 通りの需給調整**: 需要スパイクや高コスト期に対し、事前積み増し（保管費 $h$）・バックオーダー（遅延費 $p_b$）・受注見送り（逸失利益 $r - c_t + p_l$）を自動的に天秤にかけます。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

各期の実在庫保存式とバックオーダー保存式をそれぞれ `m.constraint()` に配列で渡し、最終期のバックオーダーは変数上界で 0 に固定します。WaSHI では `map` と `expr` で各期の収支式を組み立て、PuLP ではループ内で等式制約を追加します。

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.demands.map((_, t) => {
    const prevInv = t === 0 ? input.initialInventory : inventory[t - 1];
    return expr`${prevInv} + ${production[t]} - ${sales[t]} - ${inventory[t]} == 0`;
  })
);
m.constraint(
  input.demands.map((demand, t) => {
    const prevBack = t === 0 ? 0 : backlog[t - 1];
    return expr`${prevBack} + ${demand} - ${sales[t]} - ${lostSales[t]} - ${backlog[t]} == 0`;
  })
);
```

**PuLP (Python)**

```python
for t in range(T):
    prev_inv = initial_inventory if t == 0 else inventory[t - 1]
    prev_back = 0 if t == 0 else backlog[t - 1]
    prob += prev_inv + production[t] - sales[t] == inventory[t]
    prob += prev_back + demands[t] - sales[t] - lost_sales[t] == backlog[t]
```
