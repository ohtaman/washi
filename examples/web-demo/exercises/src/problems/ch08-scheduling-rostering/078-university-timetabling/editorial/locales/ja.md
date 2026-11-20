## アプローチ

講義 $c$ を教室 $r$・時限 $t$ に割り当てる 3 次元の 0-1 変数 $x_{c,r,t} \in \{0, 1\}$ を用い、1 講義 1 枠・教室定員・同室排他制約に加えて、教員ごとおよび学生コホートごとのクリーク競合禁止制約を課して選好スコア合計を最大化します。

## 数理モデル

$$
\begin{aligned}
\max \quad & \sum_{c=0}^{C-1} \sum_{r=0}^{R-1} \sum_{t=0}^{T-1} w_{c,t} x_{c,r,t} \\
\text{s.t.} \quad & \sum_{r=0}^{R-1} \sum_{t=0}^{T-1} x_{c,r,t} = 1 && \forall c \\
& x_{c,r,t} = 0 && \forall c, r, t : s_c > K_r \\
& \sum_{c=0}^{C-1} x_{c,r,t} \le 1 && \forall r, t \\
& \sum_{c \in G} \sum_{r=0}^{R-1} x_{c,r,t} \le 1 && \forall \text{教員・コホート群 } G, \; \forall t \\
& x_{c,r,t} \in \{0, 1\} && \forall c, r, t
\end{aligned}
$$

## ポイント

- **クリーク制約による LP 緩和の強化**: 同じ教員または同じコホートに属する講義集合 $G$ 全体を $\sum_{c \in G} \sum_r x_{c,r,t} \le 1$ という 1 本の不等式で抑えると、ペアごとに $x_{a,t} + x_{b,t} \le 1$ を並べるよりも LP 緩和の上界がタイトになり、分枝限定法が高速化します。
- **定員不適合の事前固定**: $s_c > K_r$ となる教室 $r$ への変数を 0 に固定することで、定員オーバーの割当を根本から排除します。
- **教室制約と時限競合の連鎖**: 教員が別でも共通コホートを持つ講義は同一時限に置けないため、希望時限や大教室の奪い合いが発生します。
- 用語の確認: [ガイド・用語集 — 基本構成要素](?view=guide&lang=ja#building-blocks) / [変数の種類](?view=guide&lang=ja#variable-types)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
for (let r = 0; r < R; r++) {
  for (let t = 0; t < T; t++) {
    m.constraint(expr`${sum(x.map((courseRooms) => courseRooms[r][t]))} <= 1`);
  }
}
for (const group of [...teacherGroups.values(), ...cohortGroups.values()]) {
  if (group.length < 2) continue;
  for (let t = 0; t < T; t++) {
    const vars = group.flatMap((c) => x[c].map((roomSlots) => roomSlots[t]));
    m.constraint(expr`${sum(vars)} <= 1`);
  }
}
```

**PuLP (Python)**

```python
for r in range(num_rooms):
    for t in range(num_slots):
        prob += pulp.lpSum(x[c][r][t] for c in range(num_courses)) <= 1
for group in list(teacher_groups.values()) + list(cohort_groups.values()):
    if len(group) >= 2:
        for t in range(num_slots):
            prob += pulp.lpSum(x[c][r][t] for c in group for r in range(num_rooms)) <= 1
```
