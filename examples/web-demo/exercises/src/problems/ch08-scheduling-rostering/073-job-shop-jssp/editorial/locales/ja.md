## アプローチ

各工程に有限整数の開始時刻変数 $S_{j,o} \in \{0, \dots, H - d_{j,o}\}$ を定義し、ジョブ内の工程順序 $S_{j,o} + d_{j,o} \le S_{j,o+1}$ を課したうえで、同じ機械 $r \in \{0, \dots, M-1\}$ を共有する工程群を Pumpkin のグローバル制約 `disjoint(...)` 1 本でまとめ、`max(...)` で表したメイクスパンを最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & C_{\max} = \max_{j,o} (S_{j,o} + d_{j,o}) \\
\text{s.t.} \quad & S_{j,o} + d_{j,o} \le S_{j,o+1} && \forall j, \; o < K_j - 1 \\
& \text{disjoint}\!\left(\left\{(S_{j,o}, d_{j,o}) \mid m_{j,o} = r\right\}\right) && \forall r \in \{0, \dots, M-1\} \\
& S_{j,o} \in \{0, \dots, H - d_{j,o}\} && \forall j, o
\end{aligned}
$$

ここで $H = \sum_{j,o} d_{j,o}$ は計画期間の上界、$m_{j,o}$ はジョブ $j$ の工程 $o$ が使用する機械番号、$K_j$ はジョブ $j$ の工程数、$M$ は機械台数です。

## ポイント

- **CP `disjoint` と Big-M MIP の対比**: Big-M による MIP 定式化では、同じ機械上の全工程ペアに 0-1 順序変数 $y_{ab}$ と 2 本の弱い Big-M 不等式が必要になり、LP 緩和では両工程が半分ずつ重なった非実用的な下界になりがちです。一方 CP の `disjoint` は、機械ごとの 2 次オーダーの Big-M 制約なしに、エッジファインディングなどの専用伝播器で整数区間から直接枝刈りを行います。
- **コンパクトな上界設定**: `horizon = sum(durations)` に基づく上界 `ub: horizon - d` を与えることで、Lazy Clause Generation（LCG）の探索ドメインが引き締まります。
- **WaSHI 固有機能**: `disjoint` と `max` を Pumpkin バックエンドで直接解くため、本問は WaSHI (TypeScript) 専用（`{ solver: "pumpkin" }`）となっています。
- 用語の確認: [ガイド・用語集 — 問題の分類](?view=guide&lang=ja#paradigms) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

Pumpkin ソルバーを指定したモデルで整数開始時刻変数を宣言し、同一機械を使用する工程リストを `disjoint()` に渡して非重複制約を一括登録します。最後に全工程の完了時刻の `max()` を目的関数として最小化します。

**WaSHI (TypeScript)**

```ts
const m = new Model("JobShopCP", { solver: "pumpkin" });
const starts = input.durations.map((jobDurs, j) =>
  jobDurs.map((d, o) => m.integer(`s_${j}_${o}`, { lb: 0, ub: horizon - d }))
);
Array.from({ length: numMachines }, (_, mach) => mach).forEach((mach) => {
  const ops = input.machines.flatMap((jobMachs, j) =>
    jobMachs
      .map((opMach, o) =>
        opMach === mach ? { start: starts[j][o], duration: input.durations[j][o] } : null
      )
      .filter((item): item is NonNullable<typeof item> => item !== null)
  );
  if (ops.length >= 2) m.constraint(disjoint(ops), `machine_${mach}`);
});
const completions = starts.flatMap((jobStarts, j) =>
  jobStarts.map((s, o) => expr`${s} + ${input.durations[j][o]}`)
);
m.objective(minimize(max(completions)));
```
