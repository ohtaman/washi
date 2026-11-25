## アプローチ

最大完了時刻の安全な有限上界として `horizon = sum(durations)`（$H = \sum_{i=0}^{n-1} d_i$）と置きます。各作業の開始時刻を `[0, horizon - durations[i]]` の有界整数 `starts[i]` で表し、先行制約と単一の累積資源制約 `cumulative(tasks, input.capacity)` を追加して、最大完了時刻 `max(starts[i] + durations[i])` を最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & C_{\max} = \max_{i} (s_i + d_i) \\
\text{s.t.} \quad & s_u + d_u \le s_v && \forall (u, v) \in E_{\text{prec}} \\
& \sum_{i:\, s_i \le t < s_i + d_i} q_i \le C && \forall t \in \{0, \dots, H - 1\} \\
& 0 \le s_i \le H - d_i, \quad s_i \in \mathbb{Z} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## ポイント

- **ホライズンに依存しない `cumulative()` と時刻展開 MIP の違い**: 時刻離散化 MIP は $O(n \cdot H)$ 個の 0-1 変数と $H$ 本の容量制約式を生成するため時間粒度が細かくなると破綻しますが、CP の `cumulative()` はたった $n$ 個の整数変数のまま Pumpkin のタイムテーブル伝播で解きます。
- **`disjoint` との関係**: すべての需要が 1 で容量も 1 の場合が `disjoint` に相当し、単一機械では専用のエッジファインディングが働きます。
- 関連リファレンス: [ガイド・用語集 — モデルの基本構成要素](?view=guide&lang=ja#building-blocks) / [代表的な問題クラス](?view=guide&lang=ja#paradigms)

## 実装の勘所

各作業の `{ start, duration, demand }` をまとめて `cumulative(..., input.capacity)` 制約として登録し、全作業の最大終了時刻を最小化します。

**WaSHI (TypeScript)**

```ts
m.constraint(
  cumulative(
    starts.map((s, i) => ({
      start: s,
      duration: input.durations[i],
      demand: input.demands[i],
    })),
    input.capacity
  ),
  "resource_cap"
);
m.objective(minimize(max(starts.map((s, i) => expr`${s} + ${input.durations[i]}`))));
```
