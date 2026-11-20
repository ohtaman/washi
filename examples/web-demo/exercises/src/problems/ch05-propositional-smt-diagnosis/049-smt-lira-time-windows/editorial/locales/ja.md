## アプローチ

真偽値モード変数 `express[i]`（`m.bool`）、本数計数用の `0`-`1` 変数 `expFlag[i]`（`m.binary`）、および連続時刻・遅れ時間変数 `start[i]`, `end[i]`, `tardy[i]`（`m.continuous`）を併用します。`implies(...)` で各モードの時間枠と小数所要時間を切り替え、`or(...)` で保守休止回避とドック非重複を表して `await m.solve({ solver: "z3" })` で最小コストを求めます。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \left( F_i^{\text{exp}}\, e_i + p_i\, \tau_i \right) \\
\text{s.t.} \quad & x_i \iff (e_i = 1) && \forall i \\
& \neg x_i \implies \bigl(w^{\text{std}}_{i,0} \le s_i,\; c_i = s_i + d_i^{\text{std}},\; c_i \le w^{\text{std}}_{i,1}\bigr) && \forall i \\
& x_i \implies \bigl(w^{\text{exp}}_{i,0} \le s_i,\; c_i = s_i + d_i^{\text{exp}},\; c_i \le w^{\text{exp}}_{i,1}\bigr) && \forall i \\
& (c_i \le b_0) \lor (s_i \ge b_1) && \forall i \\
& (c_i \le s_j) \lor (c_j \le s_i) && \forall i < j \\
& \sum_{i=0}^{n-1} e_i \le K_{\max}, \quad \tau_i \ge c_i - D_i \\
& x_i \in \{\text{false}, \text{true}\},\quad e_i \in \{0, 1\},\quad s_i, c_i, \tau_i \ge 0 && \forall i
\end{aligned}
$$

## ポイント

- **Big-M 不要の SMT-LIRA 表現**: 通常の MIP では連続値の時間枠切替や選言的非重複に Big-$M$ の手動調整が必要ですが、Z3 は `implies` や `or` の内部にある連続変数不等式を厳密な有理数線形実数算術として直接解けます。
- **論理・整数・連続実数の統合**: `BoolVar` と `Binary` を連動させることで、整数本数制限 `sum(expFlag) <= maxExpress` と連続時刻の遅延ペナルティを 1 つのモデルで同時最適化できます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(
  implies(express[i], and(expr`${start[i]} >= ${spec.expWindow[0]}`, expr`${end[i]} == ${start[i]} + ${spec.expDuration}`, expr`${end[i]} <= ${spec.expWindow[1]}`)),
  `exp_mode_${i}`
);
m.constraint(or(expr`${end[i]} <= ${input.blackout[0]}`, expr`${start[i]} >= ${input.blackout[1]}`), `blackout_${i}`);
m.constraint(or(expr`${end[i]} <= ${start[j]}`, expr`${end[j]} <= ${start[i]}`), `dock_${i}_${j}`);
```
