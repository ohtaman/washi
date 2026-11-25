## アプローチ

$n$ 個の後継拠点変数 `next[i]` と訪問順位変数 `rank[i]`（ともに `[0, n - 1]`）を用い、`distinct(next)` と `next[i] != i` に加えて「デポ 0 に戻る辺以外では訪問順位が 1 増える」制約を `implies` と `at(rank, next[i])` で課すことで部分巡回路を排除し、`at(distances[i], next[i])` の総和を最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} d_{i,\, \text{next}_i} \\
\text{s.t.} \quad & \text{AllDifferent}(\text{next}), \quad \text{AllDifferent}(\text{rank}) \\
& \text{next}_i \ne i && \forall i \in \{0, \dots, n-1\} \\
& \text{rank}_0 = 0, \quad \text{rank}_{\text{next}_0} = 1 \\
& \text{next}_i \ne 0 \implies \text{rank}_{\text{next}_i} = \text{rank}_i + 1 && \forall i \in \{1, \dots, n-1\} \\
& \text{next}_i,\, \text{rank}_i \in \{0, \dots, n-1\} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## ポイント

- **なぜ `distinct(next)` と `next[i] != i` だけでは不十分か**: 自己ループのない全単射（完全順列）は `(0 <-> 1)` と `(2 <-> 3)` のような複数の小さな閉路（サブツアー）を許します。`next[i] != 0` のときに `rank[next[i]] == rank[i] + 1` を強制すると、0 を通らない閉路では訪問順位が単調増加して矛盾するため、部分巡回路が完全に禁止されます。
- **`at(rank, next[i])` と `implies()` の連携**: 変数配列 `rank` に変数 `next[i]` で添字参照する Element 制約により、MIP の $O(n^2)$ 辺変数や MTZ Big-M なしで $O(n)$ 変数のみで巡回表現を完結できます。
- 関連リファレンス: [ガイド・用語集 — モデルの基本構成要素](?view=guide&lang=ja#building-blocks) / [代表的な問題クラス](?view=guide&lang=ja#paradigms)

## 実装の勘所

後継変数 `next` と訪問順位変数 `rank` の相異制約・自己ループ禁止に加え、`implies` と `at(rank, nx)` を用いてデポ以外の辺で訪問順位が 1 ずつ増える制約を登録します。

**WaSHI (TypeScript)**

```ts
m.constraint(distinct(next), "distinct_next");
m.constraint(distinct(rank), "distinct_rank");
m.constraint(next.map((nx, i) => expr`${nx} != ${i}`));
m.constraint(expr`${rank[0]} == 0`, "rank_start");
m.constraint(expr`at(${rank}, ${next[0]}) == 1`, "rank_first_step");
m.constraint(
  next.slice(1).map((nx, idx) =>
    implies(expr`${nx} != 0`, expr`at(${rank}, ${nx}) == ${rank[idx + 1]} + 1`)
  )
);
m.objective(minimize(sum(input.distances.map((row, i) => at(row, next[i])))));
```
