## アプローチ

工場の開設 0-1 変数 $u_p$ と DC の開設 0-1 変数 $w_d$、および工場 $\to$ DC と DC $\to$ 顧客の非負連続フロー行列 $f_{p,d}, g_{d,c}$ を導入します。各工場・DC の能力連結制約、各 DC の流入出保存則、および各顧客の需要充足制約を連立させ、固定開設費と 2 段階の輸送費の合計を最小化します。

## 数理モデル

$$
\begin{aligned}
\min_{u, w \in \{0,1\},\; f, g \ge 0} \quad & \sum_{p} F^P_p u_p + \sum_{d} F^D_d w_d + \sum_{p,d} c_{p,d} f_{p,d} + \sum_{d,c} c'_{d,c} g_{d,c} \\
\text{s.t.} \quad & \sum_{d} f_{p,d} \le C^P_p u_p && \forall p \\
& \sum_{p} f_{p,d} \le C^D_d w_d && \forall d \\
& \sum_{p} f_{p,d} = \sum_{c} g_{d,c} && \forall d \\
& \sum_{d} g_{d,c} \ge D_c && \forall c
\end{aligned}
$$

ここで $F^P_p = \text{plantFixedCosts}[p]$、$C^P_p = \text{plantCaps}[p]$、$F^D_d = \text{dcFixedCosts}[d]$、$C^D_d = \text{dcCaps}[d]$、$D_c = \text{demands}[c]$、$c_{p,d} = \text{plantDcCosts}[p][d]$、$c'_{d,c} = \text{dcCustomerCosts}[d][c]$ とします。

## ポイント

- **DC の容量制約は流入側だけで十分**: 流量保存則 $\sum_p f_{p,d} = \sum_c g_{d,c}$ により流入と流出が一致するため、$\sum_p f_{p,d} \le C^D_d w_d$ を課せば流出量も同じ上限に自動的に抑えられます。
- **固定費と多段階輸送費の同時バランス**: 顧客に近い DC を閉じると $F^D_d$ は浮きますが配送費 $c'_{d,c}$ が増大し、上流工場の容量がタイトな場合は複数工場・複数 DC を協調させる必要があります。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

工場の出荷能力制約に加え、各 DC について流入合計と流出合計を計算し、能力制約と流量保存則（流入＝流出）を同時に課します。WaSHI では `sum()` で行・列の合計式を作り、PuLP では `pulp.lpSum` で同様に記述します。

**WaSHI (TypeScript)**

```ts
m.constraint(
  plantToDc.map((row, p) => expr`${sum(row)} <= ${input.plantCaps[p]} * ${openPlants[p]}`)
);
input.dcCaps.forEach((cap, d) => {
  const dcInflow = sum(plantToDc.map((row) => row[d]));
  const dcOutflow = sum(dcToCustomer[d]);
  m.constraint(expr`${dcInflow} <= ${cap} * ${openDcs[d]}`);
  m.constraint(expr`${dcInflow} - ${dcOutflow} == 0`);
});
```

**PuLP (Python)**

```python
for p in range(n_plants):
    prob += pulp.lpSum(plant_to_dc[p]) <= plant_caps[p] * open_plants[p]
for d in range(n_dcs):
    inflow = pulp.lpSum(plant_to_dc[p][d] for p in range(n_plants))
    outflow = pulp.lpSum(dc_to_customer[d])
    prob += inflow <= dc_caps[d] * open_dcs[d]
    prob += inflow == outflow
```
