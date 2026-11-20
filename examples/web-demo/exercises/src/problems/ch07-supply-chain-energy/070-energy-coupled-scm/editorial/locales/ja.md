## アプローチ

第 7 章で学んだロットサイズ計画と蓄電池運用を 1 つの MIP に統合します。製品在庫 $I_t$ の収支式と蓄電池 SOC $E_t$ の収支式を、系統買電平衡式 $g_t = L_t + p_{\text{idle}} y_t + p_{\text{unit}} x_t + c_t - d_t$ で結合し、生産コスト・電力料金・デマンド料金の総和を最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{t=0}^{T-1} \left( F y_t + h I_t + \pi_t g_t \right) + \gamma P_{\text{peak}} \\
\text{s.t.} \quad & I_{t-1} + x_t - I_t = D_t, \quad 0 \le x_t \le C_{\text{prod}} y_t && \forall t \;\; (I_{-1} = 0) \\
& E_t = E_{t-1} + \eta_c c_t - \frac{1}{\eta_d} d_t && \forall t \;\; (E_{-1} = E_{\text{init}},\; E_{T-1} \ge E_{\text{init}}) \\
& g_t = L_t + p_{\text{idle}} y_t + p_{\text{unit}} x_t + c_t - d_t \ge 0, \quad P_{\text{peak}} \ge g_t && \forall t \\
& 0 \le c_t \le P_{\max} z_t, \quad 0 \le d_t \le P_{\max} (1 - z_t) && \forall t \\
& y_t, z_t \in \{0, 1\}, \quad I_t \ge 0, \quad 0 \le E_t \le E_{\max}
\end{aligned}
$$

ただし $D_t$（`demands[t]`）は固定の製品需要、$d_t$（`discharge[t]`）は制御可能な蓄電池放電量です。

## ポイント

- **「製品在庫」と「蓄電池」の二重バッファ**: 安価な時間帯に先行生産して製品在庫 $I_t$ を持つことは、工場電力を製品の形で前倒し消費・貯蔵することに相当します。保管費 $h$ と蓄電池の充放電ロス $1 - \eta_c \eta_d$ を見比べながら両者を併用することで単体最適化より低い総コストを実現します。
- **系統負荷等式による統合最適化**: 段取り待機電力 $p_{\text{idle}} y_t$ と加工電力 $p_{\text{unit}} x_t$ を同じ買電式 $g_t$ に入れることで、生産バッチ集約・負荷シフト・ピークカットを同時最適化できます。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${production[t]} <= ${input.prodCap} * ${setups[t]}`);
m.constraint(expr`${prevInv} + ${production[t]} - ${inventory[t]} == ${demand}`);
m.constraint(
  expr`${soc[t]} - ${prevSoc} - ${input.etaCharge} * ${charge[t]} + ${invEtaD} * ${discharge[t]} == 0`
);
m.constraint(
  expr`${gridLoad[t]} - ${input.setupPower} * ${setups[t]} - ${input.unitPower} * ${production[t]} - ${charge[t]} + ${discharge[t]} == ${input.baseLoads[t]}`
);
m.constraint(expr`${peakLoad} >= ${gridLoad[t]}`);
```

**PuLP (Python)**

```python
prob += production[t] <= prod_cap * setups[t]
prob += prev_inv + production[t] - inventory[t] == demands[t]
prob += soc[t] == prev_soc + eta_c * charge[t] - discharge[t] / eta_d
prob += grid_load[t] == base_loads[t] + setup_power * setups[t] + unit_power * production[t] + charge[t] - discharge[t]
prob += peak_load >= grid_load[t]
```
