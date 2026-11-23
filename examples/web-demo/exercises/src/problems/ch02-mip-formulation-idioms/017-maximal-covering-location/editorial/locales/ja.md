## アプローチ

候補地の開設を表す 0-1 変数 `open[j]` と各地区の被覆を表す 0-1 変数 `covered[i]` を置き、開設数上限 `maxFacilities` と距離 `coverageRadius` 以内の施設和との連結不等式を課して、被覆需要を最大化します。

## 数理モデル

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} d_i z_i \\
\text{s.t.} \quad & \sum_{j=0}^{m-1} y_j \le p \\
& z_i \le \sum_{j : \text{dist}_{i,j} \le R} y_j && \forall i \in \{0, \dots, n-1\} \\
& y_j, z_i \in \{0, 1\} && \forall j, i
\end{aligned}
$$

## ポイント

- **`z_i <= sum(...)` だけで OR 条件を表現できる理由**: `z_i` が 0-1 変数で目的係数が非負（`demands[i] >= 0`）なため、周辺施設が開いていれば最大化により自動で `z_i = 1` が選ばれ、開いている施設が 0 個（到達不能な地区を含む）なら `z_i <= 0` により `z_i = 0` に抑えられます。
- **集合被覆との対比**: 集合被覆が「全要素のカバーを必須にして費用最小化」するのに対し、MCLP は「施設数 $p$ を固定してカバー需要の最大化」を行います。
- 用語の確認: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

開設拠点数の上限制約に加え、各地区 `i` の被覆変数 `covered[i]` が到達可能な候補地の開設変数 `open[j]` の和以下になる連結制約を追加し、被覆需要を最大化します。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`${sum(open)} <= ${input.maxFacilities}`, "max_facilities");
m.constraint(
  covered.map((cov, i) =>
    expr`${cov} <= ${sum(open.filter((_, j) => input.distances[i][j] <= input.coverageRadius))}`
  )
);
m.objective(maximize(expr`dot(${input.demands}, ${covered})`));
```

**PuLP (Python)**

```python
prob += pulp.lpSum(open_vars) <= max_facilities
for i in range(n):
    prob += covered[i] <= pulp.lpSum(
        open_vars[j] for j in range(m_sites) if distances[i][j] <= radius
    )
prob += pulp.lpDot(demands, covered)
```
