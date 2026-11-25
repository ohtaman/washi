## アプローチ

第 $t$ 期の期首在庫を $I_t^{\text{real}}$（$I_0^{\text{real}} = \text{initialInventory}$）とします。各期 $t = 0, \dots, T - 1$ において、$I_{t-1} = I_t^{\text{real}}$ を初期条件としてウィンドウ $[t, \min(T, t + H))$ の予測需要 `forecastDemands` に対する先読み LP を解きます。当期の生産量 $x_t^*$ だけを確定し、実需 `actualDemands[t]` から次期の期首在庫 $I_{t+1}^{\text{real}} = \max(0, I_t^{\text{real}} + x_t^* - d_t^{\text{act}})$ と欠品量 $\max(0, d_t^{\text{act}} - I_t^{\text{real}} - x_t^*)$ を更新して次期へ進みます。

## 数理モデル

$$
\begin{aligned}
\forall t = 0, \dots, T-1: \quad \min_{x, I, s \ge 0} \quad & \sum_{k=t}^{E-1} \left( c_k x_k + h I_k + p s_k \right) \qquad \left(E = \min(T, t + H)\right) \\
\text{s.t.} \quad & I_{t-1} = I_t^{\text{real}} \\
& I_{k-1} + x_k + s_k - I_k = \hat{d}_k && \forall k \in \{t, \dots, E-1\} \\
& 0 \le x_k \le C_{\text{prod}} && \forall k \in \{t, \dots, E-1\}
\end{aligned}
$$

## ポイント

- **近視眼計画（$H = 1$）・先読み MPC・完全予知（Clairvoyant）の違い**: $H = 1$ では次期以降の需要スパイクを見通せず先行生産できないため巨額の欠品ペナルティを被ります（Case 0 では 1830 対 860）。一方 MPC では、予測誤差を含みつつも毎期実在庫をフィードバックしながら順次計画を更新できます。
- **欠品スラックによる実行可能性保証**: 各ステップの在庫収支に非負の欠品変数 $s_k \ge 0$ を入れておくことで、予測と実需のズレが生じた場合でも次期の先読み LP が必ず実行可能になります。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

各期 `t` ごとに長さ `L` の先読みウィンドウ上で `Model` を構築し、`Array.from({ length: L }, ...)` で在庫収支制約を一括登録します。求解後は先頭期の生産量 `x[0]` だけを確定し、実需に基づいて実在庫を更新します。

**WaSHI (TypeScript)**

```ts
for (let t = 0; t < T; t++) {
  const end = Math.min(T, t + input.windowLen);
  const L = end - t;
  const m = new Model(`MPC_${t}`);
  const x = m.continuous(L, { lb: 0, ub: input.prodCap, prefix: "x" });
  const inv = m.continuous(L, { lb: 0, prefix: "inv" });
  const sh = m.continuous(L, { lb: 0, prefix: "sh" });
  m.constraint(Array.from({ length: L }, (_, k) =>
    expr`${k === 0 ? invCurr : inv[k - 1]} + ${x[k]} + ${sh[k]} - ${inv[k]} == ${input.forecastDemands[t + k]}`
  ));
  m.objective(minimize(expr`dot(${input.prodCosts.slice(t, end)}, ${x}) + ${input.holdCost} * sum(${inv}) + ${input.shortfallPenalty} * sum(${sh})`));
  await m.solve();
  const xt = x[0].value!;
  const realizedShort = Math.max(0, input.actualDemands[t] - (invCurr + xt));
  invCurr = Math.max(0, invCurr + xt - input.actualDemands[t]);
}
```

**PuLP (Python)**

```python
for t in range(T):
    end = min(T, t + window_len)
    L = end - t
    prob = pulp.LpProblem(f"mpc_{t}", pulp.LpMinimize)
    x = [pulp.LpVariable(f"x_{k}", lowBound=0, upBound=prod_cap) for k in range(L)]
    inv = [pulp.LpVariable(f"inv_{k}", lowBound=0) for k in range(L)]
    sh = [pulp.LpVariable(f"sh_{k}", lowBound=0) for k in range(L)]
    for k in range(L):
        prob += (inv_curr if k == 0 else inv[k - 1]) + x[k] + sh[k] - inv[k] == forecast_demands[t + k]
    prob += pulp.lpDot(prod_costs[t:end], x) + hold_cost * pulp.lpSum(inv) + shortfall_penalty * pulp.lpSum(sh)
    prob.solve(pulp.HiGHS(msg=False))
    xt = float(pulp.value(x[0]))
    realized_short = max(0.0, actual_demands[t] - (inv_curr + xt))
    inv_curr = max(0.0, inv_curr + xt - actual_demands[t])
```
