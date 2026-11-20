## アプローチ

各ラインの稼働有無を表す 0-1 変数 `open` と生産量を表す連続変数 `quantities` を対にし、`quantities[i] <= capacities[i] * open[i]` で稼働と生産上限を連動させたうえで、共有原材料上限のもとで純利益（粗利 − 固定費）を最大化します。

## 数理モデル

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} m_i q_i - \sum_{i=0}^{n-1} F_i y_i \\
\text{s.t.} \quad & 0 \le q_i \le C_i y_i && \forall i \in \{0, \dots, n-1\} \\
& \sum_{i=0}^{n-1} a_i q_i \le M_{\text{cap}} \\
& y_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## ポイント

- **0-1 スイッチによるオン・オフ制御（Big-M の基礎）**: $q_i \le C_i y_i$ と書くことで、`y_i = 0` なら $q_i \le 0$（停止）、`y_i = 1` なら $q_i \le C_i$（稼働）となります。第 1 章の連続 LP と 0-1 計画を融合するパターンであり、第 2 章の Big-M 法・固定費ネットワークにつながります。
- **固定費と変動利益の分離**: 目的関数を `dot(margins, quantities) - dot(fixedCosts, open)` と書くことで、生産量 `quantities[i]` に関係なく「稼働（`open[i] = 1`）したラインに対してだけ固定費を 1 回引く」構造を表現できます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(
  quantities.map((qty, i) => expr`${qty} <= ${input.capacities[i]} * ${open[i]}`)
);
m.constraint(
  expr`dot(${input.materialUsages}, ${quantities}) <= ${input.materialCap}`,
  "material"
);
m.objective(
  maximize(
    expr`dot(${input.margins}, ${quantities}) - dot(${input.fixedCosts}, ${open})`
  )
);
```

**Python (PuLP)**

```python
for i in range(n):
    prob += quantities[i] <= capacities[i] * open_vars[i]
prob += pulp.lpDot(mat_usages, quantities) <= mat_cap
prob += pulp.lpDot(margins, quantities) - pulp.lpDot(fixed_costs, open_vars)
prob.solve(pulp.HiGHS(msg=False))
```
