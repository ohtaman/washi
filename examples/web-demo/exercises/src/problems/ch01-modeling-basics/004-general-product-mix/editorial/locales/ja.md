## アプローチ

製品数に応じた非負連続変数の配列 `quantities` を宣言し、各資源行 `usages[k]` ごとに上限制約 `dot(usages[k], quantities) <= capacities[k]` を並べて総利益 `dot(margins, quantities)` を最大化します。

## 数理モデル

$$
\begin{aligned}
\max \quad & \sum_{j=0}^{n-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} a_{k,j} x_j \le b_k && \forall k \in \{0, \dots, m-1\} \\
& x_j \ge 0 && \forall j \in \{0, \dots, n-1\}
\end{aligned}
$$

## ポイント

- **データ駆動の制約記述（`.map()`）**: **#001** のように 1 本ずつ手書きするのではなく、`input.capacities.map(...)` で $m$ 本の制約式配列を作って `m.constraint([...])` にまとめて渡すとスッキリ書けます。
- **連続 LP の頂点解**: 個数を整数に制限した **#003** とは異なり、本作は連続変数なので実行可能領域（多面体）の頂点として端数を含む最適解が自然に得られます。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
const quantities = m.continuous(input.margins.length, { lb: 0, prefix: "q" });

m.constraint(
  input.capacities.map(
    (cap, k) => expr`dot(${input.usages[k]}, ${quantities}) <= ${cap}`
  )
);
m.objective(maximize(expr`dot(${input.margins}, ${quantities})`));
```

**Python (highspy)**

```python
for k, cap in enumerate(capacities):
    h.addConstr(
        h.qsum(usages[k][j] * quantities[j] for j in range(n_products)) <= cap
    )
h.maximize(h.qsum(margins[j] * quantities[j] for j in range(n_products)))
```
