## アプローチ

各工場 $i$ に稼働を表す二値変数 $y_i \in \{0, 1\}$ と生産量を表す連続変数 $q_i \ge 0$ を用意し、総需要制約 $\sum_i q_i \ge D$ とタイトな連結制約 $q_i \le \min(C_i, D)\,y_i$ のもとで固定費と変動費の合計を最小化します。上界を $\min(C_i, D)$ に抑えることで、$C_i > D$ の過大能力工場が緩和解で極小の小数稼働になるのを防ぎます。先に連続 LP 緩和を解いて `lpBound` を求め、続けて MIP を解いて整数最適計画を得ます。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{n-1} \left( F_i y_i + c_i q_i \right) \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} q_i \ge D \\
& 0 \le q_i \le \min(C_i, D) \cdot y_i && \forall i \in \{0, \dots, n-1\} \\
& y_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## ポイント

- **粗い Big-M が緩和を弱める理由**: LP 緩和最適解では $y_i = q_i / M_i$ が成り立つため、変動コストの実効単価は $c_i + F_i / M_i$ となります。$M = 10^6$ や生の工場能力（例えば入力例の $D = 60$ に対する $C_0 = 500$）をそのまま使うと $F_i / M_i$ が過小評価され、LP 下界が大きく緩んで分枝限定法の探索木が肥大化します。
- **需要上限によるタイト化**: 生産単価が $c_i \ge 0$ であるため、需要制約が不等式 $\sum_i q_i \ge D$ であっても $q_i > D$ とする意味はなく、$M_i = \min(C_i, D)$ に絞ってもすべての最適整数解が保たれます（変数やカットを増やさずに LP 緩和だけを強められます）。
- **数値スケーリングの安定性**: 過大な任意定数を避けることで、基底行列の条件数悪化や微小許容誤差による誤稼働（trickle flow）も抑えられます。
- 用語の確認: [ガイド・用語集 — 代表的な問題クラス](?view=guide&lang=ja#paradigms) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

各工場の連結制約は `quantities.map(...)` の中で `Math.min(input.capacities[i], input.demand)` を上界として一括生成し、同じモデル `m` に対して `await m.relax()` で LP 緩和下界を得たあと `await m.solve()` で整数解を求めます。PuLP では `cat` を `pulp.LpContinuous` と `pulp.LpBinary` で切り替えることで連続緩和と MIP を構築します。

**WaSHI (TypeScript)**

```ts
m.constraint(
  quantities.map((qty, i) => {
    const tightM = Math.min(input.capacities[i], input.demand);
    return expr`${qty} <= ${tightM} * ${open[i]}`;
  })
);
m.constraint(expr`sum(${quantities}) >= ${input.demand}`, "demand");
m.objective(minimize(expr`dot(${input.fixedCosts}, ${open}) + dot(${input.unitCosts}, ${quantities})`));

await m.relax();
const lpBound = m.objectiveValue!;
await m.solve();
```

**PuLP (Python)**

```python
cat = pulp.LpContinuous if relax else pulp.LpBinary
open_vars = [pulp.LpVariable(f"open_{i}", 0, 1, cat=cat) for i in range(n)]
for i in range(n):
    tight_m = min(capacities[i], demand)
    prob += quantities[i] <= tight_m * open_vars[i]
```
