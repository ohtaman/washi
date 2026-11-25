## アプローチ

区画割当の 0-1 変数 $y_{ik}$ とハブ選択 $h_{ik} \le y_{ik}$ に対し、隣接グラフ `adjEdges` 上の単一品種フロー（$s_{ik} \le n h_{ik}$、$f_{ek} \le (n-1) y_{uk}$、$f_{ek} \le (n-1) y_{vk}$）で各テリトリーの領域連結性を保証しつつ、同一テリトリー内のみを結ぶ巡回枝 $x_{ij}$（$y_{ik} - y_{jk} \le 1 - x_{ij}$）とハブでリセットされる MTZ ポテンシャルを結合します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{k=0}^{K-1}\sum_{i=0}^{n-1} F_i h_{ik} + \sum_{i=0}^{n-1}\sum_{j \ne i} d_{ij} x_{ij} \\
\text{s.t.} \quad & \sum_k y_{ik} = 1 \;\; (\forall i), \quad \sum_i h_{ik} = 1, \quad h_{ik} \le y_{ik}, \quad L \le \sum_i \text{demands}_i y_{ik} \le U && \forall k \\
& s_{ik} \le n h_{ik} \;\; (\forall i, k), \quad f_{u \to v, k} \le (n-1) y_{uk}, \quad f_{u \to v, k} \le (n-1) y_{vk} && \forall (u, v) \in \vec{E},\; k \\
& s_{ik} + \text{inflow}_k(i) - \text{outflow}_k(i) = y_{ik} && \forall i, k \\
& \sum_{j \ne i} x_{ij} = \sum_{j \ne i} x_{ji} = 1 \;\; (\forall i), \quad y_{ik} - y_{jk} \le 1 - x_{ij} && \forall i \ne j,\; k \\
& u_i + 1 - u_j \le n\left(1 - x_{ij} + \sum_k h_{jk}\right) && \forall i \ne j \\
& y_{ik}, h_{ik}, x_{ij} \in \{0, 1\}, \quad s_{ik} \ge 0, \quad f_{u \to v, k} \ge 0, \quad 0 \le u_i \le n - 1
\end{aligned}
$$

ここで $F_i = \text{hubCosts}[i]$、$d_{ij} = \text{dist}[i][j]$、$[L, U] = \text{demandBounds}$、$K = \text{numTerritories}$ であり、$\vec{E}$ は各無向辺 $\{u, v\} \in \text{adjEdges}$ に対する双方向の有向枝 $(u, v)$ および $(v, u)$ の集合です。

## ポイント

- **未知のハブからのフロー供給を線形化**: もし供給量を $\left(\sum_j y_{jk}\right) h_{ik}$ と書くと積になってしまいますが、連続供給変数 $s_{ik} \le n h_{ik}$ を置いて保存則 $s_{ik} + \text{inflow}_k(i) - \text{outflow}_k(i) = y_{ik}$ を全頂点で足し合わせれば、選ばれたハブだけがテリトリーサイズ分のフローを供給する形に完全線形化できます。
- **ハブでリセットされる MTZ 部分巡回路排除**: 終点 $j$ がハブであるときだけ $\sum_k h_{jk} = 1$ によって MTZ 不等式を緩めることで、「各テリトリーにハブを 1 つずつ含む単一の閉路」のみを許します。
- **対称性除去による高速化**: $\sum_i i \cdot h_{ik} + 1 \le \sum_i i \cdot h_{i,k+1}$ でテリトリー番号をハブ番号順に並べることで、探索木から重複対称解を削減できます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

全区画 `nodes` に対して出次数・入次数 1 の制約を課しつつ、`filter` と `flatMap` で異なる区画ペア `(i, j)` を列挙して同一テリトリー制限とハブ基準の MTZ 制約を登録します。

**WaSHI (TypeScript)**

```ts
const nodes = Array.from({ length: n }, (_, i) => i);
const territories = Array.from({ length: K }, (_, k) => k);

nodes.forEach((i) => {
  m.constraint(expr`${sum(x[i].filter((v) => v !== null))} == 1`);
  m.constraint(expr`${sum(x.map((row) => row[i]).filter((v) => v !== null))} == 1`);
  m.constraint(
    nodes
      .filter((j) => i !== j)
      .flatMap((j) => [
        ...territories.map((k) => expr`${y[i][k]} - ${y[j][k]} <= 1 - ${x[i][j]!}`),
        expr`${u[i]} + 1 - ${u[j]} <= ${n} * (1 - ${x[i][j]!} + ${sum(h[j])})`,
      ])
  );
});
```

**PuLP (Python)**

```python
for i in range(n):
    prob += pulp.lpSum(x[i][j] for j in range(n) if j != i) == 1
    prob += pulp.lpSum(x[j][i] for j in range(n) if j != i) == 1
    for j in range(n):
        if i != j:
            for k in range(num_territories):
                prob += y[i][k] - y[j][k] <= 1 - x[i][j]
            h_j = pulp.lpSum(h[j][k] for k in range(num_territories))
            prob += u[i] + 1 - u[j] <= n * (1 - x[i][j] + h_j)
```
