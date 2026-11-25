## アプローチ

各タスクに有限整数の開始時刻変数 $S_i \in [0, H - d_i]$ を置き、DAG の先行関係 $S_u + d_u \le S_v$ を追加したうえで、再生可能資源ごとの容量制約を Pumpkin の `cumulative(tasks, capacity)` グローバル制約 1 本で記述し、`max(...)` で定義したメイクスパンを最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & C_{\max} = \max_{i} (S_i + d_i) \\
\text{s.t.} \quad & S_u + d_u \le S_v && \forall (u, v) \in E \\
& \text{cumulative}\!\left(\left\{(S_i, d_i, q_{r,i}) \mid q_{r,i} > 0\right\},\, C_r\right) && \forall r \\
& S_i \in \{0, \dots, H - d_i\} && \forall i
\end{aligned}
$$

## ポイント

- **時間軸長に依存しない CP `cumulative` と時間展開 MIP の対比**: 時間展開型の MIP（$x_{i,t} \in \{0,1\}$）は $O(n \cdot H)$ 個の 0-1 変数と各時刻の容量行を必要とし、期間 $H$ が大きくなるとモデルが急膨張します。CP の `cumulative` は $H$ に関わらず $n$ 個の整数変数だけでタイムテーブル伝播を行います。
- **資源競合によるクリティカルパス延長**: 入力例では資源制約なしの DAG クリティカルパスは $8$ ですが、資源容量 $C_0 = 3$ によりタスク 2 とタスク 1 を同時に実行できないため、最小メイクスパンは $12$ に延びます。
- **需要 0 のタスクを除外**: 複数資源を扱う際は `demand > 0` のタスクだけを渡すことで各資源のプロパゲータを簡潔に保てます。
- 用語の確認: [ガイド・用語集 — 問題の分類](?view=guide&lang=ja#paradigms) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

Pumpkin ソルバーで整数の開始時刻変数を宣言し、DAG の先行制約と資源ごとの `cumulative()` 制約を登録します。各資源では需要が正のタスクのみを抽出して渡すことでモデルを簡潔に保てます。

**WaSHI (TypeScript)**

```ts
const m = new Model("RcpspProjectCP", { solver: "pumpkin" });
const starts = input.durations.map((d, i) =>
  m.integer(`s_${i}`, { lb: 0, ub: horizon - d })
);
m.constraint(
  input.precedences.map(([u, v]) => expr`${starts[u]} + ${input.durations[u]} <= ${starts[v]}`)
);
input.capacities.forEach((cap, r) => {
  const tasks = input.durations
    .map((duration, i) => ({ start: starts[i], duration, demand: input.demands[r][i] }))
    .filter((task) => task.demand > 0);
  if (tasks.length > 0) m.constraint(cumulative(tasks, cap), `resource_${r}`);
});
m.objective(minimize(max(starts.map((s, i) => expr`${s} + ${input.durations[i]}`))));
```
