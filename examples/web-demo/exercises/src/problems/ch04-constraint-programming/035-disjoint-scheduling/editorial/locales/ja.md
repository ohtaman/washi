## アプローチ

各工程に有界整数変数 `starts[i]`（`[releaseTimes[i], horizon - durations[i]]`）を用意し、先行制約と装置ごとの `disjoint(tasks)` 制約を追加して、最大完了時刻 `max(starts[i] + durations[i])` を最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & C_{\max} = \max_{i} (s_i + d_i) \\
\text{s.t.} \quad & s_u + d_u \le s_v && \forall (u, v) \in E_{\text{prec}} \\
& \text{Disjunctive}\big(\{(s_i, d_i) \mid m_i = k\}\big) && \forall k \in \{0, \dots, M-1\} \\
& r_i \le s_i \le H - d_i, \quad s_i \in \mathbb{Z} && \forall i \in \{0, \dots, n-1\}
\end{aligned}
$$

## ポイント

- **Edge-finding 伝播と Big-M の対比**: MIP のように同一装置上の全ペアへ Big-M と 0-1 順序変数を張らなくても、`disjoint(tasks)` は Pumpkin の `disjunctive_strict`（Vilím エッジファインディング）プロパゲータで装置単位の占有区間を強力に伝播します。
- **安全な有限ホライズン**: `horizon = max(releaseTimes) + sum(durations)` と置くことで、過大な定数を避けつつ実行可能性を保証する有限上界を設定できます。
- 関連リファレンス: [ガイド・用語集 — モデルの基本構成要素](?view=guide&lang=ja#building-blocks) / [代表的な問題クラス](?view=guide&lang=ja#paradigms)

## 実装の勘所

各担当装置ごとに割り当てられた工程の `{ start, duration }` リストを抽出し、`disjoint(...)` 制約を装置数分まとめて登録したうえで、全工程の最大完了時刻を最小化します。

**WaSHI (TypeScript)**

```ts
const numMachines = Math.max(...input.machines) + 1;
m.constraint(
  Array.from({ length: numMachines }, (_, mach) =>
    disjoint(
      starts
        .map((s, i) => ({ start: s, duration: input.durations[i], mach: input.machines[i] }))
        .filter((t) => t.mach === mach)
        .map(({ start, duration }) => ({ start, duration }))
    )
  )
);
m.objective(minimize(max(starts.map((s, i) => expr`${s} + ${input.durations[i]}`))));
```
