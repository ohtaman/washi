## アプローチ

各品目・各期に対してバイナリ段取り変数 $y_{i,t}$、非負整数の生産投入量 $x_{i,t}$、および非負連続の期末在庫 $I_{i,t}$ を導入します。生産能力上限による段取り連結制約と、親品目の投入 $x_{j,t}$ が即座に子部品 $i$ の従属需要 $\sum_j r_{i,j} x_{j,t}$ を生みつつ自身の完成品がリードタイム $L_i$ だけ遅れて $x_{i, t - L_i}$ として入庫する在庫収支式を連立させ、段取り費・生産費・保管費の合計を最小化します。

## 数理モデル

$$
\begin{aligned}
\min_{y \in \{0,1\}^{N \times T},\; x \in \mathbb{Z}_{\ge 0}^{N \times T},\; I \ge 0} \quad & \sum_{i=0}^{N-1} \sum_{t=0}^{T-1} \left( F_i y_{i,t} + c_i x_{i,t} + h_i I_{i,t} \right) \\
\text{s.t.} \quad & I_{i,t-1} + x_{i, t - L_i} - D_{i,t} - \sum_{j=0}^{N-1} r_{i,j} x_{j,t} = I_{i,t} && \forall i, t \\
& 0 \le x_{i,t} \le C_i y_{i,t} && \forall i, t
\end{aligned}
$$

ここで $r_{i,j} = \text{bom}[i][j]$、$D_{i,t} = \text{externalDemands}[i][t]$、$L_i = \text{leadTimes}[i]$、$I_{i,-1} = \text{initialInventory}[i]$、$F_i = \text{setupCosts}[i]$、$c_i = \text{prodCosts}[i]$、$h_i = \text{holdCosts}[i]$、$C_i = \text{capacities}[i]$ とし、$t < L_i$ のときは $x_{i, t - L_i} \equiv 0$ とします。

## ポイント

- **時間シフトされた入庫と即時引当**: 親品目の投入 $x_{j,t}$ は同じ期 $t$ の子部品在庫を引当消費する一方、完成品入庫は $L_j$ 期後に現れます。この添字シフトだけで多段階 BOM の時間展開が過不足なく記述できます。
- **上流工程へのロット波及**: 下流品目の段取り費 $F_j$ を節約するためにロットをまとめると、投入期の上流需要がスパイク状になるため、上流部品をさらに前倒し生産して在庫で平準化する動きが自然に現れます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

各品目・各期について段取り連結制約と、リードタイム分だけシフトした入庫および BOM 展開による従属需要を含む在庫収支式を構築します。WaSHI では `bom[i]` から非ゼロの親品目項のみを抽出して `sum()` で合算し、PuLP では内包表記で従属需要を記述します。

**WaSHI (TypeScript)**

```ts
input.externalDemands.forEach((extRow, i) => {
  const L = input.leadTimes[i];
  extRow.forEach((extDemand, t) => {
    m.constraint(expr`${production[i][t]} <= ${input.capacities[i]} * ${setups[i][t]}`);
    const prevInv = t === 0 ? input.initialInventory[i] : inventory[i][t - 1];
    const arrival = t >= L ? production[i][t - L] : 0;
    const depTerms = input.bom[i]
      .map((ratio, j) => (ratio !== 0 ? expr`${ratio} * ${production[j][t]}` : null))
      .filter((term): term is NonNullable<typeof term> => term !== null);
    const depExpr = depTerms.length > 0 ? sum(depTerms) : 0;
    m.constraint(expr`${prevInv} + ${arrival} - ${depExpr} - ${inventory[i][t]} == ${extDemand}`);
  });
});
```

**PuLP (Python)**

```python
for i in range(n_items):
    L = lead_times[i]
    for t in range(T):
        prob += production[i][t] <= capacities[i] * setups[i][t]
        prev_inv = initial_inventory[i] if t == 0 else inventory[i][t - 1]
        arrival = production[i][t - L] if t >= L else 0
        dep_demand = pulp.lpSum(
            bom[i][j] * production[j][t] for j in range(n_items) if bom[i][j] != 0
        )
        prob += prev_inv + arrival - dep_demand - inventory[i][t] == external_demands[i][t]
```
