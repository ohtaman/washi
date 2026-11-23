## アプローチ

各工場 $i$ について生産量の上界をインスタンス固有のタイトな値 $M_i = \min(\text{capacities}[i], \text{demand})$ で抑え、`capacities[i] > demand` の工場が LP 緩和で極小の小数稼働 $y_i$ になるのを防ぎます。先に連続緩和（`await m.relax()`）を解いて `lpBound` を記録し、続けて `await m.solve()` で整数最適解を求めます。

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

- **粗い Big-M が緩和を弱める理由**: LP 緩和最適解では $y_i = q_i / M_i$ が成り立つため、変動コストの実効単価は $c_i + F_i / M_i$ となります。需要 $D = 60$ に対して $M = 10^6$ や生の能力 $C_i = 500$ を使うと $F_i / M_i$ が過小評価され、LP 下界が大きく緩んで分枝限定法の探索木が肥大化します。
- **インスタンス由来のタイト化**: 総需要が $D$ である以上、どんな実行可能解でも $q_i > D$ にはなりません。$M_i = \min(C_i, D)$ に絞ることで実行可能領域を変えずに LP 緩和だけを強められます。
- **数値スケーリングの安定性**: 過大な任意定数を避けることで、基底行列の条件数悪化や微小許容誤差による誤稼働（trickle flow）も抑えられます。
- 用語の確認: [ガイド・用語集 — 代表的な問題クラス](?view=guide&lang=ja#paradigms) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

各工場の連結制約は `quantities.map(...)` の中で `Math.min(input.capacities[i], input.demand)` を上界として一括生成し、同じモデル `m` に対して `await m.relax()` で LP 緩和下界を得たあと `await m.solve()` で整数解を求めます。

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
