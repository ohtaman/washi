## アプローチ

各時刻 $t = 0, \dots, T - 1$ において、現在の実在庫 $I_t^{\text{real}}$ を初期値とし、ウィンドウ $[t, \min(T, t + H))$ の予測需要 `forecastDemands` に対する先読み LP を解きます。決定された初手生産量 $x_0^*$ だけを確定し、実需 `actualDemands[t]` で翌期在庫 $I_{t+1}^{\text{real}} = \max(0, I_t^{\text{real}} + x_0^* - d_t^{\text{act}})$ と実欠品量を更新して次期へ進みます。

## 数理モデル

$$
\begin{aligned}
\forall t = 0, \dots, T-1: \quad \min_{x, I, s \ge 0} \quad & \sum_{k=t}^{E-1} \left( c_k x_k + h I_k + p s_k \right) \qquad \left(E = \min(T, t + H)\right) \\
\text{s.t.} \quad & I_{k-1} + x_k + s_k - I_k = \hat{d}_k && \forall k \in \{t, \dots, E-1\} \\
& I_{t-1} = I_t^{\text{real}}, \quad 0 \le x_k \le C_{\text{prod}}
\end{aligned}
$$

## ポイント

- **近視眼計画（$H = 1$）・先読み MPC・完全予知（Clairvoyant）の違い**: $H = 1$ では次期以降の需要スパイクを見通せず先行生産できないため巨額の欠品ペナルティを被ります（Case 0 では 1830 対 860）。一方 MPC では、予測誤差を含みつつも毎期実在庫をフィードバックしながら順次計画を更新できます。
- **欠品スラックによる実行可能性保証**: 各ステップの在庫収支に非負の欠品変数 $s_k \ge 0$ を入れておくことで、予測と実需のズレが生じた場合でも次期の先読み LP が必ず実行可能になります。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

各期 `t` ごとに長さ `L` の先読みウィンドウ上で `Model` を構築し、`Array.from({ length: L }, ...)` で在庫収支制約を一括登録して先頭期の生産量だけを確定させます。

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
        prob += (inv_curr if k == 0 else inv[k - 1]) + x[k] + sh[k] - inv[k] == forecasts[t + k]
    prob += pulp.lpDot(prod_costs[t:end], x) + hold_cost * pulp.lpSum(inv) + shortfall_pen * pulp.lpSum(sh)
    prob.solve(pulp.HiGHS(msg=False))
```
