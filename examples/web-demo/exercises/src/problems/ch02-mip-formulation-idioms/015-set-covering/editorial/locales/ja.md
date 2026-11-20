## アプローチ

各候補集合に 0-1 変数 `selected[j]` を割り当て、各要素 `i` を含む集合の選択変数の和が `1` 以上になる制約を追加して、総コストを最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{m-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j : i \in S_j} x_j \ge 1 && \forall i \in \{0, \dots, n-1\} \\
& x_j \in \{0, 1\} && \forall j \in \{0, \dots, m-1\}
\end{aligned}
$$

## ポイント

- **貪欲法が最適にならない理由**: 1 要素あたりのコストが安く見える大きな集合（例：`[0, 1, 3, 4]` コスト 8）を先に選ぶと残った要素 `2` のために追加コストがかさみ、より小さい集合の組合せに負けることがあります。
- **被覆 (`>= 1`) と分割 (`== 1`) の違い**: 集合被覆では `>= 1` とすることで同一要素の重複カバーを許容し、重複があっても安い組合せを逃さず選べます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [基本構成要素](?view=guide&lang=ja#building-blocks)

## 実装の勘所

**WaSHI (TypeScript)**

```ts
m.constraint(
  Array.from({ length: input.numElements }, (_, i) =>
    expr`${sum(selected.filter((_, j) => input.sets[j].includes(i)))} >= 1`
  )
);
m.objective(minimize(expr`dot(${input.costs}, ${selected})`));
```

**PuLP (Python)**

```python
for i in range(num_elements):
    prob += pulp.lpSum(selected[j] for j in range(m_count) if i in sets[j]) >= 1
prob += pulp.lpDot(costs, selected)
```
