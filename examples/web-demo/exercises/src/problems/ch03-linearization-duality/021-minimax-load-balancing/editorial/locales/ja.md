## アプローチ

各ジョブ・サーバー間の割当比率 $x_{ij} \in [0, \text{compatible}_{ij}]$ に加え、最大負荷の上界を表す連続変数（エピグラフ変数）$t$ を 1 つ導入します。各サーバーの負荷和 $\sum_i w_i x_{ij}$ を $t$ 以下に抑える制約を並べて $t$ を最小化することで、$\min \max_j$ を純粋な LP として解けます。

## 数理モデル

$$
\begin{aligned}
\min \quad & t \\
\text{s.t.} \quad & \sum_{j=0}^{m-1} x_{ij} = 1 && \forall i \in \{0, \dots, n-1\} \\
& \sum_{i=0}^{n-1} w_i x_{ij} \le t && \forall j \in \{0, \dots, m-1\} \\
& 0 \le x_{ij} \le \text{compatible}_{ij} && \forall i, j \\
& t \ge 0
\end{aligned}
$$

## ポイント

- **エピグラフ（epigraph）による線形化**: 非線形な $\max_j L_j$ の最小化は、上界変数 $t$ を置いて全サーバーについて $L_j \le t$ を課し、目的関数で $t$ を最小化することで線形計画に変換できます。最小化の圧力により、最適解では $t = \max_j L_j$ にぴったり一致します。
- **変数上界による対応可否の表現**: 変数の上界に `compatible[i][j]`（`0` または `1`）をそのまま渡すことで、追加制約なしに非対応ペアを $x_{ij} = 0$ に固定できます。
- 用語の確認: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(assignments.map((row) => expr`${sum(row)} == 1`));
m.constraint(
  Array.from({ length: nServers }, (_, j) => {
    const serverLoad = sum(
      input.weights.map((w, i) => expr`${w} * ${assignments[i][j]}`)
    );
    return expr`${serverLoad} <= ${peak}`;
  })
);
m.objective(minimize(peak));
```

**PuLP (Python)**

```python
for i in range(n_jobs):
    prob += pulp.lpSum(assignments[i]) == 1
for j in range(n_servers):
    prob += pulp.lpSum(weights[i] * assignments[i][j] for i in range(n_jobs)) <= peak
prob += peak
prob.solve(pulp.HiGHS(msg=False))
```
