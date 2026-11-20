## アプローチ

制約付き主問題（`master`）に各品目の需要制約 `0 >= demands[i]` と単一品目パターンの初期列を `master.column(...)` で登録します。`solveColumnGeneration({ master, finalizeAsMIP: true, pricing })` を呼び出し、`pricing` 内で `getDual` から双対価格を取得してナップサック子問題を解き、被約費用 $1 - \sum_i \pi_i a_i < 0$ のパターンを逐次追加したのち MIP で確定します。

## 数理モデル

$$
\begin{aligned}
\text{(RMP)} \quad \min \quad & \sum_{p \in \mathcal{P}} \lambda_p \\
\text{s.t.} \quad & \sum_{p \in \mathcal{P}} a_{ip} \lambda_p \ge d_i && \forall i \in \{0, \dots, m-1\} \quad (\text{双対変数 } \pi_i) \\
& \lambda_p \in \mathbb{Z}_{\ge 0} && \forall p \in \mathcal{P}
\end{aligned}
$$

$$
\begin{aligned}
\text{(Pricing)} \quad \max \quad & \sum_{i=0}^{m-1} \pi_i a_i \\
\text{s.t.} \quad & \sum_{i=0}^{m-1} w_i a_i \le W, \quad a_i \in \mathbb{Z}_{\ge 0}
\end{aligned}
$$

## ポイント

- **被約費用による採用判定**: 原反 1 本のコストは `1` なので、新パターンの被約費用は $\bar{c} = 1 - \sum_i \pi_i a_i$ となります。ナップサック最適値が `1` を超える（$\bar{c} < -10^{-5}$）限り、LP 緩和を改善する新列が見つかります。
- **初期実行可能基底の確保**: 各品目を単独で詰める初期列（`floor(W / w_i)` 本）を入れておくことで、反復 1 回目から主問題が必ず実行可能となり有効な双対価格が得られます。
- **Price-and-Branch（`finalizeAsMIP: true`）**: LP 緩和で改善列が尽きた後、`solveColumnGeneration` は生成済みの全列に整数条件を課して最終 MIP を自動求解します。
- 用語の確認: [ガイド・用語集 — 代表的な問題クラス](?view=guide&lang=ja#paradigms) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
const result = await solveColumnGeneration<number[]>({
  master,
  finalizeAsMIP: true,
  pricing: async ({ getDual }) => {
    const sub = new Model("KnapsackPricing");
    const a = input.widths.map((w, i) =>
      sub.integer(`a_${i}`, { lb: 0, ub: Math.floor(input.rollWidth / w) })
    );
    const duals = input.widths.map((_, i) => getDual(`demand_${i}`));
    sub.objective(maximize(expr`dot(${duals}, ${a})`));
    sub.constraint(expr`dot(${input.widths}, ${a}) <= ${input.rollWidth}`);
    await sub.solve();
    const rc = 1 - (sub.objectiveValue ?? 0);
    if (rc >= -1e-5) return null;
    const pat = a.map((v) => Math.round(v.value ?? 0));
    return { type: "Integer", cost: 1, coefficients: toCoeffMap(pat), reducedCost: rc, meta: pat };
  },
});
```
