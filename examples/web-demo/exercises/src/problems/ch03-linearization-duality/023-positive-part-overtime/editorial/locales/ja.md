## アプローチ

各期の不足残業量 $\max(0, d_t - x_t)$ を表す非負変数 $s_t \ge 0$ を導入し、$s_t \ge d_t - x_t$ の不等式で下から抑えたうえで $\sum_t (r_t x_t + p_t s_t)$ を最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{t=0}^{T-1} \left(r_t x_t + p_t s_t\right) \\
\text{s.t.} \quad & \sum_{t=0}^{T-1} x_t \le \text{totalRegularCap} \\
& s_t \ge d_t - x_t && \forall t \in \{0, \dots, T-1\} \\
& L_t \le x_t \le U_t, \quad s_t \ge 0 && \forall t
\end{aligned}
$$

## ポイント

- **符号反転の罠（$s_t \ge x_t - d_t$ と書いてしまうミス）**: 誤って $s_t \ge x_t - d_t$ と書くと、不足ではなく「余剰」$\max(0, x_t - d_t)$ にペナルティがかかってしまい、$x_t$ を下げても残業ペナルティが $0$ になってしまいます。$x_t < d_t$ のときに $s_t$ が正へ押し上げられる向き（$d_t - x_t$）を必ず確認してください。
- **等式にしてしまう罠（$s_t = d_t - x_t$）**: 閑散期に最低稼働量 $L_t > d_t$ があると $x_t > d_t$ すなわち $d_t - x_t < 0$ になり、等式と $s_t \ge 0$ が矛盾して `INFEASIBLE` になります。不等式 $s_t \ge d_t - x_t$ にしておけば、$p_t > 0$ の最小化圧力によって自動的に $s_t = \max(0, d_t - x_t)$ へ収束します。
- 用語の確認: [ガイド・用語集 — 採点ステータス](?view=guide&lang=ja#verdicts) / [基本構成要素](?view=guide&lang=ja#building-blocks)

## 実装の勘所

全期間の通常稼働時間合計の制約と各期の不足量に対する不等式 `shortage[t] >= demand - regular[t]` を登録し、通常稼働コストと残業ペナルティの総和を最小化します。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${sum(regular)} <= ${input.totalRegularCap}`, "total_regular");
m.constraint(
  input.demands.map((demand, t) => expr`${shortage[t]} >= ${demand} - ${regular[t]}`)
);
m.objective(
  minimize(
    expr`dot(${input.regularCosts}, ${regular}) + dot(${input.overtimePenalties}, ${shortage})`
  )
);
```

**PuLP (Python)**

```python
prob += pulp.lpSum(regular) <= total_cap
for t in range(T):
    prob += shortage[t] >= demands[t] - regular[t]
prob += pulp.lpDot(reg_costs, regular) + pulp.lpDot(penalties, shortage)
prob.solve(pulp.HiGHS(msg=False))
```
