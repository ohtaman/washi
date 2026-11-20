## アプローチ

各日の需要制約 `0 >= demands[d]` と単日勤務の初期列を `master.column(...)` で登録した集合被覆 RMP（`master`）を構築します。`solveColumnGeneration({ master, finalizeAsMIP: true, pricing })` を呼び出し、`pricing` 内で `1 <= sum(a) <= maxWorkDays` と連続勤務スライディングウィンドウ制約を持つ 0-1 MIP 子問題を解いて被約費用が負の勤務パターンを追加したうえで MIP として確定します。

## 数理モデル

$$
\begin{aligned}
\text{(RMP)} \quad \min \quad & \sum_{p \in \mathcal{P}} \left(F + \sum_{d=0}^{D-1} c_d a_{dp}\right) \lambda_p \\
\text{s.t.} \quad & \sum_{p \in \mathcal{P}} a_{dp} \lambda_p \ge r_d && \forall d \in \{0, \dots, D-1\} \quad (\text{双対変数 } \pi_d) \\
& \lambda_p \in \mathbb{Z}_{\ge 0} && \forall p \in \mathcal{P}
\end{aligned}
$$

$$
\begin{aligned}
\text{(Pricing)} \quad \max \quad & \sum_{d=0}^{D-1} (\pi_d - c_d) a_d \\
\text{s.t.} \quad & 1 \le \sum_{d=0}^{D-1} a_d \le M_{\text{work}} \\
& \sum_{d=t}^{t + M_{\text{consec}}} a_d \le M_{\text{consec}} && \forall t \in \{0, \dots, D - M_{\text{consec}} - 1\} \\
& a_d \in \{0, 1\} && \forall d \in \{0, \dots, D-1\}
\end{aligned}
$$

## ポイント

- **被約費用の分離**: 変動賃金 `shiftCosts[d]` を子問題目的関数へ移項すると、新パターンの被約費用は $\bar{c}(a) = F - \sum_d (\pi_d - c_d) a_d$ となります。子問題最適値が `baseCost` を上回るとき $\bar{c} < -10^{-5}$ となり主問題が改善されます。
- **連勤上限の線形化**: 長さ `maxConsecutive + 1` のすべての連続区間について和が `maxConsecutive` 以下となるよう制約すると、許容連勤数を超える勤務列を厳密に排除できます。
- **単日初期列**: 需要が正の各日に 1 日だけ出勤する列を入れておくことで、規則の強弱に関わらず主問題の初期実行可能性を保証できます。
- 用語の確認: [ガイド・用語集 — 代表的な問題クラス](?view=guide&lang=ja#paradigms) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
const result = await solveColumnGeneration<number[]>({
  master,
  finalizeAsMIP: true,
  pricing: async ({ getDual }) => {
    const sub = new Model("ShiftPricing");
    const a = sub.binary(D, { prefix: "a" });
    let netGain = expr`0`;
    for (let d = 0; d < D; d++) {
      netGain = netGain.add(a[d].mul(getDual(`demand_${d}`) - input.shiftCosts[d]));
    }
    sub.objective(maximize(netGain));
    sub.constraint(expr`sum(${a}) >= 1`, "nonempty");
    sub.constraint(expr`sum(${a}) <= ${input.maxWorkDays}`, "max_work");
    for (let t = 0; t <= D - (input.maxConsecutive + 1); t++) {
      sub.constraint(
        expr`sum(${a.slice(t, t + input.maxConsecutive + 1)}) <= ${input.maxConsecutive}`
      );
    }
    if ((await sub.solve()) !== "Optimal") return null;
    const reducedCost = input.baseCost - (sub.objectiveValue ?? 0);
    if (reducedCost >= -1e-5) return null;
    const pat = a.map((v) => Math.round(v.value ?? 0));
    return { type: "Integer", cost: patCost(pat), coefficients: toCoeffs(pat), reducedCost, meta: pat };
  },
});
```
