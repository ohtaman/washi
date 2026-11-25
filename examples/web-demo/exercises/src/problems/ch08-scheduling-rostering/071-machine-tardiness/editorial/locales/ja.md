## アプローチ

各ジョブに連続値の開始時刻変数 $S_j \ge r_j$ と非負の納期遅れ変数 $T_j \ge 0$ を用意し、$T_j \ge S_j + p_j - d_j$ で納期遅れを線形化したうえで、ジョブ対 $(i, j)$ ごとの前後関係を表す 0-1 変数 $y_{ij}$ と選言 Big-M 制約で非重複を保証します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{n-1} w_j T_j \\
\text{s.t.} \quad & r_j \le S_j \le H - p_j, \quad T_j \ge S_j + p_j - d_j, \quad T_j \ge 0 && \forall j \\
& S_i + p_i \le S_j + M(1 - y_{ij}) && \forall i < j \\
& S_j + p_j \le S_i + M y_{ij} && \forall i < j \\
& y_{ij} \in \{0, 1\} && \forall i < j
\end{aligned}
$$

ここで $H = \max_k r_k + \sum_k p_k$、$M = H$ です。

## ポイント

- **時間離散化不要の選言定式化**: $y_{ij}=1$ なら $i \to j$、$y_{ij}=0$ なら $j \to i$ の順で処理されます。時刻スロットに分割しないため、小数の到着時刻や処理時間にもそのまま対応できます。
- **妥当でタイトな Big-M**: 無駄な空き時間を詰めた最適スケジュールは必ず $H = \max_k r_k + \sum_k p_k$ 以内に完了します。$r_j \ge 0$ かつ $S_j \le H - p_j$ の下で $M = H$ とすれば、妥当な一様上界となり、恣意的な巨大定数を使う場合より LP 緩和をずっとタイトに保てます。
- **意図的な手待ち（Inserted Idle Time）**: 到着時刻がある問題では、機械が空いていても到着直前の高重みジョブを待つ方が、すぐ開始するノンディレイ貪欲則より総遅れを抑えられる場合があります。たとえば入力例では、$t = 0$ から $t = 2$ まで待って重み $w_1 = 5$ のジョブ 1 を先に処理することで、重み付き納期遅れ和を大きく削減できます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

各ジョブの納期遅れ下界制約と、全ジョブ対に対する非重複の選言 Big-M 制約を構築します。WaSHI では `slice` と `forEach` で各ペアの 2 本の制約を配列として登録し、PuLP では二重ループと `pulp.lpDot` で記述します。

**WaSHI (TypeScript)**

```ts
m.constraint(
  tardiness.map(
    (T, j) => expr`${T} >= ${starts[j]} + ${input.processingTimes[j]} - ${input.dueDates[j]}`
  )
);
starts.forEach((sI, i) => {
  starts.slice(i + 1).forEach((sJ, offset) => {
    const j = i + 1 + offset;
    const y = m.binary(`y_${i}_${j}`);
    m.constraint([
      expr`${sI} + ${input.processingTimes[i]} <= ${sJ} + ${M} * (1 - ${y})`,
      expr`${sJ} + ${input.processingTimes[j]} <= ${sI} + ${M} * ${y}`,
    ]);
  });
});
m.objective(minimize(expr`dot(${input.weights}, ${tardiness})`));
```

**PuLP (Python)**

```python
for j in range(n):
    prob += tardiness[j] >= starts[j] + p[j] - d[j]
for i in range(n):
    for j in range(i + 1, n):
        y = pulp.LpVariable(f"y_{i}_{j}", cat=pulp.LpBinary)
        prob += starts[i] + p[i] <= starts[j] + big_m * (1 - y)
        prob += starts[j] + p[j] <= starts[i] + big_m * y
prob += pulp.lpDot(w, tardiness)
prob.solve(pulp.HiGHS(msg=False))
```
