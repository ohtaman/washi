## アプローチ

0-1 変数 `selected[j]` を用意し、各資源次元 `capacities[k]` の不等式、前提依存 `selected[a] <= selected[b]`、および非両立制約 `selected[c] + selected[d] <= 1` を同時に課して総価値を最大化します。

## 数理モデル

$$
\begin{aligned}
\max \quad & \sum_{j=0}^{n-1} v_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} w_{k,j} x_j \le C_k && \forall k \in \{0, \dots, m-1\} \\
& x_a \le x_b && \forall (a, b) \in \mathcal{P} \\
& x_c + x_d \le 1 && \forall (c, d) \in \mathcal{I} \\
& x_j \in \{0, 1\} && \forall j
\end{aligned}
$$

## ポイント

- **多次元制約では単一指標の貪欲法が破綻する**: 資源 0 あたりの価値効率が高い項目が資源 1 を圧迫することがあり、すべての次元を連立させた厳密 MIP が必要になります。
- **論理依存とナップサックの統合**: $x_a \le x_b$ により依存元の重みも含めて採択判断が行われ、$x_c + x_d \le 1$ により高価値でも競合する組を同時に選ぶことが防がれます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [基本構成要素](?view=guide&lang=ja#building-blocks)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.capacities.map((cap, k) => expr`dot(${input.weights[k]}, ${selected}) <= ${cap}`)
);
m.constraint(
  input.prerequisites.map(([a, b]) => expr`${selected[a]} <= ${selected[b]}`)
);
m.constraint(
  input.incompatibles.map(([c, d]) => expr`${selected[c]} + ${selected[d]} <= 1`)
);
```

**PuLP (Python)**

```python
for k, cap in enumerate(capacities):
    prob += pulp.lpDot(weights[k], selected) <= cap
for a, b in prerequisites:
    prob += selected[a] <= selected[b]
for c, d in incompatibles:
    prob += selected[c] + selected[d] <= 1
```
