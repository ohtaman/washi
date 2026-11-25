## アプローチ

バイナリ決定変数 $x_j$（`take[j]`）を宣言し、各負荷区分の負荷量 $w_{k,j}$（`requirements[k][j]`）と上限 $C_k$（`caps[k]`）による線形容量制約、前提ペア集合 $\mathcal{P}$（`prerequisites`）の順序制約、時間割重複ペア集合 $\mathcal{T}$（`timeConflicts`）の排反制約を課して、興味スコア $v_j$（`interest[j]`）の合計を最大化します。

## 数理モデル

$$
\begin{aligned}
\max \quad & \sum_{j=0}^{n-1} v_j x_j \\
\text{s.t.} \quad & \sum_{j=0}^{n-1} w_{k,j} x_j \le C_k && \forall k \in \{0, \dots, m-1\} \\
& x_{\text{course}} \le x_{\text{prereq}} && \forall (\text{prereq}, \text{course}) \in \mathcal{P} \\
& x_a + x_b \le 1 && \forall (a, b) \in \mathcal{T} \\
& x_j \in \{0, 1\} && \forall j
\end{aligned}
$$

## ポイント

- **多次元制約では単一指標の貪欲法が通用しない**: 2つ以上の負荷区分がある場合、区分0で軽く見える科目が区分1の上限を圧迫することがあります。すべての次元を同時に解くことで真の最適解が得られます。
- **論理制約とナップサックの結合**: 前提条件（$x_{\text{course}} \le x_{\text{prereq}}$）により前提科目を含めた負荷を考慮する必要が生じ、時間割重複（$x_a + x_b \le 1$）により重複する高スコア科目の同時履修を防ぎます。
- 関連用語: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types)、[基本構成要素](?view=guide&lang=ja#building-blocks)。

## 実装の勘所

各負荷区分 `k` の容量制約に加えて、前提科目ペア `[prereq, course]` の含意不等式と時間割重複ペア `[a, b]` の排反不等式を `take` 変数上に設定します。

**WaSHI (TypeScript)**

```ts
m.constraint(
  input.caps.map((cap, k) => expr`dot(${input.requirements[k]}, ${take}) <= ${cap}`)
);
m.constraint(
  input.prerequisites.map(([prereq, course]) => expr`${take[course]} <= ${take[prereq]}`)
);
m.constraint(
  input.timeConflicts.map(([a, b]) => expr`${take[a]} + ${take[b]} <= 1`)
);
```

**PuLP (Python)**

```python
for k, cap in enumerate(caps):
    prob += pulp.lpDot(requirements[k], take) <= cap
for prereq, course in prerequisites:
    prob += take[course] <= take[prereq]
for a, b in time_conflicts:
    prob += take[a] + take[b] <= 1
```
