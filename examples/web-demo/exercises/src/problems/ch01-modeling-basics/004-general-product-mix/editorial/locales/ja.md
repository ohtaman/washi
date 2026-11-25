## アプローチ

各フレーバー $j$ の生産量（リットル）を非負の連続変数 $x_j$（`quantities[j]`）として定義します。1 リットルあたりの利益 $c_j$（`margins[j]`）、材料・設備 $k$ の消費量 $a_{k,j}$（`usages[k][j]`）、利用上限 $b_k$（`capacities[k]`）を用いて、すべての材料・設備について消費量の合計が $b_k$ 以下になる制約のもとで総利益を最大化します。WaSHI（および PuLP）では、これらを**変数配列 `quantities`** と **`dot` / `lpDot`** で簡潔に記述できます。

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
- **連続変数と端数解**: 個数を整数に制限した **#003** とは異なり、本問の生産量は連続変数（LP）としてモデル化するため、最適解に端数が含まれる場合があります。実行可能領域が有界かつ非空の LP では多面体の頂点に最適解が存在し、制約の交点として非整数値が得られることもあります。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

フレーバー数や材料・設備の数がデータによって変わるため、`.map()`（WaSHI）やループ（PuLP）で制約を動的に生成し、`dot` / `pulp.lpDot` で内積を簡潔に記述します。

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
