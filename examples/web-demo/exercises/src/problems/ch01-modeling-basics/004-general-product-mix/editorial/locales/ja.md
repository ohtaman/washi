## アプローチ

各フレーバーの生産量（リットル）を非負の連続変数 $x_j$ として定義し、すべての材料・設備について消費量の合計が利用上限 $b_k$ 以下になる制約のもとで総利益を最大化します。WaSHI（および PuLP）では、これらを**変数配列 `quantities`** と **`dot` / `lpDot`** を用いて簡潔に記述できます。

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
- **連続 LP の頂点解**: 個数を整数に制限した **#003** とは異なり、本問は連続変数なので実行可能領域（多面体）の頂点として端数を含む最適解が自然に得られます。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

フレーバー数や材料・設備の数がデータによって変わるため、`.map()`（WaSHI）やリスト内包表記（PuLP）で制約を動的に生成し、`dot` / `pulp.lpDot` で内積を簡潔に記述します。

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

**PuLP (Python)**

```python
for k, cap in enumerate(capacities):
    prob += pulp.lpDot(usages[k], quantities) <= cap
prob += pulp.lpDot(margins, quantities)
prob.solve(pulp.HiGHS(msg=False))
```
