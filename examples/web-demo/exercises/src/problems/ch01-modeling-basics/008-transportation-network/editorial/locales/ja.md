## アプローチ

倉庫 $i$ から店舗 $j$ への輸送量を表す非負連続変数行列 `shipments[i][j]` を宣言し、倉庫ごとの供給上限（行和 `<= supplies[i]`）と店舗ごとの需要下限（列和 `>= demands[j]`）を課して総輸送費を最小化します。

## 数理モデル

$$
\begin{aligned}
\min_{x \ge 0} \quad & \sum_{i=0}^{S-1} \sum_{j=0}^{D-1} c_{i,j} x_{i,j} \\
\text{s.t.} \quad & \sum_{j=0}^{D-1} x_{i,j} \le S_i && \forall i \in \{0, \dots, S-1\} \\
& \sum_{i=0}^{S-1} x_{i,j} \ge D_j && \forall j \in \{0, \dots, D-1\}
\end{aligned}
$$

## ポイント

- **全ユニモジュラ性（TU）による自動整数性**: 輸送問題の制約行列は特殊なネットワーク構造（2部グラフの接続行列）を持つため、供給量と需要量が整数であれば連続計画（LP）として解くだけで最適頂点が自動的に整数になります。
- **`.map()` と `.flatMap()` による2次元集計**: 行制約・列制約をそれぞれ `map` で配列として構築し、目的関数の二重和は `flatMap` で 1 本の和へ展開します。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(
  shipments.map((row, i) => expr`${sum(row)} <= ${input.supplies[i]}`)
);
m.constraint(
  input.demands.map(
    (demand, j) => expr`${sum(shipments.map((row) => row[j]))} >= ${demand}`
  )
);
```

**PuLP (Python)**

```python
for i in range(n_s):
    prob += pulp.lpSum(shipments[i][j] for j in range(n_d)) <= supplies[i]
for j in range(n_d):
    prob += pulp.lpSum(shipments[i][j] for i in range(n_s)) >= demands[j]
```
