## アプローチ

充放電効率を反映した蓄電残量（SOC）の保存則に加え、最大系統買電電力 $\max_t g_t$ をエピグラフ変数 $P_{\text{peak}} \ge g_t$ で線形化し、同時充放電を防ぐ 0-1 モード変数 $z_t$ を組み合わせることで、TOU 裁定とピークカットを統合したモデルを構築します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{t=0}^{T-1} \pi_t g_t + \gamma P_{\text{peak}} \\
\text{s.t.} \quad & E_t = E_{t-1} + \eta_c c_t - \frac{1}{\eta_d} d_t && \forall t \;\; (E_{-1} = E_{\text{init}}) \\
& g_t = L_t + c_t - d_t \ge 0, \quad P_{\text{peak}} \ge g_t && \forall t \\
& 0 \le c_t \le P_{\max} z_t, \quad 0 \le d_t \le P_{\max} (1 - z_t) && \forall t \\
& E_{\min} \le E_t \le E_{\max}, \quad E_{T-1} \ge E_{\text{end}}, \quad z_t \in \{0, 1\} && \forall t
\end{aligned}
$$

ここで $L_t$（`baseLoads[t]`）、$\pi_t$（`prices[t]`）、$\gamma$（`demandCharge`）、$E_{\max}$（`capacity`）、$E_{\min}$（`minSoc`）、$E_{\text{init}}$（`initSoc`）、$E_{\text{end}}$（`minFinalSoc`）、$P_{\max}$（`maxPower`）、$\eta_c$（`etaCharge`）、$\eta_d$（`etaDischarge`）は各入力フィールドに対応します。

## ポイント

- **エピグラフ変数によるデマンド料金の線形化**: 非線形な $\gamma \max_t g_t$ は、補助変数 $P_{\text{peak}}$ と全時刻の不等式 $P_{\text{peak}} \ge g_t$ に置き換えるだけで厳密に線形表現できます。
- **LP 緩和が一致する条件と 0-1 変数の役割**: 電気料金 $\pi_t > 0$ かつ $\eta_c \eta_d < 1$ のときは同時充放電がエネルギー損を生むため目的関数を改善せず（$g_t > 0$ の期では厳密に劣最適）、ただし $g_t = 0$ の期やゼロ・負料金、理想効率（$\eta_c = \eta_d = 1$）を含む一般ケースでは 0-1 スイッチ $z_t$ が不可欠になります。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

各期について蓄電残量（SOC）の遷移式・系統買電電力の需給バランス式・ピーク電力のエピグラフ不等式・0-1 モード変数による同時充放電禁止制約をまとめて追加します。WaSHI では `baseLoads.forEach` 内で 5 本の制約を順に登録し、PuLP でも同じ構造をループで記述します。

**WaSHI (TypeScript)**

```ts
const invEtaD = 1 / input.etaDischarge;
input.baseLoads.forEach((base, t) => {
  const prevSoc = t === 0 ? input.initSoc : soc[t - 1];
  m.constraint(
    expr`${soc[t]} - ${prevSoc} - ${input.etaCharge} * ${charge[t]} + ${invEtaD} * ${discharge[t]} == 0`
  );
  m.constraint(expr`${gridLoad[t]} - ${charge[t]} + ${discharge[t]} == ${base}`);
  m.constraint(expr`${peakLoad} >= ${gridLoad[t]}`);
  m.constraint(expr`${charge[t]} <= ${input.maxPower} * ${mode[t]}`);
  m.constraint(expr`${discharge[t]} <= ${input.maxPower} * (1 - ${mode[t]})`);
});
```

**PuLP (Python)**

```python
for t in range(T):
    prev_soc = init_soc if t == 0 else soc[t - 1]
    prob += soc[t] == prev_soc + eta_charge * charge[t] - discharge[t] / eta_discharge
    prob += grid_load[t] == base_loads[t] + charge[t] - discharge[t]
    prob += peak_load >= grid_load[t]
    prob += charge[t] <= max_power * mode[t]
    prob += discharge[t] <= max_power * (1 - mode[t])
```
