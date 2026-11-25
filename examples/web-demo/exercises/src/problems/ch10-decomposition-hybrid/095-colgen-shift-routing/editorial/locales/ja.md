## アプローチ

各シフトパターンへの配置人数 $\lambda_p$ を選んで日別の最低人数 $r_d$ を満たす集合被覆の制約付き主問題（RMP）LP と、$D$ 日間の二値変数に対して総勤務日数制約（$1 \le \sum_d a_d \le M_{\text{work}}$）とスライディングウィンドウによる連勤上限制約を課して被約費用が負の勤務パターンを探す価格付け子問題に分解します。WaSHI では日別の名前付き需要制約と単日勤務の初期列を `master.column(...)` で `master` に登録し、`solveColumnGeneration({ master, finalizeAsMIP: true, pricing })` を呼び出して改善列を生成したのち整数解として確定します。

## 数理モデル

$$
\begin{aligned}
\text{(RMP LP)} \quad \min \quad & \sum_{p \in \mathcal{P}} \left(F + \sum_{d=0}^{D-1} c_d a_{dp}\right) \lambda_p \\
\text{s.t.} \quad & \sum_{p \in \mathcal{P}} a_{dp} \lambda_p \ge r_d && \forall d \in \{0, \dots, D-1\} \quad (\text{双対変数 } \pi_d) \\
& \lambda_p \ge 0 && \forall p \in \mathcal{P}
\end{aligned}
$$

列生成の収束後、最終 MIP の求解時に整数条件 $\lambda_p \in \mathbb{Z}_{\ge 0}$ を課します（`finalizeAsMIP: true`）。

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
- **スライディングウィンドウによる連勤上限**: 長さ `maxConsecutive + 1` のすべての連続区間について和が `maxConsecutive` 以下となるよう制約すると、許容連勤数を超える勤務列を厳密に排除できます。
- **単日初期列**: 需要が正の各日に 1 日だけ出勤する列を入れておくことで、規則の強弱に関わらず主問題の初期実行可能性を保証できます。
- 用語の確認: [ガイド・用語集 — 代表的な問題クラス](?view=guide&lang=ja#paradigms) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

価格付け子問題では `input.shiftCosts.map(...)` で各日の純利得係数を計算して `dot` で目的関数を組み立て、連続勤務の上限制約は `Array.from` と `a.slice(...)` でスライディングウィンドウ制約として一括登録します。

**WaSHI (TypeScript)**

```ts
const result = await solveColumnGeneration<number[]>({
  master,
  finalizeAsMIP: true,
  pricing: async ({ getDual }) => {
    const sub = new Model("ShiftPricing");
    const a = sub.binary(D, { prefix: "a" });
    const netGains = input.shiftCosts.map((c, d) => getDual(`demand_${d}`) - c);
    sub.objective(maximize(expr`dot(${netGains}, ${a})`));
    sub.constraint(expr`sum(${a}) >= 1`, "nonempty");
    sub.constraint(expr`sum(${a}) <= ${input.maxWorkDays}`, "max_work");
    const windowSize = input.maxConsecutive + 1;
    if (D >= windowSize) {
      sub.constraint(
        Array.from({ length: D - windowSize + 1 }, (_, t) =>
          expr`sum(${a.slice(t, t + windowSize)}) <= ${input.maxConsecutive}`
        )
      );
    }
    if ((await sub.solve()) !== "Optimal") return null;
    const reducedCost = input.baseCost - (sub.objectiveValue ?? 0);
    if (reducedCost >= -1e-5) return null;
    const pat = a.map((v) => Math.round(v.value ?? 0));
    const cost =
      input.baseCost + pat.reduce((acc, v, d) => acc + v * input.shiftCosts[d], 0);
    const coefficients = Object.fromEntries(
      pat.flatMap((v, d) => (v > 0 ? [[`demand_${d}`, 1]] : []))
    );
    return { type: "Integer", cost, coefficients, reducedCost, meta: pat };
  },
});
```
