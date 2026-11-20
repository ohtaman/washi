## アプローチ

全社共有制約 `shared_cap`（`0 <= sharedCap`）、部門ごとの凸結合制約 `conv_${k}`（`0 == 1`）、およびゼロ生産初期列 `init_${k}` を持つ最大化 RMP（`master`）を構築します。`finalizeAsMIP: false` で `solveColumnGeneration` を呼び出し、`pricing` 内で各部門の LP ブロックを独立に解いて改善端点を追加したのち、得られた重み $\lambda_{kp}$ の凸結合として `allocations[k][j]` を復元します。

## 数理モデル

$$
\begin{aligned}
\text{(RMP)} \quad \max \quad & \sum_{k=0}^{K-1} \sum_{p \in \mathcal{P}_k} \left(\sum_j c_{kj} x_{kpj}\right) \lambda_{kp} \\
\text{s.t.} \quad & \sum_{k=0}^{K-1} \sum_{p \in \mathcal{P}_k} \left(\sum_j s_{kj} x_{kpj}\right) \lambda_{kp} \le S && (\text{双対変数 } \pi) \\
& \sum_{p \in \mathcal{P}_k} \lambda_{kp} = 1 && \forall k \quad (\text{双対変数 } \mu_k) \\
& \lambda_{kp} \ge 0 && \forall k, p
\end{aligned}
$$

$$
\begin{aligned}
\text{(Block } k\text{)} \quad \max \quad & \sum_j (c_{kj} - \pi s_{kj}) x_{kj} \\
\text{s.t.} \quad & \sum_j \ell_{kj} x_{kj} \le L_k, \quad 0 \le x_{kj} \le u_{kj}
\end{aligned}
$$

## ポイント

- **最大化での被約費用判定**: 最大化 RMP に対し `solveColumnGeneration` は `rc = cost - dualContrib` を計算し `rc > reducedCostTolerance` の列を採用します。ブロック子問題が $\sum_j (c_{kj} - \pi s_{kj}) x_{kj}$ を最大化するため、被約利益は `sub.objectiveValue - getDual("conv_" + k)` と厳密に一致します。
- **原点初期列による実行可能性保証**: 消費係数・容量が非負であるため、ゼロ生産ベクトル $x = 0$ は各ブロックで常に実行可能となり、1 反復目から凸結合制約を満たす基底が得られます。
- **連続 LP の端点再構成**: 生産量は連続値となるため `finalizeAsMIP: false` を指定し、採用列の凸結合 $\sum_p \lambda_{kp} x_{kpj}$ から元のコンパクト LP の大域最適解を再構成します。
- 用語の確認: [ガイド・用語集 — 代表的な問題クラス](?view=guide&lang=ja#paradigms) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
const result = await solveColumnGeneration<DwColumnMeta>({
  master,
  finalizeAsMIP: false,
  pricing: async ({ getDual }) => {
    const piShared = getDual("shared_cap");
    const proposals: Array<ColumnProposal<DwColumnMeta>> = [];
    for (let k = 0; k < K; k++) {
      const muK = getDual(`conv_${k}`);
      const sub = new Model(`BlockPricing_${k}`);
      const x = input.productCaps[k].map((cap, j) => sub.continuous(`x_${k}_${j}`, { lb: 0, ub: cap }));
      sub.objective(maximize(expr`dot(${reducedUnits}, ${x})`));
      sub.constraint(expr`dot(${input.localUsages[k]}, ${x}) <= ${input.localCaps[k]}`);
      if ((await sub.solve()) !== "Optimal") continue;
      const rc = (sub.objectiveValue ?? 0) - muK;
      if (rc > 1e-6) proposals.push(/* { cost, coefficients: { shared_cap, conv_k: 1 }, reducedCost: rc } */);
    }
    return proposals.length > 0 ? proposals : null;
  },
});
```
