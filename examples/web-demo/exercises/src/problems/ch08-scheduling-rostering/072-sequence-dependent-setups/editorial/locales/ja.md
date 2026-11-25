## アプローチ

スケジュールの始点・終点を表すダミーノード $n$ を加え、$i \ne j \in \{0, \dots, n\}$ の遷移アーク $x_{ij} \in \{0, 1\}$ で 1 本のハミルトン閉路（実ジョブ列）を作ります。同時に、アークに沿って完了時刻 $C_j$ を Big-M で伝播させ、総納期遅れ $\sum_j T_j$ を最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{n-1} T_j \\
\text{s.t.} \quad & \sum_{j \ne i} x_{ij} = 1, \quad \sum_{j \ne i} x_{ji} = 1 && \forall i \in \{0, \dots, n\} \\
& C_j \ge C_i + s_{ij} + p_j - M(1 - x_{ij}) && \forall i \ne j \in \{0, \dots, n-1\} \\
& p_j \le C_j \le H, \quad T_j \ge C_j - d_j, \quad T_j \ge 0 && \forall j \in \{0, \dots, n-1\} \\
& x_{ij} \in \{0, 1\} && \forall i \ne j
\end{aligned}
$$

ここで $H = \sum_k p_k + (n - 1)\max_{a,b} s_{ab}$、$M = H + \max_{a,b} s_{ab}$ です。

## ポイント

- **完了時刻伝播が部分巡回（Subtour）を自動排除**: $p_j > 0$ かつ $s_{ij} \ge 0$ なので、ダミーノード $n$ を含まない閉路ができると不等式の和が $0 \ge \sum (s+p) > 0$ の矛盾になり、MTZ ポテンシャルと同様に部分巡回が禁止されます。
- **逆順ペアに対する安全な Big-M**: $H = \sum_k p_k + (n-1)\max_{a,b} s_{ab}$ とおくと、最後のジョブが $C_i = H$、最初のジョブが $C_j = p_j$ になり得るため、$C_i + s_{ij} + p_j - C_j \le H + s_{ij}$ が成立します。よって $M = H + \max_{a,b} s_{ab}$ を選べば最適解を切り落とすことがありません。
- **納期順ルールが破綻する理由**: 入力例では、最短納期順（EDD、$d_2 = 5 < d_0 = 6 < d_1 = 8$ より $2 \to 0 \to 1$）は段取り替え時間を無視するため、大きな段取り（$s_{20} = 3, s_{01} = 5$）が発生し、総納期遅れが 4 ではなく 11 まで悪化します。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

各ノードの出次数・入次数を 1 に保つ次数制約と、アーク選択変数に応じた完了時刻の Big-M 伝播制約を追加します。WaSHI では `forEach` と `filter` で自己ループを除いた変数集合をまとめて制約し、PuLP では内包表記で記述します。

**WaSHI (TypeScript)**

```ts
x.forEach((row, i) => {
  const outVars = row.filter((v): v is NonNullable<typeof v> => v !== null);
  const inVars = x.map((r) => r[i]).filter((v): v is NonNullable<typeof v> => v !== null);
  m.constraint([expr`${sum(outVars)} == 1`, expr`${sum(inVars)} == 1`]);
});
input.setupMatrix.forEach((row, i) => {
  row.forEach((setup, j) => {
    if (i === j) return;
    const step = setup + input.processingTimes[j];
    m.constraint(
      expr`${completions[j]} >= ${completions[i]} + ${step} - ${M} * (1 - ${x[i][j]!})`
    );
  });
});
```

**PuLP (Python)**

```python
for i in range(n + 1):
    prob += pulp.lpSum(x[(i, j)] for j in range(n + 1) if j != i) == 1
    prob += pulp.lpSum(x[(j, i)] for j in range(n + 1) if j != i) == 1
for i in range(n):
    for j in range(n):
        if i != j:
            prob += completions[j] >= completions[i] + s[i][j] + p[j] - big_m * (1 - x[(i, j)])
```
