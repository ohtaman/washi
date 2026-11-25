## アプローチ

0-1 変数 `selected[i]` を宣言し、予算制約に加えて `mutexGroups`・`exactGroups`・`atLeastOneGroups` のそれぞれを対象インデックスの和に対する線形制約として記述し、総価値を最大化します。

## 数理モデル

$$
\begin{aligned}
\max \quad & \sum_{i=0}^{n-1} v_i x_i \\
\text{s.t.} \quad & \sum_{i=0}^{n-1} c_i x_i \le B \\
& \sum_{i \in G} x_i \le 1 && \forall G \in \mathcal{G}_{\text{mutex}} \\
& \sum_{i \in G} x_i = k_G && \forall (G, k_G) \in \mathcal{G}_{\text{exact}} \\
& \sum_{i \in G} x_i \ge 1 && \forall G \in \mathcal{G}_{\ge 1} \\
& x_i \in \{0, 1\} && \forall i
\end{aligned}
$$

## ポイント

- **0-1 変数の和はそのまま「選ばれた個数」**: $x_i \in \{0, 1\}$ なので部分和 $\sum_{i \in G} x_i$ はそのままグループ $G$ 内で選ばれたプロジェクト数になり、`<= 1`（排反）・`== k`（指定数）・`>= 1`（必須）を統一的に表現できます。
- **グループ重複への自然な対応**: 1 つのプロジェクトが複数のグループに属していても補助変数は不要で、ソルバーがすべての条件を同時に満たす組み合わせを見つけます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [基本構成要素](?view=guide&lang=ja#building-blocks)

## 実装の勘所

予算上限の制約に加えて、3 種類のグループ配列をそれぞれ走査し、対象プロジェクトのバイナリ変数 `selected[i]` の和に対して `<= 1`、`== count`、`>= 1` の制約を追加します。

**WaSHI (TypeScript)**

```ts
m.constraint(expr`dot(${input.costs}, ${selected}) <= ${input.budget}`, "budget");
m.constraint(
  input.mutexGroups.map((group) => expr`${sum(group.map((i) => selected[i]))} <= 1`)
);
m.constraint(
  input.exactGroups.map(
    (g) => expr`${sum(g.indices.map((i) => selected[i]))} == ${g.count}`
  )
);
m.constraint(
  input.atLeastOneGroups.map((group) => expr`${sum(group.map((i) => selected[i]))} >= 1`)
);
```

**PuLP (Python)**

```python
prob += pulp.lpDot(costs, selected) <= budget
for group in mutex_groups:
    prob += pulp.lpSum(selected[i] for i in group) <= 1
for rule in exact_groups:
    prob += pulp.lpSum(selected[i] for i in rule["indices"]) == rule["count"]
for group in at_least_one_groups:
    prob += pulp.lpSum(selected[i] for i in group) >= 1
```
