## アプローチ

0-1 変数 $x_{i,d,s} \in \{0, 1\}$ に対して 1 日 1 シフト制約を置き、稼働する各 `(d, s)` に総人数・シニアリーダー（1 名以上）・スキル別必要人数の被覆制約を加えたうえで、NG ペア $(a, b)$ ごとに同一シフト禁止 $x_{a,d,s} + x_{b,d,s} \le 1$ を課して総コストを最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{i=0}^{N-1} \sum_{d=0}^{D-1} \sum_{s=0}^{S-1} c_{i,s} x_{i,d,s} \\
\text{s.t.} \quad & \sum_{s=0}^{S-1} x_{i,d,s} \le 1 && \forall i, d \\
& \sum_{i=0}^{N-1} x_{i,d,s} \ge D_{d,s}, \quad \sum_{i=0}^{N-1} L_i x_{i,d,s} \ge 1 && \forall (d, s) : D_{d,s} > 0 \\
& \sum_{i=0}^{N-1} A_{i,k} x_{i,d,s} \ge R_{s,k} && \forall (d, s) : D_{d,s} > 0, \; \forall k \\
& x_{a,d,s} + x_{b,d,s} \le 1 && \forall (a, b) \in \text{NG}, \; \forall d, s \\
& x_{i,d,s} \in \{0, 1\} && \forall i, d, s
\end{aligned}
$$

## ポイント

- **同一列ベクトルに対する多属性被覆**: 各 `(d, s)` の割当列 `col = [x[0][d][s], ..., x[N-1][d][s]]` に対し、総人数・シニア人数（$L_i$）・複数スキル（$A_{i,k}$）をすべて同じ列の内積として簡潔に記述できます。
- **多能工と NG ペアの相互作用**: 複数スキルを持つスタッフは 1 人で複数条件を同時に満たせますが、NG ペア制約があると最安のリーダーと組めないケースが生じます。
- **シフト単位の禁止判定**: $x_{a,d,s} + x_{b,d,s} \le 1$ は `(d, s)` ごとに書くため、同じ日でも別々の時間帯シフトであれば両者を配置できます。
- 用語の確認: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
for (let d = 0; d < D; d++) {
  for (let s = 0; s < S; s++) {
    if (input.demands[d][s] <= 0) continue;
    const col = x.map((staff) => staff[d][s]);
    m.constraint([
      expr`${sum(col)} >= ${input.demands[d][s]}`,
      expr`dot(${input.isSenior}, ${col}) >= 1`,
    ]);
    for (let k = 0; k < K; k++) {
      if (input.skillDemands[s][k] > 0) {
        const coeffs = input.staffSkills.map((sk) => sk[k]);
        m.constraint(expr`dot(${coeffs}, ${col}) >= ${input.skillDemands[s][k]}`);
      }
    }
  }
}
for (const [a, b] of input.ngPairs) {
  for (let d = 0; d < D; d++) {
    for (let s = 0; s < S; s++) {
      m.constraint(expr`${x[a][d][s]} + ${x[b][d][s]} <= 1`);
    }
  }
}
```

**PuLP (Python)**

```python
for d in range(num_days):
    for s in range(num_shifts):
        if demands[d][s] <= 0:
            continue
        col = [x[i][d][s] for i in range(num_staff)]
        prob += pulp.lpSum(col) >= demands[d][s]
        prob += pulp.lpDot(is_senior, col) >= 1
        for k in range(num_skills):
            if skill_demands[s][k] > 0:
                prob += pulp.lpSum(staff_skills[i][k] * x[i][d][s] for i in range(num_staff)) >= skill_demands[s][k]
for a, b in ng_pairs:
    for d in range(num_days):
        for s in range(num_shifts):
            prob += x[a][d][s] + x[b][d][s] <= 1
```
