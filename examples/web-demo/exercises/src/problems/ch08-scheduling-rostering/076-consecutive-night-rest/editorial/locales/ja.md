## アプローチ

各日のシフト割当 $x_{i,d,s} \in \{0, 1\}$（$s \in \{0, 1, 2\}$）と日次稼働量 $w_{i,d} = \sum_s x_{i,d,s} \le 1$ を用いて、長さ $K+1$ のすべての連続区間における稼働日数和を $K$ 以下に抑えつつ、隣接日間の夜勤→日勤禁止 $x_{i,d,2} + x_{i,d+1,0} \le 1$ と日別シフト需要を課して総費用を最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{N-1} \sum_{d=0}^{D-1} \sum_{s=0}^{2} c_{i,s} x_{i,d,s} \\
\text{s.t.} \quad & w_{i,d} = \sum_{s=0}^{2} x_{i,d,s} \le 1 && \forall i, d \\
& \sum_{i=0}^{N-1} x_{i,d,s} \ge D_{d,s} && \forall d, s \\
& \sum_{\tau=t}^{t+K} w_{i,\tau} \le K && \forall i, \; t \in \{0, \dots, D - K - 1\} \\
& x_{i,d,2} + x_{i,d+1,0} \le 1 && \forall i, \; d \in \{0, \dots, D - 2\} \\
& x_{i,d,s} \in \{0, 1\} && \forall i, d, s
\end{aligned}
$$

## ポイント

- **スライディングウィンドウによる連勤制限**: 連続する $K+1$ 日間のどの窓でも稼働日数の和が $K$ 以下（$\sum_{\tau=t}^{t+K} w_{i,\tau} \le K$）であれば、連勤日数カウント用の補助変数を作らずに $K+1$ 日以上の連勤を完全に防げます。
- **2変数の和 $\le 1$ による禁止遷移の表現**: $x_{i,d,2} + x_{i,d+1,0} \le 1$ は夜勤 (`2`) → 翌日日勤 (`0`) の同時成立だけを禁じ、夜勤連投（`2 -> 2`）や夜勤→休み（`2 -> -1`）は許容する厳密でタイトな線形不等式です。
- **ローテーション余力への注意**: 窓制約は期間端の休日配置も強く制約するため、人件費の安いスタッフでも週の途中で休みを挟む必要が生じます。
- 用語の確認: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
x.forEach((staffDays) => {
  const work = staffDays.map((dayVars) => sum(dayVars));
  m.constraint(work.map((w) => expr`${w} <= 1`));
  for (let t = 0; t <= D - K - 1; t++) {
    m.constraint(expr`${sum(work.slice(t, t + K + 1))} <= ${K}`);
  }
  for (let d = 0; d < D - 1; d++) {
    m.constraint(expr`${staffDays[d][2]} + ${staffDays[d + 1][0]} <= 1`);
  }
});
```

**PuLP (Python)**

```python
for i in range(num_staff):
    for d in range(num_days):
        prob += pulp.lpSum(x[i][d]) <= 1
    for t in range(num_days - max_consec):
        prob += pulp.lpSum(x[i][tau][s] for tau in range(t, t + max_consec + 1) for s in range(3)) <= max_consec
    for d in range(num_days - 1):
        prob += x[i][d][2] + x[i][d + 1][0] <= 1
```
