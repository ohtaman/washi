## アプローチ

$n$ 個のコンポーネント（`numElements`）を要素 $i$、$m$ 個の監視パッケージをコスト $c_j$（`costs[j]`）の候補集合 $S_j$（`sets[j]`）としてモデル化します。各パッケージに 0-1 変数 $x_j$（`selected[j]`）を割り当て、各コンポーネント $i$ を含むパッケージの選択変数の和が 1 以上になる制約を追加して、総コストを最小化します。

## 数理モデル

$$
\begin{aligned}
\min \quad & \sum_{j=0}^{m-1} c_j x_j \\
\text{s.t.} \quad & \sum_{j : i \in S_j} x_j \ge 1 && \forall i \in \{0, \dots, n-1\} \\
& x_j \in \{0, 1\} && \forall j \in \{0, \dots, m-1\}
\end{aligned}
$$

## ポイント

- **貪欲法が最適にならない理由**: 例題では、最も多くのコンポーネントを監視するパッケージ 4（`[0, 1, 3, 4]`、コスト 8）を先に選ぶとコンポーネント 2 が残り、追加で少なくともコスト 5 のパッケージが必要になるため総コストが 13 以上になります（パッケージ 1 と 2 の組合せなら 9）。一般にも、新規カバー 1 件あたりのコストが最小のパッケージを順に選ぶ貪欲法であっても、序盤に効率的なパッケージを選んだ結果として残りのコンポーネントが中途半端に分断され、最適組合せを逃すことがあります。
- **被覆 (`>= 1`) と分割 (`== 1`) の違い**: 集合被覆では `>= 1` とすることで同一コンポーネントの重複監視を許容し、重複があっても安いパッケージの組合せを逃さず選べます。
- 用語の確認: [ガイド・用語集 — 変数の種類](?view=guide&lang=ja#variable-types) / [基本構成要素](?view=guide&lang=ja#building-blocks)

## 実装の勘所

各コンポーネント `i` ごとに `input.sets[j]` が `i` を含むようなパッケージの選択変数 `selected[j]` を抽出し、その和が 1 以上になる制約を生成します。

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
