## アプローチ

各ジョブに開始時刻 `starts[i]` と運転モード `modes[i]` の 2 つの有界整数変数だけを用意し、モード別の段取り・後処理時間を `at(...)`、機械別の非重複を `disjoint(...)`、工場全体の電力を `cumulative(..., powerCap)`、モード互換性を `allowed(...)` で表現してメイクスパンを最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & C_{\max} = \max_{i} \big(s_i + d_i + \text{post}_{i, m_i}\big) \\
\text{s.t.} \quad & s_i \ge \text{setup}_{i, m_i} && \forall i \\
& s_u + d_u + \text{post}_{u, m_u} \le s_v && \forall (u, v) \in E_{\text{prec}} \\
& \text{Disjunctive}\big(\{(s_i, d_i) \mid \text{mach}_i = k\}\big) && \forall k \\
& \sum_{i:\, s_i \le t < s_i + d_i} p_i \le P_{\text{cap}} && \forall t \\
& (m_u, m_v) \in T_r && \forall r = (u, v, T_r) \in \mathcal{R}_{\text{mode}}
\end{aligned}
$$

## ポイント

- **CP と MIP の表現力・スケーラビリティ比較**: この問題を MIP で書くには時刻展開変数 $x_{i,t}$・モード選択バイナリ $z_{i,m}$・互換タプル用補助変数・時刻ごとの容量式がすべて必要になります。一方 WaSHI + Pumpkin の CP モデルは $O(n)$ 個の整数変数のまま、`disjoint`・`cumulative`・`allowed`・`at` の各グローバルプロパゲータを協調動作させられます。
- **待機時間と前段取りの相乗効果**: 機械待ちや電力待ちで開始が後ろにずれるジョブでは、待機中に長い機外前段取り（`setup = 2, 3`）を済ませることで後処理（`post = 0`）を短縮し、全体のメイクスパンを縮められます。
- 関連リファレンス: [ガイド・用語集 — モデルの基本構成要素](?view=guide&lang=ja#building-blocks) / [代表的な問題クラス](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.jobs.map((j, i) => expr`${starts[i]} >= at(${j.setupTimes}, ${modes[i]})`)
);
m.constraint(
  input.precedences.map(
    ([u, v]) =>
      expr`${starts[u]} + ${input.jobs[u].duration} + at(${input.jobs[u].postTimes}, ${modes[u]}) <= ${starts[v]}`
  )
);
m.constraint(
  Array.from({ length: numMachines }, (_, mach) =>
    disjoint(
      input.jobs
        .map((j, i) => ({ start: starts[i], duration: j.duration, machine: j.machine }))
        .filter((t) => t.machine === mach)
        .map(({ start, duration }) => ({ start, duration }))
    )
  )
);
m.constraint(
  cumulative(
    input.jobs.map((j, i) => ({ start: starts[i], duration: j.duration, demand: j.power })),
    input.powerCap
  )
);
m.constraint(
  input.modeRules.map((r) => allowed([modes[r.jobs[0]], modes[r.jobs[1]]], r.allowedPairs))
);
```
