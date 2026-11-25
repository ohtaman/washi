## アプローチ

各切断パターンの使用本数 $\lambda_p$ を選んで品目ごとの需要 $d_i$ を満たす制約付き主問題（RMP）の LP と、原反幅以内で双対価値 $\sum_i \pi_i a_i$ を最大化して被約費用 $1 - \sum_i \pi_i a_i < 0$ の新パターンを探す有界ナップサック価格付け子問題に分解します。WaSHI では各品目の名前付き需要制約と単一品目の初期列（`master.column(...)`）を `master` に登録し、`pricing` 内で `getDual` から双対価格を取得する形で `solveColumnGeneration({ master, finalizeAsMIP: true, pricing })` を呼び出し、LP 収束後に整数計画として確定します。

## 数理モデル

$$
\begin{aligned}
\text{(RMP LP)} \quad \min \quad & \sum_{p \in \mathcal{P}} \lambda_p \\
\text{s.t.} \quad & \sum_{p \in \mathcal{P}} a_{ip} \lambda_p \ge d_i && \forall i \in \{0, \dots, m-1\} \quad (\text{双対変数 } \pi_i) \\
& \lambda_p \ge 0 && \forall p \in \mathcal{P}
\end{aligned}
$$

列生成の収束後、最終 MIP の求解時に整数条件 $\lambda_p \in \mathbb{Z}_{\ge 0}$ を課します（`finalizeAsMIP: true`）。

$$
\begin{aligned}
\text{(Pricing)} \quad \max \quad & \sum_{i=0}^{m-1} \pi_i a_i \\
\text{s.t.} \quad & \sum_{i=0}^{m-1} w_i a_i \le W, \quad a_i \in \mathbb{Z}_{\ge 0}
\end{aligned}
$$

## ポイント

- **被約費用による採用判定**: 原反 1 本のコストは 1 なので、新パターンの被約費用は $\bar{c} = 1 - \sum_i \pi_i a_i$ となります。ナップサック最適値が 1 を超える（$\bar{c} < -10^{-5}$）限り、LP 緩和を改善する新列が見つかります。
- **初期実行可能基底の確保**: 各品目 $i$ を単独で詰める初期列（$\lfloor W / w_i \rfloor$ 本）を入れておくことで、反復 1 回目から主問題が必ず実行可能となり有効な双対価格が得られます。
- **Price-and-Branch（`finalizeAsMIP: true`）**: LP 緩和で改善列が尽きた後、`solveColumnGeneration` は生成済みの全列に整数条件を課して最終 MIP を自動求解します（完全な Branch-and-Price とは異なり、ルート LP で生成した列だけで MIP を解くため一般には主ヒューリスティクスとなります）。
- 用語の確認: [ガイド・用語集 — 代表的な問題クラス](?view=guide&lang=ja#paradigms) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

`solveColumnGeneration` の `pricing` コールバック内で `getDual` から各品目の双対価格を取得し、整数変数 `a` による有界ナップサック子問題を解いて被約費用が負の切断パターンを提案します。

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
    const coefficients = Object.fromEntries(
      pat.flatMap((c, i) => (c > 0 ? [[`demand_${i}`, c]] : []))
    );
    return { type: "Integer", cost: 1, coefficients, reducedCost: rc, meta: pat };
  },
});
```
