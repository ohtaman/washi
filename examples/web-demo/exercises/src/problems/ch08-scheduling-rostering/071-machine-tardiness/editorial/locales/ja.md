## アプローチ

各ジョブに連続値の開始時刻変数 $S_j \ge r_j$ と非負の納期遅れ変数 $T_j \ge 0$ を用意し、$T_j \ge S_j + p_j - d_j$ で納期遅れを線形化したうえで、ジョブ対 $(i, j)$ ごとの前後関係を表す 0-1 変数 $y_{ij}$ と選言 Big-M 制約で非重複を保証します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{n-1} w_j T_j \\
\text{s.t.} \quad & S_j \ge r_j, \quad T_j \ge S_j + p_j - d_j, \quad T_j \ge 0 && \forall j \\
& S_i + p_i \le S_j + M(1 - y_{ij}) && \forall i < j \\
& S_j + p_j \le S_i + M y_{ij} && \forall i < j \\
& y_{ij} \in \{0, 1\} && \forall i < j
\end{aligned}
$$

## ポイント

- **時間離散化不要の選言定式化**: $y_{ij}=1$ なら $i \to j$、$y_{ij}=0$ なら $j \to i$ の順で処理されます。時刻スロットに分割しないため、小数の到着時刻や処理時間にもそのまま対応できます。
- **妥当でタイトな Big-M**: 無駄な空き時間を詰めた最適スケジュールは必ず $H = \max_k r_k + \sum_k p_k$ 以内に完了するため、$S_j \le H - p_j$ とすれば $M = H$ が厳密に妥当な最小限の上界になります。
- **意図的な手待ち（Inserted Idle Time）**: 到着時刻がある問題では、機械が空いていても到着直前の高重みジョブを待った方が総遅れが小さくなるため、単純なノンディレイ貪欲則は最適解を逃します。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [問題の分類](?view=guide&lang=ja#paradigms)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(
  tardiness.map(
    (T, j) => expr`${T} >= ${starts[j]} + ${input.processingTimes[j]} - ${input.dueDates[j]}`
  )
);
for (let i = 0; i < n; i++) {
  for (let j = i + 1; j < n; j++) {
    const y = m.binary(`y_${i}_${j}`);
    m.constraint([
      expr`${starts[i]} + ${input.processingTimes[i]} <= ${starts[j]} + ${M} * (1 - ${y})`,
      expr`${starts[j]} + ${input.processingTimes[j]} <= ${starts[i]} + ${M} * ${y}`,
    ]);
  }
}
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
