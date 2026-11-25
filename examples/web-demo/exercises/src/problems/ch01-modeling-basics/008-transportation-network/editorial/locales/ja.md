## アプローチ

出荷可能量 $s_i$ を持つ $S$ 箇所の焙煎工場、必要需要量 $d_j$ を持つ $D$ 箇所のカフェ店舗、輸送単価 $c_{i,j}$ に対し、工場 $i$ から店舗 $j$ への輸送量（kg）を非負連続変数 $x_{i,j} \ge 0$ として定義します。工場ごとの**出荷上限（行についての和 $\le s_i$）**と店舗ごとの**需要下限（列についての和 $\ge d_j$）**を課して総輸送コストを最小化します。

## 数理モデル

$$
\begin{aligned}
\min_{x \ge 0} \quad & \sum_{i=0}^{S-1} \sum_{j=0}^{D-1} c_{i,j} x_{i,j} \\
\text{s.t.} \quad & \sum_{j=0}^{D-1} x_{i,j} \le s_i && \forall i \in \{0, \dots, S-1\} \\
& \sum_{i=0}^{S-1} x_{i,j} \ge d_j && \forall j \in \{0, \dots, D-1\}
\end{aligned}
$$

## ポイント

- **全ユニモジュラ性（TU）による自動整数性**: 輸送問題の制約行列は特殊なネットワーク構造（2部グラフの接続行列）を持つため、供給量と需要量が整数であれば連続変数の線形計画（LP）として解くだけで最適頂点が自動的に整数になります。
- **`.map()` と `.flatMap()` による2次元集計**: 行制約・列制約をそれぞれ `.map()` で配列として構築し、目的関数の二重和は `.flatMap()` で 1 本の和へ展開します。
- 用語の確認: [ガイド・用語集 — 基本要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

2 次元変数配列 `shipments` に対し、行方向の和（工場の出荷上限）と列方向の和（店舗の需要下限）をそれぞれ `.map()` で制約として構築します。

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
