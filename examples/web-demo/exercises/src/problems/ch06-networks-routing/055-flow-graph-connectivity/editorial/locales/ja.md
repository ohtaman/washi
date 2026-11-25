## アプローチ

頂点選択の 0-1 変数 $y_v$（$y_0 = 1$）と無向辺変数 $w_e$ に加え、辺の向きを表す 0-1 変数 $z_e^{\to}, z_e^{\leftarrow}$（$z_e^{\to} + z_e^{\leftarrow} \le w_e$ により敷設した各辺で最大 1 方向のみフローを許可）と非負の仮想フロー変数 $f_e^{\to} \le (n-1) z_e^{\to}$、$f_e^{\leftarrow} \le (n-1) z_e^{\leftarrow}$ を導入します。根頂点 0 から選ばれた全頂点 $v \ge 1$ へ 1 単位ずつフローを送り切る制約により、孤立島のない単一の連結成分を保証します。

## 数理モデル

$$
\begin{aligned}
\max \quad & \sum_{v=0}^{n-1} p_v y_v - \sum_{e \in E} c_e w_e \\
\text{s.t.} \quad & y_0 = 1, \quad w_e \le y_u, \quad w_e \le y_v, \quad z_e^{\to} + z_e^{\leftarrow} \le w_e && \forall e=(u,v) \in E \\
& 0 \le f_e^{\to} \le (n-1) z_e^{\to}, \quad 0 \le f_e^{\leftarrow} \le (n-1) z_e^{\leftarrow} && \forall e \in E \\
& \text{outflow}(0) - \text{inflow}(0) = \sum_{v=1}^{n-1} y_v, \quad \text{inflow}(v) - \text{outflow}(v) = y_v && \forall v \ge 1 \\
& y_v \in \{0, 1\} \;\; \forall v, \quad w_e, z_e^{\to}, z_e^{\leftarrow} \in \{0, 1\} \;\; \forall e \in E
\end{aligned}
$$

## ポイント

- **局所的な次数制約の限界**: 「辺を選ぶには両端点が選択済み（$w_e \le y_u, y_v$）」や「採用頂点は次数 1 以上」といった局所制約だけでは、根頂点 0 から切り離された孤立クラスター（例えば入力例の孤立した高便益ペア `{3, 4}` だけの選択）を止められません。
- **仮想フローによる連結性の線形表現**: 根頂点 0 だけが供給源となり、選択された辺上しかフローを通せないため、各採用頂点が正味 1 単位を受け取れること自体が「根頂点 0 からの連結パスの存在証明」になります。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

`input.edges.forEach` で各無向辺に対し、両端点選択の結合制約・向き選択の排他制約・容量 $(n - 1)$ の仮想フロー上限制約をまとめて登録します。

**WaSHI (TypeScript)**

```ts
input.edges.forEach((e, idx) => {
  m.constraint(expr`${w[idx]} <= ${y[e.u]}`);
  m.constraint(expr`${w[idx]} <= ${y[e.v]}`);
  m.constraint(expr`${zFwd[idx]} + ${zRev[idx]} <= ${w[idx]}`);
  m.constraint(expr`${fFwd[idx]} <= ${n - 1} * ${zFwd[idx]}`);
  m.constraint(expr`${fRev[idx]} <= ${n - 1} * ${zRev[idx]}`);
});
```

**PuLP (Python)**

```python
for i, e in enumerate(edges):
    prob += w[i] <= y[e["u"]]
    prob += w[i] <= y[e["v"]]
    prob += z_fwd[i] + z_rev[i] <= w[i]
    prob += f_fwd[i] <= (n - 1) * z_fwd[i]
    prob += f_rev[i] <= (n - 1) * z_rev[i]
```
