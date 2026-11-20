## アプローチ

各発電機・各時刻の運転状態 $u_{g,t} \in \{0,1\}$、起動指示変数 $v_{g,t} \in \{0,1\}$、停止変数 $w_{g,t} \in [0,1]$ を状態遷移等式 $v_{g,t} - w_{g,t} = u_{g,t} - u_{g,t-1}$ で結び、最小連続運転・停止時間に Rajan–Takriti のタイトな窓和不等式を適用して起動費＋燃料費を最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{g,t} \left( K_g v_{g,t} + c_g p_{g,t} \right) \\
\text{s.t.} \quad & \sum_{g} p_{g,t} = D_t, \quad P^{\min}_g u_{g,t} \le p_{g,t} \le P^{\max}_g u_{g,t} && \forall g, t \\
& v_{g,t} - w_{g,t} = u_{g,t} - u_{g,t-1} && \forall g, t \;\; (u_{g,-1} = 0) \\
& \sum_{\tau=\max(0, t-U_g+1)}^{t} v_{g,\tau} \le u_{g,t}, \quad \sum_{\tau=\max(0, t-D^{\text{down}}_g+1)}^{t} w_{g,\tau} \le 1 - u_{g,t} && \forall g, t \\
& p_{g,t} - p_{g,t-1} \le R_g u_{g,t-1} + S_g (1 - u_{g,t-1}) && \forall g, t \ge 1 \\
& p_{g,t-1} - p_{g,t} \le R_g u_{g,t} + S_g (1 - u_{g,t}) && \forall g, t \ge 1
\end{aligned}
$$

ただし $S_g = \max(P^{\min}_g, R_g)$、$p_{g,0} \le S_g$ とします。

## ポイント

- **タイトな起動・停止窓和不等式（Turn-on/Turn-off 制約）**: 直近 $U_g$ 時間の起動和を $u_{g,t}$ 以下に抑えると「起動したら最低 $U_g$ 時間稼働」と「同期間内に最大 1 回しか起動できない」が同時に表現でき、停止側と対で用いることで $v_{g,t}$ と $w_{g,t}$ が自動的に 0-1 に定まります。
- **起動・停止時のランプ緩和**: 単純な $|p_{g,t} - p_{g,t-1}| \le R_g$ では $P^{\min}_g > R_g$ の基底電源が起動不能になりますが、$R_g u + S_g(1 - u)$ にすれば起動・停止時の $P^{\min}_g$ へのジャンプを正しく許容しつつ稼働中ランプ幅を $R_g$ に保てます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
const prevU = t === 0 ? 0 : u[g][t - 1];
m.constraint(expr`${v[g][t]} - ${w[g][t]} - ${u[g][t]} + ${prevU} == 0`);
const upStart = Math.max(0, t - input.minUp[g] + 1);
m.constraint(expr`${sum(v[g].slice(upStart, t + 1))} <= ${u[g][t]}`);
const downStart = Math.max(0, t - input.minDown[g] + 1);
m.constraint(expr`${sum(w[g].slice(downStart, t + 1))} + ${u[g][t]} <= 1`);
```

**PuLP (Python)**

```python
prev_u = 0 if t == 0 else u[g][t - 1]
prob += v[g][t] - w[g][t] == u[g][t] - prev_u
prob += pulp.lpSum(v[g][max(0, t - min_up[g] + 1) : t + 1]) <= u[g][t]
prob += pulp.lpSum(w[g][max(0, t - min_down[g] + 1) : t + 1]) <= 1 - u[g][t]
```
